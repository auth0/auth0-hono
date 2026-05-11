import { SessionData, UserClaims } from '@auth0/auth0-server-js';

/**
 * Auth0 user claims from OIDC token and custom claims.
 *
 * Extends server-js `UserClaims` which includes standard OIDC claims:
 * - `sub`: Subject (user ID)
 * - `name`: Full name
 * - `email`: Email address
 * - `email_verified`: Whether email is verified
 * - `org_id`: Organization ID (if user is part of an organization)
 * - `org_name`: Organization name
 * - Plus any custom claims from ID token
 *
 * @example
 * ```typescript
 * const user = c.var.auth0.user
 * if (user) {
 *   console.log(user.sub)        // 'auth0|123456'
 *   console.log(user.email)      // 'user@example.com'
 *   console.log(user.org_id)     // 'org_abc123' (if user is in org)
 *   console.log(user['custom'])  // any custom claims
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Auth0User extends UserClaims {
  // Standard claims inherited from UserClaims:
  // sub: string
  // name?: string
  // email?: string
  // email_verified?: boolean
  // org_id?: string
  // org_name?: string
  // ... plus any custom claims
}

/**
 * Organization context when user belongs to an organization.
 *
 * Populated in `c.var.auth0.org` when:
 * - User has `org_id` claim in ID token, OR
 * - `requiresOrg()` middleware validates organization membership
 *
 * @example
 * ```typescript
 * const org = c.var.auth0.org
 * if (org) {
 *   console.log(org.id)   // 'org_abc123'
 *   console.log(org.name) // 'Acme Corp'
 * }
 * ```
 */
export interface Auth0Organization {
  /**
   * Organization ID from token (org_id claim).
   */
  id: string;

  /**
   * Organization name from token (org_name claim).
   * May be undefined if not included in token.
   */
  name?: string;
}

/**
 * Full session data including user, tokens, and custom enrichment fields.
 *
 * Extends server-js `SessionData` which includes:
 * - `user`: User claims from ID token
 * - `idToken`: Raw ID token JWT string (if requested)
 * - `refreshToken`: Refresh token (if requested)
 * - `tokenSets`: Array of access token objects for multiple audiences
 * - `connectionTokenSets`: Connection-specific token objects
 * - `internal`: Metadata { sid, createdAt } for session tracking
 *
 * The index signature allows custom fields from:
 * - `onCallback` hook enrichment
 * - `updateSession()` helper
 *
 * @example
 * ```typescript
 * const session = c.var.auth0.session
 * if (session) {
 *   console.log(session.user.email)       // 'user@example.com'
 *   console.log(session.idToken)          // JWT string or undefined
 *   console.log(session['custom_field'])  // any enriched fields
 * }
 * ```
 */
export interface Auth0Session extends SessionData {
  /**
   * Allow custom fields added via enrichment hooks or updateSession().
   * Reserved field names (user, idToken, refreshToken, etc.) are protected by updateSession.
   */
  [key: string]: unknown;
}

/**
 * Context object available on every request via `c.var.auth0`.
 *
 * Populated by the `auth0()` middleware on every request. All properties are nullable
 * to support unauthenticated requests.
 *
 * @example
 * ```typescript
 * app.use('*', auth0())
 * app.use('/api/*', requiresAuth())  // Optional: enforce auth
 *
 * app.get('/profile', (c) => {
 *   const { user, session, org } = c.var.auth0
 *   return c.json({ user, session, org })
 * })
 * ```
 *
 * @see Auth0User
 * @see Auth0Session
 * @see Auth0Organization
 */
export interface Auth0Context {
  /**
   * Current user claims from ID token, or null if unauthenticated.
   *
   * Includes standard OIDC claims (sub, name, email, org_id) plus custom claims.
   * Use `requiresAuth()` middleware to enforce authentication.
   */
  user: Auth0User | null;

  /**
   * Full session data including tokens and enriched custom fields, or null if unauthenticated.
   *
   * Contains all auth tokens (idToken, refreshToken, tokenSets).
   * Custom fields from `onCallback` hook or `updateSession()` are merged here.
   */
  session: Auth0Session | null;

  /**
   * Organization context when user has `org_id` claim, or null otherwise.
   *
   * Populated when user is part of an organization. Use `requiresOrg()` middleware
   * to enforce organization membership.
   */
  org: Auth0Organization | null;
}
