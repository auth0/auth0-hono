/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { callback } from '../../src/middleware/callback';
import { SessionData } from '@auth0/auth0-server-js';
import { Auth0Error } from '../../src/errors/Auth0Error';
import { createMockContext, createMockClient, createMockConfig, createMockSession } from '../fixtures';

// Mock dependencies
vi.mock('../../src/config/index', () => ({
  getClient: vi.fn((c) => ({
    client: c.get('mockClient'),
    configuration: c.get('mockConfig'),
  })),
}));

vi.mock('../../src/utils/util', () => ({
  createRouteUrl: vi.fn((url) => url),
  toSafeRedirect: vi.fn((url) => url),
}));

vi.mock('../../src/helpers/sessionCache', () => ({
  invalidateSessionCache: vi.fn(),
}));

vi.mock('../../src/middleware/silentLogin', () => ({
  resumeSilentLogin: vi.fn().mockReturnValue(vi.fn().mockResolvedValue(undefined)),
}));

vi.mock('../../src/errors/errorMap', () => ({
  mapServerError: (err: any) => err,
}));

describe('onCallback Hook', () => {
  let mockContext: any;
  let mockConfig: any;
  let mockClient: any;
  let mockSession: SessionData;
  let mockStateStore: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSession = createMockSession({
      user: {
        sub: 'auth0|123',
        email: 'test@example.com',
        name: 'Test User',
        email_verified: true,
      },
    });

    mockConfig = createMockConfig({
      onCallback: undefined, // Will be set per test
    });

    mockClient = createMockClient({
      // completeInteractiveLogin must trigger stateStore.set() for the proxy to capture session.
      // In real server-js, this happens internally. In tests, we simulate it.
      completeInteractiveLogin: vi.fn().mockImplementation(async (_url: any, ctx: any) => {
        const stateStore = ctx.get('__auth0_state_store');
        const stateData = {
          ...mockSession,
          internal: { sid: 'session_id_123', createdAt: Math.floor(Date.now() / 1000) },
        };
        await stateStore.set('appSession', stateData, true, ctx);
        return { appState: { returnTo: '/dashboard' } };
      }),
      getSession: vi.fn().mockResolvedValue(mockSession),
      logout: vi.fn(),
    });

    mockContext = createMockContext({
      req: {
        url: 'https://app.test.com/auth/callback?code=test_code&state=test_state',
        method: 'GET',
      },
    });

    // Set up mock stateStore with contract-enforcing set
    mockStateStore = {
      get: vi.fn().mockResolvedValue({
        ...mockSession,
        internal: {
          sid: 'session_id_123',
          createdAt: Math.floor(Date.now() / 1000),
        },
      }),
      set: vi.fn().mockImplementation(async (_id: string, stateData: any) => {
        // Enforce contract: internal.createdAt must exist
        if (!stateData?.internal?.createdAt) {
          throw new TypeError("Cannot read properties of undefined (reading 'createdAt')");
        }
      }),
    };
    mockContext.vars['__auth0_state_store'] = mockStateStore;

    mockContext.get = vi.fn((key: string) => {
      if (key === 'mockClient') return mockClient;
      if (key === 'mockConfig') return mockConfig;
      if (key === '__auth0_state_store') return mockStateStore;
      return mockContext.vars[key];
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call onCallback hook on successful callback', async () => {
    const hookFn = vi.fn().mockResolvedValue(undefined);
    mockConfig.onCallback = hookFn;

    const callbackMiddleware = callback();
    const next = vi.fn();

    await callbackMiddleware(mockContext, next);

    // Verify hook was called with correct parameters
    expect(hookFn).toHaveBeenCalledWith(
      mockContext,
      null, // No error on success path
      expect.objectContaining({
        user: expect.objectContaining({ sub: 'auth0|123' }),
      })
    );
  });

  it('should support session enrichment in onCallback', async () => {
    const enrichedSession = {
      ...mockSession,
      permissions: ['read:data', 'write:data'],
      user: {
        ...mockSession.user,
        customField: 'custom_value',
      },
    };

    const hookFn = vi.fn().mockResolvedValue(enrichedSession);
    mockConfig.onCallback = hookFn;

    const callbackMiddleware = callback();
    const next = vi.fn();

    await callbackMiddleware(mockContext, next);

    // Verify hook was called
    expect(hookFn).toHaveBeenCalled();

    // Find enrichment call (removeIfExists=false, distinct from completeInteractiveLogin's call with true)

    const enrichmentCall = (mockStateStore.set as any).mock.calls.find(
      (call: any[]) => call[2] === false
    );
    expect(enrichmentCall).toBeDefined();
    expect(enrichmentCall[1]).toMatchObject({
      permissions: ['read:data', 'write:data'],
      internal: expect.objectContaining({ createdAt: expect.any(Number) }),
    });
  });

  it('should support Response override in onCallback on success', async () => {
    const customResponse = new Response('Welcome!', { status: 200 });
    const hookFn = vi.fn().mockResolvedValue(customResponse);
    mockConfig.onCallback = hookFn;

    const callbackMiddleware = callback();
    const next = vi.fn();

    const result = await callbackMiddleware(mockContext, next);

    // Verify hook was called
    expect(hookFn).toHaveBeenCalled();

    // Verify custom response was used (overrides default redirect)
    expect(result).toBe(customResponse);
  });

  it('should call onCallback hook on callback error', async () => {
    const testError = new Auth0Error('User denied', 403, 'access_denied');
    mockClient.completeInteractiveLogin.mockRejectedValue(testError);

    const hookFn = vi.fn().mockResolvedValue(undefined);
    mockConfig.onCallback = hookFn;

    const callbackMiddleware = callback();
    const next = vi.fn();

    try {
      await callbackMiddleware(mockContext, next);
    } catch {
      // Error is expected to be thrown
    }

    // Verify hook was called with error on error path
    expect(hookFn).toHaveBeenCalledWith(
      mockContext,
      expect.any(Object), // Error object
      null // No session on error path
    );
  });

  it('should support Response override in onCallback on error', async () => {
    const testError = new Auth0Error('User denied', 403, 'access_denied');
    mockClient.completeInteractiveLogin.mockRejectedValue(testError);

    const customErrorResponse = new Response('Login cancelled', {
      status: 200,
    });
    const hookFn = vi.fn().mockResolvedValue(customErrorResponse);
    mockConfig.onCallback = hookFn;

    const callbackMiddleware = callback();
    const next = vi.fn();

    const result = await callbackMiddleware(mockContext, next);

    // Verify hook was called with error
    expect(hookFn).toHaveBeenCalled();

    // Verify custom error response was used
    expect(result).toBe(customErrorResponse);
  });

  it('should propagate original auth error when hook throws', async () => {
    const authError = new Auth0Error('Missing transaction', 400, 'missing_transaction');
    mockClient.completeInteractiveLogin.mockRejectedValue(authError);

    const hookThrowError = new Error('Hook API call failed');
    const hookFn = vi.fn().mockRejectedValue(hookThrowError);
    mockConfig.onCallback = hookFn;

    const callbackMiddleware = callback();
    const next = vi.fn();

    let caughtError: any;
    try {
      await callbackMiddleware(mockContext, next);
    } catch (err) {
      caughtError = err;
    }

    // Original auth error should be thrown, not hook error
    expect(caughtError).toEqual(authError);
    expect(caughtError).not.toEqual(hookThrowError);
  });

  it('should not mask auth error even if hook fails silently', async () => {
    const authError = new Auth0Error('Invalid grant', 401, 'invalid_grant');
    mockClient.completeInteractiveLogin.mockRejectedValue(authError);

    // Hook throws error during error path handling
    const hookFn = vi.fn().mockImplementation(() => {
      throw new Error('Hook failed unexpectedly');
    });
    mockConfig.onCallback = hookFn;

    const callbackMiddleware = callback();
    const next = vi.fn();

    let caughtError: any;
    try {
      await callbackMiddleware(mockContext, next);
    } catch (err) {
      caughtError = err;
    }

    // Original auth error should propagate
    expect(caughtError).toEqual(authError);
  });

  it('should override hook with callback parameter', async () => {
    const configHook = vi.fn().mockResolvedValue(undefined);
    const paramHook = vi.fn().mockResolvedValue(undefined);

    mockConfig.onCallback = configHook;

    const callbackMiddleware = callback({ onCallback: paramHook });
    const next = vi.fn();

    await callbackMiddleware(mockContext, next);

    // Verify param hook was used instead of config hook
    expect(paramHook).toHaveBeenCalled();
    expect(configHook).not.toHaveBeenCalled();
  });

  it('should handle hook returning undefined on success', async () => {
    const hookFn = vi.fn().mockResolvedValue(undefined);
    mockConfig.onCallback = hookFn;

    const callbackMiddleware = callback();
    const next = vi.fn();

    const result = await callbackMiddleware(mockContext, next);

    // Verify hook was called
    expect(hookFn).toHaveBeenCalled();

    // Verify default behavior: redirect to returnTo
    expect(result?.status).toBe(302); // Redirect
  });

  it('should handle hook returning enriched session via Response override params', async () => {
    const enrichmentData = { roles: ['admin'] };

    const hookFn = vi.fn(async (c: any, err: any, session: any) => {
      if (!err && session) {
        // Return enriched session
        return { ...session, ...enrichmentData };
      }
    });

    mockConfig.onCallback = hookFn;

    const callbackMiddleware = callback();
    const next = vi.fn();

    await callbackMiddleware(mockContext, next);

    // Find enrichment call (removeIfExists=false)

    const enrichmentCall = (mockStateStore.set as any).mock.calls.find(
      (call: any[]) => call[2] === false
    );
    expect(enrichmentCall).toBeDefined();
    expect(enrichmentCall[1]).toMatchObject({
      roles: ['admin'],
      internal: expect.objectContaining({ createdAt: expect.any(Number) }),
    });
  });

  // REQ-B1: Prevent hook from overwriting internal field
  it('should preserve internal field when hook returns enriched session without internal', async () => {
    const enrichedSessionFromHook = {
      ...mockSession,
      internal: undefined, // Hook tries to overwrite
      permissions: ['read:data'],
    };

    const hookFn = vi.fn().mockResolvedValue(enrichedSessionFromHook);
    mockConfig.onCallback = hookFn;

    const callbackMiddleware = callback();
    const next = vi.fn();

    await callbackMiddleware(mockContext, next);

    // Verify hook was called
    expect(hookFn).toHaveBeenCalled();

    // Verify internal field was preserved from captured state (set during completeInteractiveLogin)

    // stateStore.set is called twice: once by completeInteractiveLogin (via proxy), once by enrichment
    const enrichmentCall = (mockStateStore.set as any).mock.calls.find(
      (call: any[]) => call[2] === false // enrichment uses removeIfExists=false
    );
    expect(enrichmentCall).toBeDefined();
    expect(enrichmentCall[1]).toMatchObject({
      permissions: ['read:data'],
      internal: expect.objectContaining({ createdAt: expect.any(Number) }),
    });
  });

  it('should NOT allow hook to overwrite internal field', async () => {
    const hookProvidedInternal = {
      sid: 'hacker_session_id',
      createdAt: 9999999999,
    };

    const enrichedSessionFromHook = {
      ...mockSession,
      internal: hookProvidedInternal, // Hook tries to override
    };

    const hookFn = vi.fn().mockResolvedValue(enrichedSessionFromHook);
    mockConfig.onCallback = hookFn;

    const callbackMiddleware = callback();
    const next = vi.fn();

    await callbackMiddleware(mockContext, next);

    // Find the enrichment call (removeIfExists=false)

    const enrichmentCall = (mockStateStore.set as any).mock.calls.find(
      (call: any[]) => call[2] === false
    );
    expect(enrichmentCall).toBeDefined();

    // Verify original internal is preserved, not hook's version
    const persistedData = enrichmentCall[1];
    expect(persistedData.internal.sid).not.toBe('hacker_session_id');
    expect(persistedData.internal.createdAt).not.toBe(9999999999);
  });

  // REQ-B2: Handle case where stateStore.get returns null after login
  it('should handle gracefully when stateStore.get returns null after successful login', async () => {
    const hookFn = vi.fn().mockResolvedValue(undefined);
    mockConfig.onCallback = hookFn;


    mockStateStore.get.mockResolvedValue(null); // Race condition: state already deleted

    const callbackMiddleware = callback();
    const next = vi.fn();

    // Should not throw even if state is null
    const result = await callbackMiddleware(mockContext, next);

    // Should still complete (either with redirect or response)
    expect(result).toBeDefined();
  });

  it('should proceed without critical error when stateStore.get returns valid session', async () => {
    const hookFn = vi.fn().mockResolvedValue(undefined);
    mockConfig.onCallback = hookFn;


    mockStateStore.get.mockResolvedValue(mockSession); // Valid session returned

    const callbackMiddleware = callback();
    const next = vi.fn();

    const result = await callbackMiddleware(mockContext, next);

    // Should not throw or error out
    expect(result).toBeDefined();
  });
});
