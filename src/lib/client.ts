import { Configuration } from '@/config/Configuration.js';
import { HonoCookieHandler } from '@/session/HonoCookieHandler.js';
import { installCaptureInterceptor } from '@/session/captureRegistry.js';
import { createRouteUrl } from '@/utils/util.js';

/** Resolve secret to string (first element if array — active encryption key). */
function resolveSecret(secret: string | string[]): string {
  return Array.isArray(secret) ? secret[0] : secret;
}
import {
  CookieTransactionStore,
  ServerClient,
  StatefulStateStore,
  StatelessStateStore,
  StateStore,
} from '@auth0/auth0-server-js';
import { Context } from 'hono';

/**
 * Bundle of Auth0 client components.
 * Retains the state store reference for session mutation helpers.
 */
export interface Auth0ClientBundle {
  /**
   * OIDC server client for Auth0 authorization flows.
   */
  serverClient: ServerClient<Context>;

  /**
   * State store for session persistence and retrieval.
   * Retained by SDK for use in persistSession() and updateSession() helpers.
   */
  stateStore: StateStore<Context>;

  /**
   * Cookie handler for session storage.
   */
  cookieHandler: HonoCookieHandler;
}

/**
 * Factory function to create state store based on configuration.
 *
 * Chooses between StatelessStateStore and StatefulStateStore.
 * POST-BETA: This factory pattern enables injection of session hooks wrapper.
 *
 * @param config - Parsed configuration
 * @param cookieHandler - Cookie handler instance
 * @returns State store instance
 */
export function createStateStore(config: Configuration, cookieHandler: HonoCookieHandler): StateStore<Context> {
  // Choose stateless or stateful based on config
  const baseStore = config.session.store
    ? new StatefulStateStore(
        {
          ...config.session,
          secret: resolveSecret(config.session.secret),
          store: config.session.store,
        },
        cookieHandler
      )
    : new StatelessStateStore(
        {
          ...config.session,
          secret: resolveSecret(config.session.secret),
        },
        cookieHandler
      );

  // POST-BETA: Wrap with HonoStateStore for beforeSessionSaved hook
  // if (config.beforeSessionSaved) {
  //   return new HonoStateStore(baseStore, config.beforeSessionSaved)
  // }

  return baseStore;
}

/**
 * Initialize the OpenID Connect client with retained state store reference.
 *
 * Creates ServerClient and retains state store for use by SDK helpers.
 * Server-js stores the state store as a private field, so the SDK retains
 * a reference for mutation operations via persistSession() and updateSession().
 *
 * @param config - Parsed Auth0 configuration
 * @returns Auth0ClientBundle with serverClient, stateStore, and cookieHandler
 */
export function initializeOidcClient(config: Configuration): Auth0ClientBundle {
  const cookieHandler = new HonoCookieHandler();
  const stateStore = createStateStore(config, cookieHandler);
  const stateId = config.session.cookie?.name ?? 'appSession';

  const serverClient = new ServerClient<Context>({
    domain: config.domain,
    clientId: config.clientID,
    clientSecret: config.clientSecret,
    clientAssertionSigningKey: config.clientAssertionSigningKey,
    clientAssertionSigningAlg: config.clientAssertionSigningAlg,
    authorizationParams: {
      ...config.authorizationParams,
      redirect_uri: createRouteUrl(config.routes.callback, config.baseURL).toString(),
    },
    transactionStore: new CookieTransactionStore(
      {
        secret: resolveSecret(config.session.secret),
      },
      cookieHandler
    ),
    stateStore, // Same reference retained below
    stateIdentifier: stateId,
    customFetch: config.fetch,
  });

  // Install one-time capture interceptor for concurrency-safe session capture.
  // This replaces the per-request monkey-patch pattern in callback.ts that was
  // vulnerable to race conditions under concurrent OAuth callbacks.
  installCaptureInterceptor(stateStore, stateId);

  // RETURN: Bundle with retained state store reference
  return { serverClient, stateStore, cookieHandler };
}
