// Main auth0 middleware
export { auth0 } from '@/auth.js';
/**
 * @deprecated Use auth0() instead.
 */
export { auth } from '@/auth.js';

// Route handlers (standalone)
export {
  handleLogin,
  handleLogout,
  handleCallback,
  handleBackchannelLogout,
  handleLinkUser,
  handleLinkCallback,
  handleUnlinkUser,
  handleUnlinkCallback,
} from '@/middleware/index.js';

// Protection + Authorization middleware
export { requiresAuth, requiresOrg, claimEquals, claimIncludes, claimCheck } from '@/middleware/index.js';
export { requiresScopes, requiresPermissions } from '@/middleware/requiresScopes.js';

// Error handler for app.onError()
export { auth0ErrorHandler } from '@/middleware/auth0ErrorHandler.js';

// Silent login
export { attemptSilentLogin, cancelSilentLogin, resumeSilentLogin } from '@/middleware/index.js';
/**
 * @deprecated Use cancelSilentLogin instead.
 */
export { pauseSilentLogin } from '@/middleware/silentLogin.js';

// Helpers
export { getSession } from '@/helpers/sessionCache.js';
export { getUser, updateSession } from '@/helpers/session.js';
export { getAccessToken } from '@/helpers/getAccessToken.js';
export type { Auth0TokenSet, GetAccessTokenOptions } from '@/helpers/getAccessToken.js';
export { getAccessTokenForConnection } from '@/helpers/getAccessTokenForConnection.js';
export type { GetAccessTokenForConnectionOptions } from '@/helpers/getAccessTokenForConnection.js';

// Utilities
export { toSafeRedirect } from '@/utils/util.js';

// Errors
export {
  Auth0Error,
  AccessDeniedError,
  LoginRequiredError,
  InvalidGrantError,
  MissingSessionError,
  MissingTransactionError,
  TokenRefreshError,
  ConnectionTokenError,
  Auth0Exception,
} from '@/errors/index.js';

// Types
export type { Auth0Context, Auth0User, Auth0Organization, Auth0Session } from '@/types/auth0.js';
export type { OIDCEnv, OIDCVariables } from '@/lib/honoEnv.js';
export { SessionStore } from '@/types/session.js';
export { KVSessionStore } from '@/stores/KVSessionStore.js';
export type { KVNamespaceLike, KVSessionStoreOptions } from '@/stores/KVSessionStore.js';
export type { LinkUserParams } from '@/middleware/linkUser.js';
export type { LinkCallbackParams } from '@/middleware/linkCallback.js';
export type { UnlinkUserParams } from '@/middleware/unlinkUser.js';
export type { UnlinkCallbackParams } from '@/middleware/unlinkCallback.js';
export type { StartLinkUserOptions, StartUnlinkUserOptions } from '@auth0/auth0-server-js';
export { type UserInfoResponse as UserInfo } from 'openid-client';
export type { TokenEndpointResponse as TokenSet } from 'openid-client';
