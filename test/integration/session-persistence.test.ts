/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * Integration test: session persistence with real StatelessStateStore.
 *
 * Uses the actual @auth0/auth0-server-js StatelessStateStore (encrypt/decrypt/cookie)
 * to verify that updateSession and callback hook enrichment work end-to-end without
 * the mocking that masked the internal.createdAt bug.
 *
 * This test ensures the full contract between SDK helpers and server-js state stores
 * is maintained — specifically that `internal` field is preserved through all
 * session mutation paths.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { StatelessStateStore, StateData } from '@auth0/auth0-server-js';
import { updateSession } from '../../src/helpers/session';
import { STATE_STORE_KEY } from '../../src/lib/constants';
import { MissingSessionError } from '../../src/errors';

// Real secret (32+ chars) for StatelessStateStore encryption
const TEST_SECRET = 'integration_test_secret_that_is_at_least_32_characters_long';
const IDENTIFIER = 'appSession';

/**
 * In-memory cookie handler that simulates real cookie set/get/delete.
 * Allows the StatelessStateStore to encrypt → store → decrypt cycle.
 */
function createInMemoryCookieHandler() {
  const cookies: Map<string, string> = new Map();

  return {
    cookies,
    handler: {
      setCookie(name: string, value: string, _opts: any, _ctx: any) {
        cookies.set(name, value);
      },
      getCookie(name: string, _ctx: any) {
        return cookies.get(name) ?? null;
      },
      getCookies(_ctx: any) {
        // Returns all cookies as a plain object (used by getCookieKeys for chunk enumeration)
        return Object.fromEntries(cookies);
      },
      deleteCookie(name: string, _ctx: any) {
        cookies.delete(name);
      },
    },
  };
}

/**
 * Create a mock Hono context wired to the real state store.
 */
function createIntegrationContext(stateStore: any, config: any): any {
  const vars: Record<string, any> = {
    auth0Configuration: config,
    [STATE_STORE_KEY]: stateStore,
  };

  return {
    var: {
      get auth0Configuration() {
        return vars.auth0Configuration;
      },
      get auth0() {
        return vars.auth0;
      },
    },
    get(key: string) {
      return vars[key];
    },
    set(key: string, value: any) {
      vars[key] = value;
      return value;
    },
  };
}

