import { Context } from 'hono';
import { ConnectionTokenSet } from '@auth0/auth0-server-js';
import { getClient } from '@/config/index.js';
import { mapServerError } from '@/errors/errorMap.js';

/**
 * Options for getAccessTokenForConnection helper.
 */
export interface GetAccessTokenForConnectionOptions {
  /**
   * Connection name (e.g., 'google-oauth2', 'facebook', 'github').
   */
  connection: string;

  /**
   * Optional login hint to help identify which account to use.
   */
  loginHint?: string;
}

/**
 * Get an access token for a specific connection (social provider).
 *
 * Public API helper for obtaining access tokens for third-party services
 * connected via Auth0 social connections. Useful when you need to access
 * user data or perform actions on behalf of the user on connected services.
 *
 * This is a thin wrapper around server-js client.getAccessTokenForConnection.
 * No caching is performed (unlike getAccessToken) as connection tokens are one-off requests.
 *
 * @param c - Hono context
 * @param options - Connection name and optional login hint
 * @returns ConnectionTokenSet with accessToken string and metadata
 * @throws Auth0Error (ConnectionTokenError or mapped from server-js errors)
 *
 * @example
 * ```typescript
 * try {
 *   const googleToken = await getAccessTokenForConnection(c, {
 *     connection: 'google-oauth2',
 *     loginHint: 'user@gmail.com'
 *   })
 *   console.log(googleToken.accessToken)  // Google API token
 *   console.log(googleToken.expiresAt)    // When token expires
 * } catch (err) {
 *   if (err instanceof ConnectionTokenError) {
 *     // Failed to get connection token
 *   }
 * }
 * ```
 *
 * @see getAccessToken - Get token for your API (with auto-refresh)
 */
export async function getAccessTokenForConnection(
  c: Context,
  options: GetAccessTokenForConnectionOptions
): Promise<ConnectionTokenSet> {
  const { client } = getClient(c);

  try {
    // Thin wrapper — server-js does all the work
    return await client.getAccessTokenForConnection(options, c);
  } catch (err) {
    // Map server-js error to SDK error
    throw mapServerError(err);
  }
}
