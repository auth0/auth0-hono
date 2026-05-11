/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contract-enforcing mock factory for StateStore.
 *
 * This mock enforces the StateStore contract that real implementations require:
 * - `set()` must be called with stateData that includes `internal.createdAt`
 * - Throws TypeError if contract is violated, preventing silent test failures
 *
 * @module test/mocks/stateStore
 */

import { vi } from 'vitest';
import { StateData } from '@auth0/auth0-server-js';

/**
 * Creates a contract-enforcing mock StateStore.
 *
 * The set() method validates that stateData includes required internal field,
 * matching the real StatelessStateStore behavior.
 *
 * @param overrides - Optional method implementations
 * @returns Mock StateStore with contract enforcement on set()
 *
 * @example
 * ```typescript
 * const mockStore = createMockStateStore()
 *
 * // Valid call - succeeds
 * await mockStore.set('sessionId', {
 *   user: { sub: 'user123' },
 *   internal: { sid: 'sid_123', createdAt: 1234567890 }
 * })
 *
 * // Invalid call - throws TypeError
 * await mockStore.set('sessionId', {
 *   user: { sub: 'user123' }
 *   // Missing internal field - will throw
 * })
 * ```
 */
export function createMockStateStore(
  overrides?: Partial<{
    get?: any;
    set?: any;
    delete?: any;
  }>
): any {
  return {
    get: vi.fn().mockResolvedValue({
      user: { sub: 'user123', email: 'test@example.com' },
      idToken: 'eyJhbGc...',
      refreshToken: 'refresh_token_123',
      tokenSets: [],
      connectionTokenSets: {},
      internal: {
        sid: 'session_id_123',
        createdAt: Math.floor(Date.now() / 1000),
      },
      ...overrides?.get,
    } as StateData),

    set: vi.fn().mockImplementation(async (_id: string, stateData: any) => {
      // CONTRACT ENFORCEMENT: internal.createdAt must exist
      // This matches the error thrown by real StatelessStateStore
      if (!stateData?.internal?.createdAt) {
        throw new TypeError("Cannot read properties of undefined (reading 'createdAt')");
      }
      // Optional validation for other fields
      if (!stateData?.user || typeof stateData.user !== 'object') {
        throw new TypeError('Invalid user object in stateData');
      }
      if (!Array.isArray(stateData?.tokenSets) && typeof stateData?.tokenSets !== 'object') {
        throw new TypeError('Invalid tokenSets in stateData');
      }
      return Promise.resolve();
    }),

    delete: vi.fn().mockResolvedValue(undefined),

    ...overrides,
  };
}

/**
 * Creates a mock SessionData object with standard structure.
 *
 * @param overrides - Optional data overrides
 * @returns Mock StateData with all required fields
 *
 * @example
 * ```typescript
 * const session = createMockSessionData({
 *   user: { email: 'custom@example.com' }
 * })
 * expect(session.internal.createdAt).toBeDefined()
 * ```
 */
export function createMockSessionData(overrides?: Record<string, any>): StateData {
  return {
    user: { sub: 'user123', email: 'test@example.com' },
    idToken: 'eyJhbGc...',
    refreshToken: 'refresh_token_123',
    tokenSets: [],
    connectionTokenSets: {},
    internal: {
      sid: 'session_id_123',
      createdAt: Math.floor(Date.now() / 1000),
    },
    ...overrides,
  } as StateData;
}
