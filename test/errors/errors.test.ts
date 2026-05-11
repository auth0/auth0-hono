/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { HTTPException } from 'hono/http-exception';
import {
  Auth0Error,
  AccessDeniedError,
  LoginRequiredError,
  InvalidGrantError,
  MissingSessionError,
  MissingTransactionError,
  TokenRefreshError,
  ConnectionTokenError,
  mapServerError,
  Auth0Exception,
} from '@/errors';

describe('Error Classes', () => {
  describe('Auth0Error base class', () => {
    it('should create Auth0Error with code, status, and description', () => {
      const error = new Auth0Error('Test message', 401, 'test_code', {
        description: 'Test description',
      });

      expect(error).toBeInstanceOf(Auth0Error);
      expect(error).toBeInstanceOf(HTTPException);
      expect(error.status).toBe(401);
      expect(error.code).toBe('test_code');
      expect(error.description).toBe('Test description');
      expect(error.message).toBe('Test message');
    });

    it('should default description to message if not provided', () => {
      const error = new Auth0Error('Default description', 401, 'test_code');

      expect(error.description).toBe('Default description');
    });

    it('should support cause option for error chaining', () => {
      const originalError = new Error('Original error');
      const auth0Error = new Auth0Error('Wrapped error', 500, 'wrapped', {
        cause: originalError,
      });

      expect(auth0Error.cause).toBe(originalError);
    });

    it('should return OAuth2-compliant JSON response', async () => {
      const error = new Auth0Error('Invalid token', 401, 'invalid_grant', {
        description: 'The token is invalid or expired',
      });

      const response = error.getResponse();
      expect(response.status).toBe(401);
      expect(response.headers.get('content-type')).toBe('application/json');

      const body = await response.json();
      expect(body).toEqual({
        error: 'invalid_grant',
        error_description: 'The token is invalid or expired',
      });
    });

    it('should not leak cause in response body', async () => {
      const originalError = new Error('Sensitive info');
      const auth0Error = new Auth0Error('Public message', 500, 'unknown', {
        cause: originalError,
      });

      const response = auth0Error.getResponse();
      const body = await response.json();

      expect(body).toEqual({
        error: 'unknown',
        error_description: 'Public message',
      });
      expect(JSON.stringify(body)).not.toContain('Sensitive');
    });
  });

  describe('Error subclasses', () => {
    it('AccessDeniedError should have status 403 and code "access_denied"', () => {
      const error = new AccessDeniedError('User denied access');

      expect(error).toBeInstanceOf(Auth0Error);
      expect(error).toBeInstanceOf(HTTPException);
      expect(error.status).toBe(403);
      expect(error.code).toBe('access_denied');
    });

    it('LoginRequiredError should have status 401 and code "login_required"', () => {
      const error = new LoginRequiredError('Login is required');

      expect(error).toBeInstanceOf(Auth0Error);
      expect(error.status).toBe(401);
      expect(error.code).toBe('login_required');
    });

    it('InvalidGrantError should have status 401 and code "invalid_grant"', () => {
      const error = new InvalidGrantError('Token is invalid');

      expect(error).toBeInstanceOf(Auth0Error);
      expect(error.status).toBe(401);
      expect(error.code).toBe('invalid_grant');
    });

    it('MissingSessionError should have status 401 and code "missing_session"', () => {
      const error = new MissingSessionError('No session found');

      expect(error).toBeInstanceOf(Auth0Error);
      expect(error.status).toBe(401);
      expect(error.code).toBe('missing_session');
    });

    it('MissingTransactionError should have status 400 and code "missing_transaction"', () => {
      const error = new MissingTransactionError('Transaction not found');

      expect(error).toBeInstanceOf(Auth0Error);
      expect(error.status).toBe(400);
      expect(error.code).toBe('missing_transaction');
    });

    it('TokenRefreshError should have status 401 and code "token_refresh_error"', () => {
      const error = new TokenRefreshError('Token refresh failed');

      expect(error).toBeInstanceOf(Auth0Error);
      expect(error.status).toBe(401);
      expect(error.code).toBe('token_refresh_error');
    });

    it('ConnectionTokenError should have status 401 and code "connection_token_error"', () => {
      const error = new ConnectionTokenError('Connection token failed');

      expect(error).toBeInstanceOf(Auth0Error);
      expect(error.status).toBe(401);
      expect(error.code).toBe('connection_token_error');
    });
  });

  describe('instanceof chain', () => {
    it('should support instanceof checks throughout error hierarchy', () => {
      const error = new AccessDeniedError();

      expect(error instanceof AccessDeniedError).toBe(true);
      expect(error instanceof Auth0Error).toBe(true);
      expect(error instanceof HTTPException).toBe(true);
    });

    it('should work with try-catch and instanceof', () => {
      try {
        throw new MissingSessionError('No session');
      } catch (err) {
        expect(err instanceof MissingSessionError).toBe(true);
        expect(err instanceof Auth0Error).toBe(true);
        expect(err instanceof HTTPException).toBe(true);
      }
    });
  });

  describe('Auth0Exception deprecated alias', () => {
    it('Auth0Exception should be alias for Auth0Error', () => {
      expect(Auth0Exception).toBe(Auth0Error);
    });

    it('should create Auth0Exception instance', () => {
      const error = new Auth0Exception('Test', 500, 'test_code');

      expect(error).toBeInstanceOf(Auth0Error);
      expect(error.status).toBe(500);
      expect(error.code).toBe('test_code');
    });
  });
});

