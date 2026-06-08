import { describe, it, expect, beforeEach } from 'vitest';
import { InMemorySessionStore } from '../stores.js';
import type { StateData } from '@auth0/auth0-server-js';

describe('InMemorySessionStore', () => {
  let store: InMemorySessionStore;

  beforeEach(() => {
    store = new InMemorySessionStore();
  });

  // ST-1: get/set roundtrip
  it('should store and retrieve session data (get/set roundtrip)', async () => {
    const sessionId = 'sess123';
    const stateData: StateData = {
      internal: { sid: 'auth0|sid1', createdAt: Date.now() },
      user: { sub: 'user1' } as any,
      idToken: 'id_token_value',
      refreshToken: 'refresh_token_value',
      tokenSets: [] as any,
    };

    await store.set(sessionId, stateData);
    const retrieved = await store.get(sessionId);

    expect(retrieved).toEqual(stateData);
  });

  // ST-2: sid indexing with data.internal.sid (regression guard)
  it('should index sessions by data.internal.sid for BCLO lookups', async () => {
    const sessionId = 'sess456';
    const internalSid = 'auth0|sid_abc123';
    const stateData: StateData = {
      internal: { sid: internalSid, createdAt: Date.now() },
      user: { sub: 'user2' } as any,
      idToken: 'id_token_value',
      refreshToken: 'refresh_token_value',
      tokenSets: [] as any,
    };

    await store.set(sessionId, stateData);

    // Regression guard: deleteByLogoutToken with sid should work
    // This test FAILS if implementation uses data.sid instead of data.internal.sid
    await store.deleteByLogoutToken({ sid: internalSid });
    const retrieved = await store.get(sessionId);

    expect(retrieved).toBeUndefined();
  });

  // ST-3: get non-existent session
  it('should return undefined for non-existent session', async () => {
    const retrieved = await store.get('does-not-exist');
    expect(retrieved).toBeUndefined();
  });

  // ST-4: deleteByLogoutToken with sid match
  it('should delete session by logout token with sid claim', async () => {
    const sessionId = 'sess_x';
    const sidClaim = 'auth0|x';
    const stateData: StateData = {
      internal: { sid: sidClaim, createdAt: Date.now() },
      user: { sub: 'user3' } as any,
      idToken: 'id_token_value',
      refreshToken: 'refresh_token_value',
      tokenSets: [] as any,
    };

    await store.set(sessionId, stateData);
    await store.deleteByLogoutToken({ sid: sidClaim });

    const retrieved = await store.get(sessionId);
    expect(retrieved).toBeUndefined();
  });

  // ST-5: deleteByLogoutToken with sid not found (graceful no-op)
  it('should gracefully handle deleteByLogoutToken with unknown sid (no-op)', async () => {
    // Set a session first
    const sessionId = 'sess_known';
    const stateData: StateData = {
      internal: { sid: 'auth0|known', createdAt: Date.now() },
      user: { sub: 'user4' } as any,
      idToken: 'id_token_value',
      refreshToken: 'refresh_token_value',
      tokenSets: [] as any,
    };

    await store.set(sessionId, stateData);

    // Call deleteByLogoutToken with non-existent sid
    await store.deleteByLogoutToken({ sid: 'auth0|nonexistent' });

    // Existing session should still be there
    const retrieved = await store.get(sessionId);
    expect(retrieved).toEqual(stateData);
  });

  // ST-6: deleteByLogoutToken with sub fallback
  it('should delete session by logout token with sub claim (fallback)', async () => {
    const sessionId1 = 'sess_user1';
    const sessionId2 = 'sess_user2';
    const userSubToDelete = 'user_subject_123';

    const stateData1: StateData = {
      internal: { sid: 'auth0|sid1', createdAt: Date.now() },
      user: { sub: userSubToDelete } as any,
      idToken: 'id_token_value',
      refreshToken: 'refresh_token_value',
      tokenSets: [] as any,
    };

    const stateData2: StateData = {
      internal: { sid: 'auth0|sid2', createdAt: Date.now() },
      user: { sub: 'user_subject_456' } as any,
      idToken: 'id_token_value',
      refreshToken: 'refresh_token_value',
      tokenSets: [] as any,
    };

    await store.set(sessionId1, stateData1);
    await store.set(sessionId2, stateData2);

    // Delete by sub claim
    await store.deleteByLogoutToken({ sub: userSubToDelete });

    // sessionId1 should be gone
    const retrieved1 = await store.get(sessionId1);
    expect(retrieved1).toBeUndefined();

    // sessionId2 should still exist
    const retrieved2 = await store.get(sessionId2);
    expect(retrieved2).toEqual(stateData2);
  });

  // ST-7: delete cleans sid index
  it('should clean sid index when deleting session by ID', async () => {
    const sessionId = 'sess_to_delete';
    const sidClaim = 'auth0|sid_to_clean';
    const stateData: StateData = {
      internal: { sid: sidClaim, createdAt: Date.now() },
      user: { sub: 'user5' } as any,
      idToken: 'id_token_value',
      refreshToken: 'refresh_token_value',
      tokenSets: [] as any,
    };

    await store.set(sessionId, stateData);

    // Delete by session ID
    await store.delete(sessionId);

    // Session should be gone
    const retrieved = await store.get(sessionId);
    expect(retrieved).toBeUndefined();

    // Subsequent deleteByLogoutToken by that sid should be a no-op (no error)
    await expect(store.deleteByLogoutToken({ sid: sidClaim })).resolves.toBeUndefined();
  });

  // ST-8: Missing internal/sid handled gracefully
  it('should handle missing internal.sid without throwing', async () => {
    const sessionId = 'sess_no_sid';
    const stateData: StateData = {
      internal: { createdAt: Date.now() } as any, // No sid property
      user: { sub: 'user6' } as any,
      idToken: 'id_token_value',
      refreshToken: 'refresh_token_value',
      tokenSets: [] as any,
    };

    // Should not throw
    await store.set(sessionId, stateData);

    // Session should be stored
    const retrieved = await store.get(sessionId);
    expect(retrieved).toEqual(stateData);

    // Should not throw; should remain stored
    await store.delete(sessionId);
    const afterDelete = await store.get(sessionId);
    expect(afterDelete).toBeUndefined();
  });
});
