import { Configuration } from '@/config/Configuration.js';
import { Auth0Context } from '@/types/auth0.js';
import { ServerClient, StateStore } from '@auth0/auth0-server-js';
import { Context } from 'hono';

/**
 * Module augmentation for Hono's ContextVariableMap.
 *
 * WARNING: This augmentation modifies the global ContextVariableMap.
 * If another middleware augments ContextVariableMap with conflicting names,
 * the last augmentation wins. Auth0-specific names minimize collision risk.
 *
 * All properties are optional to support:
 * - Unauthenticated requests (no user/session)
 * - Standalone handlers (auth0Client/auth0Configuration may not be set)
 * - Plain Context usage (requires null checks)
 *
 * For strict typing after auth0() middleware, use OIDCEnv instead.
 */
declare module 'hono' {
  interface ContextVariableMap {
    /**
     * Auth0 context: user, session, and organization.
     * Set by auth0() middleware on every request.
     * Null properties indicate unauthenticated request.
     */
    auth0?: Auth0Context;

    /**
     * Internal: Auth0 OIDC server client instance.
     * Set by auth0() middleware during initialization.
     */
    auth0Client?: ServerClient<Context>;

    /**
     * Internal: Parsed Auth0 configuration.
     * Set by auth0() middleware during initialization.
     */
    auth0Configuration?: Configuration;

    /**
     * Internal: Retained state store reference for session mutations.
     * Set by auth0() middleware during initialization.
     * @see STATE_STORE_KEY in lib/constants.ts
     */
    __auth0_state_store?: StateStore<Context>;

    /**
     * Internal: Request-scoped session cache.
     * @see SESSION_CACHE_KEY in lib/constants.ts
     */
    __auth0_session_cache?: unknown;

    /**
     * Internal: Promise-based token refresh cache.
     * @see REFRESH_CACHE_KEY in lib/constants.ts
     */
    __auth0_refresh_promises?: unknown;
  }
}

/**
 * Strict typing for variables after auth0() middleware.
 * All properties are required (guaranteed by auth0() middleware).
 *
 * Use `Context<OIDCEnv>` in handlers that run after auth0() middleware
 * for full type safety without null checks.
 *
 * @example
 * ```typescript
 * app.use('*', auth0())
 * app.get('/dashboard', (c: Context<OIDCEnv>) => {
 *   // c.var.auth0, auth0Client, auth0Configuration all typed and required
 *   return c.json(c.var.auth0.user)
 * })
 * ```
 */
export interface OIDCVariables {
  /**
   * Auth0 context: user, session, and organization.
   * Always present after auth0() middleware.
   */
  auth0: Auth0Context;

  /**
   * Auth0 OIDC server client instance.
   * Used internally by helpers and middleware.
   */
  auth0Client: ServerClient<Context>;

  /**
   * Parsed Auth0 configuration.
   * Used internally by helpers and middleware.
   */
  auth0Configuration: Configuration;
}

/**
 * Hono environment with Auth0 context typing.
 *
 * Use with `Context<OIDCEnv>` for full type safety:
 * ```typescript
 * app.get('/api/secure', (c: Context<OIDCEnv>) => {
 *   // All variables are typed and required
 *   return c.json({ user: c.var.auth0.user })
 * })
 * ```
 *
 * @template TBindings - Your app's bindings type (e.g., Env for Cloudflare Workers)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface OIDCEnv<TBindings = any> {
  Bindings: TBindings;
  Variables: OIDCVariables;
}
