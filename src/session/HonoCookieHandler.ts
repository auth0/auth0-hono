import { Auth0Error } from '@/errors/Auth0Error.js';
import { CookieHandler, CookieSerializeOptions } from '@auth0/auth0-server-js';
import { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { CookieOptions } from 'hono/utils/cookie';

/**
 * Conditional AsyncLocalStorage import — defensive fallback for context resolution.
 *
 * CONTEXT RESOLUTION ORDER in getContext():
 *   1. storeOptions (explicit Hono Context passed by server-js) — primary path
 *   2. ALS getStore() — fallback if storeOptions is undefined
 *   3. Throw Auth0Error — neither available
 *
 * WHY ALS EXISTS (defensive, not required):
 * Audit of auth0-server-js confirms all 12 CookieHandler call sites (across
 * CookieTransactionStore, StatelessStateStore, StatefulStateStore) always pass
 * storeOptions explicitly. ALS is never the active path in current server-js.
 * Retained as insurance against future server-js changes or custom StateStore
 * implementations that may omit storeOptions.
 *
 * CONDITIONAL IMPORT MECHANISM:
 * Bundlers externalize Node built-ins via platform config (webpack externalsPresets,
 * esbuild platform:'node'), NOT because of try/catch. The try/catch is purely a
 * runtime guard for environments where async_hooks doesn't exist.
 *   - Node.js / Bun 1.0+: resolves → ALS available
 *   - Cloudflare Workers (no nodejs_compat): fails → catch → ALS = null → ok
 *   - Ref: https://github.com/webpack/webpack/pull/18076
 *   - Ref: https://developers.cloudflare.com/workers/runtime-apis/nodejs/
 *
 * WHY NOT A POLYFILL:
 * A try/finally polyfill breaks under concurrent requests (Workers share isolate;
 * Request A overwrites Request B's stored context). Real ALS uses V8 async context
 * tracking across promise chains. A correct polyfill (zone.js) is 10KB+. Since ALS
 * is defensive-only, a clear error on the rare edge case beats a subtly wrong polyfill.
 *
 * PRIOR ART:
 * No major library uses this exact pattern. Hono avoids ALS entirely (explicit context
 * passing). nextjs-auth0 uses @edge-runtime/cookies without ALS. OpenTelemetry uses
 * pluggable managers with static import (fails on Workers). Our case is unique: we
 * follow Hono's explicit pattern (storeOptions) but retain ALS as forward-compat guard.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let AsyncLocalStorageImpl: (new () => any) | null = null;
try {
  const mod = await import('async_hooks');
  AsyncLocalStorageImpl = mod.AsyncLocalStorage;
} catch {
  // Runtime doesn't support async_hooks — ALS fallback disabled.
  // Safe: server-js passes storeOptions (Context) explicitly on all standard paths.
  // Only CookieTransactionStore internal edge case would hit the null path.
}

function capitalize<T extends string>(s: T): Capitalize<T> {
  return (s.charAt(0).toUpperCase() + s.slice(1)) as Capitalize<T>;
}

export class HonoCookieHandler implements CookieHandler<Context> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static localStore: any = AsyncLocalStorageImpl ? new AsyncLocalStorageImpl() : null;
  // Cache cookie options per name for deletion (Chrome scheme-bound cookies require matching attrs).
  // This is a singleton instance — persists across requests. Last-write-wins per cookie name.
  // Safe because each cookie name (__a0_tx, appSession, etc.) always uses the same options
  // across its lifecycle. If a future feature uses dynamic options per-cookie-name, this
  // would need to be request-scoped.
  private cookieOptionsCache = new Map<string, CookieOptions>();

  static setContext<R>(context: Context, callback: () => R): R {
    if (!this.localStore) {
      // ALS not available — execute callback directly.
      // Context must be passed via storeOptions on each method call.
      return callback();
    }
    return this.localStore.run(context, callback);
  }

  /**
   * Resolve context: storeOptions first, ALS fallback.
   * storeOptions is passed by server-js on every method call.
   */
  private getContext(storeOptions?: Context): Context {
    const ctx = storeOptions ?? HonoCookieHandler.localStore?.getStore();
    if (!ctx) {
      throw new Auth0Error(
        'No Hono Context available. Ensure auth0() middleware is registered.' +
          (HonoCookieHandler.localStore
            ? ''
            : ' AsyncLocalStorage is not available in this runtime — context must be passed explicitly.'),
        500,
        'missing_context'
      );
    }
    return ctx;
  }

  /**
   * Parse cookies from the request header.
   *
   * @note Malformed %-encoding in cookie values is handled gracefully by returning
   * the raw value as a fallback. This prevents request crashes from attacker-injected
   * malformed cookies while preserving legitimate cookie data.
   *
   * @param storeOptions - Optional context override
   * @returns Record of cookie name-value pairs
   */
  getCookies(storeOptions?: Context): Record<string, string> {
    const { req } = this.getContext(storeOptions);
    const rawHeader = req.header('Cookie') ?? '';
    const result = Object.fromEntries(
      rawHeader.split(';').map((cookie) => {
        const [key, ...val] = cookie.trim().split('=');
        const encodedValue = val.join('=');
        let decodedValue: string;

        try {
          decodedValue = decodeURIComponent(encodedValue);
        } catch {
          // Return raw value as fallback — prevents request crash on attacker-injected
          // malformed cookies. The raw value will fail session decryption downstream
          // and be treated as an absent session.
          decodedValue = encodedValue;
        }

        return [key, decodedValue];
      })
    );
    return result;
  }

  setCookie(name: string, value: string, options?: CookieSerializeOptions, storeOptions?: Context): string {
    const cookieOptions: CookieOptions | undefined = options
      ? {
          ...options,
          sameSite: options.sameSite ? capitalize(options.sameSite) : undefined,
          priority: options.priority ? capitalize(options.priority) : undefined,
        }
      : undefined;
    const ctx = this.getContext(storeOptions);
    setCookie(ctx, name, value, cookieOptions);
    // Store options for deletion — Chrome scheme-bound cookies require matching attributes
    if (cookieOptions) {
      this.cookieOptionsCache.set(name, cookieOptions);
    }
    return value;
  }

  getCookie(name: string, storeOptions?: Context): string | undefined {
    const ctx = this.getContext(storeOptions);
    try {
      const val = getCookie(ctx, name);
      return val;
    } catch {
      // Malformed %-encoding in cookie value — treat as absent.
      // Prevents 500 crash from attacker-injected malformed session cookies.
      return undefined;
    }
  }

  deleteCookie(name: string, storeOptions?: Context): void {
    const ctx = this.getContext(storeOptions);
    // IMPORTANT: Replay stored attributes on deletion.
    // Chrome 118+ uses scheme-bound cookies — deletion must match creation attributes
    // (sameSite, secure, path, domain) exactly, otherwise cookie persists.
    // Same issue was hit in nextjs-auth0.
    const storedOptions = this.cookieOptionsCache.get(name);
    const cookieOptions: CookieOptions = {
      path: storedOptions?.path ?? '/',
      maxAge: 0,
      ...(storedOptions
        ? {
            sameSite: storedOptions.sameSite,
            secure: storedOptions.secure,
            domain: storedOptions.domain,
          }
        : {}),
    };
    setCookie(ctx, name, '', cookieOptions);
  }
}
