/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared test fixtures for auth0-hono test suite.
 *
 * Provides factory functions for creating consistent mock objects across all test files:
 * - `createMockContext()` - Mock Hono Context with get/set and auth0 vars
 * - `createMockClient()` - Mock ServerClient with all methods as vi.fn()
 * - `createMockConfig()` - Mock Configuration with sensible defaults
 * - `createMockSession()` - Mock SessionData with standard user and token structure
 * - `createMapServerErrorMock()` - Consistent mapServerError mock implementation
 *
 * @module test/fixtures
 */

import { vi } from 'vitest';
import { Auth0Error } from '../../src/errors/Auth0Error';
import {
  AccessDeniedError,
  InvalidGrantError,
  MissingSessionError,
  MissingTransactionError,
  TokenRefreshError,
  ConnectionTokenError,
} from '../../src/errors/index';

/**
 * Creates a mock Hono Context with get/set methods and auth0 variables.
 *
 * @param overrides - Optional overrides for auth0, auth0Configuration, vars, or req
 * @returns Mock context matching Hono Context interface for testing
 *
 * @example
 * ```typescript
 * const ctx = createMockContext({
 *   auth0: { user: { sub: 'user123' } },
 *   vars: { customKey: 'value' }
 * })
 * expect(ctx.get('customKey')).toBe('value')
 * ctx.set('newKey', 'newValue')
 * ```
 */
