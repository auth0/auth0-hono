import { InitConfiguration } from '@/config/Configuration.js';
import { MakeOptional } from '@/types/util.js';
import { redactSecrets } from '@/utils/redact.js';

/** Values (case-insensitive) that enable debug logging via AUTH0_DEBUG. */
const DEBUG_TRUTHY = new Set(['true', '1', 'yes', 'on']);

/** Whether the AUTH0_DEBUG env value should enable the default debug logger. */
const isDebugEnabled = (value: unknown): boolean =>
  typeof value === 'string' && DEBUG_TRUTHY.has(value.toLowerCase());

/**
 * Default debug logger used when AUTH0_DEBUG is enabled and no explicit `debug`
 * function was supplied. Log metadata is passed through {@link redactSecrets} so
 * tokens, secrets, and PII are never written to the log.
 */
const createDefaultDebugLogger =
  (): ((message: string, metadata?: Record<string, unknown>) => void) =>
  (message: string, metadata?: Record<string, unknown>): void => {
    if (metadata === undefined) {
      console.log(`[auth0-hono] ${message}`);
      return;
    }
    console.log(`[auth0-hono] ${message}`, redactSecrets(metadata));
  };

export type MinimalConfigByEnv = {
  AUTH0_DOMAIN: string;
  AUTH0_CLIENT_ID: string;
  AUTH0_CLIENT_SECRET?: string;
  AUTH0_AUDIENCE?: string;
  APP_BASE_URL: string;
  AUTH0_SESSION_ENCRYPTION_KEY?: string;
  AUTH0_DEBUG?: string;
};

export type PartialConfig = MakeOptional<
  InitConfiguration,
  'clientID' | 'clientSecret' | 'domain' | 'baseURL' | 'session'
>;

export const envHasConfig = (config: MinimalConfigByEnv | unknown): config is MinimalConfigByEnv => {
  return (
    typeof config === 'object' &&
    config !== null &&
    'AUTH0_DOMAIN' in config &&
    'AUTH0_CLIENT_ID' in config &&
    'APP_BASE_URL' in config &&
    typeof config.AUTH0_DOMAIN === 'string' &&
    typeof config.AUTH0_CLIENT_ID === 'string' &&
    typeof config.APP_BASE_URL === 'string'
  );
};

/**
 * Merge environment variables with explicit config.
 *
 * Resolution order:
 * 1. Explicit config values (highest priority)
 * 2. Environment variables from runtimeEnv
 * 3. Zod schema defaults (lowest priority)
 *
 * @param config - Explicit configuration object
 * @param runtimeEnv - Runtime environment variables (from hono/adapter env(c), NOT process.env)
 * @returns Merged configuration with env vars applied
 */
export const assignFromEnv = (
  config: PartialConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runtimeEnv: Record<string, any>
): InitConfiguration => {
  const configWithoutEnv = config ?? ({} as PartialConfig);
  if (!envHasConfig(runtimeEnv)) {
    return configWithoutEnv as InitConfiguration;
  }

  const {
    AUTH0_DOMAIN,
    AUTH0_CLIENT_ID,
    AUTH0_CLIENT_SECRET,
    APP_BASE_URL,
    AUTH0_AUDIENCE,
    AUTH0_SESSION_ENCRYPTION_KEY,
    AUTH0_DEBUG,
  } = runtimeEnv;

  const authorizationParams = { ...configWithoutEnv.authorizationParams };
  authorizationParams.audience = authorizationParams.audience ?? AUTH0_AUDIENCE;

  // Debug precedence: an explicit config.debug always wins; otherwise enable a
  // redacting default logger only when AUTH0_DEBUG is truthy.
  const debug =
    configWithoutEnv.debug ?? (isDebugEnabled(AUTH0_DEBUG) ? createDefaultDebugLogger() : undefined);

  return {
    ...configWithoutEnv,
    domain: configWithoutEnv.domain ?? AUTH0_DOMAIN,
    clientID: configWithoutEnv.clientID ?? AUTH0_CLIENT_ID,
    clientSecret: configWithoutEnv.clientSecret ?? AUTH0_CLIENT_SECRET,
    baseURL: configWithoutEnv.baseURL ?? APP_BASE_URL,
    authorizationParams: authorizationParams,
    session: {
      ...(configWithoutEnv.session || {}),
      secret: configWithoutEnv.session?.secret ?? AUTH0_SESSION_ENCRYPTION_KEY,
    },
    ...(debug ? { debug } : {}),
  };
};
