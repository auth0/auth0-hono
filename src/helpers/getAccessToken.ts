import { getClient } from '@/config/index.js';
import { Auth0Error } from '@/errors/Auth0Error.js';
import { mapServerError } from '@/errors/errorMap.js';
import { REFRESH_CACHE_KEY } from '@/lib/constants.js';
import { TokenSet } from '@auth0/auth0-server-js';
import { Context } from 'hono';
import { invalidateSessionCache } from './sessionCache.js';

/**
 * Re-export server-js TokenSet as public return type.
 */
export type Auth0TokenSet = TokenSet;

/**
 * Options for {@link getAccessToken}.
 *
 * All fields are optional; omitting the options object preserves the original
 * single-audience behavior exactly.
 */
export interface GetAccessTokenOptions {
  /**
   * Target audience for the access token.
   *
   * The underlying `@auth0/auth0-server-js` client binds its audience once, at
   * construction time (from `authorizationParams.audience`), and does not accept
   * a per-call audience. To fail loud rather than silently return a token for the
   * wrong audience, passing an `audience` that differs from the configured one
   * throws an {@link Auth0Error} with code `unsupported_audience_override`.
   * Passing the same audience as configured (or omitting it) is always allowed.
   */
  audience?: string;
  /**
   * Scope hint used to partition the per-request token cache. Distinct scopes are
   * cached separately so callers requesting different scopes never share a cached
   * token. Note: the server-js client determines the scope actually requested;
   * this value affects cache keying, not the upstream token request.
   */
  scope?: string;
  /**
   * When `true`, bypass any cached in-flight token for this key and force a fresh
   * `getAccessToken` call. Default: `false`.
   */
  refresh?: boolean;
}

/**
 * Compute the per-request refresh-cache key for the given options.
 *
 * No options (or neither audience nor scope) → `'__default__'`, preserving the
 * original cache key so existing callers hit the same entry. Otherwise the key
 * is `"<audience>:<scope>"` so distinct audience/scope pairs are isolated.
 */
function computeCacheKey(options?: GetAccessTokenOptions): string {
  if (!options || (!options.audience && !options.scope)) {
    return '__default__';
  }
  return `${options.audience ?? ''}:${options.scope ?? ''}`;
}

/**
 * Get an access token, auto-refreshing if expired.
 *
 * Public API helper with intelligent caching:
 * - Promise-based deduplication within a request (prevents concurrent refreshes)
 * - Auto-refresh if token is expired
 * - Session cache invalidation after refresh
 * - Proper error mapping
 *
 * NOTE: The token audience is determined by `authorizationParams.audience` in the
 * auth0() middleware config.
 * For connection-scoped tokens, use `getAccessTokenForConnection()`.
 *
 * @param c - Hono context
 * @returns Auth0TokenSet with accessToken string and metadata
 * @throws Auth0Error (mapped from server-js errors)
 *
 * @example
 * ```typescript
 * try {
 *   const token = await getAccessToken(c)
 *   console.log(token.accessToken)  // JWT string
 *   console.log(token.expiresAt)    // Unix timestamp
 * } catch (err) {
 *   if (err instanceof InvalidGrantError) {
 *     // Refresh token is invalid or revoked
 *   }
 * }
 * ```
 *
 * @see getAccessTokenForConnection - Get token for a specific connection/provider
 * @see updateSession - Merge custom data into session
 */
export async function getAccessToken(c: Context, options?: GetAccessTokenOptions): Promise<Auth0TokenSet> {
  const { client, configuration } = getClient(c);

  // Fail loud on a per-call audience that differs from the configured one:
  // server-js binds audience per client instance, so we cannot honor an override.
  if (options?.audience) {
    const configuredAudience = configuration.authorizationParams?.audience;
    if (options.audience !== configuredAudience) {
      throw new Auth0Error(
        'Per-call audience override is not supported',
        400,
        'unsupported_audience_override',
        {
          description: `The requested audience "${options.audience}" does not match the configured audience${
            configuredAudience ? ` "${configuredAudience}"` : ''
          }. Configure authorizationParams.audience on the auth0() middleware instead.`,
        }
      );
    }
  }

  // Cache key: '__default__' preserves original behavior for option-less calls;
  // otherwise partition by audience/scope so tokens never bleed across keys.
  const cacheKey = computeCacheKey(options);

  // NOTE: This cache uses non-atomic read-modify-write on Map.
  // Under extreme concurrency, two requests for same key could both miss cache
  // and create duplicate refresh promises. This is acceptable because:
  // 1. Both promises resolve to same token (idempotent)
  // 2. Extra refresh work is wasteful but not incorrect
  // 3. Serverless handlers execute sequentially per request (low risk)
  // 4. Token refresh is already server-side cached (additional level)

  // Get or initialize refresh promise cache for this request
  const cached = c.get(REFRESH_CACHE_KEY);
  let refreshCache: Map<string, Promise<TokenSet>>;

  // Runtime check: ensure cache is actually a Map (not overwritten by other middleware)
  if (!cached || !(cached instanceof Map)) {
    // Either no cache or invalid type: create new Map
    if (cached && !(cached instanceof Map)) {
      // Log that cache was invalid type (helps debug conflicts)
      configuration.debug(`Cache key collision detected: ${REFRESH_CACHE_KEY} was not a Map, creating new cache`);
    }

    refreshCache = new Map<string, Promise<TokenSet>>();
    c.set(REFRESH_CACHE_KEY, refreshCache);
  } else {
    refreshCache = cached;
  }

  // Force-refresh: drop any in-flight/cached promise for this key first.
  if (options?.refresh) {
    refreshCache.delete(cacheKey);
  }

  // Check if another handler is already refreshing this key
  let promise = refreshCache.get(cacheKey);
  if (!promise) {
    // No in-flight refresh — create new promise
    // server-js client.getAccessToken() handles:
    // - Checking token expiry
    // - Refreshing if needed
    // - Persisting new token to state store
    // - Returning full TokenSet (not just string)
    promise = client.getAccessToken(c);

    // Cache the promise so concurrent calls await the same refresh
    refreshCache.set(cacheKey, promise);
  }

  // Wait for refresh (whether cached or in-flight)
  try {
    const tokenSet = await promise;

    // After refresh, session may have changed (new tokens)
    // Invalidate session cache so next getSession() reloads
    invalidateSessionCache(c);

    return tokenSet;
  } catch (err) {
    // On error, remove stale promise from cache so next call attempts fresh refresh
    refreshCache.delete(cacheKey);

    // Also invalidate session cache (same as success path)
    invalidateSessionCache(c);

    // Map error to SDK error type and throw
    throw mapServerError(err);
  }
}
