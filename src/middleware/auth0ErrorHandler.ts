import type { Context, ErrorHandler } from 'hono';
import { accepts } from 'hono/accepts';
import { Auth0Error } from '@/errors/Auth0Error.js';
import { LoginRequiredError } from '@/errors/index.js';
import { getClient } from '@/config/index.js';
import { toSafeRedirect } from '@/utils/util.js';

/**
 * Determine whether the request prefers an HTML response, mirroring the content
 * negotiation used by `requiresAuth()`. Defaults to JSON when no `Accept` header
 * is present or parsing yields no match.
 */
function prefersHtml(c: Context): boolean {
  return (
    accepts(c, {
      header: 'Accept',
      supports: ['text/html', 'application/json'],
      default: 'application/json',
    }) === 'text/html'
  );
}

/**
 * Ready-made error handler for `app.onError()` that maps Auth0 SDK errors to
 * appropriate HTTP responses so applications don't have to hand-map them.
 *
 * Behavior:
 * - `LoginRequiredError` for an HTML request → 302 redirect to the configured
 *   login route. The original path and query are preserved as `returnTo` when
 *   they pass an open-redirect (same-origin) check. If the `auth0()` middleware
 *   was never applied, the original error is re-thrown rather than masked.
 * - Any other `Auth0Error` (or `LoginRequiredError` for a JSON request) → a JSON
 *   body `{ error, error_description, statusCode }` using the error's own
 *   `status` (falling back to 500) and `code`.
 * - Non-Auth0 errors are re-thrown untouched, so application-level or Hono's
 *   default error handling still applies (errors are never swallowed).
 *
 * @example
 * ```typescript
 * import { auth0ErrorHandler } from '@auth0/auth0-hono';
 * app.onError(auth0ErrorHandler);
 * ```
 */
export const auth0ErrorHandler: ErrorHandler = (err, c) => {
  // Only handle SDK errors; let everything else propagate untouched.
  if (!(err instanceof Auth0Error)) {
    throw err;
  }

  if (err instanceof LoginRequiredError && prefersHtml(c)) {
    // getClient() throws if auth0() middleware was never applied. Guard so we
    // surface the original error instead of masking it with a config error.
    let configuration;
    try {
      ({ configuration } = getClient(c));
    } catch {
      throw err;
    }

    const loginUrl = new URL(configuration.routes.login, configuration.baseURL);
    // Preserve the full path + query as returnTo, validated against the app's
    // own origin to prevent open redirects.
    const requestUrl = new URL(c.req.url);
    const safeReturnTo = toSafeRedirect(requestUrl.pathname + requestUrl.search, configuration.baseURL);
    if (safeReturnTo) {
      loginUrl.searchParams.set('returnTo', new URL(safeReturnTo).pathname + new URL(safeReturnTo).search);
    }
    return c.redirect(loginUrl.toString(), 302);
  }

  const statusCode = err.status ?? 500;
  return c.json(
    {
      error: err.code,
      error_description: err.description,
      statusCode,
    },
    statusCode
  );
};
