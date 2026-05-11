/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono';
import { describe, expect, it, beforeEach } from 'vitest';
import { requiresOrg } from '../../src/middleware/requiresOrg';
import { Auth0Error } from '../../src/errors/Auth0Error';
import { createMockContext } from '../fixtures';

describe('requiresOrg middleware', () => {
  let mockContext: Context;
  let mockNext: any;

  beforeEach(() => {
    mockNext = async () => 'next-called';
    mockContext = createMockContext();
  });

  describe('organization membership', () => {
    it('should allow user with org_id and populate c.var.auth0.org', async () => {
      mockContext.var.auth0 = {
        user: {
          org_id: 'org_123',
          org_name: 'Acme Corp',
          sub: 'user123',
        },
      };
      const middleware = requiresOrg();
      const result = await middleware(mockContext, mockNext);
      expect(result).toBe('next-called');
      expect(mockContext.var.auth0.org).toEqual({
        id: 'org_123',
        name: 'Acme Corp',
      });
    });

    it('should block user without org_id', async () => {
      mockContext.var.auth0 = {
        user: {
          sub: 'user123',
        },
      };
      const middleware = requiresOrg();
      await expect(middleware(mockContext, mockNext)).rejects.toThrow(Auth0Error);
      try {
        await middleware(mockContext, mockNext);
      } catch (err: any) {
        expect(err.status).toBe(403);
        expect(err.code).toBe('missing_organization');
      }
    });
  });

  describe('specific organization enforcement', () => {
    it('should block user from different org', async () => {
      mockContext.var.auth0 = {
        user: {
          org_id: 'org_456',
          org_name: 'Different Corp',
          sub: 'user123',
        },
      };
      const middleware = requiresOrg({ orgId: 'org_123' });
      await expect(middleware(mockContext, mockNext)).rejects.toThrow(Auth0Error);
      try {
        await middleware(mockContext, mockNext);
      } catch (err: any) {
        expect(err.status).toBe(403);
        expect(err.code).toBe('organization_mismatch');
      }
    });

    it('should allow user from matching org', async () => {
      mockContext.var.auth0 = {
        user: {
          org_id: 'org_123',
          org_name: 'Acme Corp',
          sub: 'user123',
        },
      };
      const middleware = requiresOrg({ orgId: 'org_123' });
      const result = await middleware(mockContext, mockNext);
      expect(result).toBe('next-called');
      expect(mockContext.var.auth0.org.id).toBe('org_123');
    });
  });

  describe('custom check function', () => {
    it('should allow when custom check returns true', async () => {
      mockContext.var.auth0 = {
        user: {
          org_id: 'customer_abc',
          sub: 'user123',
        },
      };
      const middleware = requiresOrg((c) => c.var.auth0.user?.org_id?.startsWith('customer_') ?? false);
      const result = await middleware(mockContext, mockNext);
      expect(result).toBe('next-called');
    });

    it('should block when custom check returns false', async () => {
      mockContext.var.auth0 = {
        user: {
          org_id: 'internal_xyz',
          sub: 'user123',
        },
      };
      const middleware = requiresOrg((c) => c.var.auth0.user?.org_id?.startsWith('customer_') ?? false);
      await expect(middleware(mockContext, mockNext)).rejects.toThrow(Auth0Error);
      try {
        await middleware(mockContext, mockNext);
      } catch (err: any) {
        expect(err.status).toBe(403);
        expect(err.code).toBe('organization_check_failed');
      }
    });

    it('should wrap errors from custom check function', async () => {
      mockContext.var.auth0 = {
        user: {
          org_id: 'org_123',
          sub: 'user123',
        },
      };
      const middleware = requiresOrg(() => {
        throw new Error('Custom check failed');
      });
      await expect(middleware(mockContext, mockNext)).rejects.toThrow(Auth0Error);
      try {
        await middleware(mockContext, mockNext);
      } catch (err: any) {
        expect(err.status).toBe(500);
        expect(err.code).toBe('organization_check_error');
      }
    });
  });

  describe('configuration requirements', () => {
    it('should throw configuration_error when requiresAuth not run first', async () => {
      // No user at all means requiresAuth wasn't run
      mockContext.var.auth0 = { user: null };
      const middleware = requiresOrg();
      await expect(middleware(mockContext, mockNext)).rejects.toThrow(Auth0Error);
      try {
        await middleware(mockContext, mockNext);
      } catch (err: any) {
        expect(err.status).toBe(500);
        expect(err.code).toBe('configuration_error');
      }
    });

    it('should be idempotent if org already set', async () => {
      mockContext.var.auth0 = {
        user: {
          org_id: 'org_123',
          org_name: 'Acme Corp',
          sub: 'user123',
        },
        org: {
          id: 'org_existing',
          name: 'Existing Org',
        },
      };
      const middleware = requiresOrg();
      const result = await middleware(mockContext, mockNext);
      expect(result).toBe('next-called');
      // Should keep the existing org (idempotent)
      expect(mockContext.var.auth0.org.id).toBe('org_existing');
    });

    it('should be accessible in handler after requiresOrg', async () => {
      mockContext.var.auth0 = {
        user: {
          org_id: 'org_123',
          org_name: 'Acme Corp',
          sub: 'user123',
        },
      };
      const middleware = requiresOrg();
      await middleware(mockContext, async () => {
        // In a real handler, org should be guaranteed non-null
        expect(mockContext.var.auth0.org).toBeDefined();
        expect(mockContext.var.auth0.org.id).toBe('org_123');
        return 'handler-complete';
      });
    });
  });

  describe('edge cases', () => {
    it('should handle org_name being undefined', async () => {
      mockContext.var.auth0 = {
        user: {
          org_id: 'org_123',
          sub: 'user123',
        },
      };
      const middleware = requiresOrg();
      const result = await middleware(mockContext, mockNext);
      expect(result).toBe('next-called');
      expect(mockContext.var.auth0.org).toEqual({
        id: 'org_123',
        name: undefined,
      });
    });
  });
});
