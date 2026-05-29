import { Configuration } from '@/config/Configuration.js';
import { ensureClient, getClient } from '@/config/index.js';
import { Auth0Error } from '@/errors/Auth0Error.js';
import { mapServerError } from '@/errors/errorMap.js';
import { STATE_STORE_KEY } from '@/lib/constants.js';
import { OIDCEnv } from '@/lib/honoEnv.js';
import { clearCapturedState, getCapturedState } from '@/session/captureRegistry.js';
import { createRouteUrl, toSafeRedirect } from '@/utils/util.js';
import { SessionData, StateData, StateStore } from '@auth0/auth0-server-js';
import { Context, MiddlewareHandler, Next } from 'hono';
import { createMiddleware } from 'hono/factory';
import { deleteSilentLoginCookie } from './silentLogin.js';

/**
 * Get the state store and cookie identifier from context.
 *
 * @param c - Hono context
 * @param configuration - Auth0 configuration with session settings
 * @returns Object containing stateStore and identifier
 * @internal
 */
function getStateStoreContext(c: Context, configuration: Configuration) {
  const stateStore = c.get(STATE_STORE_KEY) as StateStore<Context>;
  const identifier = configuration.session.cookie?.name ?? 'appSession';
  return { stateStore, identifier };
}

export type CallbackParams = {
  /**
   * Optionally override the url to redirect after successful
   * authentication.
   *
   * Or disable it completely by setting it to false
   * to continue to the next middleware.
   */
  redirectAfterLogin?: string | false;

  /**
   * Hook called on successful or failed login callback.
   * Overrides configuration onCallback if provided.
   */
  onCallback?: Configuration['onCallback'];
};

/**
 * Handle callback from the OIDC provider.
 *
 * Completes the authorization code exchange, handles onCallback hook,
 * and redirects or returns an error response.
 */
export const callback = (params: CallbackParams = {}) => {
  return createMiddleware<OIDCEnv>(async function callback(c, next: Next): Promise<Response | void> {
    const { client, configuration } = getClient(c);
    const { baseURL } = configuration;

    let session: SessionData | null = null;
    let error: Auth0Error | null = null;

    try {
      // Capture the session that completeInteractiveLogin persists.
      // We can't re-read from cookies because setCookie writes to response headers
      // but getCookie reads from the request Cookie header (stale on callback request).
      //
      // Session capture uses a WeakMap-based registry (installed once at init in client.ts)
      // keyed by the per-request Hono Context. This provides concurrency-safe isolation
      // without per-request monkey-patching of the shared stateStore singleton.
      // See: src/session/captureRegistry.ts
      const { stateStore, identifier } = getStateStoreContext(c, configuration);

      // Complete the login flow
      const { appState } = await client.completeInteractiveLogin<{ returnTo: string } | undefined>(
        createRouteUrl(c.req.url, baseURL),
        c
      );

      // Retrieve captured state from the per-request registry slot
      const capturedStateData = getCapturedState(c) ?? null;
      clearCapturedState(c);

      // Use captured session (strips internal to match SessionData contract)
      if (capturedStateData) {
        const stateObj = capturedStateData as Record<string, unknown>;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { internal: _internal, ...sessionData } = stateObj;
        session = sessionData as SessionData;
      }

      // SUCCESS PATH: Invoke onCallback hook
      const hook = params.onCallback ?? configuration.onCallback;
      if (hook) {
        try {
          const hookResult = await hook(c, null, session);
          if (hookResult instanceof Response) {
            deleteSilentLoginCookie(c);
            return hookResult;
          }
          // If hook returns enriched session (different object), persist it
          if (hookResult && hookResult !== session) {
            session = hookResult as SessionData;

            if (capturedStateData) {
              // Use captured state (has internal.createdAt) — no re-read from cookies needed
              const rawState = capturedStateData as Record<string, unknown> & { internal: { createdAt: number } };
              const enrichedState = {
                ...rawState,
                ...session,
                internal: rawState.internal,
              } as StateData;
              await stateStore.set(identifier, enrichedState, false, c);
            } else {
              // Shouldn't happen: completeInteractiveLogin succeeded but we didn't capture state
              configuration.debug('Warning: Hook enrichment discarded — session state not captured during login.');
            }
          }
          // void/undefined: use default behavior
        } catch (hookErr) {
          // Hook errors are intentionally non-fatal on the success path.
          // Rationale: A successful OAuth exchange must not be masked by downstream hook failures
          configuration.debug('onCallback hook error', { error: hookErr });
        }
      }

      // Delete silent login skip cookie directly — do NOT use resumeSilentLogin()(c, next).
      // resumeSilentLogin calls next() which dispatches to Hono's 404 in standalone routes,
      // setting context.finalized=true and causing the redirect below to be discarded.
      deleteSilentLoginCookie(c);

      if (params.redirectAfterLogin === false) {
        return next();
      }

      // appState is encrypted in transaction cookie (server-js),
      // but validate returnTo anyway to eliminate open redirect class entirely.
      const finalURL =
        (params.redirectAfterLogin ? toSafeRedirect(params.redirectAfterLogin, baseURL) : undefined) ??
        (appState?.returnTo ? toSafeRedirect(appState.returnTo, baseURL) : undefined) ??
        baseURL;

      return c.redirect(finalURL);
    } catch (err) {
      // Map to SDK error
      error = mapServerError(err);

      // ERROR PATH: Invoke onCallback hook with error
      const hook = params.onCallback ?? configuration.onCallback;
      if (hook) {
        try {
          const hookResult = await hook(c, error, null);
          if (hookResult instanceof Response) {
            // On error path with custom response, still don't clear skip cookie
            // to prevent silent login redirect loops
            return hookResult;
          }
          // Per design M4: any other return on error path is ignored
        } catch {
          // Hook error silently ignored — original auth error always propagates
        }
      }

      // Always throw original error — hook failure never masks it
      // NOTE: Do NOT call resumeSilentLogin() on error path.
      // If this error came from a prompt=none silent login attempt,
      // clearing the skip cookie would trigger an infinite redirect loop:
      // request → silent login → callback error → clear cookie → request → ...
      throw error;
    }
  });
};

/**
 * Standalone callback handler wrapper.
 *
 * Can be used independently of auth0() middleware.
 * Automatically initializes client from environment if not already done.
 */
export function handleCallback(params?: CallbackParams): MiddlewareHandler {
  return createMiddleware<OIDCEnv>(async (c, next) => {
    // Ensure client is available in standalone mode
    await ensureClient(c);
    // Delegate to internal callback handler
    return callback(params)(c, next);
  });
}
