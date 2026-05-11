/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono';
import { describe, expect, it, beforeEach, afterEach, vi, Mock } from 'vitest';
import { getUser, updateSession, persistSession } from '../../src/helpers/session';
import { MissingSessionError } from '../../src/errors';
import { SESSION_CACHE_KEY, STATE_STORE_KEY } from '../../src/lib/constants';

describe('getUser(c)', () => {
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      var: { auth0: {} },
    } as any as Context;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return user from c.var.auth0.user (synchronous)', () => {
    const mockUser = {
      sub: 'user123',
      email: 'test@example.com',
      name: 'Test User',
    };

    mockContext.var.auth0.user = mockUser;

    const result = getUser(mockContext);

    expect(result).toEqual(mockUser);
    expect(result.email).toBe('test@example.com');
  });

  it('should throw MissingSessionError when no user', () => {
    mockContext.var.auth0.user = null;

    expect(() => getUser(mockContext)).toThrow(MissingSessionError);

    // Verify the error description mentions the issue
    try {
      getUser(mockContext);
    } catch (err) {
      expect((err as any).description).toContain('getUser() called on an unauthenticated request');
    }
  });

  it('should throw MissingSessionError when called on plain Context (c.var.auth0 undefined)', () => {
    mockContext.var.auth0 = undefined;

    expect(() => getUser(mockContext)).toThrow(MissingSessionError);
  });

  it('should work after requiresAuth() middleware (user guaranteed)', () => {
    const mockUser = {
      sub: 'authenticated_user',
      email: 'auth@example.com',
      org_id: 'org_123',
    };

    // Simulate state after requiresAuth() middleware
    mockContext.var.auth0.user = mockUser;

    const result = getUser(mockContext);

    expect(result).toEqual(mockUser);
    expect(result.org_id).toBe('org_123');
  });
});

