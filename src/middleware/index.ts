// Internal middleware handlers
export { backchannelLogout } from './backchannelLogout.js';
export { callback } from './callback.js';
export { linkCallback } from './linkCallback.js';
export { linkUser } from './linkUser.js';
export { login } from './login.js';
export { logout } from './logout.js';
export { requiresAuth } from './requiresAuth.js';
export { unlinkCallback } from './unlinkCallback.js';
export { unlinkUser } from './unlinkUser.js';

// Standalone handler wrappers
export { handleBackchannelLogout } from './backchannelLogout.js';
export { handleCallback } from './callback.js';
export { handleLinkCallback } from './linkCallback.js';
export { handleLinkUser } from './linkUser.js';
export { handleLogin } from './login.js';
export { handleLogout } from './logout.js';
export { handleUnlinkCallback } from './unlinkCallback.js';
export { handleUnlinkUser } from './unlinkUser.js';

//export all middlewares in this file
export { attemptSilentLogin, cancelSilentLogin, pauseSilentLogin, resumeSilentLogin } from './silentLogin.js';

// Authorization middleware
export { claimEquals, claimIncludes, claimCheck } from './claims.js';
export { requiresOrg } from './requiresOrg.js';
