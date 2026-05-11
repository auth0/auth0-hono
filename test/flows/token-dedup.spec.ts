/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getAccessToken } from '../../src/helpers/getAccessToken';
import { TokenSet } from '@auth0/auth0-server-js';
import { REFRESH_CACHE_KEY } from '../../src/lib/constants';
// Shared fixtures available at ../fixtures if needed

// Mock getClient
vi.mock('../../src/config/index', () => ({
  getClient: vi.fn((c) => ({
    client: c.get('mockClient'),
    configuration: { baseURL: 'https://app.test.com' },
  })),
}));

// Mock error mapping
vi.mock('../../src/errors/errorMap', () => ({
  mapServerError: (err: any) => err,
}));

// Mock session cache
vi.mock('../../src/helpers/sessionCache', () => ({
  invalidateSessionCache: vi.fn(),
}));

describe('Token Deduplication (Promise-based)', () => {
  let mockContext: any;
  let mockClient: any;
  let callCount: number;

  beforeEach(() => {
    vi.clearAllMocks();
    callCount = 0;

    // Create mock context with get/set methods
    mockContext = {
      get: vi.fn((key: string) => {
        return mockContext.vars[key];
      }),
      set: vi.fn((key: string, value: any) => {
        mockContext.vars[key] = value;
      }),
      vars: {},
    };

    // Mock ServerClient with instrumented getAccessToken
    mockClient = {
      getAccessToken: vi.fn(async () => {
        callCount++;
        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          accessToken: 'new_access_token_xxx',
          audience: 'https://api.test.com',
          scope: 'openid profile email',
          expiresAt: Date.now() + 3600000,
        } as TokenSet;
      }),
    };

    mockContext.set('mockClient', mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should deduplicate concurrent getAccessToken calls (same audience, needs refresh)', async () => {
    // Simulate 3 concurrent calls to getAccessToken
    const promises = [getAccessToken(mockContext), getAccessToken(mockContext), getAccessToken(mockContext)];

    const results = await Promise.all(promises);

    // Verify all results are identical TokenSet
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);

    // Verify client.getAccessToken called only once
    expect(callCount).toBe(1);
    expect(mockClient.getAccessToken).toHaveBeenCalledTimes(1);
  });

  it('should deduplicate repeated calls within same request', async () => {
    const mockClientSingle = {
      getAccessToken: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return {
          accessToken: `token_single`,
          audience: 'https://api.test.com',
          scope: 'openid',
          expiresAt: Date.now() + 3600000,
        } as TokenSet;
      }),
    };

    mockContext.set('mockClient', mockClientSingle);

    // Multiple calls — all deduped to single server-js call
    const token1 = getAccessToken(mockContext);
    const token2 = getAccessToken(mockContext);

    const results = await Promise.all([token1, token2]);

    // Only 1 call — deduped via promise cache
    expect(mockClientSingle.getAccessToken).toHaveBeenCalledTimes(1);
    expect(results[0]).toEqual(results[1]);
  });

  it('should isolate dedup cache per request (new context = new cache)', async () => {
    const token1Promise = getAccessToken(mockContext);
    await token1Promise;

    // Verify cache was created for first request
    const cache1 = mockContext.get(REFRESH_CACHE_KEY) as Map<string, Promise<TokenSet>>;
    expect(cache1).toBeDefined();
    expect(cache1.size).toBe(1);

    // Create new context (new request)
    const newContext = {
      get: vi.fn((key: string) => newContext.vars[key]),
      set: vi.fn((key: string, value: any) => {
        newContext.vars[key] = value;
      }),
      vars: {},
    };
    newContext.set('mockClient', mockClient);

    // Call getAccessToken in new context
    const token2Promise = getAccessToken(newContext);
    await token2Promise;

    // Verify new cache was created (isolated)
    const cache2 = newContext.get(REFRESH_CACHE_KEY) as Map<string, Promise<TokenSet>>;
    expect(cache2).toBeDefined();
    expect(cache2).not.toBe(cache1);

    // Verify each context has its own cache (different instances)
    expect(cache1).not.toBe(cache2);
    expect(mockContext.get(REFRESH_CACHE_KEY)).not.toBe(newContext.get(REFRESH_CACHE_KEY));
  });

  it('should propagate refresh failure to all concurrent waiters', async () => {
    const testError = new Error('Token refresh failed');

    const mockClientWithError = {
      getAccessToken: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw testError;
      }),
    };

    mockContext.set('mockClient', mockClientWithError);

    // All concurrent calls should receive same error
    const promises = [getAccessToken(mockContext), getAccessToken(mockContext), getAccessToken(mockContext)];

    const results = await Promise.allSettled(promises);

    // All should fail with same error
    expect(results).toHaveLength(3);
    results.forEach((result) => {
      expect(result.status).toBe('rejected');
      expect((result as PromiseRejectedResult).reason).toEqual(testError);
    });

    // Verify client called only once
    expect(mockClientWithError.getAccessToken).toHaveBeenCalledTimes(1);
  });

  it('should return valid cached token without refresh', async () => {
    const validToken: TokenSet = {
      accessToken: 'valid_token_xxx',
      audience: 'https://api.test.com',
      scope: 'openid',
      expiresAt: Date.now() + 3600000, // Valid for 1 hour
    };

    mockClient.getAccessToken = vi.fn().mockResolvedValue(validToken);

    const token = await getAccessToken(mockContext);

    expect(token).toEqual(validToken);
    expect(mockClient.getAccessToken).toHaveBeenCalledTimes(1);
  });

  it('should deduplicate 5 concurrent calls to single server-js call', async () => {
    const mockClientDedup = {
      getAccessToken: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return {
          accessToken: 'token_xxx',
          audience: 'https://api.test.com',
          scope: 'openid',
          expiresAt: Date.now() + 3600000,
        } as TokenSet;
      }),
    };

    mockContext.set('mockClient', mockClientDedup);

    // 5 concurrent calls — all same audience (determined by client config)
    const promises = [
      getAccessToken(mockContext),
      getAccessToken(mockContext),
      getAccessToken(mockContext),
      getAccessToken(mockContext),
      getAccessToken(mockContext),
    ];

    const results = await Promise.all(promises);

    expect(results).toHaveLength(5);
    // All deduped — only 1 actual server-js call
    expect(mockClientDedup.getAccessToken).toHaveBeenCalledTimes(1);
    // All results identical
    results.forEach((r) => expect(r).toEqual(results[0]));
  });
});
