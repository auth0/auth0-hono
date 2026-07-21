/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assignFromEnv } from '../../src/config/envConfig';

const baseEnv = {
  AUTH0_DOMAIN: 'test.auth0.com',
  AUTH0_CLIENT_ID: 'test-client-id',
  APP_BASE_URL: 'https://example.com',
  AUTH0_CLIENT_SECRET: 'test-secret',
};

describe('AUTH0_DEBUG env wiring (assignFromEnv)', () => {
  let logSpy: any;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('does not set a debug logger when AUTH0_DEBUG is absent', () => {
    const result = assignFromEnv({}, { ...baseEnv });
    expect(result.debug).toBeUndefined();
  });

  it('does not enable debug for falsy values', () => {
    for (const val of ['false', '0', 'no', 'off', '']) {
      const result = assignFromEnv({}, { ...baseEnv, AUTH0_DEBUG: val });
      expect(result.debug).toBeUndefined();
    }
  });

  it('enables a default debug logger for truthy values (case-insensitive)', () => {
    for (const val of ['true', '1', 'yes', 'on', 'TRUE', 'Yes']) {
      const result = assignFromEnv({}, { ...baseEnv, AUTH0_DEBUG: val });
      expect(typeof result.debug).toBe('function');
    }
  });

  it('lets an explicit config.debug take precedence over AUTH0_DEBUG', () => {
    const explicit = vi.fn();
    const result = assignFromEnv({ debug: explicit } as any, { ...baseEnv, AUTH0_DEBUG: 'true' });
    expect(result.debug).toBe(explicit);
  });

  it('default logger redacts secrets before writing to console', () => {
    const result = assignFromEnv({}, { ...baseEnv, AUTH0_DEBUG: 'true' });
    (result.debug as any)('token refresh', {
      accessToken: 'RAW_TOKEN_VALUE',
      email: 'raw@example.com',
      clientSecret: 'RAW_SECRET',
      scope: 'openid profile',
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(logSpy.mock.calls[0]);
    expect(serialized).not.toContain('RAW_TOKEN_VALUE');
    expect(serialized).not.toContain('raw@example.com');
    expect(serialized).not.toContain('RAW_SECRET');
    // Non-sensitive metadata preserved.
    expect(serialized).toContain('openid profile');
    // Redaction labels present.
    expect(serialized).toContain('[REDACTED_TOKEN]');
    expect(serialized).toContain('[REDACTED_PII]');
    expect(serialized).toContain('[REDACTED_SECRET]');
  });

  it('default logger handles a message with no metadata', () => {
    const result = assignFromEnv({}, { ...baseEnv, AUTH0_DEBUG: 'true' });
    (result.debug as any)('just a message');
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
