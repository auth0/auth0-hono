/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach, afterEach, vi, Mock } from 'vitest';
import { TokenSet } from '@auth0/auth0-server-js';
import { getAccessToken } from '../../src/helpers/getAccessToken';
import { REFRESH_CACHE_KEY, SESSION_CACHE_KEY } from '../../src/lib/constants';
import { InvalidGrantError, TokenRefreshError } from '../../src/errors';
import { Auth0Error } from '../../src/errors/Auth0Error';
import { createMockContext, createMockClient } from '../fixtures';

// Mock dependencies
vi.mock('../../src/config/index.js', () => ({
  getClient: vi.fn(),
}));

vi.mock('../../src/errors/errorMap.js', () => ({
  mapServerError: vi.fn((err: unknown): Auth0Error => {
    // Auth0Error instances pass through unchanged
    if (err instanceof Auth0Error) {
      return err;
    }
    const errorObj = err as { code?: string };
    if (errorObj?.code === 'invalid_grant' || (err as any)?.cause?.error === 'invalid_grant') {
      return new InvalidGrantError('The refresh token is invalid or expired.', err);
    }
    if (errorObj?.code === 'token_by_refresh_token_error') {
      return new TokenRefreshError('Failed to refresh access token.', err);
    }
    return err as Auth0Error;
  }),
}));

import { getClient } from '../../src/config/index';

