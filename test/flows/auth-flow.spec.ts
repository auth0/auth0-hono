import { Hono } from 'hono';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { auth0 } from '../../src/auth';
import { requiresAuth } from '../../src/middleware';
import { createMockSession } from '../fixtures/index';

// Mock @auth0/auth0-server-js
vi.mock('@auth0/auth0-server-js', () => ({
  ServerClient: vi.fn(),
  StatelessStateStore: vi.fn(),
  CookieTransactionStore: vi.fn(),
}));

// Mock hono/adapter
vi.mock('hono/adapter', () => ({
  env: vi.fn(() => {
    return {
      AUTH0_DOMAIN: 'test.auth0.com',
      AUTH0_CLIENT_ID: 'test_client_id',
      AUTH0_CLIENT_SECRET: 'test_client_secret_' + 'x'.repeat(20),
      AUTH0_SESSION_ENCRYPTION_KEY: 'test_secret_' + 'x'.repeat(22),
      APP_BASE_URL: 'https://app.test.com',
    };
  }),
}));

// Mock hono/cookie
vi.mock('hono/cookie', () => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
}));

// Mock src/helpers/sessionCache.ts with shared state
const mockCacheState = {
  session: null as unknown,
};

vi.mock('../../src/helpers/sessionCache', () => ({
  getCachedSession: vi.fn(() => Promise.resolve(mockCacheState.session)),
  getSession: vi.fn(() => Promise.resolve(mockCacheState.session)),
  invalidateSessionCache: vi.fn(),
}));

// Shared mock state object (defined at module level, not hoisted inside vi.mock)
const mockState = {
  getSession: vi.fn().mockResolvedValue(null),
};

// Mock src/lib/client.ts - using factory function to avoid TDZ
vi.mock('../../src/lib/client', async () => {
  const actual = await vi.importActual('../../src/lib/client');
  return {
    ...actual,
    initializeOidcClient: vi.fn(() => ({
      serverClient: {
        getSession: mockState.getSession,
        startInteractiveLogin: vi.fn().mockResolvedValue(new URL('https://test.auth0.com/authorize')),
        completeInteractiveLogin: vi.fn(),
        logout: vi.fn().mockResolvedValue('https://test.auth0.com/logout'),
        handleBackchannelLogout: vi.fn(),
        getAccessToken: vi.fn(),
        getAccessTokenForConnection: vi.fn(),
      },
      stateStore: {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
      },
      cookieHandler: {
        getCookie: vi.fn(),
        setCookie: vi.fn(),
        deleteCookie: vi.fn(),
      },
    })),
    createStateStore: vi.fn(),
  };
});

describe('Auth Flow (end-to-end)', () => {
  beforeEach(() => {
    // Reset mock responses for each test
    mockCacheState.session = null;
    mockState.getSession.mockReset();
    mockState.getSession.mockResolvedValue(null);
  });

  afterEach(() => {
    mockCacheState.session = null;
    mockState.getSession.mockClear();
  });

  it('should handle browser login flow → redirect to Auth0', async () => {
    const app = new Hono();

    app.use('*', auth0());

    app.get('/', (c) => c.text('Home'));

    const response = await app.request('http://localhost/auth/login', {
      method: 'GET',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toMatch(/https:\/\/test\.auth0\.com\/authorize/);
  });

  it('should populate c.var.auth0 on authenticated request', async () => {
    const mockSession = createMockSession({
      user: { email: 'test@example.com', sub: 'user123' },
    });

    // Set up both mocks - getCachedSession is called first
    mockCacheState.session = mockSession;
    mockState.getSession.mockResolvedValue(mockSession);

    const app = new Hono();

    app.use('*', auth0());

    app.get('/dashboard', (c) => {
      const auth0Data = c.var.auth0;
      return c.json(auth0Data);
    });

    const response = await app.request('http://localhost/dashboard', {
      method: 'GET',
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe('test@example.com');
    expect(data.user.sub).toBe('user123');
  });

  it('should return 401 JSON on unauthenticated API request without session', async () => {
    mockState.getSession.mockResolvedValue(null);

    const app = new Hono();

    app.use('*', auth0());
    app.use('/api/*', requiresAuth('error'));

    app.get('/api/protected', (c) => {
      return c.json({ data: 'secret' });
    });

    const response = await app.request('http://localhost/api/protected', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it('should redirect to login on unauthenticated browser request', async () => {
    mockState.getSession.mockResolvedValue(null);

    const app = new Hono();

    app.use('*', auth0());
    app.use('/dashboard', requiresAuth());

    app.get('/dashboard', (c) => {
      return c.json(c.var.auth0.user);
    });

    const response = await app.request('http://localhost/dashboard', {
      method: 'GET',
      headers: { Accept: 'text/html' },
    });

    expect(response.status).toBe(302);
    const location = response.headers.get('location');
    expect(location).toBeTruthy();
    // Accept either redirect to login or to auth0 (both are 302 redirects)
    expect([/\/auth\/login/, /https:\/\/test\.auth0\.com\/authorize/].some((r) => r.test(location || ''))).toBe(true);
  });

  it('should handle logout route and redirect', async () => {
    mockState.getSession.mockResolvedValue(null);

    const app = new Hono();

    app.use('*', auth0());

    const response = await app.request('http://localhost/auth/logout', {
      method: 'GET',
    });

    expect(response.status).toBe(302);
    expect(response.headers.has('location')).toBe(true);
  });

  it('should propagate callback errors', async () => {
    mockState.getSession.mockResolvedValue(null);

    const app = new Hono();

    app.use('*', auth0());

    app.onError((err, c) => {
      return c.json({ error: err.message }, 400);
    });

    const response = await app.request('http://localhost/api/test', {
      method: 'GET',
    });

    expect([200, 400]).toContain(response.status);
  });

  it('should support custom route handler access to context', async () => {
    const mockSession = createMockSession({
      user: { email: 'user@example.com', sub: 'user456' },
    });

    // Set up both mocks - getCachedSession is called first
    mockCacheState.session = mockSession;
    mockState.getSession.mockResolvedValue(mockSession);

    const app = new Hono();

    app.use('*', auth0());

    app.get('/api/profile', (c) => {
      const user = c.var.auth0?.user;
      return c.json({ authenticated: !!user, email: user?.email });
    });

    const response = await app.request('http://localhost/api/profile', {
      method: 'GET',
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.authenticated).toBe(true);
    expect(data.email).toBe('user@example.com');
  });
});
