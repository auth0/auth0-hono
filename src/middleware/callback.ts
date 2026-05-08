import { getClient, ensureClient } from '@/config/index.js';
import { createRouteUrl, toSafeRedirect } from '@/utils/util.js';
import { mapServerError } from '@/errors/errorMap.js';
import { Auth0Error } from '@/errors/Auth0Error.js';
import { Next, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { OIDCEnv } from '@/lib/honoEnv.js';
import { resumeSilentLogin } from './silentLogin.js';
import { SessionData, StateData, StateStore } from '@auth0/auth0-server-js';
import { STATE_STORE_KEY } from '@/lib/constants.js';
import { Configuration } from '@/config/Configuration.js';
import { Context } from 'hono';

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
      // We intercept stateStore.set() to capture the written StateData in memory.
      //
      // CONCURRENCY NOTE: The patch window is ~50ms (duration of completeInteractiveLogin).
      // In serverless (1 request/isolate), no issue. In Node.js with concurrent callbacks,
      // interleaving is theoretically possible but practically negligible (callback URL is
      // hit once per login flow, not under concurrent load).
      const { stateStore, identifier } = getStateStoreContext(c, configuration);
      let capturedStateData: StateData | null = null;
      const originalSet = stateStore.set;
      stateStore.set = async function (this: StateStore<Context>, id, data, removeIfExists, opts) {
        if (id === identifier) {
          capturedStateData = data as StateData;
        }
        return originalSet.call(this, id, data, removeIfExists, opts);
      };

      let appState: { returnTo: string } | undefined;
      try {
        // Complete the login flow
        ({ appState } = await client.completeInteractiveLogin<{ returnTo: string } | undefined>(
          createRouteUrl(c.req.url, baseURL),
          c
        ));
      } finally {
        // Always restore — even if completeInteractiveLogin throws
        stateStore.set = originalSet;
      }

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
            await resumeSilentLogin()(c, next);
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
              configuration.debug(
                'Warning: Hook enrichment discarded — session state not captured during login.'
              );
            }
          }
          // void/undefined: use default behavior
        } catch (hookErr) {
          // Hook threw — log but don't mask the login
          configuration.debug('onCallback hook error', { error: hookErr });
        }
      }

      // Resume silent login and redirect
      await resumeSilentLogin()(c, next);

      if (params.redirectAfterLogin === false) {
        return next();
      }

      const finalURL =
        (params.redirectAfterLogin ? toSafeRedirect(params.redirectAfterLogin, baseURL) : undefined) ??
        appState?.returnTo ??
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
