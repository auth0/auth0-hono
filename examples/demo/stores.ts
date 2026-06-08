/**
 * Session Store Implementation for Auth0 Backchannel Logout (BCLO)
 *
 * ===== Backchannel Logout (BCLO) + Stateful Store =====
 * BCLO allows Auth0 to notify the app when a user session is terminated on Auth0
 * (logout, password reset, etc.). The SDK auto-mounts POST /auth/backchannel-logout
 * and validates the logout_token.
 *
 * However, invalidating a session by 'sid' (Session ID) requires a STATEFUL session
 * store (not stateless cookies). Stateless stores cannot enumerate sessions by 'sid'.
 * Stateful stores enable the SDK to call deleteByLogoutToken({sid}) on the provided
 * store, clearing the session.
 *
 * This demo provides InMemorySessionStore (Map-based) for Node.js and local
 * Cloudflare Workers development. For production Workers with multiple instances,
 * replace with a KV-backed store (skeleton provided in comments).
 */

import { SessionStore } from '@auth0/auth0-hono';
import type { StateData, LogoutTokenClaims } from '@auth0/auth0-server-js';
import type { Context } from 'hono';

/**
 * In-memory session storage using a Map.
 * Tracks both session ID and 'sid' claim (via data.internal?.sid) for BCLO lookups.
 *
 * Suitable for: single-process Node.js demo, local Cloudflare Workers dev
 * Production: replace with KV-backed store for Workers, Redis/DB for Node.js
 */
export class InMemorySessionStore extends SessionStore {
  private sessions = new Map<string, StateData>();
  private sidToSessionId = new Map<string, string>(); // internal.sid → session ID mapping

  /**
   * Retrieve session by ID.
   */
  async get(identifier: string): Promise<StateData | undefined> {
    return this.sessions.get(identifier);
  }

  /**
   * Store session by ID.
   * Updates sidToSessionId mapping for BCLO lookups.
   *
   * StateData structure: { internal: { sid: string, ... }, user: UserClaims, ... }
   */
  async set(identifier: string, stateData: StateData): Promise<void> {
    this.sessions.set(identifier, stateData);

    // If session has a 'sid' claim in internal, index it for backchannel logout
    if (stateData?.internal?.sid) {
      this.sidToSessionId.set(stateData.internal.sid, identifier);
    }
  }

  /**
   * Delete session by ID.
   * Removes from both sessions and sidToSessionId index.
   */
  async delete(identifier: string): Promise<void> {
    const data = this.sessions.get(identifier);
    if (data?.internal?.sid) {
      this.sidToSessionId.delete(data.internal.sid);
    }
    this.sessions.delete(identifier);
  }

  /**
   * Delete session by logout token claims (called by BCLO handler).
   *
   * Auth0 BCLO sends logout_token with either 'sid' or 'sub' claim in the events payload.
   * This method invalidates the session by looking up the claim.
   *
   * Signature: (claims: LogoutTokenClaims, _c?: Context) where claims has .sid? and .sub?
   */
  async deleteByLogoutToken(claims: LogoutTokenClaims, _c?: Context): Promise<void> {
    if (claims.sid) {
      // Lookup session ID by 'sid' (from logout token)
      const sessionId = this.sidToSessionId.get(claims.sid);
      if (sessionId) {
        await this.delete(sessionId);
      }
    } else if (claims.sub) {
      // Fallback: search by 'sub' claim (user subject from logout token)
      for (const [id, data] of this.sessions.entries()) {
        if (data?.user?.sub === claims.sub) {
          await this.delete(id);
        }
      }
    }
  }
}

/**
 * Example KV-backed store for Cloudflare Workers production.
 *
 * Uncomment and use if deploying to Workers with real KV namespace.
 *
 * Usage:
 *   const kvStore = new KVSessionStore(env.SESSION_STORE);
 *   // In auth-config.ts: session.store = kvStore
 *
 * Note: Indexes sessions by data.internal.sid for BCLO lookups.
 */
/*
export class KVSessionStore extends SessionStore {
  constructor(private kv: KVNamespace) {}

  async get(identifier: string): Promise<StateData | undefined> {
    const data = await this.kv.get(`session:${identifier}`, 'json');
    return data as StateData | null || undefined;
  }

  async set(identifier: string, stateData: StateData): Promise<void> {
    await this.kv.put(`session:${identifier}`, JSON.stringify(stateData), {
      expirationTtl: 86400, // 1 day
    });

    // Index by 'sid' (from data.internal?.sid) for BCLO
    if (stateData?.internal?.sid) {
      await this.kv.put(`sid:${stateData.internal.sid}`, identifier, {
        expirationTtl: 86400,
      });
    }
  }

  async delete(identifier: string): Promise<void> {
    const data = await this.get(identifier);
    if (data?.internal?.sid) {
      await this.kv.delete(`sid:${data.internal.sid}`);
    }
    await this.kv.delete(`session:${identifier}`);
  }

  async deleteByLogoutToken(claims: LogoutTokenClaims, _c?: Context): Promise<void> {
    if (claims.sid) {
      const sessionId = await this.kv.get(`sid:${claims.sid}`, 'text');
      if (sessionId) {
        await this.delete(sessionId);
      }
    }
  }
}
*/
