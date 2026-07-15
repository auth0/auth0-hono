import type { LogoutTokenClaims, StateData } from '@auth0/auth0-server-js';
import type { Context } from 'hono';
import { SessionStore } from '@/types/session.js';

/**
 * Minimal structural type for a Cloudflare Workers KV namespace.
 *
 * Declared locally so this module does not add a hard dependency on
 * `@cloudflare/workers-types`. Any object satisfying this shape (including the
 * real Workers `KVNamespace` binding) can be passed to {@link KVSessionStore}.
 */
export interface KVNamespaceLike {
  get(key: string, options?: { type?: 'text' | 'json' }): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Options for {@link KVSessionStore}.
 */
export interface KVSessionStoreOptions {
  /**
   * Absolute session lifetime in seconds. Used as the KV `expirationTtl` for the
   * primary session record and its lookup indexes.
   *
   * Default: 259200 (3 days), matching the SDK session default.
   */
  absoluteDuration?: number;
  /**
   * Inactivity window in seconds for the rolling activity marker.
   *
   * Default: 86400 (1 day), matching the SDK session default.
   */
  inactivityDuration?: number;
}

/** Cloudflare Workers KV enforces a minimum `expirationTtl` of 60 seconds. */
const KV_MIN_TTL_SECONDS = 60;
const DEFAULT_ABSOLUTE_DURATION = 60 * 60 * 24 * 3; // 3 days
const DEFAULT_INACTIVITY_DURATION = 60 * 60 * 24; // 1 day

/** Clamp a requested TTL to the Workers KV minimum. */
function clampTtl(seconds: number): number {
  return Math.max(seconds, KV_MIN_TTL_SECONDS);
}

/**
 * Read the Auth0 session id (`sid`) from stored state, if present.
 *
 * `sid` lives on the server-js `internal` bag, which is typed as `unknown` via
 * `StateData`'s index signature, so we narrow it defensively.
 */
function readSid(stateData: StateData): string | undefined {
  const internal = (stateData as { internal?: { sid?: unknown } }).internal;
  return typeof internal?.sid === 'string' ? internal.sid : undefined;
}

/** Read the subject (`sub`) claim from stored state, if present. */
function readSub(stateData: StateData): string | undefined {
  const sub = stateData.user?.sub;
  return typeof sub === 'string' ? sub : undefined;
}

/**
 * A {@link SessionStore} backed by Cloudflare Workers KV.
 *
 * This is a stateful, production-ready store for Workers deployments. Unlike an
 * in-memory store, it survives isolate restarts and is shared across isolates,
 * which is required for Backchannel Logout (BCLO) invalidation by `sid`.
 *
 * The store maintains two secondary lookup indexes so BCLO logout tokens can be
 * resolved to a session identifier:
 * - `sid-index:<sid>`  → session identifier (primary BCLO lookup)
 * - `sub-index:<sub>`  → session identifier (fallback for logout tokens that
 *   carry only a `sub` claim)
 *
 * All KV writes carry an `expirationTtl` so entries are cleaned up automatically
 * even if an explicit delete is missed. Writes are best-effort and not atomic;
 * a partially written record is bounded by its TTL.
 *
 * @example
 * ```typescript
 * // In a Cloudflare Worker with a KV binding named AUTH0_SESSIONS:
 * const store = new KVSessionStore(c.env.AUTH0_SESSIONS);
 * app.use('*', auth0({ session: { secret, store } }));
 * ```
 */
export class KVSessionStore extends SessionStore {
  private readonly kv: KVNamespaceLike;
  private readonly absoluteDuration: number;
  private readonly inactivityDuration: number;

  constructor(kv: KVNamespaceLike, options: KVSessionStoreOptions = {}) {
    super();
    this.kv = kv;
    this.absoluteDuration = options.absoluteDuration ?? DEFAULT_ABSOLUTE_DURATION;
    this.inactivityDuration = options.inactivityDuration ?? DEFAULT_INACTIVITY_DURATION;
  }

  private sessionKey(identifier: string): string {
    return `session:${identifier}`;
  }

  private activityKey(identifier: string): string {
    return `session-active:${identifier}`;
  }

  private sidIndexKey(sid: string): string {
    return `sid-index:${sid}`;
  }

  private subIndexKey(sub: string): string {
    return `sub-index:${sub}`;
  }

  /**
   * Retrieve session state by identifier. The primary `session:<id>` record is
   * the source of truth; a missing record means the session is invalid.
   */
  async get(identifier: string): Promise<StateData | undefined> {
    const data = await this.kv.get(this.sessionKey(identifier), { type: 'json' });
    return (data as StateData | null) ?? undefined;
  }

  /**
   * Persist session state and refresh its lookup indexes.
   *
   * Writes the primary record (absolute TTL), a rolling activity marker
   * (inactivity TTL), and — when available — `sid` and `sub` indexes used by
   * {@link deleteByLogoutToken}.
   */
  async set(identifier: string, stateData: StateData): Promise<void> {
    const absoluteTtl = clampTtl(this.absoluteDuration);
    const inactivityTtl = clampTtl(this.inactivityDuration);

    await this.kv.put(this.sessionKey(identifier), JSON.stringify(stateData), {
      expirationTtl: absoluteTtl,
    });

    await this.kv.put(this.activityKey(identifier), new Date().toISOString(), {
      expirationTtl: inactivityTtl,
    });

    const sid = readSid(stateData);
    if (sid) {
      await this.kv.put(this.sidIndexKey(sid), identifier, { expirationTtl: absoluteTtl });
    }

    const sub = readSub(stateData);
    if (sub) {
      await this.kv.put(this.subIndexKey(sub), identifier, { expirationTtl: absoluteTtl });
    }
  }

  /**
   * Delete a session and its associated indexes. Index deletes are derived from
   * the stored record and are idempotent (KV ignores missing keys).
   */
  async delete(identifier: string): Promise<void> {
    const data = await this.get(identifier);

    await this.kv.delete(this.sessionKey(identifier));
    await this.kv.delete(this.activityKey(identifier));

    if (data) {
      const sid = readSid(data);
      if (sid) {
        await this.kv.delete(this.sidIndexKey(sid));
      }
      const sub = readSub(data);
      if (sub) {
        await this.kv.delete(this.subIndexKey(sub));
      }
    }
  }

  /**
   * Invalidate a session in response to a Backchannel Logout token.
   *
   * Resolution order:
   * 1. `sid` claim → `sid-index:<sid>` → session identifier.
   * 2. `sub` claim → `sub-index:<sub>` → session identifier (fallback).
   *
   * If neither index resolves, this is a no-op; the session's TTL guarantees
   * eventual cleanup. `internal.sid` is populated by server-js when Auth0 issues
   * a session with a `sid`, so sid-based invalidation applies to those sessions.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async deleteByLogoutToken(claims: LogoutTokenClaims, c?: Context): Promise<void> {
    if (claims.sid) {
      const identifier = await this.kv.get(this.sidIndexKey(claims.sid), { type: 'text' });
      if (typeof identifier === 'string') {
        await this.delete(identifier);
        return;
      }
    }

    if (claims.sub) {
      const identifier = await this.kv.get(this.subIndexKey(claims.sub), { type: 'text' });
      if (typeof identifier === 'string') {
        await this.delete(identifier);
        return;
      }
    }
  }
}
