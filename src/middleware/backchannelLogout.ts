import { getClient, ensureClient } from '@/config/index.js';
import { OIDCEnv } from '@/lib/honoEnv.js';
import { mapServerError } from '@/errors/errorMap.js';
import { createMiddleware } from 'hono/factory';
import { MiddlewareHandler } from 'hono';
import { Auth0Error } from '@/errors/Auth0Error.js';

/**
 * Handle backchannel logout requests from Auth0.
 *
 * Validates the logout token and clears the session.
 */
export const backchannelLogout = () => {
  return createMiddleware<OIDCEnv>(async function (c): Promise<Response> {
    const contentType = c.req.header('content-type');
    if (!contentType || !contentType.includes('application/x-www-form-urlencoded')) {
      throw new Auth0Error(
        "Invalid content type. Expected 'application/x-www-form-urlencoded'.",
        400,
        'invalid_request'
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: Record<string, any>;
    try {
      body = await c.req.parseBody();
    } catch (parseErr) {
      throw new Auth0Error('Failed to parse request body', 400, 'invalid_request', { cause: parseErr });
    }

    const { logout_token: logoutToken } = body;

    if (!logoutToken || typeof logoutToken !== 'string') {
      throw new Auth0Error('Missing `logout_token` in the request body.', 400, 'invalid_request');
    }

    const { client } = getClient(c);

    try {
      await client.handleBackchannelLogout(logoutToken, c);
    } catch (err) {
      throw mapServerError(err);
    }
    return new Response(null, {
      status: 204,
    });
  });
};

/**
 * Standalone backchannel logout handler wrapper.
 *
 * Can be used independently of auth0() middleware.
 * Automatically initializes client from environment if not already done.
 */
export function handleBackchannelLogout(): MiddlewareHandler {
  return createMiddleware<OIDCEnv>(async (c, next) => {
    // Ensure client is available in standalone mode
    await ensureClient(c);
    // Delegate to internal backchannel logout handler
    return backchannelLogout()(c, next);
  });
}
