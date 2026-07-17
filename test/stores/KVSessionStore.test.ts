/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateData } from '@auth0/auth0-server-js';
import { KVSessionStore, type KVNamespaceLike } from '../../src/stores/KVSessionStore';

function createMockKV(): KVNamespaceLike & {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    // Default: empty listing (overridden per-test as needed).
    list: vi.fn().mockResolvedValue({ keys: [], list_complete: true }),
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

const DAY = 60 * 60 * 24;

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
    it('writes the session record, sid-index and per-session sub-index', async () => {
      const state = makeState();
      await store.set('id1', state);

      expect(kv.put).toHaveBeenCalledWith('session:id1', JSON.stringify(state), {
        expirationTtl: DAY * 3,
      });
      expect(kv.put).toHaveBeenCalledWith('sid-index:sid-1', 'id1', { expirationTtl: DAY * 3 });
      // Per-session sub index: key includes the identifier so multiple sessions coexist.
      expect(kv.put).toHaveBeenCalledWith('sub-index:auth0|user1:id1', 'id1', { expirationTtl: DAY * 3 });
    });

    it('does not write an activity marker key', async () => {
      await store.set('id1', makeState());
      const activityWrite = kv.put.mock.calls.find((c) => String(c[0]).startsWith('session-active:'));
      expect(activityWrite).toBeUndefined();
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
    });

    it('honors custom durations above the minimum', async () => {
      store = new KVSessionStore(kv, { absoluteDuration: 1000, inactivityDuration: 500 });
      await store.set('id1', makeState());
      expect(kv.put).toHaveBeenCalledWith('session:id1', expect.any(String), { expirationTtl: 1000 });
    });
  });

  describe('delete', () => {
    it('removes the session record and both indexes', async () => {
      kv.get.mockResolvedValueOnce(makeState());
      await store.delete('id1');
      expect(kv.delete).toHaveBeenCalledWith('session:id1');
      expect(kv.delete).toHaveBeenCalledWith('sid-index:sid-1');
      expect(kv.delete).toHaveBeenCalledWith('sub-index:auth0|user1:id1');
    });

    it('does not delete an activity marker key', async () => {
      kv.get.mockResolvedValueOnce(makeState());
      await store.delete('id1');
      const activityDelete = kv.delete.mock.calls.find((c) => String(c[0]).startsWith('session-active:'));
      expect(activityDelete).toBeUndefined();
    });

    it('still deletes the session key when the record is gone', async () => {
      kv.get.mockResolvedValueOnce(null);
      await store.delete('id1');
      expect(kv.delete).toHaveBeenCalledWith('session:id1');
      const idxDelete = kv.delete.mock.calls.find((c) => String(c[0]).includes('-index:'));
      expect(idxDelete).toBeUndefined();
    });
  });

  describe('deleteByLogoutToken', () => {
    it('resolves a session by sid and deletes it', async () => {
      // sid-index lookup -> identifier; delete() then reads the session record.
      kv.get.mockResolvedValueOnce('id1').mockResolvedValueOnce(makeState());
      await store.deleteByLogoutToken({ sid: 'sid-1' });
      expect(kv.get).toHaveBeenCalledWith('sid-index:sid-1', { type: 'text' });
      expect(kv.delete).toHaveBeenCalledWith('session:id1');
    });

    it('deletes ALL sessions for a sub-only logout token (RFC 9700 §2.4)', async () => {
      // list() returns two sub-index keys → two sessions to delete.
      kv.list.mockResolvedValueOnce({
        keys: [{ name: 'sub-index:auth0|user1:idA' }, { name: 'sub-index:auth0|user1:idB' }],
        list_complete: true,
      });
      // delete() reads each session record.
      kv.get.mockResolvedValue(makeState());
      await store.deleteByLogoutToken({ sub: 'auth0|user1' });
      expect(kv.list).toHaveBeenCalledWith({ prefix: 'sub-index:auth0|user1:', cursor: undefined });
      expect(kv.delete).toHaveBeenCalledWith('session:idA');
      expect(kv.delete).toHaveBeenCalledWith('session:idB');
    });

    it('pages through the sub-index cursor until list_complete', async () => {
      kv.list
        .mockResolvedValueOnce({ keys: [{ name: 'sub-index:auth0|user1:idA' }], list_complete: false, cursor: 'c1' })
        .mockResolvedValueOnce({ keys: [{ name: 'sub-index:auth0|user1:idB' }], list_complete: true });
      kv.get.mockResolvedValue(makeState());
      await store.deleteByLogoutToken({ sub: 'auth0|user1' });
      expect(kv.list).toHaveBeenNthCalledWith(1, { prefix: 'sub-index:auth0|user1:', cursor: undefined });
      expect(kv.list).toHaveBeenNthCalledWith(2, { prefix: 'sub-index:auth0|user1:', cursor: 'c1' });
      expect(kv.delete).toHaveBeenCalledWith('session:idA');
      expect(kv.delete).toHaveBeenCalledWith('session:idB');
    });

    it('deletes by sid and also sweeps sub sessions when both claims present', async () => {
      // sid path: get sid-index -> 'idSid', delete() reads session.
      kv.get.mockResolvedValueOnce('idSid').mockResolvedValue(makeState());
      kv.list.mockResolvedValueOnce({ keys: [{ name: 'sub-index:auth0|user1:idB' }], list_complete: true });
      await store.deleteByLogoutToken({ sid: 'sid-1', sub: 'auth0|user1' });
      expect(kv.delete).toHaveBeenCalledWith('session:idSid');
      expect(kv.delete).toHaveBeenCalledWith('session:idB');
    });

    it('is a graceful no-op when sid does not resolve and sub has no sessions', async () => {
      kv.get.mockResolvedValue(null); // sid-index miss
      kv.list.mockResolvedValueOnce({ keys: [], list_complete: true });
      await store.deleteByLogoutToken({ sid: 'x', sub: 'y' });
      expect(kv.delete).not.toHaveBeenCalled();
    });

    it('is a no-op when claims carry neither sid nor sub', async () => {
      await store.deleteByLogoutToken({});
      expect(kv.get).not.toHaveBeenCalled();
      expect(kv.list).not.toHaveBeenCalled();
      expect(kv.delete).not.toHaveBeenCalled();
    });
  });
});
