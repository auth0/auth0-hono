/**
 * Auth0 Configuration Factory
 *
 * This module builds a complete Auth0 middleware configuration from runtime
 * environment variables, supporting three confidential-client features:
 * - PAR (Pushed Authorization Requests)
 * - JWT-CA (private_key_jwt client assertion)
 * - BCLO (Backchannel Logout with stateful store)
 */

import { auth0 } from '@auth0/auth0-hono';
import type { Context, MiddlewareHandler } from 'hono';
import { env } from 'hono/adapter';
import { InMemorySessionStore } from './stores.js';

/** Client-assertion signing algorithms accepted for private_key_jwt (JWT-CA). */
type SigningAlg = 'RS256' | 'RS384' | 'RS512' | 'PS256' | 'PS384' | 'PS512' | 'ES256' | 'ES256K' | 'ES384' | 'ES512' | 'EdDSA';

/**
 * Decode a base64-encoded PEM key to a UTF-8 string.
 * Works on both Node.js (Buffer) and Cloudflare Workers (atob).
 */
function decodeBase64PemKey(keyBase64: string): string {
  // Try Buffer first (Node.js); fall back to atob (Workers)
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(keyBase64, 'base64').toString('utf-8');
  }
  // Workers environment: atob produces a latin1 (binary) string.
  // Map each char code to a byte, then decode as UTF-8 via TextDecoder
  // (escape/unescape are deprecated and must not be used).
  const binary = atob(keyBase64);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Build Auth0 middleware configuration from runtime environment.
 *
 * This factory receives runtime environment as a parameter (read via env(c)
 * in middleware context). Features auto-enable based on presence of env vars:
 *
 * - PAR: enabled if AUTH0_PUSHED_AUTHORIZATION_REQUESTS=true
 * - JWT-CA: enabled if AUTH0_CLIENT_ASSERTION_SIGNING_KEY is set
 * - BCLO: enabled by default (in-memory store always wired)
 *
 * @param runtimeEnv - Environment variables from hono/adapter env(c)
 * @returns Fully resolved auth0() config object
 */
