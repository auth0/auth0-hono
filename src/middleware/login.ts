import { OIDCAuthorizationRequestParams } from '@/config/authRequest.js';
import { ensureClient, getClient } from '@/config/index.js';
import { mapServerError } from '@/errors/errorMap.js';
import { OIDCEnv } from '@/lib/honoEnv.js';
import { toSafeRedirect } from '@/utils/util.js';
import { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';

export type LoginParams = {
  /**
   * The URL to redirect to after login.
   * This is stored in session.oidc_tx.returnTo
   * and used in the callback handler.
   *
   * If not set, defaults to the value of the `return_to` query parameter.
   *
   * If neither is set, defaults to '/'.
   * @example '/home'
   * @default '/'
   */
  redirectAfterLogin?: string;

  /**
   * Whether to suppress the login prompt.
   * This is stored in session.oidc_tx.silent
   * and used in the callback handler.
   *
   * @example true
   * @default false
   */
  silent?: boolean;

  /**
   * Override authorization parameters.
   *
   * @example { prompt: 'none' }
   * @default undefined
   */
  authorizationParams?: Partial<OIDCAuthorizationRequestParams>;

  /**
   * Forwards specific query parameters from the login request to the authorization request.
   * This allows passing through parameters like 'ui_locales', 'acr_values', or custom parameters
   * that your identity provider supports without having to specify them in authorizationParams.
   *
   * Only parameters with non-empty values will be forwarded.
   *
   * @example ['ui_locales', 'acr_values', 'login_hint']
   * @example ['locale', 'campaign']
   * @default []
   */
  forwardAuthorizationParams?: string[];
};

/**
 * Security-critical parameters that MUST NOT be overridden via query string forwarding.
 * These are computed by the SDK/server-js and overriding them breaks OIDC security.
 *
 * Matches nextjs-auth0's INTERNAL_AUTHORIZE_PARAMS:
 * https://github.com/auth0/nextjs-auth0/blob/main/src/server/auth-client.ts
 */
const BLOCKED_FORWARD_PARAMS = new Set([
  'client_id',
  'redirect_uri',
  'response_type',
  'code_challenge',
  'code_challenge_method',
  'state',
  'nonce',
  'max_age',
]);

/**
 * Handle login requests.
 *
 * Initiates the authorization flow with Auth0, optionally with custom
 * authorization parameters and redirect URL.
 *
 * ## Authorization Parameter Priority
 *
 * Matches nextjs-auth0 pattern (query > config, security params blocked):
 *
 * 1. config.authorizationParams (base — lowest priority)
 * 2. params.authorizationParams (developer per-call override — medium)
 * 3. forwardAuthorizationParams from query string (user-driven — highest)
 * 4. BLOCKED_FORWARD_PARAMS excluded from all query forwarding (SDK-computed)
 *
 * server-js additionally merges ServerClientOptions.authorizationParams (constructor)
 * as the base under all of the above.
 *
 * This allows patterns like: `/auth/login?audience=https://api2.example.com&login_hint=user@example.com`
 * while preventing: `/auth/login?response_type=token&redirect_uri=https://evil.com`
 */
export const login = (params: LoginParams = {}) => {
  return createMiddleware<OIDCEnv>(async function (c) {
    try {
      const { client, configuration } = getClient(c);
      const { debug } = configuration;

      // Get the potential return URL
      const potentialReturnTo =
        params.redirectAfterLogin ??
        (c.req.method === 'GET' && c.req.path !== configuration.routes.login ? c.req.url : undefined) ??
        c.req.query('return_to') ??
        '/';

      // Validate the URL to prevent open redirects
      const returnTo = toSafeRedirect(potentialReturnTo, configuration.baseURL);

      const paramsFromQuery: Record<string, string> = {};

      const forwardParams = params.forwardAuthorizationParams ?? configuration.forwardAuthorizationParams;

      if (forwardParams && forwardParams.length > 0) {
        for (const param of forwardParams) {
          // SECURITY: Block security-critical params even if developer lists them.
          // These are always SDK-computed (PKCE, state, nonce) or fixed (response_type, redirect_uri).
          if (BLOCKED_FORWARD_PARAMS.has(param)) {
            debug(`Blocked forwarding of security-critical param "${param}" from query string`);
            continue;
          }

          const value = c.req.query(param);

          if (value) {
            // Normalize to string: if array, use first value (standard behavior)
            const normalizedValue = Array.isArray(value) ? value[0] : value;
            // Reject values containing CR/LF/NUL to prevent HTTP Response Splitting.
            // Ref: https://owasp.org/www-community/attacks/HTTP_Response_Splitting
            if (/[\r\n\0]/.test(normalizedValue)) {
              continue;
            }
            paramsFromQuery[param] = normalizedValue;
          }
        }
      }

      // Priority: query forwarded params override explicit params.authorizationParams.
      // This matches nextjs-auth0 behavior: query > config (allows dynamic login_hint,
      // audience override from application routes). Security params already blocked above.
      const authParams: Partial<OIDCAuthorizationRequestParams> = {
        ...(params.authorizationParams ?? {}),
        ...paramsFromQuery,
      };

      if (params.silent) {
        authParams.prompt = 'none';
      }

      debug('Starting login flow with:', authParams);

      const authorizationUrl = await client.startInteractiveLogin(
        {
          pushedAuthorizationRequests: configuration.pushedAuthorizationRequests,
          appState: { returnTo },
          authorizationParams: authParams,
        },
        c
      );

      return c.redirect(authorizationUrl.href);
    } catch (err) {
      throw mapServerError(err);
    }
  });
};

/**
 * Standalone login handler wrapper.
 *
 * Can be used independently of auth0() middleware.
 * Automatically initializes client from environment if not already done.
 */
export function handleLogin(params?: LoginParams): MiddlewareHandler {
  return createMiddleware<OIDCEnv>(async (c, next) => {
    // Ensure client is available in standalone mode
    await ensureClient(c);
    // Delegate to internal login handler
    return login(params)(c, next);
  });
}
