import { Context } from 'hono';
import { SessionData } from '@auth0/auth0-server-js';
import { SESSION_CACHE_KEY } from '@/lib/constants.js';
import { getClient } from '@/config/index.js';

/**
 * Get session from cache or load from server-js client.
 * @param c - Hono context
 * @returns SessionData or null if no active session
 * @internal
 */
export async function getCachedSession(c: Context): Promise<SessionData | null> {
  // Check cache first
  const cached = c.get('__auth0_session_cache');
  if (cached !== undefined) {
    return cached as SessionData | null; // Cache hit (including null for "no session" case)
  }

  // Cache miss — load from server-js client
  const { client } = getClient(c);
  const session = (await client.getSession(c)) ?? null;

  // Store in cache (including null)
  c.set('__auth0_session_cache', session);

  return session;
}

/**
 * Clear session cache to force reload on next access.
 *
 * Called after session mutations (updateSession, refresh) or when session state changes.
 *
 * @param c - Hono context
 * @internal
 */
export function invalidateSessionCache(c: Context): void {
  c.set(SESSION_CACHE_KEY, undefined);
}

/**
 * Get the current session or null if not authenticated.
 *
 * Public API helper that returns the full session data including tokens.
 * Never throws on unauthenticated requests. Uses request-scoped caching
 * to avoid redundant cookie parse + decrypt operations.
 *
 * @param c - Hono context
 * @returns SessionData with user, tokens, and custom fields, or null
 *
 * @example
 * ```typescript
 * const session = await getSession(c)
 * if (session) {
 *   console.log(session.user.email)      // 'user@example.com'
 *   console.log(session.idToken)         // JWT string or undefined
 *   console.log(session['custom_field']) // enriched fields
 * }
 * ```
 */
export async function getSession(c: Context): Promise<SessionData | null> {
  return getCachedSession(c);
}