export function createMockContext(overrides?: {
  auth0?: any;
  auth0Configuration?: any;
  vars?: Record<string, any>;
  req?: any;
}): any {
  const internalVars: Record<string, any> = {
    auth0: overrides?.auth0 ?? {},
    ...overrides?.vars,
  };

  if (overrides?.auth0Configuration) {
    internalVars.auth0Configuration = overrides.auth0Configuration;
  }

  const varProxy = {
    auth0: internalVars.auth0,
  };

  return {
    var: varProxy,
    vars: internalVars,
    get: vi.fn((key: string) => internalVars[key]),
    set: vi.fn((key: string, value: any) => {
      internalVars[key] = value;
      // Sync var proxy for auth0 context (needed for middleware that mutate auth0)
      if (key === 'auth0') {
        varProxy.auth0 = value;
      }
      return value;
    }),
    req: overrides?.req ?? {
      url: 'https://example.com',
      method: 'GET',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      header: vi.fn((_name: string) => null),
    },
    redirect: vi.fn((url: string) => {
      return new Response('', { status: 302, headers: { location: url } });
    }),
    json: vi.fn((data: any) => {
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
    text: vi.fn((text: string) => {
      return new Response(text, { status: 200 });
    }),
  };
}

/**
 * Creates a mock ServerClient with all standard methods as vi.fn() mocks.
 *
 * @param overrides - Optional method implementations or return values
 * @returns Mock ServerClient with default vi.fn() for all methods
 *
 * @example
 * ```typescript
 * const client = createMockClient({
 *   getSession: vi.fn().mockResolvedValue({ user: { sub: 'user123' } })
 * })
 * const session = await client.getSession(mockContext)
 * ```
 */
export function createMockClient(overrides?: Partial<Record<string, any>>): any {
  return {
    getSession: vi.fn(),
    getAccessToken: vi.fn(),
    getAccessTokenForConnection: vi.fn(),
    startInteractiveLogin: vi.fn(),
    completeInteractiveLogin: vi.fn(),
    logout: vi.fn(),
    handleBackchannelLogout: vi.fn(),
    ...overrides,
  };
}

/**
 * Creates a mock Configuration object with sensible defaults.
 *
 * @param overrides - Optional configuration overrides
 * @returns Mock Configuration with default values
 *
 * @example
 * ```typescript
 * const config = createMockConfig({
 *   domain: 'custom.auth0.com',
 *   baseURL: 'https://custom-app.com'
 * })
 * expect(config.domain).toBe('custom.auth0.com')
 * ```
 */
export function createMockConfig(overrides?: Record<string, any>): any {
  return {
    domain: 'test.auth0.com',
    baseURL: 'https://app.test.com',
    clientID: 'test_client_id',
    clientSecret: 'test_client_secret',
    routes: {
      login: '/auth/login',
      callback: '/auth/callback',
      logout: '/auth/logout',
    },
    session: {
      cookie: {
        name: 'appSession',
        secure: false,
        httpOnly: true,
        sameSite: 'Lax',
      },
    },
    debug: vi.fn(),
    ...overrides,
  };
}

/**
 * Creates a mock SessionData object with standard user and token structure.
 *
 * @param overrides - Optional session data overrides
 * @returns Mock SessionData with default user, tokens, and metadata
 *
 * @example
 * ```typescript
 * const session = createMockSession({
 *   user: { email: 'user@example.com' }
 * })
 * expect(session.user.sub).toBe('user123')
 * expect(session.user.email).toBe('user@example.com')
 * ```
 */
export function createMockSession(overrides?: Record<string, any>): any {
  const defaultUser = {
    sub: 'user123',
    email: 'test@example.com',
    email_verified: true,
    name: 'Test User',
    picture: 'https://example.com/avatar.jpg',
  };

  const { user: userOverrides, ...otherOverrides } = overrides ?? {};

  return {
    user: { ...defaultUser, ...userOverrides },
    idToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
    refreshToken: 'refresh_token_123',
    tokenSets: {
      default: {
        accessToken: 'access_token_123',
        audience: 'https://api.test.com',
        scope: 'openid profile email',
        expiresAt: Date.now() + 3600000,
      },
    },
    connectionTokenSets: {},
    internal: {
      sid: 'session_id_123',
      createdAt: Date.now(),
    },
    ...otherOverrides,
  };
}

/**
 * Creates a mock implementation of mapServerError function.
 *
 * Maps @auth0/auth0-server-js error codes to SDK error classes.
 * Returns Auth0Error instances as-is, wraps other errors based on code property.
 *
 * @returns vi.fn() mock that implements error mapping logic
 *
 * @example
 * ```typescript
 * const mapError = createMapServerErrorMock()
 * const auth0Error = new Auth0Error('test', 401, 'invalid_grant')
 * expect(mapError(auth0Error)).toBe(auth0Error) // passthrough
 *
 * const serverError = new Error('Refresh failed')
 * serverError.code = 'token_by_refresh_token_error'
 * expect(mapError(serverError)).toBeInstanceOf(TokenRefreshError)
 * ```
 */
export function createMapServerErrorMock() {
  return vi.fn((err: unknown): Auth0Error => {
    // Auth0Error instances pass through unchanged
    if (err instanceof Auth0Error) {
      return err;
    }

    // Handle null/undefined
    if (err === null || err === undefined) {
      return new Auth0Error('Unknown error', 500, 'unknown_error', {
        cause: err,
      });
    }

    const errorObj = err as { code?: string; cause?: { error?: string } };
    const causeError = errorObj.cause?.error;

    // Map by error code
    switch (errorObj.code) {
      case 'missing_transaction_error':
        return new MissingTransactionError(
          'No login transaction found. The callback URL may have been visited directly.',
          err
        );

      case 'missing_session_error':
        return new MissingSessionError('No active session found.', err);

      case 'token_by_code_error':
        if (causeError === 'access_denied') {
          return new AccessDeniedError('The user denied the authorization request.', err);
        }
        if (causeError === 'invalid_grant') {
          return new InvalidGrantError('The authorization code is invalid or expired.', err);
        }
        return new Auth0Error('Token exchange failed', 401, causeError ?? 'token_exchange_error', {
          cause: err,
        });

      case 'token_by_refresh_token_error':
        if (causeError === 'invalid_grant') {
          return new InvalidGrantError('The refresh token is invalid, expired, or revoked.', err);
        }
        return new TokenRefreshError('Failed to refresh access token.', err);

      case 'token_for_connection_error':
        return new ConnectionTokenError('Failed to get token for connection.', err);

      case 'backchannel_logout_error':
      case 'verify_logout_token_error':
        return new Auth0Error('Backchannel logout failed', 400, 'backchannel_logout_error', {
          cause: err,
        });

      case 'build_authorization_url_error':
        return new Auth0Error('Failed to build authorization URL', 500, 'authorization_url_error', {
          cause: err,
        });

      default:
        return new Auth0Error((err as Error)?.message ?? 'Unknown authentication error', 500, 'unknown_error', {
          cause: err,
        });
    }
  });
}
