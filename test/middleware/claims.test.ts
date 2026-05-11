/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono';
import { describe, expect, it, beforeEach } from 'vitest';
import { claimEquals, claimIncludes, claimCheck } from '../../src/middleware/claims';
import { Auth0Error } from '../../src/errors/Auth0Error';
import { createMockContext } from '../fixtures';

describe('claimEquals middleware', () => {
  let mockContext: Context;
  let mockNext: any;

  beforeEach(() => {
    mockNext = async () => 'next-called';
    mockContext = createMockContext();
  });

  describe('claim matching', () => {
    it('should allow matching string claim', async () => {
      mockContext.var.auth0 = { user: { role: 'admin', sub: 'user123' } };
      const middleware = claimEquals('role', 'admin');
      const result = await middleware(mockContext, mockNext);
      expect(result).toBe('next-called');
    });

    it('should allow matching boolean claim', async () => {
      mockContext.var.auth0 = { user: { admin: true, sub: 'user123' } };
      const middleware = claimEquals('admin', true);
      const result = await middleware(mockContext, mockNext);
      expect(result).toBe('next-called');
    });

    it('should allow matching number claim', async () => {
      mockContext.var.auth0 = { user: { userId: 12345, sub: 'user123' } };
      const middleware = claimEquals('userId', 12345);
      const result = await middleware(mockContext, mockNext);
      expect(result).toBe('next-called');
    });

    it('should allow matching null claim', async () => {
      mockContext.var.auth0 = { user: { status: null, sub: 'user123' } };
      const middleware = claimEquals('status', null);
      const result = await middleware(mockContext, mockNext);
      expect(result).toBe('next-called');
    });

    it('should block mismatched claim', async () => {
      mockContext.var.auth0 = { user: { role: 'user', sub: 'user123' } };
      const middleware = claimEquals('role', 'admin');
      await expect(middleware(mockContext, mockNext)).rejects.toThrow(Auth0Error);
      try {
        await middleware(mockContext, mockNext);
      } catch (err: any) {
        expect(err.status).toBe(403);
        expect(err.code).toBe('insufficient_claims');
      }
    });
  });

  describe('authentication requirement', () => {
    it('should require authentication', async () => {
      mockContext.var.auth0 = { user: null };
      const middleware = claimEquals('role', 'admin');
      await expect(middleware(mockContext, mockNext)).rejects.toThrow(Auth0Error);
      try {
        await middleware(mockContext, mockNext);
      } catch (err: any) {
        expect(err.status).toBe(403);
        expect(err.code).toBe('access_denied');
      }
    });

    it('should require auth when auth0 context is undefined', async () => {
      mockContext.var = {};
      const middleware = claimEquals('role', 'admin');
      await expect(middleware(mockContext, mockNext)).rejects.toThrow(Auth0Error);
    });
  });

  describe('composability', () => {
    it('should be composable with other middleware', async () => {
      mockContext.var.auth0 = { user: { role: 'admin', sub: 'user123' } };
      const middleware1 = claimEquals('role', 'admin');
      const middleware2 = claimEquals('sub', 'user123');

      const result1 = await middleware1(mockContext, mockNext);
      expect(result1).toBe('next-called');

      const result2 = await middleware2(mockContext, mockNext);
      expect(result2).toBe('next-called');
    });
  });
});