export function createAuth0Config(runtimeEnv: Record<string, any>) {
  // ===== Required Configuration =====
  const domain = runtimeEnv.AUTH0_DOMAIN || '';
  const clientId = runtimeEnv.AUTH0_CLIENT_ID || '';
  const clientSecret = runtimeEnv.AUTH0_CLIENT_SECRET || '';
  const baseUrl = runtimeEnv.APP_BASE_URL || 'http://localhost:3000';
  const sessionSecret = runtimeEnv.AUTH0_SESSION_ENCRYPTION_KEY || '';

  // ===== PAR (Pushed Authorization Requests) =====
  // pushedAuthorizationRequests: true directs the SDK to use Auth0's PAR endpoint
  // before redirecting to authorization. Improves security by decoupling request
  // from user interaction (JWT-binding, compliance). Requires confidential client
  // (clientSecret or private_key_jwt). Enabled via AUTH0_PUSHED_AUTHORIZATION_REQUESTS env var.
  const parEnabled = runtimeEnv.AUTH0_PUSHED_AUTHORIZATION_REQUESTS === 'true';

  // ===== JWT Client Assertion (private_key_jwt) =====
  // clientAssertionSigningKey + clientAssertionSigningAlg enable JWT-based client authentication.
  // Instead of sending client_secret in the body, the SDK signs a JWT with the private key
  // and sends it as client_assertion. Enhances security (no secrets exposed in tokens);
  // supported by confidential clients.
  //
  // Key supplied via AUTH0_CLIENT_ASSERTION_SIGNING_KEY (base64-encoded PKCS#8 PEM).
  // Algorithm via AUTH0_CLIENT_ASSERTION_SIGNING_ALG (default RS256).
  //
  // IMPORTANT: If key is present, clientAuthMethod auto-defaults to 'private_key_jwt' (by Schema).
  // If both clientSecret and key are present, ensure clientSecret is omitted or
  // clientAuthMethod is explicitly set to 'private_key_jwt' to avoid ambiguity.
  //
  // Note: Preferred approach is to pass PEM string directly to clientAssertionSigningKey.
  // server-js accepts both string and CryptoKey. If Workers runtime rejects PEM string,
  // convert to CryptoKey via Web Crypto API importKey('pkcs8', ...).
  const signingKeyB64 = runtimeEnv.AUTH0_CLIENT_ASSERTION_SIGNING_KEY || '';
  // Supported client-assertion signing algorithms (matches the SDK's accepted set).
  const signingAlg: SigningAlg = (runtimeEnv.AUTH0_CLIENT_ASSERTION_SIGNING_ALG || 'RS256') as SigningAlg;

  // Decode signing key from base64 (if provided)
  let signingKey: string | undefined;
  if (signingKeyB64) {
    try {
      signingKey = decodeBase64PemKey(signingKeyB64);
      // Validate PEM header (PKCS#8 format)
      if (!signingKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
        throw new Error('Invalid PEM format (expected PKCS#8; must start with -----BEGIN PRIVATE KEY-----)');
      }
    } catch (err) {
      throw new Error(
        `Failed to decode AUTH0_CLIENT_ASSERTION_SIGNING_KEY: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // ===== Backchannel Logout (BCLO) + Stateful Store =====
  // BCLO allows Auth0 to notify the app when a user session is terminated on Auth0
  // (logout, password reset, etc.). The SDK auto-mounts POST /auth/backchannel-logout
  // and validates the logout_token.
  //
  // To invalidate sessions by 'sid' (Session ID), a STATEFUL session store is required.
  // This demo provides InMemorySessionStore (Map-based) for both Node.js and local
  // Cloudflare Workers development. For production Workers, replace with a KV-backed
  // store (skeleton provided in stores.ts comments).
  //
  // InMemorySessionStore is NOT production-safe: it loses sessions on restart and
  // is not shared across instances/isolates. Warn loudly if this looks like prod.
  if (!baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
    console.warn(
      '[auth0-demo] InMemorySessionStore is in use with a non-localhost APP_BASE_URL. ' +
        'This store is demo-only — replace it with a KV/Redis/DB-backed store for production ' +
        '(see KVSessionStore skeleton in stores.ts).'
    );
  }
  const store = new InMemorySessionStore();

  // Build config
  const config = {
    domain,
    clientID: clientId,
    clientSecret: clientSecret || undefined,
    baseURL: baseUrl,
    authRequired: false,
    // Redirect to the dashboard after a successful login callback.
    // Signature matches the SDK's onCallback: (c, error, session). `error` is
    // an Auth0Error | null — null means the callback succeeded.
    onCallback: (c: Context, error: unknown) => {
      if (!error) return c.redirect('/dashboard?t=login_success');
    },
    session: {
      secret: sessionSecret,
      store, // Always enable stateful store for BCLO
    },
    pushedAuthorizationRequests: parEnabled,
    clientAssertionSigningKey: signingKey,
    clientAssertionSigningAlg: signingAlg,
  };

  return config;
}

/**
 * Lazy middleware wrapper for auth0 middleware.
 *
 * This pattern ensures createAuth0Config() is called inside middleware context
 * where env(c) is available on BOTH Node.js and Cloudflare Workers at request time.
 *
 * Usage in app.tsx:
 *   app.use('*', auth0Lazy);
 *
 * Benefits:
 * - serve-node.ts and worker.ts remain zero-edit
 * - env(c) available on both runtimes at request time
 * - Middleware is cached after first request (singleton pattern)
 *
 * Concurrency: the check + assignment below are fully synchronous (no await
 * between them), so within a single JS isolate they cannot interleave — no
 * race. Each Workers isolate keeps its own module state. The cache captures
 * the FIRST request's env; this is fine here because env is stable across a
 * deployment. If env can vary per request, key the cache by env instead.
 */
let configured: MiddlewareHandler | undefined;

export const auth0Lazy: MiddlewareHandler = async (c, next) => {
  if (!configured) {
    const runtimeEnv = env(c);
    configured = auth0(createAuth0Config(runtimeEnv));
  }
  return configured(c, next);
};
