import { MiddlewareHandler, Next } from 'hono';
import { env } from 'hono/adapter';
import { every } from 'hono/combine';
import { createMiddleware } from 'hono/factory';

import { Configuration } from '@/config/Configuration.js';
import { PartialConfig } from '@/config/envConfig.js';
import { assignFromEnv, parseConfiguration } from '@/config/index.js';
import { mapServerError } from '@/errors/errorMap.js';
import { getCachedSession } from '@/helpers/sessionCache.js';
import { Auth0ClientBundle, initializeOidcClient } from '@/lib/client.js';
import { OIDCEnv } from '@/lib/honoEnv.js';
import {
  backchannelLogout as backchannelLogoutHandler,
  callback as callbackHandler,
  login as loginHandler,
  logout as logoutHandler,
  requiresAuth,
} from '@/middleware/index.js';
import { HonoCookieHandler } from '@/session/HonoCookieHandler.js';
import { Auth0Context, Auth0Organization, Auth0Session, Auth0User } from '@/types/auth0.js';

/**
 * Main Auth0 OIDC middleware.
 *
 * Initializes the Auth0 OIDC client on first request (lazy singleton pattern).
 * Handles standard OIDC routes (/auth/login, /auth/callback, etc.).
 * Eagerly loads session and populates c.var.auth0 on every request.
 *
 * @param initConfig - Optional explicit configuration (overrides env vars)
 * @returns Middleware handler
 *
 * @example
 * ```typescript
 * app.use('*', auth0())
 * app.use('/api/*', requiresAuth())
 * app.get('/profile', (c) => c.json(c.var.auth0.user))
 * ```
 */
export function auth0(initConfig: PartialConfig = {}): MiddlewareHandler {
  // Promise-based init: future-proof against async additions.
  // KNOWN LIMITATION: Singleton captures env from first request. Subsequent requests
  // with different env bindings (e.g., multi-tenant Cloudflare Workers) will use
  // the first request's config.
  let initPromise: Promise<Auth0ClientBundle & { config: Configuration }> | undefined;

  // Middleware to set ALS context (for HonoCookieHandler fallback)
  const setHonoContext = createMiddleware(async (c, next) => {
    return HonoCookieHandler.setContext(c, () => next());
  });

  // Main OIDC middleware with lazy singleton init
  const oidcMiddleware: MiddlewareHandler = createMiddleware<OIDCEnv>(
    async (c, next: Next): Promise<Response | void> => {
      try {
        // === LAZY SINGLETON INITIALIZATION ===
        if (!initPromise) {
          initPromise = Promise.resolve().then(() => {
            // Get runtime environment (no process.env!)
            const runtimeEnv = env(c);

            // Merge: explicit config > env vars > defaults
            const withEnvVars = assignFromEnv(initConfig, runtimeEnv);

            // Parse and validate config
            const config = parseConfiguration(withEnvVars);

            // Initialize OIDC client with retained state store
            const bundle = initializeOidcClient(config);

            return { ...bundle, config };
          });
        }

        // Await initialization (handles cold start concurrency)
        // cookieHandler not destructured — stateless singleton, referenced internally by stateStore
        const { serverClient, stateStore, config } = await initPromise;

        // === SET CONTEXT VARIABLES ===
        c.set('auth0Client', serverClient);
        c.set('auth0Configuration', config);
        c.set('__auth0_state_store', stateStore);

        // === ROUTE HANDLING ===
        // Check if this request matches a mounted auth route
        const { routes, mountRoutes } = config;
        const { login, callback, logout, backchannelLogout } = routes;

        // /auth/login
        if (mountRoutes && !config.customRoutes.includes('login') && c.req.path === login && c.req.method === 'GET') {
          return loginHandler()(c, next);
        }

        // /auth/callback
        if (mountRoutes && !config.customRoutes.includes('callback') && c.req.path === callback) {
          return callbackHandler()(c, next);
        }

        // /auth/logout
        if (mountRoutes && !config.customRoutes.includes('logout') && c.req.path === logout && c.req.method === 'GET') {
          return logoutHandler()(c, next);
        }

        // /auth/backchannel-logout
        if (
          mountRoutes &&
          !config.customRoutes.includes('backchannelLogout') &&
          c.req.path === backchannelLogout &&
          c.req.method === 'POST'
        ) {
          return backchannelLogoutHandler()(c, next);
        }

        // === EAGER SESSION LOADING & CONTEXT POPULATION ===
        // Load session on every request (~1-2ms for cookie parse + decrypt)
        const session = await getCachedSession(c);

        // Ensure cache is set (getCachedSession should do this, but be explicit)
        c.set('__auth0_session_cache', session ?? null);

        // Populate c.var.auth0 with user, session, org
        const user = session?.user ?? null;
        const org = user?.org_id ? { id: user.org_id, name: user.org_name } : null;

        c.set('auth0', {
          user: user as Auth0User | null,
          session: session as Auth0Session | null,
          org: org as Auth0Organization | null,
        } as Auth0Context);

        // === OPTIONAL AUTH ENFORCEMENT ===
        if (config.authRequired) {
          return requiresAuth()(c, next);
        }

        // Continue to next middleware
        return next();
      } catch (err) {
        // Map server-js errors to SDK errors, propagate to app.onError
        throw mapServerError(err);
      }
    }
  );

  // Compose: setHonoContext (ALS) + oidcMiddleware
  return every(setHonoContext, oidcMiddleware);
}

/**
 * @deprecated Use auth0() instead. This alias is maintained for backward compatibility.
 */
export const auth = auth0;
