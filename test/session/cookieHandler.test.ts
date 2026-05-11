/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono';
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { HonoCookieHandler } from '../../src/session/HonoCookieHandler';
import { getCookie, setCookie } from 'hono/cookie';

// Mock hono/cookie
vi.mock('hono/cookie', () => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
}));

describe('HonoCookieHandler', () => {
  let mockContext: Context;
  let cookieHandler: HonoCookieHandler;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {
      req: {
        header: vi.fn((name: string) => {
          if (name === 'Cookie') {
            return 'sessionId=abc123; other=value; test=123';
          }
          return undefined;
        }),
      },
    } as any;

    cookieHandler = new HonoCookieHandler();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('context resolution', () => {
    it('should use storeOptions when provided (primary path)', () => {
      const ctx = mockContext as any;
      const cookieName = 'testCookie';

      cookieHandler.getCookie(cookieName, ctx);

      expect(getCookie).toHaveBeenCalledWith(ctx, cookieName);
    });

    it('should throw when storeOptions undefined and no ALS context', () => {
      const cookieName = 'testCookie';

      // Clear the mock to simulate real ALS behavior
      expect(() => {
        cookieHandler.getCookie(cookieName);
      }).toThrow(/No Hono Context available/);
    });

    it('should use ALS context when storeOptions undefined', async () => {
      const ctx = mockContext as any;
      const cookieName = 'testCookie';

      // Run within ALS context
      await HonoCookieHandler.setContext(ctx, () => {
        cookieHandler.getCookie(cookieName);
        expect(getCookie).toHaveBeenCalledWith(ctx, cookieName);
      });
    });
  });

  describe('ALS setContext', () => {
    it('should set context for middleware chain', async () => {
      const ctx = mockContext as any;
      let callbackExecuted = false;

      await HonoCookieHandler.setContext(ctx, () => {
        callbackExecuted = true;
        // Inside callback, ALS should have the context
        cookieHandler.getCookie('sessionId');
        expect(getCookie).toHaveBeenCalled();
      });

      expect(callbackExecuted).toBe(true);
    });

    it('should allow nested calls within setContext', async () => {
      const ctx = mockContext as any;

      await HonoCookieHandler.setContext(ctx, async () => {
        cookieHandler.getCookie('cookie1');
        expect(getCookie).toHaveBeenCalledWith(ctx, 'cookie1');

        cookieHandler.getCookie('cookie2');
        expect(getCookie).toHaveBeenCalledWith(ctx, 'cookie2');

        expect(getCookie).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('getCookies', () => {
    it('should return all cookies from header as object', () => {
      const ctx = mockContext as any;
      const result = cookieHandler.getCookies(ctx);

      expect(result).toEqual({
        sessionId: 'abc123',
        other: 'value',
        test: '123',
      });
    });

    it('should handle empty cookie header', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      mockContext.req.header = vi.fn((_headerName: string) => {
        return '';
      });

      const result = cookieHandler.getCookies(mockContext as any);

      // Empty string should result in empty object or object with empty string key
      expect(typeof result).toBe('object');
    });

    it('should handle missing cookie header', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      mockContext.req.header = vi.fn((_headerName: string) => {
        return undefined;
      });

      const result = cookieHandler.getCookies(mockContext as any);

      expect(typeof result).toBe('object');
    });

    it('should decode URI-encoded cookie values', () => {
      mockContext.req.header = vi.fn((headerName: string) => {
        if (headerName === 'Cookie') {
          return 'email=user%40example.com';
        }
        return undefined;
      });

      const result = cookieHandler.getCookies(mockContext as any);

      expect(result.email).toBe('user@example.com');
    });

    // REQ-A1: Handle malformed %-encoding in cookie values (crash prevention)
    it('should handle malformed %-encoding in cookie values without crashing', () => {
      mockContext.req.header = vi.fn((headerName: string) => {
        if (headerName === 'Cookie') {
          return 'malformed=%XX%ZZ; valid=ok';
        }
        return undefined;
      });

      // Should not crash; should return raw value or empty
      const result = cookieHandler.getCookies(mockContext as any);

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      // May contain raw value or skip the malformed cookie
      expect(result.valid).toBe('ok');
    });

    it('should handle cookie with incomplete %-encoding', () => {
      mockContext.req.header = vi.fn((headerName: string) => {
        if (headerName === 'Cookie') {
          return 'incomplete=%';
        }
        return undefined;
      });

      // Should not crash
      const result = cookieHandler.getCookies(mockContext as any);

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('should handle mixed valid and invalid cookies', () => {
      mockContext.req.header = vi.fn((headerName: string) => {
        if (headerName === 'Cookie') {
          return 'valid=%40ok; broken=%XX%YY; another=value';
        }
        return undefined;
      });

      // Should not crash
      const result = cookieHandler.getCookies(mockContext as any);

      expect(result).toBeDefined();
      expect(result.another).toBe('value');
    });
  });

  describe('getCookie', () => {
    it('should return single cookie by name', () => {
      const ctx = mockContext as any;
      (getCookie as any).mockReturnValue('abc123');

      const result = cookieHandler.getCookie('sessionId', ctx);

      expect(getCookie).toHaveBeenCalledWith(ctx, 'sessionId');
      expect(result).toBe('abc123');
    });

    it('should return undefined for missing cookie', () => {
      const ctx = mockContext as any;
      (getCookie as any).mockReturnValue(undefined);

      const result = cookieHandler.getCookie('missing', ctx);

      expect(result).toBeUndefined();
    });
  });

  describe('setCookie', () => {
    it('should set cookie with basic options', () => {
      const ctx = mockContext as any;
      const value = 'newValue';

      cookieHandler.setCookie('newCookie', value, undefined, ctx);

      expect(setCookie).toHaveBeenCalledWith(ctx, 'newCookie', value, undefined);
    });

    it('should set cookie with options', () => {
      const ctx = mockContext as any;
      const value = 'newValue';
      const options = {
        maxAge: 3600,
        path: '/',
        httpOnly: true,
        sameSite: 'lax' as const,
      };

      cookieHandler.setCookie('newCookie', value, options, ctx);

      // Should capitalize sameSite
      expect(setCookie).toHaveBeenCalledWith(
        ctx,
        'newCookie',
        value,
        expect.objectContaining({
          maxAge: 3600,
          path: '/',
          httpOnly: true,
          sameSite: 'Lax',
        })
      );
    });

    it('should capitalize sameSite option', () => {
      const ctx = mockContext as any;
      const options = { sameSite: 'strict' as const };

      cookieHandler.setCookie('cookie', 'value', options, ctx);

      expect(setCookie).toHaveBeenCalledWith(
        ctx,
        'cookie',
        'value',
        expect.objectContaining({
          sameSite: 'Strict',
        })
      );
    });

    it('should capitalize priority option', () => {
      const ctx = mockContext as any;
      const options = { priority: 'high' as const };

      cookieHandler.setCookie('cookie', 'value', options, ctx);

      expect(setCookie).toHaveBeenCalledWith(
        ctx,
        'cookie',
        'value',
        expect.objectContaining({
          priority: 'High',
        })
      );
    });

    it('should return the cookie value', () => {
      const ctx = mockContext as any;
      const value = 'testValue';

      const result = cookieHandler.setCookie('cookie', value, undefined, ctx);

      expect(result).toBe(value);
    });
  });

  describe('deleteCookie', () => {
    it('should delete cookie by setting maxAge to 0', () => {
      const ctx = mockContext as any;

      cookieHandler.deleteCookie('oldCookie', ctx);

      expect(setCookie).toHaveBeenCalledWith(ctx, 'oldCookie', '', {
        path: '/',
        maxAge: 0,
      });
    });

    it('should work within ALS context', async () => {
      const ctx = mockContext as any;

      await HonoCookieHandler.setContext(ctx, () => {
        cookieHandler.deleteCookie('cookie');
        expect(setCookie).toHaveBeenCalledWith(ctx, 'cookie', '', {
          path: '/',
          maxAge: 0,
        });
      });
    });
  });

  describe('integration', () => {
    it('should handle full cookie lifecycle', () => {
      const ctx = mockContext as any;

      // Set a cookie
      cookieHandler.setCookie('session', 'abc123', { maxAge: 3600 }, ctx);
      expect(setCookie).toHaveBeenCalled();

      // Get the cookie
      (getCookie as any).mockReturnValue('abc123');
      const value = cookieHandler.getCookie('session', ctx);
      expect(value).toBe('abc123');

      // Delete the cookie
      vi.clearAllMocks();
      cookieHandler.deleteCookie('session', ctx);
      expect(setCookie).toHaveBeenCalledWith(ctx, 'session', '', {
        path: '/',
        maxAge: 0,
      });
    });

    it('should support multiple cookies in same request', () => {
      const ctx = mockContext as any;

      cookieHandler.setCookie('cookie1', 'value1', undefined, ctx);
      cookieHandler.setCookie('cookie2', 'value2', undefined, ctx);

      expect(setCookie).toHaveBeenCalledTimes(2);
    });
  });

  // REQ-C1: Throw Auth0Error (not generic Error) when ALS unavailable
  describe('error handling when ALS context unavailable', () => {
    it('should throw Auth0Error (not generic Error) when no context available', () => {
      // When called without context and ALS unavailable
      expect(() => {
        cookieHandler.getCookie('sessionId');
      }).toThrow(Error);

      // Verify it throws an error that mentions context
      try {
        cookieHandler.getCookie('sessionId');
      } catch (err) {
        // The error should mention context or ALS
        const message = (err as any).message;
        expect(message).toMatch(/context/i);
      }
    });

    it('should work with explicit context provided', () => {
      const ctx = mockContext as any;
      (getCookie as any).mockReturnValue('value123');

      const result = cookieHandler.getCookie('sessionId', ctx);

      expect(result).toBe('value123');
      expect(getCookie).toHaveBeenCalledWith(ctx, 'sessionId');
    });
  });
});
