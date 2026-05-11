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
 *
 * WARNING: Do NOT call this as `cancelSilentLogin()(c, next)` inside handlers
 * that return their own response (e.g., callback, logout). The `next()` call
 * will dispatch to the next route handler, which may be Hono's 404 not-found.
 * If Hono's 404 fires, `context.finalized = true` and any subsequent
 * `c.redirect()` or `c.json()` will be silently discarded.
 * Use `deleteSilentLoginCookie(c)` / direct `setCookie()` instead.
 * See: https://github.com/auth0/auth0-hono/pull/19 (PR review discussion)
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
 *
 * WARNING: Same caveat as cancelSilentLogin() — do NOT call as
 * `resumeSilentLogin()(c, next)` inside handlers that return their own
 * response. Use `deleteSilentLoginCookie(c)` instead.
 */
export const resumeSilentLogin = () =>
  createMiddleware(async (c, next) => {
    deleteCookie(c, COOKIE_NAME, getCookieOptions(c));
    return next();
  });

/**
 * Delete the silent login skip cookie directly on a context.
 *
 * Unlike resumeSilentLogin(), this does NOT call next() — safe to call
 * inside handlers that manage their own response (e.g., callback, logout).
 *
 * CONTEXT: resumeSilentLogin() calls next() for composability in middleware
 * chains. But callback.ts and logout.ts return their own redirect response.
 * If next() fires inside those handlers, Hono dispatches to the next route
 * (often 404) which sets context.finalized = true, causing the redirect to
 * be silently discarded. This function avoids that by only deleting the cookie.
 *
 * Bug found: 2026-05-11. Root cause: commit 967e88d added next() to
 * resumeSilentLogin for composability but didn't update existing call sites
 * in callback.ts and logout.ts that passed their own `next` through.
 *
 * @param c - Hono context
 * @internal
 */
export function deleteSilentLoginCookie(c: Context<OIDCEnv>): void {
  deleteCookie(c, COOKIE_NAME, getCookieOptions(c));
}

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
