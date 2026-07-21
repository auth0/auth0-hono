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

function redactInternal(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > MAX_DEPTH) {
    return '[REDACTED_DEPTH_LIMIT]';
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value as object)) {
    return '[REDACTED_CIRCULAR]';
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactInternal(item, depth + 1, seen));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const label = redactionLabelFor(key);
    if (label) {
      result[key] = label;
    } else if (val !== null && typeof val === 'object') {
      result[key] = redactInternal(val, depth + 1, seen);
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
