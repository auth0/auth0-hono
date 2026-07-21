import { ensureClient, getClient } from '@/config/index.js';
import { Auth0Error } from '@/errors/Auth0Error.js';
import { mapServerError } from '@/errors/errorMap.js';
import { OIDCEnv } from '@/lib/honoEnv.js';
import { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { StartUnlinkUserOptions } from '@auth0/auth0-server-js';

export type UnlinkUserParams = {
  /**
   * Connection to unlink from the user's account.
   * Required.
   * @example 'google-oauth2'
   */
  connection: string;

  /**
   * Override authorization parameters.
   *
   * @example { prompt: 'login' }
   * @default undefined
   */
  authorizationParams?: Partial<Record<string, unknown>>;
};

/**
 * Handle start of user unlinking process.
 *
 * Initiates the connection unlinking flow with Auth0.
 * Requires an active session (user must be authenticated).
 *
 * Connection can be provided via params or query parameter:
 * - params.connection (explicit)
 * - ?connection=... (query param)
 *
 * Query param overrides explicit param.
 */
export const unlinkUser = (params: UnlinkUserParams = { connection: '' }) => {
  return createMiddleware<OIDCEnv>(async function (c) {
    try {
      const { client, configuration } = getClient(c);
      const { debug } = configuration;

      // Get connection from query param or params
      const connection = c.req.query('connection') ?? params.connection;

      if (!connection) {
        throw new Auth0Error('Missing required parameter: connection', 400, 'missing_connection_param');
      }

      debug('Starting unlink user flow for connection:', { connection });

      const unlinkingUrl = await client.startUnlinkUser(
        {
          connection: Array.isArray(connection) ? connection[0] : connection,
          appState: undefined,
          authorizationParams: params.authorizationParams,
        } as StartUnlinkUserOptions,
        c
      );

      return c.redirect(unlinkingUrl.href);
    } catch (err) {
      throw mapServerError(err);
    }
  });
};

/**
 * Standalone unlink user handler wrapper.
 *
 * Can be used independently of auth0() middleware.
 * Automatically initializes client from environment if not already done.
 */
export function handleUnlinkUser(params?: UnlinkUserParams): MiddlewareHandler {
  return createMiddleware<OIDCEnv>(async (c, next) => {
    // Ensure client is available in standalone mode
    await ensureClient(c);
    // Delegate to internal unlink user handler
    return unlinkUser(params)(c, next);
  });
}