describe('Integration: Session Persistence with Real StatelessStateStore', () => {
  let stateStore: InstanceType<typeof StatelessStateStore>;
  let cookieHelper: ReturnType<typeof createInMemoryCookieHandler>;
  let mockContext: any;
  let config: any;

  beforeEach(() => {
    cookieHelper = createInMemoryCookieHandler();

    stateStore = new StatelessStateStore(
      {
        secret: TEST_SECRET,
        rolling: true,
        absoluteDuration: 60 * 60 * 24 * 3, // 3 days
        inactivityDuration: 60 * 60 * 24, // 1 day
      },
      cookieHelper.handler
    );

    config = {
      session: {
        cookie: { name: IDENTIFIER },
      },
    };

    mockContext = createIntegrationContext(stateStore, config);
  });

  /**
   * Helper: seed a session into the store (simulates what completeInteractiveLogin does).
   */
  async function seedSession(customFields: Record<string, any> = {}): Promise<StateData> {
    const stateData: StateData = {
      user: {
        sub: 'auth0|integration_test',
        email: 'test@example.com',
        name: 'Integration User',
      },
      idToken: 'eyJ.test.token',
      refreshToken: 'refresh_test_123',
      tokenSets: [
        {
          accessToken: 'access_test_123',
          audience: 'default',
          scope: 'openid profile email',
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        },
      ],
      connectionTokenSets: {},
      internal: {
        sid: 'integration_session_001',
        createdAt: Math.floor(Date.now() / 1000),
      },
      ...customFields,
    } as any;

    // Store via the real StatelessStateStore (encrypts + sets cookie)
    await stateStore.set(IDENTIFIER, stateData, false, mockContext);
    return stateData;
  }

  it('updateSession should persist custom fields without losing internal', async () => {
    await seedSession();

    // Call updateSession with custom data
    await updateSession(mockContext, {
      preferences: { theme: 'dark' },
      lastActivity: '2024-01-01',
    });

    // Read back from store (raw StateData — includes internal)
    const rawState = (await stateStore.get(IDENTIFIER, mockContext)) as StateData;
    expect(rawState).not.toBeNull();

    // Verify internal is intact
    expect(rawState.internal).toBeDefined();
    expect(rawState.internal.createdAt).toBeGreaterThan(0);
    expect(rawState.internal.sid).toBe('integration_session_001');

    // Verify custom fields were merged
    expect((rawState as any).preferences).toEqual({ theme: 'dark' });
    expect((rawState as any).lastActivity).toBe('2024-01-01');

    // Verify original session data preserved
    expect(rawState.user.sub).toBe('auth0|integration_test');
    expect(rawState.idToken).toBe('eyJ.test.token');
    expect(rawState.refreshToken).toBe('refresh_test_123');
  });

  it('updateSession should not overwrite reserved fields', async () => {
    const original = await seedSession();

    await updateSession(mockContext, {
      user: 'hacker_attempt',
      internal: 'should_be_blocked',
      idToken: 'fake_token',
      refreshToken: 'fake_refresh',
      tokenSets: [],
      safeField: 'this_is_allowed',
    });

    const rawState = (await stateStore.get(IDENTIFIER, mockContext)) as StateData;

    // Reserved fields unchanged
    expect(rawState.user).toEqual(original.user);
    expect(rawState.internal).toEqual(original.internal);
    expect(rawState.idToken).toBe(original.idToken);
    expect(rawState.refreshToken).toBe(original.refreshToken);

    // Safe custom field persisted
    expect((rawState as any).safeField).toBe('this_is_allowed');
  });

  it('updateSession should throw MissingSessionError when no session exists', async () => {
    // No seedSession() — store is empty
    await expect(updateSession(mockContext, { foo: 'bar' })).rejects.toThrow(MissingSessionError);
  });

  it('multiple updateSession calls should not corrupt session', async () => {
    await seedSession();

    // First update
    await updateSession(mockContext, { counter: 1 });

    // Second update (should read the updated state)
    await updateSession(mockContext, { counter: 2, extra: 'field' });

    const rawState = (await stateStore.get(IDENTIFIER, mockContext)) as StateData;

    expect(rawState.internal).toBeDefined();
    expect(rawState.internal.createdAt).toBeGreaterThan(0);
    expect((rawState as any).counter).toBe(2);
    expect((rawState as any).extra).toBe('field');
    expect(rawState.user.sub).toBe('auth0|integration_test');
  });

  it('session cookie should survive full encrypt → store → decrypt cycle after update', async () => {
    await seedSession({ loginCount: 0 });

    await updateSession(mockContext, { loginCount: 1 });

    // Verify cookies were actually written (chunked format: appSession.0, appSession.1, etc.)
    const cookieKeys = [...cookieHelper.cookies.keys()];
    expect(cookieKeys.length).toBeGreaterThan(0);
    expect(cookieKeys.some((k) => k.startsWith(IDENTIFIER))).toBe(true);

    // Decrypt and verify
    const rawState = (await stateStore.get(IDENTIFIER, mockContext)) as StateData;
    expect(rawState).not.toBeNull();
    expect(rawState.internal.sid).toBe('integration_session_001');
    expect((rawState as any).loginCount).toBe(1);
  });

  it('simulates onCallback hook enrichment pattern (read → enrich → persist)', async () => {
    // Simulate what completeInteractiveLogin does
    const original = await seedSession();

    // Simulate: client.getSession() strips internal (as server-js does)
    const { internal, ...sessionWithoutInternal } = original;
    const publicSession = sessionWithoutInternal;

    // Simulate: hook enriches the public session
    const enrichedSession = {
      ...publicSession,
      roles: ['admin', 'user'],
      permissions: ['read:all'],
    };

    // Now do what callback.ts does: read raw state, merge enrichment, persist
    const rawState = (await stateStore.get(IDENTIFIER, mockContext)) as StateData;
    const enrichedState = { ...rawState, ...enrichedSession };
    await stateStore.set(IDENTIFIER, enrichedState, false, mockContext);

    // Verify end-to-end
    const finalState = (await stateStore.get(IDENTIFIER, mockContext)) as StateData;
    expect(finalState.internal).toBeDefined();
    expect(finalState.internal.createdAt).toBe(original.internal.createdAt);
    expect((finalState as any).roles).toEqual(['admin', 'user']);
    expect((finalState as any).permissions).toEqual(['read:all']);
  });

  it('should fail if internal is stripped (regression guard)', async () => {
    await seedSession();

    // Simulate the OLD buggy path: read via getSession (strips internal), then persist
    const rawState = (await stateStore.get(IDENTIFIER, mockContext)) as StateData;
    const { internal, ...withoutInternal } = rawState;

    // This SHOULD fail — stateStore.set requires internal.createdAt
    await expect(stateStore.set(IDENTIFIER, withoutInternal as any, false, mockContext)).rejects.toThrow();
  });
});
