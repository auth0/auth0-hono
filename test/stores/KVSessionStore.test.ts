/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateData } from '@auth0/auth0-server-js';
import { KVSessionStore, type KVNamespaceLike } from '../../src/stores/KVSessionStore';

function createMockKV(): KVNamespaceLike & {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
}

function makeState(overrides?: Partial<StateData>): StateData {
  return {
    user: { sub: 'auth0|user1' },
    idToken: 'id',
    refreshToken: 'rt',
    tokenSets: [],
    internal: { sid: 'sid-1' },
    ...overrides,
  } as unknown as StateData;
}

describe('KVSessionStore', () => {
  let kv: ReturnType<typeof createMockKV>;
  let store: KVSessionStore;

  beforeEach(() => {
    kv = createMockKV();
    store = new KVSessionStore(kv);
  });

  describe('get', () => {
    it('returns parsed StateData from the session key', async () => {
      const state = makeState();
      kv.get.mockResolvedValueOnce(state);
      const result = await store.get('id1');
      expect(kv.get).toHaveBeenCalledWith('session:id1', { type: 'json' });
      expect(result).toEqual(state);
    });

    it('returns undefined when the session is missing', async () => {
      kv.get.mockResolvedValueOnce(null);
      const result = await store.get('missing');
      expect(result).toBeUndefined();
    });
  });

  describe('set', () => {
    it('writes session, activity marker, sid-index and sub-index', async () => {
      const state = makeState();
      await store.set('id1', state);

      expect(kv.put).toHaveBeenCalledWith('session:id1', JSON.stringify(state), {
        expirationTtl: 60 * 60 * 24 * 3,
      });
      expect(kv.put).toHaveBeenCalledWith('session-active:id1', expect.any(String), {
        expirationTtl: 60 * 60 * 24,
      });
      expect(kv.put).toHaveBeenCalledWith('sid-index:sid-1', 'id1', { expirationTtl: 60 * 60 * 24 * 3 });
      expect(kv.put).toHaveBeenCalledWith('sub-index:auth0|user1', 'id1', { expirationTtl: 60 * 60 * 24 * 3 });
    });

    it('skips sid-index when internal.sid absent', async () => {
      const state = makeState({ internal: {} as any });
      await store.set('id1', state);
      const sidWrite = kv.put.mock.calls.find((c) => String(c[0]).startsWith('sid-index:'));
      expect(sidWrite).toBeUndefined();
    });

    it('clamps TTL to the KV minimum of 60 seconds', async () => {
      store = new KVSessionStore(kv, { absoluteDuration: 10, inactivityDuration: 5 });
      await store.set('id1', makeState());
      expect(kv.put).toHaveBeenCalledWith('session:id1', expect.any(String), { expirationTtl: 60 });
      expect(kv.put).toHaveBeenCalledWith('session-active:id1', expect.any(String), { expirationTtl: 60 });
    });

    it('honors custom durations above the minimum', async () => {
      store = new KVSessionStore(kv, { absoluteDuration: 1000, inactivityDuration: 500 });
      await store.set('id1', makeState());
      expect(kv.put).toHaveBeenCalledWith('session:id1', expect.any(String), { expirationTtl: 1000 });
      expect(kv.put).toHaveBeenCalledWith('session-active:id1', expect.any(String), { expirationTtl: 500 });
    });
  });

  describe('delete', () => {
    it('removes session, activity marker, and both indexes', async () => {
      kv.get.mockResolvedValueOnce(makeState());
      await store.delete('id1');
      expect(kv.delete).toHaveBeenCalledWith('session:id1');
      expect(kv.delete).toHaveBeenCalledWith('session-active:id1');
      expect(kv.delete).toHaveBeenCalledWith('sid-index:sid-1');
      expect(kv.delete).toHaveBeenCalledWith('sub-index:auth0|user1');
    });

    it('still deletes core keys when session record is gone', async () => {
      kv.get.mockResolvedValueOnce(null);
      await store.delete('id1');
      expect(kv.delete).toHaveBeenCalledWith('session:id1');
      expect(kv.delete).toHaveBeenCalledWith('session-active:id1');
      const idxDelete = kv.delete.mock.calls.find((c) => String(c[0]).includes('-index:'));
      expect(idxDelete).toBeUndefined();
    });
  });

  describe('deleteByLogoutToken', () => {
    it('resolves session by sid and deletes it', async () => {
      // 1st get: sid-index lookup -> identifier; 2nd get: delete() reads session
      kv.get.mockResolvedValueOnce('id1').mockResolvedValueOnce(makeState());
      await store.deleteByLogoutToken({ sid: 'sid-1' });
      expect(kv.get).toHaveBeenCalledWith('sid-index:sid-1', { type: 'text' });
      expect(kv.delete).toHaveBeenCalledWith('session:id1');
    });

    it('falls back to sub when sid index misses', async () => {
      // sid lookup miss (null) -> sub lookup hit -> delete() reads session
      kv.get
        .mockResolvedValueOnce(null) // sid-index miss
        .mockResolvedValueOnce('id2') // sub-index hit
        .mockResolvedValueOnce(makeState()); // delete() get
      await store.deleteByLogoutToken({ sid: 'sid-x', sub: 'auth0|user1' });
      expect(kv.get).toHaveBeenCalledWith('sub-index:auth0|user1', { type: 'text' });
      expect(kv.delete).toHaveBeenCalledWith('session:id2');
    });

    it('is a graceful no-op when neither sid nor sub resolves', async () => {
      kv.get.mockResolvedValue(null);
      await store.deleteByLogoutToken({ sid: 'x', sub: 'y' });
      expect(kv.delete).not.toHaveBeenCalled();
    });

    it('is a no-op when claims carry neither sid nor sub', async () => {
      await store.deleteByLogoutToken({});
      expect(kv.get).not.toHaveBeenCalled();
      expect(kv.delete).not.toHaveBeenCalled();
    });
  });
});