describe('persistSession', () => {
  let mockContext: Context;
  let mockStateStore: any;
  let mockConfig: any;
  let mockSession: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSession = {
      user: { sub: 'user123', email: 'test@example.com' },
      idToken: 'eyJhbGc...',
      refreshToken: 'refresh_token_123',
      tokenSets: [
        {
          accessToken: 'access_token_123',
          audience: 'https://api.example.com',
          scope: 'openid profile email',
          expiresAt: Date.now() + 3600000,
        },
      ],
      internal: {
        sid: 'session_123',
        createdAt: 1234567890,
      },
      custom: 'field',
    };

    mockStateStore = {
      set: vi.fn().mockResolvedValue(undefined),
    };

    mockConfig = {
      session: {
        cookie: {
          name: 'appSession',
        },
      },
    };

    mockContext = {
      var: {
        auth0Configuration: mockConfig,
      },
      set: function (key: string, value: any) {
        this.var[key] = value;
        return value;
      },
      get: function (key: string) {
        return this.var[key];
      },
    } as any;

    mockContext.set(STATE_STORE_KEY, mockStateStore);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('session persistence', () => {
    it('should write session to state store', async () => {
      await persistSession(mockContext, mockSession);

      expect(mockStateStore.set).toHaveBeenCalledWith('appSession', mockSession, false, mockContext);
    });

    it('should use correct identifier from config', async () => {
      mockConfig.session.cookie.name = 'custom_session_name';

      await persistSession(mockContext, mockSession);

      expect(mockStateStore.set).toHaveBeenCalledWith('custom_session_name', mockSession, false, mockContext);
    });

    it('should use default identifier when config not set', async () => {
      mockConfig.session.cookie = undefined;

      await persistSession(mockContext, mockSession);

      expect(mockStateStore.set).toHaveBeenCalledWith('appSession', mockSession, false, mockContext);
    });

    it('should pass deleteSession flag as false', async () => {
      await persistSession(mockContext, mockSession);

      const [, , deleteFlag] = (mockStateStore.set as any).mock.calls[0];
      expect(deleteFlag).toBe(false);
    });

    it('should pass context to state store', async () => {
      await persistSession(mockContext, mockSession);

      const [, , , ctx] = (mockStateStore.set as any).mock.calls[0];
      expect(ctx).toBe(mockContext);
    });
  });

  describe('internal field preservation', () => {
    it('should preserve session.internal during persist', async () => {
      const sessionWithInternal = {
        ...mockSession,
        internal: {
          sid: 'original_sid',
          createdAt: 9876543210,
        },
      };

      await persistSession(mockContext, sessionWithInternal);

      const [, persistedSession] = (mockStateStore.set as any).mock.calls[0];
      expect(persistedSession.internal).toEqual({
        sid: 'original_sid',
        createdAt: 9876543210,
      });
    });

    it('should handle session without internal field', async () => {
      const sessionWithoutInternal = {
        user: { sub: 'user123' },
        idToken: 'token',
      };

      // REQ-B1: persistSession must reject sessions without internal field
      // to prevent loss of critical internal state (sid, createdAt, etc)
      await expect(persistSession(mockContext, sessionWithoutInternal)).rejects.toThrow(
        'persistSession: session must include "internal" field'
      );
    });
  });

  describe('custom field handling', () => {
    it('should preserve custom fields', async () => {
      const sessionWithCustom = {
        ...mockSession,
        custom_field: 'custom_value',
        permissions: ['read', 'write'],
        userId: 12345,
      };

      await persistSession(mockContext, sessionWithCustom);

      const [, persistedSession] = (mockStateStore.set as any).mock.calls[0];
      expect(persistedSession.custom_field).toBe('custom_value');
      expect(persistedSession.permissions).toEqual(['read', 'write']);
      expect(persistedSession.userId).toBe(12345);
    });

    it('should preserve enriched session from onCallback', async () => {
      const enrichedSession = {
        ...mockSession,
        enriched: true,
        metadata: {
          source: 'onCallback',
          timestamp: 1234567890,
        },
      };

      await persistSession(mockContext, enrichedSession);

      const [, persistedSession] = (mockStateStore.set as any).mock.calls[0];
      expect(persistedSession.enriched).toBe(true);
      expect(persistedSession.metadata).toEqual({
        source: 'onCallback',
        timestamp: 1234567890,
      });
    });
  });

  describe('error handling', () => {
    it('should throw when state store not in context', async () => {
      mockContext.set(STATE_STORE_KEY, undefined);

      await expect(persistSession(mockContext, mockSession)).rejects.toThrow();
    });

    it('should throw when configuration not in context', async () => {
      mockContext.var.auth0Configuration = undefined;

      await expect(persistSession(mockContext, mockSession)).rejects.toThrow(/Auth0 configuration not found/);
    });

    it('should propagate state store errors', async () => {
      mockStateStore.set.mockRejectedValue(new Error('Store error'));

      await expect(persistSession(mockContext, mockSession)).rejects.toThrow('Store error');
    });
  });

  describe('identifier matching', () => {
    it('should match cookie name in identifier', async () => {
      mockConfig.session.cookie.name = 'my_session_cookie';

      await persistSession(mockContext, mockSession);

      const [identifier] = (mockStateStore.set as any).mock.calls[0];
      expect(identifier).toBe('my_session_cookie');
    });

    it('should use default when session.cookie undefined', async () => {
      mockConfig.session = { cookie: undefined };

      await persistSession(mockContext, mockSession);

      const [identifier] = (mockStateStore.set as any).mock.calls[0];
      expect(identifier).toBe('appSession');
    });

    it('should use default when session.cookie.name undefined', async () => {
      mockConfig.session.cookie = { name: undefined };

      await persistSession(mockContext, mockSession);

      const [identifier] = (mockStateStore.set as any).mock.calls[0];
      expect(identifier).toBe('appSession');
    });
  });

  describe('stateless vs stateful stores', () => {
    it('should work with stateless store (encrypted cookie)', async () => {
      // Stateless store typically writes to response headers
      const statelessStore = {
        set: vi.fn().mockImplementation(async () => {
          // Simulates encrypted cookie in response
          return Promise.resolve();
        }),
      };
      mockContext.set(STATE_STORE_KEY, statelessStore);

      await persistSession(mockContext, mockSession);

      expect(statelessStore.set).toHaveBeenCalledWith('appSession', mockSession, false, mockContext);
    });

    it('should work with stateful store (backend storage)', async () => {
      // Stateful store typically writes to Redis/database
      const statefulStore = {
        set: vi.fn().mockImplementation(async () => {
          // Simulates backend write
          return Promise.resolve();
        }),
      };
      mockContext.set(STATE_STORE_KEY, statefulStore);

      await persistSession(mockContext, mockSession);

      expect(statefulStore.set).toHaveBeenCalledWith('appSession', mockSession, false, mockContext);
    });
  });

  describe('integration', () => {
    it('should handle full session update flow', async () => {
      const originalSession = {
        ...mockSession,
        permissions: ['read'],
      };

      await persistSession(mockContext, originalSession);

      expect(mockStateStore.set).toHaveBeenCalledWith(
        'appSession',
        expect.objectContaining({
          permissions: ['read'],
        }),
        false,
        mockContext
      );

      // Update session with new permissions
      const updatedSession = {
        ...originalSession,
        permissions: ['read', 'write', 'admin'],
      };

      mockStateStore.set.mockClear();
      await persistSession(mockContext, updatedSession);

      expect(mockStateStore.set).toHaveBeenCalledWith(
        'appSession',
        expect.objectContaining({
          permissions: ['read', 'write', 'admin'],
        }),
        false,
        mockContext
      );
    });

    it('should preserve all session fields during update', async () => {
      const originalSession = mockSession;

      // First persist
      await persistSession(mockContext, originalSession);

      // Update with new field
      const updatedSession = {
        ...originalSession,
        newField: 'new value',
      };

      mockStateStore.set.mockClear();
      await persistSession(mockContext, updatedSession);

      const [, persistedSession] = (mockStateStore.set as any).mock.calls[0];

      // All original fields should be present
      expect(persistedSession.user).toEqual(originalSession.user);
      expect(persistedSession.idToken).toBe(originalSession.idToken);
      expect(persistedSession.refreshToken).toBe(originalSession.refreshToken);
      expect(persistedSession.tokenSets).toEqual(originalSession.tokenSets);
      expect(persistedSession.internal).toEqual(originalSession.internal);
      expect(persistedSession.newField).toBe('new value');
    });
  });
});

