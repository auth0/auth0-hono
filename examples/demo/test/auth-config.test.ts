import { describe, it, expect, beforeEach } from 'vitest';
import { createAuth0Config } from '../auth-config.js';
import { InMemorySessionStore } from '../stores.js';
import crypto from 'crypto';

describe('createAuth0Config', () => {
  let validPrivatePemKey: string;
  let validPrivateKeyBase64: string;

  beforeEach(() => {
    // Generate a fresh RSA key pair for each test (hermetic)
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    validPrivatePemKey = privateKey;
    validPrivateKeyBase64 = Buffer.from(validPrivatePemKey, 'utf-8').toString('base64');
  });

  // Base config required fields
  it('should assemble base configuration with required fields', () => {
    const env = {
      AUTH0_DOMAIN: 'tenant.auth0.com',
      AUTH0_CLIENT_ID: 'abc123',
      AUTH0_CLIENT_SECRET: 'secret456',
      AUTH0_SESSION_ENCRYPTION_KEY: 'key32chars_key32chars_key32chars_',
      APP_BASE_URL: 'http://localhost:3000',
    };

    const config = createAuth0Config(env);

    expect(config.domain).toBe('tenant.auth0.com');
    expect(config.clientID).toBe('abc123');
    expect(config.clientSecret).toBe('secret456');
    expect(config.baseURL).toBe('http://localhost:3000');
    expect(config.session?.secret).toBe('key32chars_key32chars_key32chars_');
  });

  // PAR flag true
  it('should enable PAR when AUTH0_PUSHED_AUTHORIZATION_REQUESTS=true', () => {
    const env = {
      AUTH0_DOMAIN: 'tenant.auth0.com',
      AUTH0_CLIENT_ID: 'abc123',
      AUTH0_SESSION_ENCRYPTION_KEY: 'key32chars_key32chars_key32chars_',
      APP_BASE_URL: 'http://localhost:3000',
      AUTH0_PUSHED_AUTHORIZATION_REQUESTS: 'true',
    };

    const config = createAuth0Config(env);

    expect(config.pushedAuthorizationRequests).toBe(true);
  });

  // PAR flag false/absent
  it('should disable PAR when AUTH0_PUSHED_AUTHORIZATION_REQUESTS=false or absent', () => {
    const envFalse = {
      AUTH0_DOMAIN: 'tenant.auth0.com',
      AUTH0_CLIENT_ID: 'abc123',
      AUTH0_SESSION_ENCRYPTION_KEY: 'key32chars_key32chars_key32chars_',
      APP_BASE_URL: 'http://localhost:3000',
      AUTH0_PUSHED_AUTHORIZATION_REQUESTS: 'false',
    };

    const envAbsent = {
      AUTH0_DOMAIN: 'tenant.auth0.com',
      AUTH0_CLIENT_ID: 'abc123',
      AUTH0_SESSION_ENCRYPTION_KEY: 'key32chars_key32chars_key32chars_',
      APP_BASE_URL: 'http://localhost:3000',
    };

    const configFalse = createAuth0Config(envFalse);
    const configAbsent = createAuth0Config(envAbsent);

    expect(configFalse.pushedAuthorizationRequests).toBe(false);
    expect(configAbsent.pushedAuthorizationRequests).toBe(false);
  });

  // JWT-CA key present (base64 decode + validation)
  it('should decode base64 signing key and validate PEM format', () => {
    const env = {
      AUTH0_DOMAIN: 'tenant.auth0.com',
      AUTH0_CLIENT_ID: 'abc123',
      AUTH0_SESSION_ENCRYPTION_KEY: 'key32chars_key32chars_key32chars_',
      APP_BASE_URL: 'http://localhost:3000',
      AUTH0_CLIENT_ASSERTION_SIGNING_KEY: validPrivateKeyBase64,
    };

    const config = createAuth0Config(env);

    expect(config.clientAssertionSigningKey).toBeDefined();
    expect(config.clientAssertionSigningKey).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    expect(config.clientAssertionSigningAlg).toBe('RS256'); // Default
  });

  // JWT-CA key absent; clientSecret present
  it('should use clientSecret when signing key is absent', () => {
    const env = {
      AUTH0_DOMAIN: 'tenant.auth0.com',
      AUTH0_CLIENT_ID: 'abc123',
      AUTH0_CLIENT_SECRET: 'mysecret',
      AUTH0_SESSION_ENCRYPTION_KEY: 'key32chars_key32chars_key32chars_',
      APP_BASE_URL: 'http://localhost:3000',
    };

    const config = createAuth0Config(env);

    expect(config.clientAssertionSigningKey).toBeUndefined();
    expect(config.clientSecret).toBe('mysecret');
  });

  // Bad base64 in signing key
  it('should throw helpful error on invalid base64 in signing key', () => {
    const env = {
      AUTH0_DOMAIN: 'tenant.auth0.com',
      AUTH0_CLIENT_ID: 'abc123',
      AUTH0_SESSION_ENCRYPTION_KEY: 'key32chars_key32chars_key32chars_',
      APP_BASE_URL: 'http://localhost:3000',
      AUTH0_CLIENT_ASSERTION_SIGNING_KEY: 'not-valid-base64!@#$',
    };

    expect(() => createAuth0Config(env)).toThrow(/Failed to decode AUTH0_CLIENT_ASSERTION_SIGNING_KEY/);
  });

  // Signing alg default & override
  it('should respect signing algorithm override and default to RS256', () => {
    const envDefault = {
      AUTH0_DOMAIN: 'tenant.auth0.com',
      AUTH0_CLIENT_ID: 'abc123',
      AUTH0_SESSION_ENCRYPTION_KEY: 'key32chars_key32chars_key32chars_',
      APP_BASE_URL: 'http://localhost:3000',
      AUTH0_CLIENT_ASSERTION_SIGNING_KEY: validPrivateKeyBase64,
    };

    const envOverride = {
      AUTH0_DOMAIN: 'tenant.auth0.com',
      AUTH0_CLIENT_ID: 'abc123',
      AUTH0_SESSION_ENCRYPTION_KEY: 'key32chars_key32chars_key32chars_',
      APP_BASE_URL: 'http://localhost:3000',
      AUTH0_CLIENT_ASSERTION_SIGNING_KEY: validPrivateKeyBase64,
      AUTH0_CLIENT_ASSERTION_SIGNING_ALG: 'RS384',
    };

    const configDefault = createAuth0Config(envDefault);
    const configOverride = createAuth0Config(envOverride);

    expect(configDefault.clientAssertionSigningAlg).toBe('RS256');
    expect(configOverride.clientAssertionSigningAlg).toBe('RS384');
  });

  // Session store always wired
  it('should always wire InMemorySessionStore to config.session.store', () => {
    const env = {
      AUTH0_DOMAIN: 'tenant.auth0.com',
      AUTH0_CLIENT_ID: 'abc123',
      AUTH0_SESSION_ENCRYPTION_KEY: 'key32chars_key32chars_key32chars_',
      APP_BASE_URL: 'http://localhost:3000',
    };

    const config = createAuth0Config(env);

    expect(config.session?.store).toBeInstanceOf(InMemorySessionStore);
  });
});
