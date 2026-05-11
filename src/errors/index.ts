// Core error class
import { Auth0Error } from './Auth0Error.js';
export { Auth0Error } from './Auth0Error.js';

/**
 * Thrown when user is denied access to a protected resource.
 * HTTP 403 Forbidden.
 */
export class AccessDeniedError extends Auth0Error {
  constructor(description?: string, cause?: unknown) {
    super('Access denied', 403, 'access_denied', { description, cause });
  }
}

/**
 * Thrown when authentication is required but user is not authenticated.
 * HTTP 401 Unauthorized.
 */
export class LoginRequiredError extends Auth0Error {
  constructor(description?: string, cause?: unknown) {
    super('Login required', 401, 'login_required', { description, cause });
  }
}

/**
 * Thrown when an authorization code or refresh token is invalid or expired.
 * HTTP 401 Unauthorized.
 */
export class InvalidGrantError extends Auth0Error {
  constructor(description?: string, cause?: unknown) {
    super('Invalid grant', 401, 'invalid_grant', { description, cause });
  }
}

/**
 * Thrown when no active session exists on an authenticated operation.
 * HTTP 401 Unauthorized.
 */
export class MissingSessionError extends Auth0Error {
  constructor(description?: string, cause?: unknown) {
    super('Missing session', 401, 'missing_session', { description, cause });
  }
}

/**
 * Thrown when callback is visited without a valid login transaction.
 * HTTP 400 Bad Request.
 */
export class MissingTransactionError extends Auth0Error {
  constructor(description?: string, cause?: unknown) {
    super('Missing transaction', 400, 'missing_transaction', {
      description,
      cause,
    });
  }
}

/**
 * Thrown when automatic token refresh fails.
 * HTTP 401 Unauthorized.
 */
export class TokenRefreshError extends Auth0Error {
  constructor(description?: string, cause?: unknown) {
    super('Token refresh failed', 401, 'token_refresh_error', {
      description,
      cause,
    });
  }
}

/**
 * Thrown when fetching access token for a connection fails.
 * HTTP 401 Unauthorized.
 */
export class ConnectionTokenError extends Auth0Error {
  constructor(description?: string, cause?: unknown) {
    super('Connection token error', 401, 'connection_token_error', {
      description,
      cause,
    });
  }
}

// Error mapper for server-js errors
export { mapServerError } from './errorMap.js';

/**
 * @deprecated Use Auth0Error instead. This alias is maintained for backward compatibility.
 */
export { Auth0Error as Auth0Exception };
