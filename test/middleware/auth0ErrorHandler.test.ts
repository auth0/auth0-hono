/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi, Mock } from 'vitest';
import { auth0ErrorHandler } from '../../src/middleware/auth0ErrorHandler';
import { Auth0Error } from '../../src/errors/Auth0Error';
import { LoginRequiredError, AccessDeniedError } from '../../src/errors/index';
import { createMockContext, createMockConfig } from '../fixtures';

vi.mock('../../src/config/index.js', () => ({
  getClient: vi.fn(),
}));

import { getClient } from '../../src/config/index';

/**
 * Build a mock context whose Accept header returns the supplied value, so
 * hono/accepts negotiation can be exercised.
 */
function ctxWithAccept(accept: string | null, url = 'https://app.test.com/protected') {
  const ctx: any = createMockContext({
    req: {
      url,
      method: 'GET',
      header: vi.fn((name?: string) => {
        if (name && name.toLowerCase() === 'accept') return accept ?? undefined;
        // hono/accepts may call header() with no args to get all headers
        return accept ?? undefined;
      }),
      raw: { headers: new Headers(accept ? { Accept: accept } : {}) },
    },
  });
  // Override fixture json/redirect to honor the status argument.
  ctx.json = vi.fn((data: any, status?: number) => {
    return new Response(JSON.stringify(data), {
      status: status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  ctx.redirect = vi.fn((location: string, status?: number) => {
    return new Response('', { status: status ?? 302, headers: { location } });
  });
  return ctx;
}

beforeEach(() => {
  vi.clearAllMocks();
  (getClient as Mock).mockReturnValue({ configuration: createMockConfig() });
});

describe('auth0ErrorHandler', () => {
  it('re-throws non-Auth0 errors (does not swallow)', () => {
    const ctx = ctxWithAccept('application/json');
    const err = new TypeError('boom');
    expect(() => auth0ErrorHandler(err as any, ctx as any)).toThrow(TypeError);
  });

  it('returns JSON body for a generic Auth0Error using its status and code', async () => {
    const ctx = ctxWithAccept('application/json');
    const err = new Auth0Error('nope', 403, 'access_denied', { description: 'denied' });
    const res = (await auth0ErrorHandler(err, ctx as any)) as Response;
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'access_denied', error_description: 'denied', statusCode: 403 });
  });

  it('maps AccessDeniedError to 403', async () => {
    const ctx = ctxWithAccept('application/json');
    const err = new AccessDeniedError('denied');
    const res = (await auth0ErrorHandler(err, ctx as any)) as Response;
    expect(res.status).toBe(403);
  });

  it('falls back to 500 when status is missing (nullish)', async () => {
    const ctx = ctxWithAccept('application/json');
    // Simulate a malformed error with no status set → `?? 500` fallback.
    const err = new Auth0Error('weird', 500, 'custom_error');
    (err as any).status = undefined;
    const res = (await auth0ErrorHandler(err, ctx as any)) as Response;
    expect(res.status).toBe(500);
  });

  it('redirects LoginRequiredError to the login route for HTML requests', async () => {
    const ctx = ctxWithAccept('text/html');
    const err = new LoginRequiredError('login required');
    const res = (await auth0ErrorHandler(err, ctx as any)) as Response;
    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toContain('/auth/login');
    expect(location).toContain('returnTo=%2Fprotected');
  });

  it('preserves the query string in returnTo (same-origin)', async () => {
    const ctx = ctxWithAccept('text/html', 'https://app.test.com/search?q=foo&page=2');
    const err = new LoginRequiredError('login required');
    const res = (await auth0ErrorHandler(err, ctx as any)) as Response;
    expect(res.status).toBe(302);
    const location = res.headers.get('location')!;
    const returnTo = new URL(location).searchParams.get('returnTo');
    expect(returnTo).toBe('/search?q=foo&page=2');
  });

  it('re-throws the original error when auth0() middleware is missing', () => {
    const ctx = ctxWithAccept('text/html');
    // getClient throws when the middleware context is absent.
    (getClient as Mock).mockImplementationOnce(() => {
      throw new Error('Auth0 client not initialized');
    });
    const err = new LoginRequiredError('login required');
    expect(() => auth0ErrorHandler(err, ctx as any)).toThrow(LoginRequiredError);
  });

  it('returns JSON for LoginRequiredError when the client wants JSON', async () => {
    const ctx = ctxWithAccept('application/json');
    const err = new LoginRequiredError('login required');
    const res = (await auth0ErrorHandler(err, ctx as any)) as Response;
    expect(res.status).toBe(err.status);
    const body = await res.json();
    expect(body.error).toBe(err.code);
  });

  it('defaults to JSON when no Accept header is present', async () => {
    const ctx = ctxWithAccept(null);
    const err = new LoginRequiredError('login required');
    const res = (await auth0ErrorHandler(err, ctx as any)) as Response;
    // No HTML preference → JSON path (not a redirect).
    expect(res.status).toBe(err.status);
    const body = await res.json();
    expect(body.error).toBe(err.code);
  });
});
