import { LogoutTokenClaims, StateData } from '@auth0/auth0-server-js';
import { Context } from 'hono';

/**
 * The session payload stored during the login process.
 * This is stored in session.oidc_tx
 */
export interface OIDCTransaction {
  codeVerifier?: string;
  nonce: string;
  state: string;
  returnTo?: string;
  silent: boolean;
}

export interface SessionCookieOptions {
  /**
   * The name of the session cookie.
   *
   * Default: `appSession`.
   */
  name?: string;
  /**
   * The sameSite attribute of the session cookie.
   *
   * Default: `lax`.
   */
  sameSite?: 'strict' | 'lax' | 'none';
  /**
   * The secure attribute of the session cookie.
   *
   * Default: depends on the protocol of the application's base URL. If the protocol is `https`, then `true`, otherwise `false`.
   */
  secure?: boolean;
}

export interface SessionConfiguration {
  /**
   * The encryption key used to encrypt the session data.
   */
  secret: string;

  /**
   * The store used to persist the session data.
   */
  store?: SessionStore;

  /**
   * A boolean indicating whether rolling sessions should be used or not.
   *
   * When enabled, the session will continue to be extended as long as it is used within the inactivity duration.
   * Once the upper bound, set via the `absoluteDuration`, has been reached, the session will no longer be extended.
   *
   * Default: `true`.
   */
  rolling?: boolean;
  /**
   * The absolute duration after which the session will expire. The value must be specified in seconds..
   *
   * Once the absolute duration has been reached, the session will no longer be extended.
   *
   * Default: 3 days.
   */
  absoluteDuration?: number;
  /**
   * The duration of inactivity after which the session will expire. The value must be specified in seconds.
   *
   * The session will be extended as long as it was active before the inactivity duration has been reached.
   *
   * Default: 1 day.
   */
  inactivityDuration?: number;

  /**
   * The options for the session cookie.
   */
  cookie?: SessionCookieOptions;
}

export abstract class SessionStore {
  abstract delete(identifier: string): Promise<void>;
  abstract set(identifier: string, stateData: StateData): Promise<void>;
  abstract get(identifier: string): Promise<StateData | undefined>;
  abstract deleteByLogoutToken(claims: LogoutTokenClaims, c?: Context | undefined): Promise<void>;
}
