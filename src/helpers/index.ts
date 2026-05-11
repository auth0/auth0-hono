/**
 * Public helper functions for session and token management.
 *
 * @example
 * ```typescript
 * import {
 *   getSession,
 *   getUser,
 *   getAccessToken,
 *   updateSession,
 *   getAccessTokenForConnection
 * } from '@auth0/auth0-hono'
 * ```
 */

export { getSession } from './sessionCache.js';
export { getUser, updateSession } from './session.js';
export { getAccessToken } from './getAccessToken.js';
export type { Auth0TokenSet } from './getAccessToken.js';
export { getAccessTokenForConnection } from './getAccessTokenForConnection.js';
export type { GetAccessTokenForConnectionOptions } from './getAccessTokenForConnection.js';
