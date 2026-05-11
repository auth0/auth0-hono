/**
 * Internal cache key for request-scoped session storage.
 * Stores `SessionData | null` to avoid duplicate cookie parse + decrypt operations.
 */
export const SESSION_CACHE_KEY = '__auth0_session_cache';

/**
 * Internal cache key for promise-based token refresh deduplication.
 * Stores `Map<audience, Promise<TokenSet>>` to prevent concurrent refresh requests.
 */
export const REFRESH_CACHE_KEY = '__auth0_refresh_promises';

/**
 * Internal cache key for retained StateStore reference.
 * Stores the `StateStore<Context>` instance for persisting session mutations.
 */
export const STATE_STORE_KEY = '__auth0_state_store';

/**
 * Reserved session field names that cannot be overwritten via `updateSession()`.
 * Protects critical authentication state (user, tokens, internal metadata).
 */
export const RESERVED_FIELDS = new Set([
  'user',
  'idToken',
  'refreshToken',
  'tokenSets',
  'connectionTokenSets',
  'internal',
]);
