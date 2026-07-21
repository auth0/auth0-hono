import { ensureClient, getClient } from '@/config/index.js';
import { mapServerError } from '@/errors/errorMap.js';
import { OIDCEnv } from '@/lib/honoEnv.js';
import { createRouteUrl, toSafeRedirect } from '@/utils/util.js';
import { MiddlewareHandler, Next } from 'hono';
import { createMiddleware } from 'hono/factory';

export type LinkCallbackParams = {
  /**
   * Optionally override the url to redirect after successful linking.
   *
   * Or disable it completely by setting it to false
   * to continue to the next middleware.
   */
  redirectAfterLinking?: string | false;
};

/**
 * Handle callback from the linking flow.
 *
 * Completes the user linking process after the user has authorized
 * the secondary connection.
 */
export const linkCallback = (params: LinkCallbackParams = {}) => {
  return createMiddleware<OIDCEnv>(async function (c, next: Next): Promise<Response | void> {
    const { client, configuration } = getClient(c);
    const { baseURL } = configuration;

    try {
      // Complete the linking flow
      await client.completeLinkUser(
        createRouteUrl(c.req.url, baseURL),
        c
      );

      // SUCCESS: Redirect or continue
      if (params.redirectAfterLinking === false) {
        return next();
      }

      // Default redirect: back to baseURL (or custom override)
      const finalURL =
        (params.redirectAfterLinking ? toSafeRedirect(params.redirectAfterLinking, baseURL) : undefined) ??
        baseURL;

      return c.redirect(finalURL);
    } catch (err) {
      // Map to SDK error and throw (app.onError handles response)
      throw mapServerError(err);
    }
  });
};

/**
 * Standalone link callback handler wrapper.
 *
 * Can be used independently of auth0() middleware.
 * Automatically initializes client from environment if not already done.
 */
export function handleLinkCallback(params?: LinkCallbackParams): MiddlewareHandler {
  return createMiddleware<OIDCEnv>(async (c, next) => {
    // Ensure client is available in standalone mode
    await ensureClient(c);
    // Delegate to internal link callback handler
    return linkCallback(params)(c, next);
  });
}
