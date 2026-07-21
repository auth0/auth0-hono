/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { requiresScopes, requiresPermissions } from '../../src/middleware/requiresScopes';
import { Auth0Error } from '../../src/errors/Auth0Error';
import { createMockContext } from '../fixtures';

describe('requiresScopes middleware', () => {
  let ctx: Context;
  let next: any;

  beforeEach(() => {
    next = async () => 'next-called';
    ctx = createMockContext();
  });

  it('allows when the single required scope is present', async () => {
    ctx.var.auth0 = { user: { sub: 'u1', scope: 'openid profile read:data' } };
    const result = await requiresScopes('read:data')(ctx, next);
    expect(result).toBe('next-called');
  });

  it('allows when all required scopes are present', async () => {
    ctx.var.auth0 = { user: { sub: 'u1', scope: 'read:data write:data' } };
    const result = await requiresScopes('read:data', 'write:data')(ctx, next);
    expect(result).toBe('next-called');
  });

  it('rejects with 403 insufficient_claims when a scope is missing', async () => {
    ctx.var.auth0 = { user: { sub: 'u1', scope: 'openid profile' } };
    const mw = requiresScopes('read:data');
    await expect(mw(ctx, next)).rejects.toThrow(Auth0Error);
    try {
      await mw(ctx, next);
    } catch (err: any) {
      expect(err.status).toBe(403);
      expect(err.code).toBe('insufficient_claims');
      expect(err.description).toContain('read:data');
    }
  });

  it('rejects when scope claim is empty string', async () => {
    ctx.var.auth0 = { user: { sub: 'u1', scope: '' } };
    await expect(requiresScopes('read:data')(ctx, next)).rejects.toThrow(Auth0Error);
  });

  it('rejects when scope claim is missing', async () => {
    ctx.var.auth0 = { user: { sub: 'u1' } };
    await expect(requiresScopes('read:data')(ctx, next)).rejects.toThrow(Auth0Error);
  });

  it('rejects when unauthenticated (no user)', async () => {
    ctx.var.auth0 = {};
    const mw = requiresScopes('read:data');
    await expect(mw(ctx, next)).rejects.toThrow(Auth0Error);
    try {
      await mw(ctx, next);
    } catch (err: any) {
      expect(err.status).toBe(403);
    }
  });
});

describe('requiresPermissions middleware', () => {
  let ctx: Context;
  let next: any;

  beforeEach(() => {
    next = async () => 'next-called';
    ctx = createMockContext();
  });

  it('allows when the required permission is present', async () => {
    ctx.var.auth0 = { user: { sub: 'u1', permissions: ['admin', 'user'] } };
    const result = await requiresPermissions('admin')(ctx, next);
    expect(result).toBe('next-called');
  });

  it('allows when all required permissions are present', async () => {
    ctx.var.auth0 = { user: { sub: 'u1', permissions: ['read:billing', 'write:billing'] } };
    const result = await requiresPermissions('read:billing', 'write:billing')(ctx, next);
    expect(result).toBe('next-called');
  });

  it('rejects with 403 insufficient_claims when a permission is missing', async () => {
    ctx.var.auth0 = { user: { sub: 'u1', permissions: ['user'] } };
    const mw = requiresPermissions('admin');
    await expect(mw(ctx, next)).rejects.toThrow(Auth0Error);
    try {
      await mw(ctx, next);
    } catch (err: any) {
      expect(err.status).toBe(403);
      expect(err.code).toBe('insufficient_claims');
      expect(err.description).toContain('admin');
    }
  });

  it('rejects when permissions is an empty array', async () => {
    ctx.var.auth0 = { user: { sub: 'u1', permissions: [] } };
    await expect(requiresPermissions('admin')(ctx, next)).rejects.toThrow(Auth0Error);
  });

  it('rejects when permissions claim is missing', async () => {
    ctx.var.auth0 = { user: { sub: 'u1' } };
    await expect(requiresPermissions('admin')(ctx, next)).rejects.toThrow(Auth0Error);
  });

  it('rejects when permissions is not an array', async () => {
    ctx.var.auth0 = { user: { sub: 'u1', permissions: 'admin' as any } };
    await expect(requiresPermissions('admin')(ctx, next)).rejects.toThrow(Auth0Error);
  });
});
