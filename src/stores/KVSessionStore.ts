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
  list(options?: { prefix?: string; cursor?: string }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
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
 * resolved to session identifiers:
 * - `sid-index:<sid>`             → session identifier (primary BCLO lookup; a
 *   `sid` maps to exactly one session)
 * - `sub-index:<sub>:<identifier>` → session identifier (one key per session, so
 *   a logout token carrying only a `sub` invalidates ALL of that subject's
 *   sessions, per RFC 9700 §2.4)
 *
 * All KV writes carry an `expirationTtl` so entries are cleaned up automatically
 * even if an explicit delete is missed. Writes are best-effort and not atomic;
 * a partially written record is bounded by its TTL.
 *
 * Inactivity/absolute session expiry is enforced by `@auth0/auth0-server-js` at
 * the (encrypted) session-cookie layer via the cookie's `exp`; this store only
 * persists the server-provided record and does not need its own activity clock.
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

  private sidIndexKey(sid: string): string {
    return `sid-index:${sid}`;
  }

  private subIndexPrefix(sub: string): string {
    return `sub-index:${sub}:`;
  }

  private subIndexKey(sub: string, identifier: string): string {
    return `${this.subIndexPrefix(sub)}${identifier}`;
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
   * Writes the primary record plus — when available — the `sid` index and a
   * per-session `sub` index entry used by {@link deleteByLogoutToken}. All writes
   * share the absolute TTL and are independent, so they are issued in parallel.
   */
  async set(identifier: string, stateData: StateData): Promise<void> {
    const absoluteTtl = clampTtl(this.absoluteDuration);
    const sid = readSid(stateData);
    const sub = readSub(stateData);

    const writes: Promise<void>[] = [
      this.kv.put(this.sessionKey(identifier), JSON.stringify(stateData), { expirationTtl: absoluteTtl }),
    ];

    if (sid) {
      writes.push(this.kv.put(this.sidIndexKey(sid), identifier, { expirationTtl: absoluteTtl }));
    }

    if (sub) {
      writes.push(this.kv.put(this.subIndexKey(sub, identifier), identifier, { expirationTtl: absoluteTtl }));
    }

    await Promise.all(writes);
  }

  /**
   * Delete a session and its associated indexes. Index deletes are derived from
   * the stored record and are idempotent (KV ignores missing keys).
   */
  async delete(identifier: string): Promise<void> {
    const data = await this.get(identifier);

    const deletes: Promise<void>[] = [this.kv.delete(this.sessionKey(identifier))];

    if (data) {
      const sid = readSid(data);
      if (sid) {
        deletes.push(this.kv.delete(this.sidIndexKey(sid)));
      }
      const sub = readSub(data);
      if (sub) {
        deletes.push(this.kv.delete(this.subIndexKey(sub, identifier)));
      }
    }

    await Promise.all(deletes);
  }

  /**
   * List every session identifier currently indexed for a subject by paging
   * through the `sub-index:<sub>:` prefix.
   */
  private async listSessionIdsForSub(sub: string): Promise<string[]> {
    const prefix = this.subIndexPrefix(sub);
    const identifiers: string[] = [];
    let cursor: string | undefined;

    do {
      const result = await this.kv.list({ prefix, cursor });
      for (const { name } of result.keys) {
        identifiers.push(name.slice(prefix.length));
      }
      cursor = result.list_complete ? undefined : result.cursor;
    } while (cursor);

    return identifiers;
  }

  /**
   * Invalidate sessions in response to a Backchannel Logout token.
   *
   * Resolution:
   * 1. A `sid` claim resolves via `sid-index:<sid>` to a single session, which
   *    is deleted.
   * 2. A `sub` claim (whether or not `sid` resolved) resolves via the
   *    `sub-index:<sub>:` prefix to ALL of that subject's sessions, each of which
   *    is deleted — satisfying RFC 9700 §2.4, which requires a `sub`-only logout
   *    token to terminate every session for the subject.
   *
   * Unresolved claims are a no-op; each session's TTL guarantees eventual
   * cleanup. `internal.sid` is populated by server-js when Auth0 issues a session
   * with a `sid`.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async deleteByLogoutToken(claims: LogoutTokenClaims, c?: Context): Promise<void> {
    if (claims.sid) {
      const identifier = await this.kv.get(this.sidIndexKey(claims.sid), { type: 'text' });
      if (typeof identifier === 'string') {
        await this.delete(identifier);
      }
    }

    if (claims.sub) {
      const identifiers = await this.listSessionIdsForSub(claims.sub);
      await Promise.all(identifiers.map((identifier) => this.delete(identifier)));
    }
  }
}
