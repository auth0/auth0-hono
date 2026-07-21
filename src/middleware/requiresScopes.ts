import { Context, MiddlewareHandler, Next } from 'hono';
import { Auth0Error } from '@/errors/Auth0Error.js';
import { requireUser } from './claims.js';

/**
 * Middleware: verifies the authenticated user was granted all required OAuth2 scopes.
 *
 * Requires authentication (must run after `requiresAuth()`). Scopes are read from
 * the user's `scope` claim, a space-delimited string per RFC 6749. This is the
 * same claim source as `c.var.auth0.user` (the ID token claims).
 *
 * Throws a 403 `Auth0Error` with code `insufficient_claims` if any required scope
 * is missing. When wired with `auth0ErrorHandler`, the 403 is content-negotiated
 * (HTML vs JSON) automatically.
 *
 * @param requiredScopes - One or more scopes that must all be present.
 *
 * @example
 * ```typescript
 * app.use('/api/data', requiresAuth(), requiresScopes('read:data'))
 * app.use('/api/admin', requiresAuth(), requiresScopes('read:data', 'write:data'))
 * ```
 */
export function requiresScopes(...requiredScopes: string[]): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const user = requireUser(c);

    // OAuth2 `scope` is a space-delimited string (RFC 6749 §3.3).
    const rawScope = typeof user.scope === 'string' ? user.scope : '';
    const grantedScopes = rawScope.split(/\s+/).filter(Boolean);

    const missing = requiredScopes.filter((scope) => !grantedScopes.includes(scope));

    if (missing.length > 0) {
      throw new Auth0Error('Required scope not granted', 403, 'insufficient_claims', {
        description: `Missing scope(s): ${missing.join(', ')}`,
      });
    }

    return next();
  };
}

/**
 * Middleware: verifies the authenticated user holds all required permissions.
 *
 * Requires authentication (must run after `requiresAuth()`). Permissions are read
 * from the user's `permissions` claim, an array of strings populated by Auth0's
 * RBAC / authorization support.
 *
 * Throws a 403 `Auth0Error` with code `insufficient_claims` if any required
 * permission is missing.
 *
 * @param requiredPermissions - One or more permissions that must all be present.
 *
 * @example
 * ```typescript
 * app.use('/admin', requiresAuth(), requiresPermissions('admin'))
 * app.use('/billing', requiresAuth(), requiresPermissions('read:billing', 'write:billing'))
 * ```
 */
export function requiresPermissions(...requiredPermissions: string[]): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const user = requireUser(c);

    const permissionsClaim = (user as { permissions?: unknown }).permissions;
    const grantedPermissions = Array.isArray(permissionsClaim)
      ? permissionsClaim.filter((p): p is string => typeof p === 'string')
      : [];

    const missing = requiredPermissions.filter((perm) => !grantedPermissions.includes(perm));

    if (missing.length > 0) {
      throw new Auth0Error('Required permission not granted', 403, 'insufficient_claims', {
        description: `Missing permission(s): ${missing.join(', ')}`,
      });
    }

    return next();
  };
}
