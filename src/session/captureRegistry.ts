import { StateData, StateStore } from '@auth0/auth0-server-js';
import { Context } from 'hono';

/**
 * Per-request session capture registry.
 *
 * Solves a concurrency race condition in the callback handler:
 * `completeInteractiveLogin` writes session data via `stateStore.set`, but we
 * cannot re-read it from cookies (setCookie writes to response headers;
 * getCookie reads from request headers — stale on callback request).
 *
 * Previous approach: monkey-patch `stateStore.set` per-request and restore after.
 * Under concurrent callbacks, nested patches corrupt the restore chain, causing
 * cross-request session data leakage when an `onCallback` hook enriches session.
 *
 * Current approach: install a single permanent interceptor at init time.
 * Use a WeakMap keyed by Hono Context (unique per-request object) to isolate
 * captured session data per request. No per-request patching/unpatching needed.
 *
 * WeakMap guarantees:
 * - Object identity isolation (each request has unique Context)
 * - Automatic GC when Context is collected (no memory leak)
 * - O(1) operations with negligible overhead (~100ns per set call)
 *
 * @internal
 */
const captureRegistry = new WeakMap<Context, StateData>();

/**
 * Symbol guard to prevent double-installation of the interceptor.
 * @internal
 */
const INTERCEPTOR_INSTALLED = Symbol('captureInterceptorInstalled');

/** @internal Type augmentation for Symbol guard on stateStore instance */
type GuardedStore = StateStore<Context> & { [key: symbol]: boolean };

/**
 * Install a one-time interceptor on the stateStore that captures written
 * StateData into a per-request WeakMap slot.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * @param stateStore - The shared StateStore singleton
 * @param identifier - The session cookie name (e.g. 'appSession')
 * @internal
 */
export function installCaptureInterceptor(stateStore: StateStore<Context>, identifier: string): void {
  if ((stateStore as GuardedStore)[INTERCEPTOR_INSTALLED]) {
    return;
  }

  const originalSet = stateStore.set.bind(stateStore);
  stateStore.set = async function (
    id: string,
    data: StateData,
    removeIfExists?: boolean,
    opts?: Context
  ): Promise<void> {
    if (id === identifier && opts) {
      captureRegistry.set(opts, data);
    }
    return originalSet(id, data, removeIfExists, opts);
  };

  (stateStore as GuardedStore)[INTERCEPTOR_INSTALLED] = true;
}

/**
 * Retrieve captured StateData for a specific request context.
 *
 * Returns the StateData written by `completeInteractiveLogin` for this request,
 * or undefined if no capture occurred (e.g. login failed before reaching set).
 *
 * @param c - The Hono Context for the current request
 * @returns Captured StateData or undefined
 * @internal
 */
export function getCapturedState(c: Context): StateData | undefined {
  return captureRegistry.get(c);
}

/**
 * Clear captured StateData for a specific request context.
 *
 * Call after reading to ensure no stale references remain for the request
 * duration. WeakMap would GC eventually, but explicit cleanup is immediate.
 *
 * @param c - The Hono Context for the current request
 * @internal
 */
export function clearCapturedState(c: Context): void {
  captureRegistry.delete(c);
}
