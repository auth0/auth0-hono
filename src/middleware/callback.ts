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
      // Complete the login flow
      const { appState } = await client.completeInteractiveLogin<{ returnTo: string } | undefined>(
        createRouteUrl(c.req.url, baseURL),
        c
      );

      // Get the session that was just created
      session = (await client.getSession(c)) ?? null;

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
            // Read raw StateData from store (preserves internal.createdAt)
            // then merge hook's enriched fields onto it for persistence.
            const { stateStore, identifier } = getStateStoreContext(c, configuration);
            const rawState = (await stateStore.get(identifier, c)) as StateData | null;

            if (rawState) {
              // SAFETY: Explicitly preserve internal field after hook enrichment
              // This prevents the hook from overwriting the session's internal metadata
              const enrichedState = {
                ...rawState,
                ...session,
                internal: rawState.internal,
              };
              await stateStore.set(identifier, enrichedState, false, c);
            } else {
              // Race condition: session cleared between login and hook execution
              // Log warning so operators detect session store issues
              configuration.debug(
                'Warning: Hook enrichment discarded due to missing session state after successful login. ' +
                  'This may indicate a race condition in your state store.'
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
