import type { Context, ErrorHandler } from 'hono';
import { accepts } from 'hono/accepts';
import { Auth0Error } from '@/errors/Auth0Error.js';
import { LoginRequiredError } from '@/errors/index.js';
import { getClient } from '@/config/index.js';

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
 *   login route (with `returnTo` preserved), driving the user into the login flow.
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
    const { configuration } = getClient(c);
    const loginUrl = new URL(configuration.routes.login, configuration.baseURL);
    loginUrl.searchParams.set('returnTo', new URL(c.req.url).pathname);
    return c.redirect(loginUrl.toString(), 302);
  }

  const statusCode = err.status || 500;
  return c.json(
    {
      error: err.code,
      error_description: err.description,
      statusCode,
    },
    statusCode
  );
};
