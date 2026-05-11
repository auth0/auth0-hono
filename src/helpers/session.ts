import { Context } from 'hono';
import { z } from 'zod';
import { SessionData, StateData, StateStore } from '@auth0/auth0-server-js';
import { RESERVED_FIELDS, STATE_STORE_KEY } from '@/lib/constants.js';
import { Auth0Session, Auth0User } from '@/types/auth0.js';
import { MissingSessionError } from '@/errors/index.js';
import { Auth0Error } from '@/errors/Auth0Error.js';

const StateDataSchema = z
  .object({
    user: z.record(z.any()),
    idToken: z.string().optional(),
    tokenSets: z.array(z.any()),
    internal: z
      .object({
        createdAt: z.number(),
      })
      .passthrough(),
  })
  .passthrough();

/**
 * Validate StateData contains required fields.
 * Prevents using corrupted state from store.
 *
 * @param data - Data to validate
 * @throws Auth0Error if validation fails
 * @internal
 */
function validateStateDataShape(data: unknown): asserts data is StateData {
  const result = StateDataSchema.safeParse(data);
  if (!result.success) {
    const issue = result.error.errors[0];
    const path = issue.path.join('.');
    const message = path
      ? `Invalid session state: ${path} — ${issue.message}`
      : `Invalid session state: ${issue.message}`;
    throw new Auth0Error(message, 500, 'state_validation_error');
  }
}

/**
 * Get the state store and cookie identifier from context.
 *
 * @param c - Hono context
 * @param configuration - Auth0 configuration with session settings
 * @returns Object containing stateStore and identifier
 * @throws Error if state store not found in context
 * @internal
 */
function getStateStoreContext(c: Context, configuration: { session: { cookie?: { name?: string } } }) {
  const stateStore = c.get(STATE_STORE_KEY) as StateStore<Context>;
  const identifier = configuration.session.cookie?.name ?? 'appSession';
  return { stateStore, identifier };
}

/**
 * Get the current user or throw if not authenticated.
 *
 * Public API helper that synchronously returns user claims from c.var.auth0.user.
 * Throws MissingSessionError with a helpful message if user is not authenticated.
 *
 * Use this helper to enforce authentication and get type-safe user access in handlers.
 * For optional authentication, use c.var.auth0.user with a null check instead.
 *
 * @param c - Hono context (should have auth0() middleware registered before this handler)
 * @returns Auth0User with claims (sub, email, org_id, custom claims, etc.)
 * @throws MissingSessionError if user is not authenticated
 *
 * @example
 * ```typescript
 * app.get('/profile', (c) => {
 *   const user = getUser(c)  // Throws if unauthenticated
 *   return c.json({ email: user.email, org: user.org_id })
 * })
 *
 * // Or with optional auth:
 * app.get('/home', (c) => {
 *   const user = c.var.auth0?.user
 *   if (user) {
 *     return c.json({ message: `Welcome ${user.name}` })
 *   }
 *   return c.json({ message: 'Welcome guest' })
 * })
 * ```
 *
 * @see getSession - Async variant that returns full session data
 * @see requiresAuth - Middleware to enforce authentication on routes
 */
export function getUser(c: Context): Auth0User {
  // Read from c.var.auth0.user (populated by auth0() middleware)
  const user = c.var.auth0?.user;

  // If no user, throw descriptive error
  if (!user) {
    throw new MissingSessionError(
      'getUser() called on an unauthenticated request. ' +
        'Add requiresAuth() before this handler or use c.var.auth0.user with a null check.'
    );
  }

  return user;
}

/**
 * Persist modified session data back to state store.
 *
 * @param c - Hono context
 * @param session - SessionData with internal field
 * @throws If session missing `internal` field or StateStore not in context
 * @internal
 */
