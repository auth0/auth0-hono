import { ensureClient, getClient } from '@/config/index.js';
import { mapServerError } from '@/errors/errorMap.js';
import { OIDCEnv } from '@/lib/honoEnv.js';
import { createRouteUrl, toSafeRedirect } from '@/utils/util.js';
import { MiddlewareHandler, Next } from 'hono';
import { createMiddleware } from 'hono/factory';

export type UnlinkCallbackParams = {
  /**
   * Optionally override the url to redirect after successful unlinking.
   *
   * Or disable it completely by setting it to false
   * to continue to the next middleware.
   */
  redirectAfterUnlinking?: string | false;
};

/**
 * Handle callback from the unlinking flow.
 *
 * Completes the user unlinking process after the user has confirmed
 * disconnecting the secondary connection.
 */
export const unlinkCallback = (params: UnlinkCallbackParams = {}) => {
  return createMiddleware<OIDCEnv>(async function (c, next: Next): Promise<Response | void> {
    const { client, configuration } = getClient(c);
    const { baseURL } = configuration;

    try {
      // Complete the unlinking flow
      await client.completeUnlinkUser(
        createRouteUrl(c.req.url, baseURL),
        c
      );

      // SUCCESS: Redirect or continue
      if (params.redirectAfterUnlinking === false) {
        return next();
      }

      // Default redirect: back to baseURL (or custom override)
      const finalURL =
        (params.redirectAfterUnlinking ? toSafeRedirect(params.redirectAfterUnlinking, baseURL) : undefined) ??
        baseURL;

      return c.redirect(finalURL);
    } catch (err) {
      // Map to SDK error and throw (app.onError handles response)
      throw mapServerError(err);
    }
  });
};

/**
 * Standalone unlink callback handler wrapper.
 *
 * Can be used independently of auth0() middleware.
 * Automatically initializes client from environment if not already done.
 */
export function handleUnlinkCallback(params?: UnlinkCallbackParams): MiddlewareHandler {
  return createMiddleware<OIDCEnv>(async (c, next) => {
    // Ensure client is available in standalone mode
    await ensureClient(c);
    // Delegate to internal unlink callback handler
    return unlinkCallback(params)(c, next);
  });
}