describe('claimIncludes middleware', () => {
  let mockContext: Context;
  let mockNext: any;

  beforeEach(() => {
    mockNext = async () => 'next-called';
    mockContext = createMockContext();
  });

  describe('array claim inclusion', () => {
    it('should allow claim with matching value in array', async () => {
      mockContext.var.auth0 = {
        user: {
          permissions: ['read:data', 'write:data'],
          sub: 'user123',
        },
      };
      const middleware = claimIncludes('permissions', 'read:data');
      const result = await middleware(mockContext, mockNext);
      expect(result).toBe('next-called');
    });

    it('should block claim without any matching values', async () => {
      mockContext.var.auth0 = {
        user: {
          permissions: ['read:data'],
          sub: 'user123',
        },
      };
      const middleware = claimIncludes('permissions', 'write:data');
      await expect(middleware(mockContext, mockNext)).rejects.toThrow(Auth0Error);
      try {
        await middleware(mockContext, mockNext);
      } catch (err: any) {
        expect(err.status).toBe(403);
        expect(err.code).toBe('insufficient_claims');
      }
    });

    it('should support variadic values with ANY match', async () => {
      mockContext.var.auth0 = {
        user: {
          permissions: ['admin', 'user'],
          sub: 'user123',
        },
      };
      const middleware = claimIncludes('permissions', 'moderator', 'admin', 'user');
      const result = await middleware(mockContext, mockNext);
      expect(result).toBe('next-called');
    });

    it('should throw when claim is not an array', async () => {
      mockContext.var.auth0 = {
        user: {
          role: 'admin',
          sub: 'user123',
        },
      };
      const middleware = claimIncludes('role', 'admin');
      await expect(middleware(mockContext, mockNext)).rejects.toThrow(Auth0Error);
      try {
        await middleware(mockContext, mockNext);
      } catch (err: any) {
        expect(err.status).toBe(403);
        expect(err.code).toBe('insufficient_claims');
      }
    });

    it('should require match when array is empty', async () => {
      mockContext.var.auth0 = {
        user: {
          permissions: [],
          sub: 'user123',
        },
      };
      const middleware = claimIncludes('permissions', 'admin');
      await expect(middleware(mockContext, mockNext)).rejects.toThrow(Auth0Error);
    });
  });

  describe('authentication requirement', () => {
    it('should require authentication', async () => {
      mockContext.var.auth0 = { user: null };
      const middleware = claimIncludes('permissions', 'admin');
      await expect(middleware(mockContext, mockNext)).rejects.toThrow(Auth0Error);
    });
  });
});

describe('claimCheck middleware', () => {
  let mockContext: Context;
  let mockNext: any;

  beforeEach(() => {
    mockNext = async () => 'next-called';
    mockContext = createMockContext();
  });

  describe('predicate function evaluation', () => {
    it('should allow when predicate returns true', async () => {
      mockContext.var.auth0 = {
        user: {
          email_verified: true,
          sub: 'user123',
        },
      };
      const middleware = claimCheck((user) => user.email_verified === true);
      const result = await middleware(mockContext, mockNext);
      expect(result).toBe('next-called');
    });

    it('should block when predicate returns false', async () => {
      mockContext.var.auth0 = {
        user: {
          email_verified: false,
          sub: 'user123',
        },
      };
      const middleware = claimCheck((user) => user.email_verified === true);
      await expect(middleware(mockContext, mockNext)).rejects.toThrow(Auth0Error);
      try {
        await middleware(mockContext, mockNext);
      } catch (err: any) {
        expect(err.status).toBe(403);
        expect(err.code).toBe('insufficient_claims');
      }
    });

    it('should receive Auth0User object', async () => {
      const userSpy = { called: false, receivedUser: null as any };
      mockContext.var.auth0 = {
        user: {
          sub: 'google-oauth2|12345',
          email: 'test@example.com',
        },
      };
      const middleware = claimCheck((user) => {
        userSpy.called = true;
        userSpy.receivedUser = user;
        return user.sub.startsWith('google-oauth2');
      });
      const result = await middleware(mockContext, mockNext);
      expect(userSpy.called).toBe(true);
      expect(userSpy.receivedUser.sub).toBe('google-oauth2|12345');
      expect(result).toBe('next-called');
    });

    it('should propagate errors from function', async () => {
      mockContext.var.auth0 = {
        user: {
          email: undefined,
          sub: 'user123',
        },
      };
      const middleware = claimCheck((user) => {
        // This will throw because email is undefined
        return user.email!.toLowerCase() === 'test@example.com';
      });
      await expect(middleware(mockContext, mockNext)).rejects.toThrow();
    });
  });

  describe('authentication requirement', () => {
    it('should require authentication', async () => {
      mockContext.var.auth0 = { user: null };
      const middleware = claimCheck((user) => user.email_verified === true);
      await expect(middleware(mockContext, mockNext)).rejects.toThrow(Auth0Error);
    });
  });
});
