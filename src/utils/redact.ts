/**
 * Secret redaction for debug logging.
 *
 * The default debug logger enabled via `AUTH0_DEBUG` must never emit raw
 * credentials or personal data. {@link redactSecrets} walks a value and replaces
 * sensitive fields with a stable, category-specific placeholder. It is applied
 * to log metadata *before* the value reaches any logger.
 *
 * Redaction categories (matched case-insensitively on the object key):
 * - Tokens/session material — any key containing `token`, or exactly
 *   `authorization`, `cookie`, `set-cookie` → `[REDACTED_TOKEN]`.
 * - Secrets — any key containing `secret`, or exactly `password` → `[REDACTED_SECRET]`.
 * - Personally identifiable information — `email`, `phone_number`, `user_id`,
 *   `sub`, `name` → `[REDACTED_PII]`.
 * - OIDC transaction parameters — `state`, `code`, `nonce`, `code_verifier`
 *   → `[REDACTED_OIDC]`.
 *
 * Traversal is bounded: nested objects are recursed up to a depth limit, and a
 * `WeakSet` guards against circular references. Exceeding the depth yields
 * `[REDACTED_DEPTH_LIMIT]`; a detected cycle yields `[REDACTED_CIRCULAR]`.
 */

const MAX_DEPTH = 10;

const TOKEN_LABEL = '[REDACTED_TOKEN]';
const SECRET_LABEL = '[REDACTED_SECRET]';
const PII_LABEL = '[REDACTED_PII]';
const OIDC_LABEL = '[REDACTED_OIDC]';

const PII_KEYS = new Set(['email', 'phone_number', 'user_id', 'sub', 'name']);
const OIDC_KEYS = new Set(['state', 'code', 'nonce', 'code_verifier']);
const TOKEN_KEYS = new Set(['authorization', 'cookie', 'set-cookie']);

/**
 * Return the redaction placeholder for a sensitive key, or `undefined` if the
 * key is not considered sensitive.
 */
function redactionLabelFor(key: string): string | undefined {
  const lower = key.toLowerCase();

  if (lower.includes('token') || TOKEN_KEYS.has(lower)) {
    return TOKEN_LABEL;
  }
  if (lower.includes('secret') || lower === 'password') {
    return SECRET_LABEL;
  }
  if (PII_KEYS.has(lower)) {
    return PII_LABEL;
  }
  if (OIDC_KEYS.has(lower)) {
    return OIDC_LABEL;
  }
  return undefined;
}

function redactInternal(value: unknown, depth: number, seen: WeakSet<object>, scrub = false): unknown {
  if (depth > MAX_DEPTH) {
    return '[REDACTED_DEPTH_LIMIT]';
  }

  if (typeof value === 'string') {
    return scrub ? scrubString(value) : value;
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value as object)) {
    return '[REDACTED_CIRCULAR]';
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactInternal(item, depth + 1, seen, scrub));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    // An own `__proto__` key (e.g. from JSON.parse) would hit the prototype setter on assignment.
    if (key === '__proto__') continue;
    const label = redactionLabelFor(key);
    if (label) {
      result[key] = label;
    } else if (val !== null && (typeof val === 'object' || (scrub && typeof val === 'string'))) {
      result[key] = redactInternal(val, depth + 1, seen, scrub);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Produce a redacted copy of `data` safe for debug logging. Primitives are
 * returned unchanged; objects/arrays are deep-copied with sensitive fields
 * replaced. The input is never mutated.
 */
export function redactSecrets(data: unknown): unknown {
  return redactInternal(data, 0, new WeakSet<object>());
}

// Compact JWS (3 parts) or JWE (5 parts, where `alg: dir` leaves the encrypted-key part empty).
const JWT_PATTERN = /eyJ[\w-]+(?:\.[\w-]*){2,4}/g;
// Parameter-name prefixes are length-bounded so the scan stays linear on long runs of `a-a-a-`.
const SECRET_NAME = '(?:[\\w-]{0,64}(?:token|secret)|code_verifier|nonce|password)';
// `name=value` (URL query, form body)
const PARAM_PATTERN = new RegExp(`\\b((?:${SECRET_NAME}|code|state)=)[^&\\s"']+`, 'gi');
// `"name":"value"` (JSON) and `name: value`
const KEYED_VALUE_PATTERN = new RegExp(`(["']?\\b${SECRET_NAME}["']?\\s*:\\s*["']?)[^"'\\s,}&]+`, 'gi');
// `Bearer <opaque token>`
const BEARER_PATTERN = /\b(Bearer\s+)[\w.~+/=-]+/gi;

/**
 * Scrub secret-shaped substrings from free text such as an error message or
 * stack:
 * - JWT/JWE-looking strings (including a JWE with an empty second segment);
 * - `name=value` pairs for token, secret, password and OIDC parameters;
 * - `"name":"value"` and `name: value` pairs for the token/secret/password names;
 * - `Bearer <token>` credentials.
 *
 * Best effort: it complements key-based redaction and does not guarantee a
 * string is secret-free. Non-string input is returned unchanged.
 */
export function scrubString<T>(text: T): T {
  if (typeof text !== 'string') return text;
  return text
    .replace(JWT_PATTERN, '[REDACTED_TOKEN]')
    .replace(BEARER_PATTERN, '$1[REDACTED]')
    .replace(PARAM_PATTERN, '$1[REDACTED]')
    .replace(KEYED_VALUE_PATTERN, '$1[REDACTED]') as T;
}

/**
 * Produce a redacted copy of an error value for use as an `Error.cause`.
 *
 * `Error` instances keep `message`, `name` and `stack` as non-enumerable
 * properties, so {@link redactSecrets} alone would drop them. This helper
 * rebuilds an `Error` that keeps `name`, a string `code` and a
 * {@link scrubString}-scrubbed `message`/`stack`. Every other own enumerable
 * property goes through key-based redaction, with string values scrubbed, and
 * a `cause` (enumerable or not) is redacted recursively, with cycles reported
 * as `[REDACTED_CIRCULAR]`. Non-error objects get the same key-based
 * redaction and string scrubbing. The input is never mutated.
 *
 * `code` is kept on `Error` instances because libraries use it as a machine
 * identifier (for example `missing_session_error`). On plain objects it is
 * redacted like any other key, since there it may be an OAuth authorization
 * code.
 */
export function redactError(err: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (!(err instanceof Error)) {
    return redactInternal(err, depth, seen, true);
  }
  if (seen.has(err)) {
    return '[REDACTED_CIRCULAR]';
  }
  seen.add(err);

  const { code } = err as Error & { code?: unknown };
  const rest: Record<string, unknown> = { ...err };
  for (const key of ['code', 'name', 'message', 'stack', 'cause']) delete rest[key];
  const copy = new Error();
  Object.assign(copy, redactInternal(rest, depth + 1, seen, true) as Record<string, unknown>);
  // Own `name` (server-js errors set it in their constructor) must not be replaced by a PII label.
  if (typeof err.name === 'string') copy.name = err.name;
  copy.message = typeof err.message === 'string' ? scrubString(err.message) : '';
  if (typeof err.stack === 'string') copy.stack = scrubString(err.stack);
  if (typeof code === 'string') {
    (copy as Error & { code?: string }).code = code;
  }
  const originalCause = (err as Error & { cause?: unknown }).cause;
  if (originalCause !== undefined) {
    (copy as Error & { cause?: unknown }).cause =
      depth >= MAX_DEPTH ? '[REDACTED_DEPTH_LIMIT]' : redactError(originalCause, depth + 1, seen);
  }
  return copy;
}
