import { getClient } from '@/config/index.js';
import { OIDCEnv } from '@/lib/honoEnv.js';
import { Context } from 'hono';
import { accepts } from 'hono/accepts';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { CookieOptions } from 'hono/utils/cookie';
import { login } from './login.js';

const COOKIE_NAME = 'oidc_skip_silent_login';

const getCookieOptions = (c: Context<OIDCEnv>): CookieOptions => {
  const { configuration } = getClient(c);
  let cookieOptions: CookieOptions | undefined =
    typeof configuration.session === 'object' ? configuration.session.cookie : undefined;

  if (!cookieOptions) {
    cookieOptions = {
      sameSite: 'Lax',
      path: '/',
      httpOnly: true,
    };
  }

  return cookieOptions;
};

/**
 * Cancel silent login attempts by setting a cookie.
 * Calls next() — safe to use as composable middleware in route chains:
 *   app.get('/logout', cancelSilentLogin(), handleLogout())
 */
export const cancelSilentLogin = () =>
  createMiddleware(async (c, next) => {
    setCookie(c, COOKIE_NAME, 'true', getCookieOptions(c));
    return next();
  });

/**
 * @deprecated Use cancelSilentLogin instead.
 */
export const pauseSilentLogin = cancelSilentLogin;

/**
 * Resume silent login by deleting the skip cookie.
 * Calls next() — safe to use as composable middleware in route chains.
 */
export const resumeSilentLogin = () =>
  createMiddleware(async (c, next) => {
    deleteCookie(c, COOKIE_NAME, getCookieOptions(c));
    return next();
  });

export const attemptSilentLogin = () => {
  return createMiddleware<OIDCEnv>(async (c, next) => {
    const { client } = getClient(c);
    const session = await client.getSession(c);

    const acceptsHTML =
      accepts(c, {
        header: 'Accept',
        supports: ['text/html', 'application/json'],
        default: 'application/json',
      }) === 'text/html';

    const hasSkipCookie = getCookie(c, COOKIE_NAME);

    const skipSilentLogin = hasSkipCookie || !!session || !acceptsHTML;

    if (skipSilentLogin) {
      return next();
    }

    // Set skip cookie directly (not via middleware — we don't want next() called here)
    setCookie(c, COOKIE_NAME, 'true', getCookieOptions(c));

    try {
      return await login({ silent: true })(c, next);
    } catch (err) {
      // Login failed — clear the skip cookie so user can retry later
      // This allows recovery if silent login temporarily fails
      deleteCookie(c, COOKIE_NAME, getCookieOptions(c));
      throw err; // Let error propagate (user sees appropriate error)
    }
  });
};
