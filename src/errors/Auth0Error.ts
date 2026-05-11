import { HTTPException } from 'hono/http-exception';
import { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Base error class for Auth0 authentication errors.
 * Extends Hono's HTTPException for automatic error handler integration.
 *
 * Returns OAuth2-compliant JSON response:
 * ```json
 * { "error": "error_code", "error_description": "description" }
 * ```
 *
 * @example
 * ```typescript
 * throw new Auth0Error(
 *   'Invalid token',
 *   401,
 *   'invalid_grant',
 *   { description: 'The refresh token is invalid or expired.' }
 * )
 * ```
 */
export class Auth0Error extends HTTPException {
  /**
   * Machine-readable error code (e.g., 'invalid_grant').
   * Follows OAuth 2.0 error code naming convention.
   */
  readonly code: string;

  /**
   * User-visible error description.
   * Included in HTTP response body as `error_description` field.
   */
  readonly description: string;

  /**
   * Create a new Auth0Error.
   *
   * @param message - Technical message for logs (NOT included in HTTP response)
   * @param status - HTTP status code (401, 403, 400, 500, etc.)
   * @param code - OAuth2 error code (e.g., 'access_denied', 'invalid_grant')
   * @param options - Additional options:
   *   - `cause`: Original error for logging/debugging (not exposed in HTTP response)
   *   - `description`: Override default description (defaults to message parameter)
   */
  constructor(
    message: string,
    status: ContentfulStatusCode,
    code: string,
    options?: {
      cause?: unknown;
      description?: string;
    }
  ) {
    // Determine description: explicit override or fallback to message
    const description = options?.description ?? message;

    // Create OAuth2-compliant JSON response body
    const responseBody = {
      error: code,
      error_description: description,
    };

    // Create Hono Response with JSON content type
    const response = new Response(JSON.stringify(responseBody), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

    // Call parent HTTPException constructor
    super(status, {
      message,
      res: response,
      cause: options?.cause,
    });

    // Set instance properties for error handling
    this.code = code;
    this.description = description;
  }
}
