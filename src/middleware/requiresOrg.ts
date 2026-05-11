import { Auth0Error } from '@/errors/Auth0Error.js';
import { Auth0Context } from '@/types/auth0.js';
import { Context, MiddlewareHandler, Next } from 'hono';

/**
 * Options for requiresOrg middleware.
 *
 * Can be:
 * - `undefined`: any organization is acceptable
 * - `{ orgId: string }`: specific organization required
 * - `(c: Context) => boolean`: custom check function
 */
type RequiresOrgOptions = undefined | { orgId: string } | ((c: Context) => boolean);

/**
 * Middleware: verifies user has organization context.
 *
 * Must be registered AFTER requiresAuth() middleware.
 * If called before, returns 500 error with message.
 *
 * Enforces user has org_id claim. Optionally validates:
 * - Specific organization membership
 * - Custom organization check logic
 *
 * Populates c.var.auth0.org with { id, name } after validation.
 *
 * @param options - Optional org validation rules
 *
 * @example
 * ```typescript
 * // CORRECT: requiresAuth first, then requiresOrg
 * app.use('/dashboard', requiresAuth())
 * app.use('/dashboard', requiresOrg())
 *
 * // WRONG: requiresOrg before requiresAuth → 500 error
 * app.use('/admin', requiresOrg())
 * app.use('/admin', requiresAuth())
 *
 * // Any org required
 * app.use('/dashboard', requiresOrg())
 *
 * // Specific org required
 * app.use('/acme', requiresOrg({ orgId: 'org_123' }))
 *
 * // Custom check
 * app.use('/admin', requiresOrg((c) => {
 *   const org = c.var.auth0.user?.org_id
 *   return org?.startsWith('org_admin_')
 * }))
 * ```
 */
export function requiresOrg(options?: RequiresOrgOptions): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    // Get user from context (must be authenticated and have run requiresAuth() first)
    const user = c.var.auth0?.user;

    // Fail if not authenticated (indicates misconfiguration)
    if (!user) {
      throw new Auth0Error('requiresOrg() must be registered after requiresAuth()', 500, 'configuration_error');
    }

    // Check user has org_id claim
    const orgId = user.org_id;
    if (!orgId) {
      throw new Auth0Error('User does not belong to any organization', 403, 'missing_organization');
    }

    // If options specify a specific org, check it matches
    if (options && typeof options === 'object' && 'orgId' in options) {
      if (orgId !== options.orgId) {
        throw new Auth0Error('User does not belong to the required organization', 403, 'organization_mismatch');
      }
    }

    // If options is a function, call custom check with error handling
    if (typeof options === 'function') {
      try {
        if (!options(c)) {
          throw new Auth0Error('Organization check failed', 403, 'organization_check_failed');
        }
      } catch (err) {
        // If error is already an Auth0Error, re-throw as-is
        if (err instanceof Auth0Error) throw err;
        // organization_check_error: intentional error code when user-provided check function throws
        // This wraps unexpected errors from custom validators to prevent unhandled exceptions
        throw new Auth0Error('Organization check function threw an error', 500, 'organization_check_error', {
          cause: err,
        });
      }
    }

    // Guarantee c.var.auth0.org is populated after this middleware
    // (in case it was not populated by auth0() middleware)
    if (!c.var.auth0?.org) {
      // Type guard: org_id is truthy (checked above), but may be number from config drift
      const orgIdString = typeof orgId === 'string' ? orgId : String(orgId);

      c.set('auth0', {
        ...c.var.auth0,
        org: { id: orgIdString, name: user.org_name as string | undefined },
      } as Auth0Context);
    }

    // All checks passed — continue
    return next();
  };
}
