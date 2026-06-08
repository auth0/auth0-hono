import { ensureClient, getClient } from '@/config/index.js';
import { mapServerError } from '@/errors/errorMap.js';
import { invalidateSessionCache } from '@/helpers/sessionCache.js';
import { OIDCEnv } from '@/lib/honoEnv.js';
import { toSafeRedirect } from '@/utils/util.js';
import { MiddlewareHandler } from 'hono';
import { deleteCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { deleteSilentLoginCookie } from './silentLogin.js';

export type LogoutParams = {
  /**
   * URL to redirect to after logout.
   * Defaults to baseURL.
   */
  redirectAfterLogout?: string;
};

/**
 * Handle logout requests.
 *
 * Clears the session and optionally redirects to the Auth0 logout endpoint
 * if idpLogout is enabled in configuration.
 */
export const logout = (params: LogoutParams = {}) => {
  return createMiddleware<OIDCEnv>(async function (c): Promise<Response> {
    try {
      const { client, configuration } = getClient(c);
      const session = await client.getSession(c);

      const returnTo =
        (params.redirectAfterLogout ? toSafeRedirect(params.redirectAfterLogout, configuration.baseURL) : undefined) ??
        configuration.baseURL;

      if (!session) {
        return c.redirect(returnTo);
      }

      const logoutUrl = await client.logout({ returnTo }, c);

      // Invalidate session cache — prevent stale reads in same request lifecycle
      invalidateSessionCache(c);

      // Delete stale transaction cookie
      deleteCookie(c, '__a0_tx', { path: '/', sameSite: 'Lax', httpOnly: true });

      // Delete silent login skip cookie directly — do NOT use resumeSilentLogin()(c, next).
      // See callback.ts for full explanation of the next() poisoning bug.
      deleteSilentLoginCookie(c);

      if (!configuration.idpLogout) {
        return c.redirect(returnTo);
      }

      return c.redirect(logoutUrl);
    } catch (err) {
      throw mapServerError(err);
    }
  });
};

/**
 * Standalone logout handler wrapper.
 *
 * Can be used independently of auth0() middleware.
 * Automatically initializes client from environment if not already done.
 */
export function handleLogout(params?: LogoutParams): MiddlewareHandler {
  return createMiddleware<OIDCEnv>(async (c, next) => {
    // Ensure client is available in standalone mode
    await ensureClient(c);
    // Delegate to internal logout handler
    return logout(params)(c, next);
  });
}
