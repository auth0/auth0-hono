// Main auth0 middleware
export { auth0 } from '@/auth.js';
/**
 * @deprecated Use auth0() instead.
 */
export { auth } from '@/auth.js';

// Route handlers (standalone)
export { handleLogin, handleLogout, handleCallback, handleBackchannelLogout } from '@/middleware/index.js';

// Protection + Authorization middleware
export { requiresAuth, requiresOrg, claimEquals, claimIncludes, claimCheck } from '@/middleware/index.js';

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
export type { Auth0TokenSet } from '@/helpers/getAccessToken.js';
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
export { type UserInfoResponse as UserInfo } from 'openid-client';
export type { TokenEndpointResponse as TokenSet } from 'openid-client';
