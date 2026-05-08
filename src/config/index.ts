import { env } from 'hono/adapter';
import { Context } from 'hono';
import { Auth0Error } from '@/errors/index.js';
import { initializeOidcClient } from '@/lib/client.js';
import { STATE_STORE_KEY } from '@/lib/constants.js';
import { Configuration, InitConfiguration } from './Configuration.js';
import { ConfigurationSchema } from './Schema.js';
import { assignFromEnv } from './envConfig.js';

/**
 * Two-tier configuration cache.
 *
 * Zod .parse() costs ~1-2ms. Caching avoids re-parsing on every request.
 * Config objects can contain non-serializable function fields (debug, fetch, onCallback)
 * which JSON.stringify drops — making JSON-only caching produce false cache hits
 * when two configs differ only in their function fields.
 *
 * Tier 1 — WeakMap by object reference:
 *   Serves auth0() middleware which reuses the same config object (closure variable).
 *   Functions preserved correctly. O(1) lookup. Auto-GC via WeakMap.
 *
 * Tier 2 — Map by JSON.stringify key:
 *   Serves ensureClient() which creates a new config object per request from env(c).
 *   These configs never contain functions (env-only), so JSON serialization is safe
 *   and collision-free.
 *
 * Why not single-tier:
 *   - WeakMap only: ensureClient() always misses (new object each request) → re-parse every call.
 *   - JSON only: auth0() configs with different functions get same key → wrong function used.
 *   - Mutating config (Symbol ID): violates user expectations, breaks Object.freeze'd configs.
 *
 * Implicit idempotency: auth0() uses reference identity, ensureClient() uses value identity.
 * No customer-facing key needed.
 */
const parsedConfigByRef = new WeakMap<object, Configuration>();
const parsedConfigByValue = new Map<string, Configuration>();

export const parseConfiguration = (config: InitConfiguration): Configuration => {
  // Tier 1: Reference equality (auth0() middleware — same closure object every request)
  if (parsedConfigByRef.has(config)) {
    return parsedConfigByRef.get(config)!;
  }

  // Tier 2: Value equality (ensureClient() — new object from env, no functions)
  const cacheKey = JSON.stringify(config);
  if (parsedConfigByValue.has(cacheKey)) {
    const cached = parsedConfigByValue.get(cacheKey)!;
    // Promote to Tier 1 for future hits with same reference
    parsedConfigByRef.set(config, cached);
    return cached;
  }

  // Cache miss — full Zod parse
  const result = ConfigurationSchema.parse(config) as Configuration;
  parsedConfigByRef.set(config, result);
  parsedConfigByValue.set(cacheKey, result);
  return result;
};

export { assignFromEnv } from '@/config/envConfig.js';

/**
 * Get initialized Auth0 client and configuration from context.
 * Throws if not initialized (must call ensureClient first or use auth0() middleware).
 *
 * Accepts plain Context to support standalone handlers that call ensureClient(c) first.
 * Runtime checks verify variables are present; no type augmentation required.
 *
 * @throws Auth0Error if client or configuration not in context
 */
export const getClient = (c: Context) => {
  if (!c.var.auth0Client || !c.var.auth0Configuration) {
    throw new Auth0Error(
      'Auth0 client not initialized. Ensure auth0() middleware is registered.',
      500,
      'configuration_error'
    );
  }
  return {
    client: c.var.auth0Client,
    configuration: c.var.auth0Configuration,
  };
};

/**
 * Initialize Auth0 client from runtime environment (for standalone handlers).
 *
 * If client is already initialized (by auth0() middleware), this is a no-op.
 * Otherwise, reads configuration from env(c) and initializes the client.
 *
 * Used by standalone handler wrappers (handleLogin, handleLogout, etc.)
 * to enable use without auth0() middleware.
 *
 * @param c - Hono context
 * @throws Auth0Error if configuration is invalid or incomplete
 */
export async function ensureClient(c: Context): Promise<void> {
  // If already initialized by auth0() middleware, do nothing
  if (c.var.auth0Client) {
    return;
  }

  // Initialize from runtime environment (no process.env!)
  const runtimeEnv = env(c);
  const withEnvVars = assignFromEnv({}, runtimeEnv);
  const config = parseConfiguration(withEnvVars);
  const bundle = initializeOidcClient(config);

  // Set context variables for standalone mode
  c.set('auth0Client', bundle.serverClient);
  c.set('auth0Configuration', config);
  c.set(STATE_STORE_KEY, bundle.stateStore);
}
