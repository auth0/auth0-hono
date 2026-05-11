import { getClient } from '@/config/index.js';
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
export async function getAccessToken(c: Context): Promise<Auth0TokenSet> {
  const { client } = getClient(c);

  // Single cache key — server-js only supports one audience per client instance
  const cacheKey = '__default__';

  // NOTE: This cache uses non-atomic read-modify-write on Map.
  // Under extreme concurrency, two requests for same audience could both miss cache
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
      const { configuration } = getClient(c);
      configuration.debug(`Cache key collision detected: ${REFRESH_CACHE_KEY} was not a Map, creating new cache`);
    }

    refreshCache = new Map<string, Promise<TokenSet>>();
    c.set(REFRESH_CACHE_KEY, refreshCache);
  } else {
    refreshCache = cached;
  }

  // Check if another handler is already refreshing this audience
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