describe('Error Mapping (mapServerError)', () => {
  describe('server-js error codes mapped correctly', () => {
    it('should map missing_transaction_error to MissingTransactionError', () => {
      const serverError = new Error('Missing transaction');
      (serverError as any).code = 'missing_transaction_error';

      const mapped = mapServerError(serverError);

      expect(mapped).toBeInstanceOf(MissingTransactionError);
      expect(mapped.status).toBe(400);
      expect(mapped.code).toBe('missing_transaction');
    });

    it('should map missing_session_error to MissingSessionError', () => {
      const serverError = new Error('Missing session');
      (serverError as any).code = 'missing_session_error';

      const mapped = mapServerError(serverError);

      expect(mapped).toBeInstanceOf(MissingSessionError);
      expect(mapped.status).toBe(401);
      expect(mapped.code).toBe('missing_session');
    });

    it('should map token_by_refresh_token_error to TokenRefreshError', () => {
      const serverError = new Error('Token refresh failed');
      (serverError as any).code = 'token_by_refresh_token_error';

      const mapped = mapServerError(serverError);

      expect(mapped).toBeInstanceOf(TokenRefreshError);
      expect(mapped.status).toBe(401);
    });

    it('should map token_for_connection_error to ConnectionTokenError', () => {
      const serverError = new Error('Connection token failed');
      (serverError as any).code = 'token_for_connection_error';

      const mapped = mapServerError(serverError);

      expect(mapped).toBeInstanceOf(ConnectionTokenError);
      expect(mapped.status).toBe(401);
    });
  });

  describe('OAuth2 error codes in cause', () => {
    it('should map token_by_code_error with access_denied cause to AccessDeniedError', () => {
      const serverError = new Error('Token exchange failed');
      (serverError as any).code = 'token_by_code_error';
      (serverError as any).cause = { error: 'access_denied' };

      const mapped = mapServerError(serverError);

      expect(mapped).toBeInstanceOf(AccessDeniedError);
      expect(mapped.status).toBe(403);
      expect(mapped.code).toBe('access_denied');
    });

    it('should map token_by_code_error with invalid_grant cause to InvalidGrantError', () => {
      const serverError = new Error('Token exchange failed');
      (serverError as any).code = 'token_by_code_error';
      (serverError as any).cause = { error: 'invalid_grant' };

      const mapped = mapServerError(serverError);

      expect(mapped).toBeInstanceOf(InvalidGrantError);
      expect(mapped.status).toBe(401);
      expect(mapped.code).toBe('invalid_grant');
    });

    it('should map token_by_refresh_token_error with invalid_grant cause to InvalidGrantError', () => {
      const serverError = new Error('Token refresh failed');
      (serverError as any).code = 'token_by_refresh_token_error';
      (serverError as any).cause = { error: 'invalid_grant' };

      const mapped = mapServerError(serverError);

      expect(mapped).toBeInstanceOf(InvalidGrantError);
      expect(mapped.status).toBe(401);
      expect(mapped.code).toBe('invalid_grant');
    });
  });

  describe('Beta-relevant error mappings', () => {
    it('should map backchannel_logout_error to Auth0Error with status 400', () => {
      const serverError = new Error('Backchannel logout failed');
      (serverError as any).code = 'backchannel_logout_error';

      const mapped = mapServerError(serverError);

      expect(mapped).toBeInstanceOf(Auth0Error);
      expect(mapped.status).toBe(400);
      expect(mapped.code).toBe('backchannel_logout_error');
    });

    it('should map verify_logout_token_error to Auth0Error with status 400', () => {
      const serverError = new Error('Logout token verification failed');
      (serverError as any).code = 'verify_logout_token_error';

      const mapped = mapServerError(serverError);

      expect(mapped).toBeInstanceOf(Auth0Error);
      expect(mapped.status).toBe(400);
      expect(mapped.code).toBe('backchannel_logout_error');
    });

    it('should map build_authorization_url_error to Auth0Error with status 500', () => {
      const serverError = new Error('Failed to build auth URL');
      (serverError as any).code = 'build_authorization_url_error';

      const mapped = mapServerError(serverError);

      expect(mapped).toBeInstanceOf(Auth0Error);
      expect(mapped.status).toBe(500);
      expect(mapped.code).toBe('authorization_url_error');
    });
  });

  describe('unmapped error codes default to Auth0Error', () => {
    it('should map unknown error code to Auth0Error with status 500', () => {
      const serverError = new Error('Some unknown error');
      (serverError as any).code = 'unknown_server_error';

      const mapped = mapServerError(serverError);

      expect(mapped).toBeInstanceOf(Auth0Error);
      expect(mapped.status).toBe(500);
      expect(mapped.code).toBe('unknown_error');
    });

    it('should handle null or undefined errors', () => {
      const mapped1 = mapServerError(null);
      const mapped2 = mapServerError(undefined);

      expect(mapped1).toBeInstanceOf(Auth0Error);
      expect(mapped1.status).toBe(500);
      expect(mapped2).toBeInstanceOf(Auth0Error);
      expect(mapped2.status).toBe(500);
    });

    it('should handle already-mapped Auth0Error (passthrough)', () => {
      const auth0Error = new AccessDeniedError('Already mapped');
      const mapped = mapServerError(auth0Error);

      expect(mapped).toBe(auth0Error);
      expect(mapped.status).toBe(403);
    });

    it('should extract message from Error object when code is unknown', () => {
      const serverError = new Error('Custom error message');
      (serverError as any).code = 'custom_unknown';

      const mapped = mapServerError(serverError);

      expect(mapped.message).toBe('Custom error message');
    });
  });

  describe('error cause preservation', () => {
    it('should preserve original error in cause for debugging', () => {
      const originalError = new Error('Original server error');
      (originalError as any).code = 'missing_session_error';

      const mapped = mapServerError(originalError);

      expect(mapped.cause).toBe(originalError);
    });

    it('should not expose cause in response body', async () => {
      const originalError = new Error('Sensitive information');
      (originalError as any).code = 'missing_session_error';

      const mapped = mapServerError(originalError);
      const response = mapped.getResponse();
      const body = await response.json();

      expect(JSON.stringify(body)).not.toContain('Sensitive');
      expect(body).toEqual({
        error: 'missing_session',
        error_description: expect.any(String),
      });
    });
  });

  describe('error with cause not leaked in response', () => {
    it('TokenRefreshError with cause should not expose cause in response', async () => {
      const causedError = new Error('Invalid refresh token');
      const error = new TokenRefreshError('Token refresh failed', causedError);

      const response = error.getResponse();
      const body = await response.json();

      expect(body.error_description).not.toContain('Invalid refresh token');
      expect(error.cause).toBe(causedError);
    });
  });
});