export async function persistSession(c: Context, session: SessionData): Promise<void> {
  const config = c.var.auth0Configuration;
  if (!config) {
    throw new Error('Auth0 configuration not found in context. Ensure auth0() middleware is registered.');
  }
  const { stateStore, identifier } = getStateStoreContext(c, config);

  // SAFETY CHECK: Validate session has required internal field
  // (prevents regression of original critical bug)
  if (!session || typeof session !== 'object' || !('internal' in session)) {
    throw new Auth0Error(
      'persistSession: session must include "internal" field. ' +
        'Use updateSession() or merge with stateStore.get() result instead.',
      500,
      'session_validation_error'
    );
  }

  // Call state store to persist (same pattern as server-js internal usage)
  await stateStore.set(
    identifier, // cookie name (= stateIdentifier)
    session as StateData, // session with internal field must be present
    false, // deleteSession flag (false = persist)
    c // context for cookie handler
  );
}

/**
 * Merge custom data into the session and persist.
 *
 * Public API helper for enriching session with custom fields. Updates are persisted
 * to the session store (encrypted cookie or database) and reflected in context for
 * subsequent handlers.
 *
 * Reserved fields (user, idToken, refreshToken, tokenSets, internal) are protected
 * from accidental overwrite to preserve authentication state.
 *
 * @param c - Hono context
 * @param data - Custom data object to merge (keys matching RESERVED_FIELDS are filtered)
 * @throws MissingSessionError if no active session
 * @throws Auth0Error if session persistence fails
 *
 * @example
 * ```typescript
 * app.use('/api/*', requiresAuth())
 *
 * app.post('/api/profile', async (c) => {
 *   const { theme, language } = await c.req.json()
 *
 *   await updateSession(c, {
 *     preferences: { theme, language },
 *     lastUpdated: new Date().toISOString()
 *   })
 *
 *   // Updated session available in handlers
 *   const session = await getSession(c)
 *   console.log(session.preferences)  // { theme, language }
 * })
 * ```
 *
 * @see getSession - Read the full session
 * @see getUser - Get user claims
 * @see RESERVED_FIELDS - Fields protected from overwrite
 */
export async function updateSession(c: Context, data: Record<string, unknown>): Promise<void> {
  // Read raw StateData from stateStore (preserves `internal` field with createdAt/sid).
  // We cannot use getCachedSession/client.getSession here because server-js strips
  // `internal` from the returned SessionData, but stateStore.set() requires it
  // to calculate cookie maxAge from internal.createdAt.
  const config = c.var.auth0Configuration;
  if (!config) {
    throw new Error('Auth0 configuration not found in context. Ensure auth0() middleware is registered.');
  }
  const { stateStore, identifier } = getStateStoreContext(c, config);
  const stateData = (await stateStore.get(identifier, c)) as StateData | null;

  if (!stateData) {
    throw new MissingSessionError('updateSession() called without an active session.');
  }

  // Validate shape before proceeding
  validateStateDataShape(stateData);

  // Filter out reserved fields (prevent accidental overwrite)
  const safeData = Object.fromEntries(Object.entries(data).filter(([key]) => !RESERVED_FIELDS.has(key)));

  // Merge custom data onto raw StateData (preserves internal, user, tokens)
  const updatedStateData = { ...stateData, ...safeData };

  // Persist to store (internal.createdAt is intact)
  await stateStore.set(identifier, updatedStateData, false, c);

  // Build SessionData view (without internal) for cache and context
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { internal: _internal, ...updatedSession } = updatedStateData;

  // Update request-scoped cache
  c.set('__auth0_session_cache', updatedSession);

  // Update c.var.auth0 context (so subsequent handlers see new data)
  const updatedUser = updatedSession.user;
  const org =
    updatedUser?.org_id != null && updatedUser.org_id !== ''
      ? {
          id: updatedUser.org_id as string,
          name: updatedUser.org_name as string | undefined,
        }
      : null;

  c.set('auth0', {
    user: (updatedUser as Auth0User) ?? null,
    session: updatedSession as Auth0Session,
    org,
  });
}
