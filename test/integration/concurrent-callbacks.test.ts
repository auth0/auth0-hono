/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Integration test: concurrent OAuth callback session capture.
 *
 * Verifies that the WeakMap-based capture registry (captureRegistry.ts):
 * 1. Isolates captured state per request via Hono Context object identity
 * 2. Handles concurrent callbacks without cross-request data leakage
 * 3. Handles error scenarios gracefully (no capture on failed login)
 * 4. Is idempotent — double-install is a no-op
 * 5. Cleans up captured state after retrieval
 *
 * This replaces the previous monkey-patch/restore pattern which was vulnerable to
 * race conditions under concurrent callbacks (nested patch chain corruption).
 */
import { StateData, StateStore } from '@auth0/auth0-server-js';
import { describe, expect, it, vi } from 'vitest';
import {
  clearCapturedState,
  getCapturedState,
  installCaptureInterceptor,
} from '../../src/session/captureRegistry';

function createMockStateStore(): StateStore<any> {
  return {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };
}

function createMockContext(id: string): any {
  // Each context is a unique object — WeakMap uses reference equality
  return { __testId: id };
}

function createStateData(sub: string): StateData {
  return {
    user: { sub },
    idToken: `token_${sub}`,
    tokenSets: [],
    internal: { sid: `sid_${sub}`, createdAt: Math.floor(Date.now() / 1000) },
  } as any;
}

describe('WeakMap Capture Registry — Concurrency Safety', () => {
  describe('Per-request isolation', () => {
    it('should capture state data keyed by unique context object', async () => {
      const stateStore = createMockStateStore();
      installCaptureInterceptor(stateStore, 'appSession');

      const ctxA = createMockContext('request-A');
      const ctxB = createMockContext('request-B');
      const stateA = createStateData('user_A');
      const stateB = createStateData('user_B');

      // Simulate concurrent completeInteractiveLogin calls
      await stateStore.set('appSession', stateA, true, ctxA);
      await stateStore.set('appSession', stateB, true, ctxB);

      // Each context retrieves ONLY its own captured state
      expect(getCapturedState(ctxA)).toEqual(stateA);
      expect(getCapturedState(ctxB)).toEqual(stateB);
      expect(getCapturedState(ctxA)!.user.sub).toBe('user_A');
      expect(getCapturedState(ctxB)!.user.sub).toBe('user_B');
    });

    it('should NOT cross-contaminate under interleaved async operations', async () => {
      // Use a real async stateStore.set with random delays to force genuine interleaving
      const originalSetFn = vi.fn().mockImplementation(
        () => new Promise<void>((resolve) => setTimeout(resolve, Math.random() * 10))
      );
      const stateStore: StateStore<any> = {
        get: vi.fn(),
        set: originalSetFn,
        delete: vi.fn(),
      };
      installCaptureInterceptor(stateStore, 'appSession');

      const contexts = Array.from({ length: 10 }, (_, i) => createMockContext(`req-${i}`));
      const states = Array.from({ length: 10 }, (_, i) => createStateData(`user_${i}`));

      // Fire 10 concurrent callbacks — random delays force real interleaving
      const promises = contexts.map((ctx, i) =>
        stateStore.set('appSession', states[i], true, ctx)
      );
      await Promise.all(promises);

      // Each context retrieves only its own state — zero cross-contamination
      contexts.forEach((ctx, i) => {
        const captured = getCapturedState(ctx);
        expect(captured).not.toBeNull();
        expect(captured!.user.sub).toBe(`user_${i}`);
      });

      // All 10 original set calls completed
      expect(originalSetFn).toHaveBeenCalledTimes(10);
    });

    it('should not capture when identifier does not match', async () => {
      const stateStore = createMockStateStore();
      installCaptureInterceptor(stateStore, 'appSession');

      const ctx = createMockContext('request-X');
      const stateData = createStateData('user_X');

      // Call with different identifier — should NOT capture
      await stateStore.set('differentCookie', stateData, true, ctx);

      expect(getCapturedState(ctx)).toBeUndefined();
    });

    it('should not capture when opts is undefined', async () => {
      const stateStore = createMockStateStore();
      installCaptureInterceptor(stateStore, 'appSession');

      const stateData = createStateData('user_no_ctx');

      // Call without opts (4th arg) — cannot key into WeakMap
      await stateStore.set('appSession', stateData, true, undefined);

      // No crash, no capture — graceful handling
    });
  });

  describe('Cleanup', () => {
    it('should clear captured state after retrieval', async () => {
      const stateStore = createMockStateStore();
      installCaptureInterceptor(stateStore, 'appSession');

      const ctx = createMockContext('request-cleanup');
      const stateData = createStateData('user_cleanup');

      await stateStore.set('appSession', stateData, true, ctx);

      // First retrieval returns data
      expect(getCapturedState(ctx)).toEqual(stateData);

      // Clear
      clearCapturedState(ctx);

      // Second retrieval returns undefined
      expect(getCapturedState(ctx)).toBeUndefined();
    });
  });

  describe('Idempotent installation', () => {
    it('should be a no-op when called twice on same stateStore', async () => {
      const stateStore = createMockStateStore();

      installCaptureInterceptor(stateStore, 'appSession');
      const firstPatch = stateStore.set;

      installCaptureInterceptor(stateStore, 'appSession');
      const secondPatch = stateStore.set;

      // Same function reference — second install was a no-op
      expect(firstPatch).toBe(secondPatch);
    });

    it('should still function correctly after double-install attempt', async () => {
      const stateStore = createMockStateStore();
      installCaptureInterceptor(stateStore, 'appSession');
      installCaptureInterceptor(stateStore, 'appSession');

      const ctx = createMockContext('double-install');
      const stateData = createStateData('user_double');

      await stateStore.set('appSession', stateData, true, ctx);
      expect(getCapturedState(ctx)!.user.sub).toBe('user_double');
    });
  });

  describe('Error scenarios', () => {
    it('should not have captured state when login fails before set is called', () => {
      const stateStore = createMockStateStore();
      installCaptureInterceptor(stateStore, 'appSession');

      const ctx = createMockContext('failed-request');

      // Simulate completeInteractiveLogin throwing before stateStore.set
      // (e.g. MissingTransactionError)
      // stateStore.set is never called for this context

      expect(getCapturedState(ctx)).toBeUndefined();
    });

    it('should delegate to original set and propagate errors', async () => {
      const setError = new Error('store write failed');
      const stateStore: StateStore<any> = {
        get: vi.fn(),
        set: vi.fn().mockRejectedValue(setError),
        delete: vi.fn(),
      };
      installCaptureInterceptor(stateStore, 'appSession');

      const ctx = createMockContext('error-request');
      const stateData = createStateData('user_error');

      // Should propagate original error
      await expect(stateStore.set('appSession', stateData, true, ctx)).rejects.toThrow('store write failed');

      // State is NOT captured when originalSet throws — capture executes after delegation
      expect(getCapturedState(ctx)).toBeUndefined();
    });
  });

  describe('Delegates to original set correctly', () => {
    it('should call original set with all arguments', async () => {
      const originalSetFn = vi.fn();
      const stateStore: StateStore<any> = {
        get: vi.fn(),
        set: originalSetFn,
        delete: vi.fn(),
      };
      installCaptureInterceptor(stateStore, 'appSession');

      const ctx = createMockContext('delegation-test');
      const stateData = createStateData('user_delegate');

      await stateStore.set('appSession', stateData, true, ctx);

      // Original function was called with exact same arguments
      expect(originalSetFn).toHaveBeenCalledWith('appSession', stateData, true, ctx);
    });
  });
});
