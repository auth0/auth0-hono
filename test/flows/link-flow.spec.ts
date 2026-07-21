import { Hono } from 'hono';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { auth0 } from '../../src/auth';

// Mock @auth0/auth0-server-js
vi.mock('@auth0/auth0-server-js', () => ({
  ServerClient: vi.fn(),
  StatelessStateStore: vi.fn(),
  CookieTransactionStore: vi.fn(),
}));

vi.mock('hono/adapter', () => ({
  env: vi.fn(() => ({
    AUTH0_DOMAIN: 'test.auth0.com',
    AUTH0_CLIENT_ID: 'test_client_id',
    AUTH0_CLIENT_SECRET: 'test_client_secret_' + 'x'.repeat(20),
    AUTH0_SESSION_ENCRYPTION_KEY: 'test_secret_' + 'x'.repeat(22),
    APP_BASE_URL: 'https://app.test.com',
  })),
}));

vi.mock('hono/cookie', () => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
}));

const mockCacheState = { session: null as unknown };

vi.mock('../../src/helpers/sessionCache', () => ({
  getCachedSession: vi.fn(() => Promise.resolve(mockCacheState.session)),
  getSession: vi.fn(() => Promise.resolve(mockCacheState.session)),
  invalidateSessionCache: vi.fn(),
}));

const mockState = {
  startLinkUser: vi.fn(),
  startUnlinkUser: vi.fn(),
  completeLinkUser: vi.fn(),
  completeUnlinkUser: vi.fn(),
};

vi.mock('../../src/lib/client', async () => {
  const actual = await vi.importActual('../../src/lib/client');
  return {
    ...actual,
    initializeOidcClient: vi.fn(() => ({
      serverClient: {
        getSession: vi.fn().mockResolvedValue(null),
        startInteractiveLogin: vi.fn().mockResolvedValue(new URL('https://test.auth0.com/authorize')),
        completeInteractiveLogin: vi.fn(),
        logout: vi.fn(),
        handleBackchannelLogout: vi.fn(),
        getAccessToken: vi.fn(),
        getAccessTokenForConnection: vi.fn(),
        startLinkUser: mockState.startLinkUser,
        startUnlinkUser: mockState.startUnlinkUser,
        completeLinkUser: mockState.completeLinkUser,
        completeUnlinkUser: mockState.completeUnlinkUser,
      },
      stateStore: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
      cookieHandler: { getCookie: vi.fn(), setCookie: vi.fn(), deleteCookie: vi.fn() },
    })),
    createStateStore: vi.fn(),
  };
});

describe('Account Linking Flow (end-to-end)', () => {
  beforeEach(() => {
    mockCacheState.session = null;
    Object.values(mockState).forEach((m) => m.mockReset());
    mockState.startLinkUser.mockResolvedValue(new URL('https://test.auth0.com/authorize?link=1'));
    mockState.startUnlinkUser.mockResolvedValue(new URL('https://test.auth0.com/authorize?unlink=1'));
  });

  afterEach(() => {
    mockCacheState.session = null;
  });

  it('mounts default /auth/link route → redirect to Auth0', async () => {
    const app = new Hono();
    app.use('*', auth0());

    const response = await app.request('http://localhost/auth/link?connection=google-oauth2&connectionScope=openid', {
      method: 'GET',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toMatch(/https:\/\/test\.auth0\.com\/authorize/);
    expect(mockState.startLinkUser).toHaveBeenCalledWith(
      expect.objectContaining({ connection: 'google-oauth2', connectionScope: 'openid' }),
      expect.anything()
    );
  });

  it('mounts default /auth/unlink route → redirect to Auth0', async () => {
    const app = new Hono();
    app.use('*', auth0());

    const response = await app.request('http://localhost/auth/unlink?connection=google-oauth2', { method: 'GET' });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toMatch(/https:\/\/test\.auth0\.com\/authorize/);
    expect(mockState.startUnlinkUser).toHaveBeenCalledWith(
      expect.objectContaining({ connection: 'google-oauth2' }),
      expect.anything()
    );
  });

  it('returns error when connection query param is missing on /auth/link', async () => {
    const app = new Hono();
    app.use('*', auth0());
    app.onError((err, c) => c.json({ error: (err as Error).message }, 400));

    const response = await app.request('http://localhost/auth/link', { method: 'GET' });

    expect(response.status).toBe(400);
    expect(mockState.startLinkUser).not.toHaveBeenCalled();
  });
});
