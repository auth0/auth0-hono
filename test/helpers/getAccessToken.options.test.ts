/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi, Mock } from 'vitest';
import type { TokenSet } from '@auth0/auth0-server-js';
import { getAccessToken } from '../../src/helpers/getAccessToken';
import { Auth0Error } from '../../src/errors/Auth0Error';
import { InvalidGrantError, TokenRefreshError } from '../../src/errors';
import { createMockContext, createMockClient } from '../fixtures';

vi.mock('../../src/config/index.js', () => ({
  getClient: vi.fn(),
}));

vi.mock('../../src/errors/errorMap.js', () => ({
  mapServerError: vi.fn((err: unknown): Auth0Error => {
    if (err instanceof Auth0Error) return err;
    const code = (err as { code?: string })?.code;
    if (code === 'invalid_grant') return new InvalidGrantError('invalid grant', err);
    if (code === 'token_by_refresh_token_error') return new TokenRefreshError('refresh failed', err);
    return new Auth0Error((err as Error)?.message ?? 'unknown', 500, 'unknown_error', { cause: err });
  }),
}));

vi.mock('../../src/helpers/sessionCache.js', () => ({
  invalidateSessionCache: vi.fn(),
}));

import { getClient } from '../../src/config/index';

function token(accessToken: string): TokenSet {
  return { accessToken, expiresAt: Date.now() + 3_600_000 } as any;
}

describe('getAccessToken(c, options)', () => {
  let ctx: any;
  let client: any;

  function setup(configuration: Record<string, any> = {}) {
    client = createMockClient({ getAccessToken: vi.fn() });
    (getClient as Mock).mockReturnValue({ client, configuration });
    ctx = createMockContext();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  describe('backward compatibility', () => {
    it('no-options call still calls client.getAccessToken with context', async () => {
      client.getAccessToken.mockResolvedValueOnce(token('t1'));
      const result = await getAccessToken(ctx);
      expect(result.accessToken).toBe('t1');
      expect(client.getAccessToken).toHaveBeenCalledWith(ctx);
    });

    it('reuses the __default__ cache entry across no-options calls in one request', async () => {
      client.getAccessToken.mockResolvedValue(token('shared'));
      const [a, b] = await Promise.all([getAccessToken(ctx), getAccessToken(ctx)]);
      expect(a.accessToken).toBe('shared');
      expect(b.accessToken).toBe('shared');
      // Deduped: only one upstream call for the same key.
      expect(client.getAccessToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('audience validation', () => {
    it('allows an audience that matches the configured audience', async () => {
      setup({ authorizationParams: { audience: 'https://api.example.com' } });
      client.getAccessToken.mockResolvedValueOnce(token('ok'));
      const result = await getAccessToken(ctx, { audience: 'https://api.example.com' });
      expect(result.accessToken).toBe('ok');
    });

    it('throws unsupported_audience_override when audience differs from config', async () => {
      setup({ authorizationParams: { audience: 'https://api.example.com' } });
      const p = getAccessToken(ctx, { audience: 'https://other.example.com' });
      await expect(p).rejects.toThrow(Auth0Error);
      try {
        await getAccessToken(ctx, { audience: 'https://other.example.com' });
      } catch (err: any) {
        expect(err.status).toBe(400);
        expect(err.code).toBe('unsupported_audience_override');
      }
      expect(client.getAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('scope-partitioned caching', () => {
    it('caches distinct scopes under distinct keys (no bleed)', async () => {
      client.getAccessToken.mockResolvedValueOnce(token('scopeA')).mockResolvedValueOnce(token('scopeB'));
      const a = await getAccessToken(ctx, { scope: 'read:a' });
      const b = await getAccessToken(ctx, { scope: 'read:b' });
      expect(a.accessToken).toBe('scopeA');
      expect(b.accessToken).toBe('scopeB');
      expect(client.getAccessToken).toHaveBeenCalledTimes(2);
    });

    it('reuses the same key for the same scope within a request', async () => {
      client.getAccessToken.mockResolvedValue(token('same'));
      await getAccessToken(ctx, { scope: 'read:a' });
      await getAccessToken(ctx, { scope: 'read:a' });
      expect(client.getAccessToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('refresh override', () => {
    it('refresh:true bypasses the cached entry and forces a new call', async () => {
      client.getAccessToken.mockResolvedValueOnce(token('first')).mockResolvedValueOnce(token('second'));
      const first = await getAccessToken(ctx); // populates __default__
      const second = await getAccessToken(ctx, { refresh: true }); // bypasses
      expect(first.accessToken).toBe('first');
      expect(second.accessToken).toBe('second');
      expect(client.getAccessToken).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('maps upstream errors and clears the stale cache entry', async () => {
      const err = new Error('refresh failed');
      (err as any).code = 'token_by_refresh_token_error';
      client.getAccessToken.mockRejectedValueOnce(err).mockResolvedValueOnce(token('recovered'));
      await expect(getAccessToken(ctx)).rejects.toThrow();
      // After failure the key was cleared, so a subsequent call retries.
      const ok = await getAccessToken(ctx);
      expect(ok.accessToken).toBe('recovered');
    });
  });
});
