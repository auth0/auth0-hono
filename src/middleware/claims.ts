import { Context, MiddlewareHandler, Next } from 'hono';
import { Auth0Error } from '@/errors/Auth0Error.js';
import { Auth0User } from '@/types/auth0.js';

/**
 * @internal Helper to extract authenticated user from context
 */
function requireUser(c: Context): Auth0User {
  const user = c.var.auth0?.user;

  if (!user) {
    throw new Auth0Error('Authentication required', 403, 'access_denied');
  }

  return user;
}

/**
 * Middleware: verifies a user claim matches exactly.
 *
 * Requires authentication (must run after requiresAuth()).
 * Throws 403 if claim value does not match.
 *
 * @param claim - The claim name to check (e.g., 'role', 'department')
 * @param value - The expected value (string, number, boolean, or null)
 *
 * @example
 * ```typescript
 * app.use('/admin', claimEquals('role', 'admin'))
 * app.use('/billing', claimEquals('email_verified', true))
 * ```
 */
export function claimEquals(claim: string, value: string | number | boolean | null): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const user = requireUser(c);

    // Check claim value
    if (user[claim] !== value) {
      throw new Auth0Error(`Claim "${claim}" does not match expected value`, 403, 'insufficient_claims', {
        description: `Expected ${claim} to equal ${JSON.stringify(value)}`,
      });
    }

    // Claim matches — continue
    return next();
  };
}

/**
 * Middleware: verifies a user claim (array) includes at least one value.
 *
 * Requires authentication (must run after requiresAuth()).
 * Throws 403 if claim is not an array or does not include any of the required values.
 *
 * @param claim - The claim name to check (must be an array)
 * @param values - One or more values to check for in the array
 *
 * @example
 * ```typescript
 * app.use('/org', claimIncludes('permissions', 'read:data', 'write:data'))
 * // Allows access if user.permissions includes either 'read:data' or 'write:data'
 * ```
 */
export function claimIncludes(claim: string, ...values: string[]): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const user = requireUser(c);

    // Get claim value
    const claimValue = user[claim];

    // Verify claim is an array
    if (!Array.isArray(claimValue)) {
      throw new Auth0Error(`Claim "${claim}" is not an array`, 403, 'insufficient_claims');
    }

    // Check if ANY of the required values are in the array
    const hasMatch = values.some((v) => claimValue.includes(v));
    if (!hasMatch) {
      throw new Auth0Error(`Claim "${claim}" does not include any of the required values`, 403, 'insufficient_claims');
    }

    // At least one value matches — continue
    return next();
  };
}

/**
 * Middleware: verifies a custom predicate function returns true for the user.
 *
 * Requires authentication (must run after requiresAuth()).
 * Throws 403 if the predicate function returns false.
 *
 * @param fn - Synchronous predicate function that receives the user object
 *
 * @example
 * ```typescript
 * app.use('/premium', claimCheck((user) => {
 *   return user.subscription === 'premium' && user.email_verified === true
 * }))
 * ```
 */
export function claimCheck(fn: (user: Auth0User) => boolean): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const user = requireUser(c);

    // Call predicate function (must be synchronous)
    if (!fn(user)) {
      throw new Auth0Error('Custom claim check failed', 403, 'insufficient_claims');
    }

    // Predicate passed — continue
    return next();
  };
}
