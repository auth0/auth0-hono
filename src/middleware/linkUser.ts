import { ensureClient, getClient } from '@/config/index.js';
import { mapServerError } from '@/errors/errorMap.js';
import { OIDCEnv } from '@/lib/honoEnv.js';
import { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { StartLinkUserOptions } from '@auth0/auth0-server-js';

export type LinkUserParams = {
  /**
   * Connection to link to the user's account.
   * Required.
   * @example 'google-oauth2'
   */
  connection: string;

  /**
   * Scope requested for the connection.
   * Required.
   * @example 'openid profile email'
   */
  connectionScope: string;

  /**
   * Override authorization parameters.
   *
   * @example { prompt: 'login' }
   * @default undefined
   */
  authorizationParams?: Partial<Record<string, unknown>>;
};

/**
 * Handle start of user linking process.
 *
 * Initiates the connection linking flow with Auth0.
 * Requires an active session (user must be authenticated).
 *
 * Connection and scope can be provided via params or query parameters:
 * - params.connection / params.connectionScope (explicit)
 * - ?connection=... & ?connectionScope=... (query params)
 *
 * Query params override explicit params.
 */
export const linkUser = (params: LinkUserParams = { connection: '', connectionScope: '' }) => {
  return createMiddleware<OIDCEnv>(async function (c) {
    try {
      const { client, configuration } = getClient(c);
      const { debug } = configuration;

      // Get connection and scope from query params or params
      const connection = c.req.query('connection') ?? params.connection;
      const connectionScope = c.req.query('connectionScope') ?? params.connectionScope;

      if (!connection) {
        throw new Auth0Error('Missing required parameter: connection', 400, 'missing_connection_param');
      }

      if (!connectionScope) {
        throw new Auth0Error('Missing required parameter: connectionScope', 400, 'missing_connection_scope_param');
      }

      debug('Starting link user flow for connection:', { connection, connectionScope });

      const linkingUrl = await client.startLinkUser(
        {
          connection: Array.isArray(connection) ? connection[0] : connection,
          connectionScope: Array.isArray(connectionScope) ? connectionScope[0] : connectionScope,
          appState: undefined,
          authorizationParams: params.authorizationParams,
        } as StartLinkUserOptions,
        c
      );

      return c.redirect(linkingUrl.href);
    } catch (err) {
      throw mapServerError(err);
    }
  });
};

/**
 * Standalone link user handler wrapper.
 *
 * Can be used independently of auth0() middleware.
 * Automatically initializes client from environment if not already done.
 */
export function handleLinkUser(params?: LinkUserParams): MiddlewareHandler {
  return createMiddleware<OIDCEnv>(async (c, next) => {
    // Ensure client is available in standalone mode
    await ensureClient(c);
    // Delegate to internal link user handler
    return linkUser(params)(c, next);
  });
}

// Import needed for inline type check
import { Auth0Error } from '@/errors/Auth0Error.js';