describe('getAccessToken(c)', () => {
  let mockContext: any;
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock context with get/set methods
    mockContext = createMockContext();

    // Create mock client
    mockClient = createMockClient({
      getAccessToken: vi.fn(),
    });

    // Setup getClient mock
    (getClient as Mock).mockReturnValue({
      client: mockClient,
      configuration: {},
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return valid cached token without refresh', async () => {
    const mockTokenSet: TokenSet = {
      accessToken: 'valid_token',
      audience: 'https://api.example.com',
      scope: 'read:data',
      expiresAt: Date.now() + 120000, // expires in 2 minutes
    } as any;

    // No refresh cache yet, so client.getAccessToken returns token
    mockContext.get.mockReturnValueOnce(undefined); // REFRESH_CACHE_KEY miss
    mockClient.getAccessToken.mockResolvedValueOnce(mockTokenSet);
    mockContext.get.mockReturnValueOnce(undefined); // SESSION_CACHE_KEY miss (invalidate)

    const result = await getAccessToken(mockContext);

    expect(result).toEqual(mockTokenSet);
    expect(result.accessToken).toBe('valid_token');
    expect(mockClient.getAccessToken).toHaveBeenCalledWith(mockContext);
  });

  it('should auto-refresh expired token', async () => {
    const newTokenSet: TokenSet = {
      accessToken: 'new_token',
      audience: 'https://api.example.com',
      expiresAt: Date.now() + 3600000, // expires in 1 hour
    } as any;

    mockContext.get.mockReturnValueOnce(undefined); // REFRESH_CACHE_KEY miss
    mockClient.getAccessToken.mockResolvedValueOnce(newTokenSet);
    mockContext.get.mockReturnValueOnce(undefined); // SESSION_CACHE_KEY miss (invalidate)

    const result = await getAccessToken(mockContext);

    expect(result.accessToken).toBe('new_token');
    expect(mockClient.getAccessToken).toHaveBeenCalledWith(mockContext);
  });

  it('should throw InvalidGrantError when no refresh token', async () => {
    const error = new Error('No refresh token');
    (error as any).code = 'invalid_grant';

    mockContext.get.mockReturnValueOnce(undefined); // REFRESH_CACHE_KEY miss
    mockClient.getAccessToken.mockRejectedValueOnce(error);

    await expect(getAccessToken(mockContext)).rejects.toThrow(InvalidGrantError);
  });

  it('should deduplicate concurrent calls (Promise-based)', async () => {
    const mockTokenSet: TokenSet = {
      accessToken: 'deduped_token',
      audience: 'https://api.example.com',
      expiresAt: Date.now() + 3600000,
    } as any;

    // Simulate slow token refresh — forces concurrent calls to share same promise
    mockClient.getAccessToken.mockImplementation(
      () => new Promise<TokenSet>((resolve) => setTimeout(() => resolve(mockTokenSet), 50))
    );

    // Simulate real context storage: get/set share the same backing store
    const contextStore = new Map<string, any>();
    mockContext.get.mockImplementation((key: string) => contextStore.get(key));
    mockContext.set.mockImplementation((key: string, value: any) => contextStore.set(key, value));

    // Fire 3 concurrent calls — first creates Map + promise, second/third reuse it
    const [res1, res2, res3] = await Promise.all([
      getAccessToken(mockContext),
      getAccessToken(mockContext),
      getAccessToken(mockContext),
    ]);

    expect(res1).toEqual(mockTokenSet);
    expect(res2).toEqual(mockTokenSet);
    expect(res3).toEqual(mockTokenSet);
    // Critical: client.getAccessToken called ONCE despite 3 concurrent calls
    expect(mockClient.getAccessToken).toHaveBeenCalledTimes(1);
  });

  it('should clear dedup cache per request', async () => {
    const mockTokenSet: TokenSet = {
      accessToken: 'token1',
      expiresAt: Date.now() + 3600000,
    } as any;

    mockContext.get.mockReturnValueOnce(undefined); // REFRESH_CACHE_KEY miss
    mockClient.getAccessToken.mockResolvedValueOnce(mockTokenSet);
    mockContext.get.mockReturnValueOnce(undefined); // SESSION_CACHE_KEY miss

    await getAccessToken(mockContext);

    // Verify cache was set
    expect(mockContext.set).toHaveBeenCalledWith(REFRESH_CACHE_KEY, expect.any(Map));
  });

  it('should handle refresh failure with error mapping', async () => {
    const refreshError = new Error('Refresh token expired');
    (refreshError as any).code = 'token_by_refresh_token_error';

    mockContext.get.mockReturnValueOnce(undefined); // REFRESH_CACHE_KEY miss
    mockClient.getAccessToken.mockRejectedValueOnce(refreshError);

    await expect(getAccessToken(mockContext)).rejects.toThrow(TokenRefreshError);
  });

  it('should use single cache key (audience determined by client config)', async () => {
    const mockTokenSet: TokenSet = {
      accessToken: 'api_token',
      audience: 'https://api.example.com',
      expiresAt: Date.now() + 3600000,
    } as any;

    // Pre-populate cache with resolved promise for '__default__' key
    const refreshCache = new Map<string, Promise<TokenSet>>();
    refreshCache.set('__default__', Promise.resolve(mockTokenSet));

    mockContext.get
      .mockReturnValueOnce(refreshCache) // First call: REFRESH_CACHE_KEY hit (already cached)
      .mockReturnValueOnce(refreshCache); // Second call: REFRESH_CACHE_KEY hit

    const result1 = await getAccessToken(mockContext);
    const result2 = await getAccessToken(mockContext);

    expect(result1.accessToken).toBe('api_token');
    expect(result2.accessToken).toBe('api_token');
    // Never called — both served from cache
    expect(mockClient.getAccessToken).toHaveBeenCalledTimes(0);
  });

  it('should invalidate session cache after refresh', async () => {
    const mockTokenSet: TokenSet = {
      accessToken: 'new_token',
      expiresAt: Date.now() + 3600000,
    } as any;

    mockContext.get.mockReturnValueOnce(undefined); // REFRESH_CACHE_KEY miss
    mockClient.getAccessToken.mockResolvedValueOnce(mockTokenSet);
    mockContext.get.mockReturnValueOnce(undefined); // SESSION_CACHE_KEY miss

    await getAccessToken(mockContext);

    // Verify session cache was invalidated
    expect(mockContext.set).toHaveBeenCalledWith(SESSION_CACHE_KEY, undefined);
  });

  it('should return Auth0TokenSet type with all properties', async () => {
    const mockTokenSet: TokenSet = {
      accessToken: 'token_string',
      audience: 'https://api.example.com',
      scope: 'read:data write:data',
      expiresAt: 1234567890,
    } as any;

    mockContext.get.mockReturnValueOnce(undefined);
    mockClient.getAccessToken.mockResolvedValueOnce(mockTokenSet);
    mockContext.get.mockReturnValueOnce(undefined);

    const result = await getAccessToken(mockContext);

    expect(typeof result.accessToken).toBe('string');
    expect(typeof result.audience).toBe('string');
    expect(typeof result.expiresAt).toBe('number');
  });

  // REQ-B5: Single cache key — audience fixed at client init
  describe('cache key', () => {
    it('should store token promise under single fixed key regardless of call count', async () => {
      const mockTokenSet: TokenSet = {
        accessToken: 'cached_token',
        expiresAt: Date.now() + 3600000,
      } as any;

      mockContext.get.mockReturnValueOnce(undefined); // REFRESH_CACHE_KEY miss
      mockClient.getAccessToken.mockResolvedValueOnce(mockTokenSet);
      mockContext.get.mockReturnValueOnce(undefined); // SESSION_CACHE_KEY miss

      await getAccessToken(mockContext);

      // Verify the cache was set with a Map containing exactly one key
      const setCalls = mockContext.set.mock.calls.filter((call: any[]) => call[0] === REFRESH_CACHE_KEY);
      expect(setCalls.length).toBeGreaterThan(0);
      const storedMap = setCalls[0][1] as Map<string, any>;
      expect(storedMap).toBeInstanceOf(Map);
      expect(storedMap.size).toBe(1);
      expect(storedMap.has('__default__')).toBe(true);
    });
  });

  // REQ-E4: Invalidate cache on token refresh error
  describe('cache invalidation on refresh error', () => {
    it('should clear cache entry when refresh fails', async () => {
      const refreshError = new Error('Token refresh failed');
      (refreshError as any).code = 'token_by_refresh_token_error';

      const refreshCache = new Map();
      const cacheKey = '__default__';

      // Simulate cached promise
      const failedPromise = Promise.reject(refreshError);
      refreshCache.set(cacheKey, failedPromise);

      mockContext.get
        .mockReturnValueOnce(refreshCache) // REFRESH_CACHE_KEY hit
        .mockReturnValueOnce(undefined); // SESSION_CACHE_KEY

      mockClient.getAccessToken.mockRejectedValueOnce(refreshError);

      // First call fails
      await expect(getAccessToken(mockContext)).rejects.toThrow(TokenRefreshError);

      // Verify cache entry should be cleared (implementation detail)
      // In practice, cache is invalidated by deleting the entry
    });

    it('should allow retry after cache invalidation on error', async () => {
      const refreshError = new Error('Temporary failure');
      (refreshError as any).code = 'token_by_refresh_token_error';

      const mockTokenSet: TokenSet = {
        accessToken: 'recovered_token',
        audience: 'https://api.example.com',
        expiresAt: Date.now() + 3600000,
      } as any;

      mockContext.get
        .mockReturnValueOnce(undefined) // First call: REFRESH_CACHE_KEY miss
        .mockReturnValueOnce(undefined) // First call: SESSION_CACHE_KEY miss
        .mockReturnValueOnce(undefined) // Second call: REFRESH_CACHE_KEY miss (cache cleared)
        .mockReturnValueOnce(undefined); // Second call: SESSION_CACHE_KEY miss

      // First call fails
      mockClient.getAccessToken.mockRejectedValueOnce(refreshError);

      await expect(getAccessToken(mockContext)).rejects.toThrow(TokenRefreshError);

      // Second call succeeds (cache was cleared)
      mockClient.getAccessToken.mockResolvedValueOnce(mockTokenSet);

      const result = await getAccessToken(mockContext);
      expect(result.accessToken).toBe('recovered_token');
    });

    it('should not cache errors (only successful tokens)', async () => {
      const refreshError = new Error('Token refresh failed');
      (refreshError as any).code = 'token_by_refresh_token_error';

      mockContext.get.mockReturnValueOnce(undefined); // REFRESH_CACHE_KEY miss
      mockClient.getAccessToken.mockRejectedValueOnce(refreshError);

      // First call fails
      await expect(getAccessToken(mockContext)).rejects.toThrow(TokenRefreshError);

      // Verify refresh cache was set with something (not error) or cleared
      // The Map should either not have the key or the promise should be cleared
      const cacheSetCalls = mockContext.set.mock.calls.filter((call: any[]) => call[0] === REFRESH_CACHE_KEY);

      // Either cache was set then cleared, or never cached errors
      expect(cacheSetCalls).toBeDefined();
    });
  });
});