describe('updateSession(c, data)', () => {
  let mockContext: any;
  let mockStateStore: any;
  let mockConfig: any;

  // Helper: creates a raw StateData object (as returned by stateStore.get, WITH internal)
  const makeStateData = (overrides: Record<string, any> = {}) => ({
    user: { sub: 'user123', email: 'test@example.com' },
    idToken: 'id_token',
    refreshToken: 'refresh_token',
    tokenSets: [],
    connectionTokenSets: {},
    internal: { sid: 'session_id', createdAt: Math.floor(Date.now() / 1000) },
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock context — stateStore now needs both get and set
    mockStateStore = {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue(undefined),
    };

    mockConfig = {
      session: {
        cookie: {
          name: 'appSession',
        },
      },
    };

    mockContext = {
      var: { auth0Configuration: mockConfig },
      get: vi.fn(),
      set: vi.fn(),
    } as any as Context;

    mockContext.get.mockImplementation((key: string) => {
      if (key === STATE_STORE_KEY) return mockStateStore;
      return undefined;
    });

    mockContext.set.mockImplementation((key: string, value: any) => {
      // Store in var for get to retrieve
      mockContext.var[key] = value;
      return value;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should merge data into existing session', async () => {
    const stateData = makeStateData({ custom1: 'old_value' });
    mockStateStore.get.mockResolvedValueOnce(stateData);

    await updateSession(mockContext, {
      custom1: 'new_value',
      custom2: 'added_value',
    });

    // Verify stateStore.set was called with merged data (including internal)
    expect(mockStateStore.set).toHaveBeenCalledWith(
      'appSession',
      expect.objectContaining({
        custom1: 'new_value',
        custom2: 'added_value',
        internal: stateData.internal,
      }),
      false,
      mockContext
    );

    // Verify context cache was updated WITHOUT internal
    expect(mockContext.set).toHaveBeenCalledWith(
      SESSION_CACHE_KEY,
      expect.not.objectContaining({ internal: expect.anything() })
    );
    expect(mockContext.set).toHaveBeenCalledWith(
      SESSION_CACHE_KEY,
      expect.objectContaining({
        custom1: 'new_value',
        custom2: 'added_value',
      })
    );
  });

  it('should filter reserved fields', async () => {
    const stateData = makeStateData({ permissions: 'user' });
    mockStateStore.get.mockResolvedValueOnce(stateData);

    // Try to override reserved fields
    await updateSession(mockContext, {
      user: 'hacker',
      idToken: 'fake_token',
      refreshToken: 'fake_refresh',
      tokenSets: [],
      connectionTokenSets: {},
      internal: 'fake_internal',
      permissions: 'admin',
    });

    // Verify only non-reserved fields were merged
    expect(mockStateStore.set).toHaveBeenCalledWith(
      'appSession',
      expect.objectContaining({
        user: stateData.user, // Original preserved
        idToken: stateData.idToken, // Original preserved
        refreshToken: stateData.refreshToken, // Original preserved
        tokenSets: stateData.tokenSets, // Original preserved
        connectionTokenSets: stateData.connectionTokenSets, // Original preserved
        internal: stateData.internal, // Original preserved
        permissions: 'admin', // Custom field allowed
      }),
      false,
      mockContext
    );
  });

  it('should throw MissingSessionError when no session', async () => {
    mockStateStore.get.mockResolvedValueOnce(null);

    await expect(updateSession(mockContext, { foo: 'bar' })).rejects.toThrow(MissingSessionError);
  });

  it('should persist via retained stateStore and update c.var.auth0', async () => {
    const stateData = makeStateData({
      user: {
        sub: 'user123',
        email: 'test@example.com',
        org_id: 'org_123',
        org_name: 'Test Org',
      },
    });
    mockStateStore.get.mockResolvedValueOnce(stateData);

    await updateSession(mockContext, { pref: 'dark' });

    // Verify stateStore.set called with internal preserved
    expect(mockStateStore.set).toHaveBeenCalledWith(
      'appSession',
      expect.objectContaining({
        pref: 'dark',
        internal: stateData.internal,
      }),
      false,
      mockContext
    );

    // Verify c.var.auth0 updated with user and org
    expect(mockContext.set).toHaveBeenCalledWith(
      'auth0',
      expect.objectContaining({
        user: stateData.user,
        org: {
          id: 'org_123',
          name: 'Test Org',
        },
      })
    );
  });

  it('should preserve RESERVED_FIELDS during merge', async () => {
    const stateData = makeStateData({
      user: { sub: 'user123' },
      idToken: 'original_id_token',
      refreshToken: 'original_refresh_token',
      tokenSets: [{ accessToken: 'token1' }],
      connectionTokenSets: { connection1: { accessToken: 'conn_token' } },
      internal: { sid: 'session_id', createdAt: 1000000 },
    });
    mockStateStore.get.mockResolvedValueOnce(stateData);

    await updateSession(mockContext, {
      user: 'should_be_ignored',
      idToken: 'should_be_ignored',
      refreshToken: 'should_be_ignored',
      tokenSets: [],
      connectionTokenSets: {},
      internal: 'should_be_ignored',
      customField: 'custom_value',
    });

    // Get the call to mockStateStore.set
    const persistCall = (mockStateStore.set as Mock).mock.calls[0][1];

    // Verify reserved fields were not overwritten
    expect(persistCall.user).toBe(stateData.user);
    expect(persistCall.idToken).toBe(stateData.idToken);
    expect(persistCall.refreshToken).toBe(stateData.refreshToken);
    expect(persistCall.internal).toBe(stateData.internal);

    // Verify custom field was added
    expect(persistCall.customField).toBe('custom_value');
  });

  it('should read raw StateData from stateStore (not getCachedSession) to preserve internal', async () => {
    // This test verifies the fix: updateSession must read from stateStore.get()
    // (which returns StateData WITH internal.createdAt) rather than getCachedSession
    // (which goes through client.getSession() that strips internal).
    const stateData = makeStateData();
    mockStateStore.get.mockResolvedValueOnce(stateData);

    await updateSession(mockContext, { foo: 'bar' });

    // Verify stateStore.get was called (not getCachedSession)
    expect(mockStateStore.get).toHaveBeenCalledWith('appSession', mockContext);

    // Verify the persisted data has internal intact
    const persistedData = (mockStateStore.set as Mock).mock.calls[0][1];
    expect(persistedData.internal).toBeDefined();
    expect(persistedData.internal.createdAt).toBe(stateData.internal.createdAt);
    expect(persistedData.internal.sid).toBe(stateData.internal.sid);
  });

  // REQ-B3: Fix org_id truthiness check (falsy but valid '0' string)
  describe('org_id truthiness handling', () => {
    it("should handle org_id = '0' as valid (not falsy)", () => {
      const stateData = makeStateData({
        user: {
          sub: 'user123',
          org_id: '0', // Falsy string but valid
          org_name: 'Organization Zero',
        },
      });
      mockStateStore.get.mockResolvedValueOnce(stateData);

      // updateSession should preserve org_id even though '0' is falsy
      return expect(updateSession(mockContext, { foo: 'bar' })).resolves.not.toThrow();
    });

    it('should handle empty string org_id as null org', () => {
      const stateData = makeStateData({
        user: {
          sub: 'user123',
          org_id: '', // Empty string
          org_name: '',
        },
      });
      mockStateStore.get.mockResolvedValueOnce(stateData);

      return expect(updateSession(mockContext, { foo: 'bar' })).resolves.not.toThrow();
    });

    it('should handle undefined org_id as null org', () => {
      const stateData = makeStateData({
        user: {
          sub: 'user123',
          org_id: undefined,
        },
      });
      mockStateStore.get.mockResolvedValueOnce(stateData);

      return expect(updateSession(mockContext, { foo: 'bar' })).resolves.not.toThrow();
    });
  });

  // REQ-D3: Validate StateData shape before persistence
  describe('StateData shape validation', () => {
    it('should reject session without internal field', async () => {
      const invalidState = {
        user: { sub: 'user123' },
        idToken: 'token',
        refreshToken: 'refresh_token',
        tokenSets: [],
        connectionTokenSets: {},
        // Missing: internal
      };

      return expect(persistSession(mockContext, invalidState)).rejects.toThrow(/internal/i);
    });

    it('should reject session without internal.createdAt', async () => {
      const invalidState = {
        user: { sub: 'user123' },
        idToken: 'token',
        refreshToken: 'refresh_token',
        tokenSets: [],
        connectionTokenSets: {},
        internal: { sid: 'session_123' }, // Missing createdAt
      };

      // Verify contract-enforcing store rejects incomplete internal
      // The stateStore mock enforces createdAt is present
      const contractEnforcingStore = {
        set: vi.fn().mockImplementation(async (_id: string, stateData: any) => {
          if (!stateData?.internal?.createdAt) {
            throw new TypeError("Cannot read properties of undefined (reading 'createdAt')");
          }
          return Promise.resolve();
        }),
      };

      // Create a fresh context with the contract-enforcing store
      const freshContext = {
        var: { auth0Configuration: mockConfig },
        get: vi.fn((key: string) => {
          if (key === STATE_STORE_KEY) return contractEnforcingStore;
          return mockContext.var[key];
        }),
        set: vi.fn(),
      } as any;

      return expect(persistSession(freshContext, invalidState)).rejects.toThrow();
    });

    it('should accept valid StateData with all required fields', async () => {
      const validState = {
        user: { sub: 'user123' },
        idToken: 'token',
        refreshToken: 'refresh_token',
        tokenSets: [],
        connectionTokenSets: {},
        internal: {
          sid: 'session_123',
          createdAt: Math.floor(Date.now() / 1000),
        },
      };

      return expect(persistSession(mockContext, validState)).resolves.not.toThrow();
    });

    it('should reject null session', async () => {
      return expect(persistSession(mockContext, null)).rejects.toThrow();
    });
  });
});
