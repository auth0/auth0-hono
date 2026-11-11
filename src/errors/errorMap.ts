import { redactError, scrubString } from '@/utils/redact.js';
import { Auth0Error } from './Auth0Error.js';
import {
  AccessDeniedError,
  InvalidGrantError,
  MissingSessionError,
  MissingTransactionError,
  TokenRefreshError,
  ConnectionTokenError,
} from './index.js';

function scrubMessage(message: unknown): string {
  return typeof message === 'string' ? scrubString(message) : 'Unknown authentication error';
}

/**
 * Maps @auth0/auth0-server-js error codes to SDK error classes.
 *
 * Called in catch blocks of all middleware and helpers to standardize error handling.
 * Converts server-js error structures into SDK error hierarchy for consistent error handling.
 *
 * @param err - Unknown error from server-js or other sources
 * @returns Auth0Error instance (never throws)
 *
 * @example
 * ```typescript
 * try {
 *   const session = await client.getSession(c)
 * } catch (err) {
 *   throw mapServerError(err)  // Converts to MissingSessionError or Auth0Error
 * }
 * ```
 */
export function mapServerError(err: unknown): Auth0Error {
  // If already mapped, return as-is
  if (err instanceof Auth0Error) {
    return err;
  }

  // Handle null or undefined errors at entry point (critical safety check)
  if (err === null || err === undefined) {
    return new Auth0Error('Unknown error', 500, 'unknown_error', {
      cause: err,
    });
  }

  // Classification below reads the original error; only the copy stored as
  // `cause` is redacted. Redaction is best effort (key-based plus pattern
  // scrubbing of message/stack) and must never stop an error from being mapped.
  let cause: unknown;
  try {
    cause = redactError(err);
  } catch {
    // Keep the safe identifying fields so the cause is still useful for debugging.
    const fallback = new Error('[REDACTED_UNSERIALIZABLE]');
    const { name, code } = err as { name?: unknown; code?: unknown };
    if (typeof name === 'string') fallback.name = name;
    if (typeof code === 'string') (fallback as Error & { code?: string }).code = code;
    cause = fallback;
  }

  // Optional chaining makes cast safe: missing `code` or `cause` fields return undefined
  // This pattern is intentional; no additional runtime validation needed
  const errorObject = err as { code?: string; cause?: { error?: string } };
  const causeError = errorObject.cause?.error;

  // Map by error code per server-js documentation
  switch (errorObject.code) {
    case 'missing_transaction_error':
      return new MissingTransactionError(
        'No login transaction found. The callback URL may have been visited directly.',
        cause
      );

    case 'missing_session_error':
      return new MissingSessionError('No active session found.', cause);

    case 'token_by_code_error':
      // Subcases based on OAuth2 cause error
      if (causeError === 'access_denied') {
        return new AccessDeniedError('The user denied the authorization request.', cause);
      }
      if (causeError === 'invalid_grant') {
        return new InvalidGrantError('The authorization code is invalid or expired.', cause);
      }
      // Fallback: generic token exchange error
      return new Auth0Error('Token exchange failed', 401, causeError ?? 'token_exchange_error', {
        cause,
      });

    case 'token_by_refresh_token_error':
      // Subcases based on OAuth2 cause error
      if (causeError === 'invalid_grant') {
        return new InvalidGrantError('The refresh token is invalid, expired, or revoked.', cause);
      }
      return new TokenRefreshError('Failed to refresh access token.', cause);

    case 'token_for_connection_error':
      return new ConnectionTokenError('Failed to get token for connection.', cause);

    case 'backchannel_logout_error':
    case 'verify_logout_token_error':
      return new Auth0Error('Backchannel logout failed', 400, 'backchannel_logout_error', {
        cause,
      });

    case 'build_authorization_url_error':
      return new Auth0Error('Failed to build authorization URL', 500, 'authorization_url_error', {
        cause,
      });

    default:
      // Unknown errors: use 500, not 401 (unknown errors should not assume auth failure)
      return new Auth0Error(scrubMessage((err as Error)?.message), 500, 'unknown_error', {
        cause,
      });
  }
}
