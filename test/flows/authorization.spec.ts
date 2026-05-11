/* eslint-disable @typescript-eslint/no-explicit-any */
import { Hono } from 'hono';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { claimEquals, claimIncludes, requiresOrg } from '../../src/middleware';
import { Auth0User, Auth0Context } from '../../src/types/auth0';

describe('Authorization Flows (HTTP Layer)', () => {
  let mockUser: Auth0User;
  let auth0Context: Auth0Context;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock user with various claims
    mockUser = {
      sub: 'auth0|123',
      email: 'test@example.com',
      name: 'Test User',
      email_verified: true,
      org_id: 'org_123',
      org_name: 'Test Org',
      permissions: ['read:data', 'write:data'],
      role: 'admin',
    } as Auth0User;

    auth0Context = {
      user: mockUser,
      session: { user: mockUser } as any,
      org: { id: 'org_123', name: 'Test Org' },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Helper to create an app with mocked auth context
   */
  function createAuthenticatedApp() {
    const app = new Hono();

    // Middleware to populate auth context (simulates auth0() + getCachedSession)
    app.use('*', (c, next) => {
      c.set('auth0', { ...auth0Context });
      return next();
    });

    return app;
  }

  /**
   * Helper to create an app with customizable auth context
   */
  function createAppWithContext(contextOverride: Partial<Auth0Context>) {
    const app = new Hono();

    app.use('*', (c, next) => {
      c.set('auth0', { ...auth0Context, ...contextOverride });
      return next();
    });

    return app;
  }

  it('should allow full middleware chain when all checks pass', async () => {
    const app = createAuthenticatedApp();

    app.use('/protected', claimIncludes('permissions', 'read:data'));

    app.get('/protected', (c) => {
      return c.json({ success: true, data: 'protected content' });
    });

    const res = await app.request('http://localhost/protected');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBe('protected content');
  });

  it('should short-circuit on claim mismatch with 403 OAuth2 error', async () => {
    const app = createAuthenticatedApp();

    app.use('/admin', claimEquals('role', 'superadmin')); // User has 'admin', not 'superadmin'

    app.get('/admin', (c) => {
      return c.json({ admin: true });
    });

    const res = await app.request('http://localhost/admin');

    expect(res.status).toBe(403);
    expect(res.headers.get('content-type')).toBe('application/json');

    const body = await res.json();
    expect(body.error).toBe('insufficient_claims');
    expect(body.error_description).toBeDefined();
    expect(typeof body.error_description).toBe('string');
  });

  it('should short-circuit on org mismatch with 403 error', async () => {
    const app = createAuthenticatedApp();

    app.use('/org', requiresOrg({ orgId: 'org_999' })); // User has 'org_123'

    app.get('/org', (c) => {
      return c.json({ org: c.var.auth0?.org });
    });

    const res = await app.request('http://localhost/org');

    expect(res.status).toBe(403);
    expect(res.headers.get('content-type')).toBe('application/json');

    const body = await res.json();
    expect(body.error).toBe('organization_mismatch');
    expect(body.error_description).toBeDefined();
  });

  it('should verify OAuth2 error format structure on all 403 responses', async () => {
    const app = createAuthenticatedApp();

    app.use('/protected', claimEquals('permission', 'admin:write'));

    app.get('/protected', (c) => {
      return c.json({ data: 'secret' });
    });

    const res = await app.request('http://localhost/protected');

    expect(res.status).toBe(403);

    const body = await res.json();

    // Verify OAuth2 error format
    expect(body).toHaveProperty('error');
    expect(body).toHaveProperty('error_description');
    expect(body.error).toMatch(/^[a-z_]+$/); // error codes are snake_case
    expect(body.error_description).toBeTruthy();

    // Verify no leaking of technical details
    expect(body).not.toHaveProperty('code');
    expect(body).not.toHaveProperty('message');
    expect(body).not.toHaveProperty('stack');

    // Verify Content-Type header
    expect(res.headers.get('content-type')).toBe('application/json');
  });

  it('should allow different users with different claims through same chain', async () => {
    // User with different permissions
    const customContext: Auth0Context = {
      user: {
        ...mockUser,
        permissions: ['read:reports', 'write:data'],
      } as Auth0User,
      session: null,
      org: null,
    };

    const app = createAppWithContext(customContext);

    app.use('/api/reports', claimIncludes('permissions', 'read:reports'));

    app.get('/api/reports', (c) => {
      const perms = c.var.auth0?.user?.permissions || [];
      return c.json({ allowed: true, permissions: perms });
    });

    const res = await app.request('http://localhost/api/reports');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.allowed).toBe(true);
    expect(body.permissions).toContain('read:reports');
  });

  it('should allow claimIncludes with variadic values (ANY match)', async () => {
    const customContext: Auth0Context = {
      user: { ...mockUser, permissions: ['read:data'] } as Auth0User,
      session: null,
      org: null,
    };

    const app = createAppWithContext(customContext);

    app.use('/api/data', claimIncludes('permissions', 'delete:data', 'read:data', 'write:data'));

    app.get('/api/data', (c) => {
      return c.json({ accessible: true });
    });

    const res = await app.request('http://localhost/api/data');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessible).toBe(true);
  });

  it('should allow nested middleware chains with multiple claims checks', async () => {
    const app = createAuthenticatedApp();

    app.use('/api/admin', claimEquals('role', 'admin'));
    app.use('/api/admin', claimIncludes('permissions', 'write:data'));

    app.get('/api/admin', (c) => {
      return c.json({ admin: true, data: 'restricted' });
    });

    const res = await app.request('http://localhost/api/admin');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.admin).toBe(true);
  });

  it('should fail on first middleware in chain when permission missing', async () => {
    const app = createAuthenticatedApp();

    app.use('/api/admin', claimEquals('role', 'admin')); // Passes: user has role='admin'
    app.use('/api/admin', claimIncludes('permissions', 'admin:delete')); // Fails: user doesn't have this

    app.get('/api/admin', (c) => {
      return c.json({ admin: true });
    });

    const res = await app.request('http://localhost/api/admin');

    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBe('insufficient_claims');
  });
});
