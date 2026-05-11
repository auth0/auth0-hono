import { OIDCAuthorizationRequestParams } from '@/config/authRequest.js';
import { SessionConfiguration } from '@/types/session.js';
import { Context } from 'hono';
import { SessionData } from '@auth0/auth0-server-js';
import { Auth0Error } from '@/errors/Auth0Error.js';

type Routes = {
  login: string;
  logout: string;
  backchannelLogout?: string;
  callback: string;
};

export interface Configuration {
  /**
   * The base URL of the OIDC provider.
   */
  domain: string;

  /**
   * The base URL of the application.
   */
  baseURL: string;

  /**
   * The client ID of the application.
   */
  clientID: string;

  /**
   * The client secret of the application.
   */
  clientSecret?: string;

  /**
   * Whether to require authentication for all routes.
   * @default true
   */
  authRequired: boolean;

  /**
   * Whether to use the IDP's logout endpoint.
   * @default false
   */
  idpLogout: boolean;

  /**
   * Session configuration options.
   *
   * @default {
   *  secret: string, // required - at least 32 characters
   *  rolling: true,
   *  absoluteDuration: 259200, // 3 days in seconds
   *  inactivityDuration: 86400, // 1 day in seconds
   *  cookie: {
   *    name: 'appSession',
   *    sameSite: 'lax',
   *    secure: undefined // auto-determined based on baseURL protocol
   *  }
   * }
   */
  session: SessionConfiguration;

  /**
   * Use this setting to prevent the default routes from being installed.
   *
   * @default []
   */
  customRoutes: (keyof Routes)[];

  /**
   * Whether to mount the default routes.
   *
   * If set to false, you must manually define routes and use the middlewares
   * login(), callback(), and logout() in your application.
   *
   * You can disable individual routes by using the `customRoutes` setting.
   */
  mountRoutes: boolean;

  /**
   * Routes options.
   *
   * @default {
   *   login: '/login',
   *   logout: '/logout',
   *   callback: '/callback',
   * }
   */
  routes: Routes;

  /**
   * Additional authorization request parameters that will be included in
   * the authorization URL.
   *
   * @default {
   *  response_type: 'id_token',
   *  scope: 'openid profile email',
   *  response_mode: 'form_post',
   * }
   */
  authorizationParams: Partial<OIDCAuthorizationRequestParams>;

  /**
   * Forwards specific query parameters from the login request to the authorization request.
   * This allows passing through parameters like 'ui_locales', 'acr_values', or custom parameters
   * that your identity provider supports without having to specify them in authorizationParams.
   */
  forwardAuthorizationParams?: string[];

  /**
   * Additional parameters that will be sent to the
   * token endpoint, typically used for parameters such as `resource`
   * in cases where multiple resource indicators were requested but
   * the authorization server only supports issuing an access token
   * with a single audience
   */
  tokenEndpointParams?: Record<string, string>;

  /**
   * Whether to use pushed authorization requests.
   * @default false
   */
  pushedAuthorizationRequests: boolean;

  /**
   * The clock tolerance for the OIDC client.
   * @default 60
   */
  clockTolerance: number;

  /**
   * Whether to enable telemetry.
   * @default true
   */
  enableTelemetry: boolean;

  /**
   * The HTTP timeout for the OIDC client.
   * @default 5000
   */
  httpTimeout?: number;

  /**
   * Hook called on successful or failed login callback.
   *
   * On success (error is null):
   * - Return SessionData to enrich the session (persisted)
   * - Return Response to override the redirect response
   * - Return void/undefined for default behavior
   *
   * On error (session is null):
   * - Return Response to override the error page
   * - Return anything else to be ignored (default error page shown)
   * - Throw to mask the error (not recommended)
   *
   * Hook errors are logged but never mask the original auth error.
   */
  onCallback?: (
    c: Context,
    error: Auth0Error | null,
    session: SessionData | null
  ) => SessionData | Response | void | Promise<SessionData | Response | void>;

  /**
   * The method to use for client authentication.
   *
   * If `authorizationParams.response_type` is `id_token` and !pushedAuthorizationRequests,
   * the @default is `none`.
   *
   * If `clientAssertionSigningKey` is provided,
   *  the @default is `private_key_jwt`.
   *
   * Otherwise, the @default is `client_secret_basic`.
   */
  clientAuthMethod: 'client_secret_basic' | 'client_secret_post' | 'client_secret_jwt' | 'private_key_jwt' | 'none';

  /**
   * The client assertion signing key.
   * Required if `clientAuthMethod` is `private_key_jwt`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clientAssertionSigningKey?: any;

  /**
   * The client assertion signing algorithm.
   * Required if `clientAuthMethod` is `private_key_jwt`.
   * @default 'RS256'
   */
  clientAssertionSigningAlg?:
    | 'RS256'
    | 'RS384'
    | 'RS512'
    | 'PS256'
    | 'PS384'
    | 'PS512'
    | 'ES256'
    | 'ES256K'
    | 'ES384'
    | 'ES512'
    | 'EdDSA';

  /**
   * Returns 401 if the user is not authenticated.
   * @default false
   */
  errorOnRequiredAuth: boolean;

  /**
   * Whether to attempt a silent login.
   * @default false
   */
  attemptSilentLogin: boolean;

  /**
   * The claims to exclude from the user identity.
   * @default ['aud', 'iss', 'iat', 'exp', 'nbf', 'nonce', 'azp', 'auth_time', 's_hash', 'at_hash', 'c_hash']
   */
  excludedClaims: string[];

  /**
   * The expected signing algorithm for the ID token.
   * @default 'RS256'
   */
  idTokenSigningAlg: string;

  /**
   * The maximum age of the discovery cache.
   * @default 10 * 60 * 1000
   */
  discoveryCacheMaxAge: number;

  /**
   * The HTTP user agent to use for the OIDC client.
   * @default 'hono-openid-connect'
   */
  httpUserAgent: string;

  /**
   * The fetch function to use for the OIDC client.
   * @default globalThis.fetch
   */
  fetch: typeof globalThis.fetch;

  /**
   * Additional parameters that will be sent to the
   * logout endpoint.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logoutParams?: Record<string, any>;

  /**
   * Logger function to use for the OIDC client.
   * @param message - The message to log.
   * @param metadata - Additional metadata to include in the log.
   */
  debug: (message: string, metadata?: Record<string, unknown>) => void;
}

// Type for the required fields that must be provided in InitConfiguration
type RequiredConfigFields = 'domain' | 'baseURL' | 'clientID';

// Type for the optional session field that should be partial in InitConfiguration
type SessionField = {
  session?: Partial<SessionConfiguration>;
};

// Type for the optional routes field that should be partial in InitConfiguration
type RoutesField = {
  routes?: Partial<Routes>;
};

/**
 * Configuration type for initializing the OIDC client.
 * This represents the input before validation, where most properties are optional
 * since they have defaults in the schema.
 */
export type InitConfiguration = Pick<Configuration, RequiredConfigFields> &
  Partial<Omit<Configuration, RequiredConfigFields | 'session' | 'routes'>> &
  SessionField &
  RoutesField;
