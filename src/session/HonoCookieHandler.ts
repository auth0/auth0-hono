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
  // Singleton cache is safe — cookie names are static per lifecycle.
  // Multi-tenant deployments use ensureClient() which creates separate handler instances.
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

  // httpOnly enforcement is handled by server-js — all store implementations
  // always pass httpOnly:true in cookie options.
  // Ref: https://github.com/auth0/auth0-auth-js/blob/e1af6b311d83/packages/auth0-server-js/src/store/stateless-state-store.ts#L82
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

  deleteCookie(name: string, storeOptions?: Context, options?: CookieSerializeOptions): void {
    const ctx = this.getContext(storeOptions);
    // Chrome 118+ uses scheme-bound cookies — deletion must match creation attributes
    // (sameSite, secure, path, domain) exactly, otherwise cookie persists.
    // Priority: explicit options from server-js > cached options > minimal defaults.
    const cookieOptions: CookieOptions = options
      ? {
          path: options.path ?? '/',
          maxAge: 0,
          sameSite: options.sameSite ? capitalize(options.sameSite) : undefined,
          secure: options.secure,
          domain: options.domain,
          httpOnly: options.httpOnly,
        }
      : (() => {
          const storedOptions = this.cookieOptionsCache.get(name);
          return {
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
        })();
    setCookie(ctx, name, '', cookieOptions);
  }
}
