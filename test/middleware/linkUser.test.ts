/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { getClient } from '../../src/config';
import { linkUser } from '../../src/middleware/linkUser';
import { unlinkUser } from '../../src/middleware/unlinkUser';

// Mock dependencies
vi.mock('../../src/config', () => ({
  getClient: vi.fn(),
}));

describe('account linking middleware', () => {
  let mockContext: Context;
  let mockClient: any;
  let mockConfiguration: any;
  const nextFn = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();

    mockClient = {
      startLinkUser: vi.fn().mockResolvedValue(new URL('https://idp.example.com/authorize?link=1')),
      startUnlinkUser: vi.fn().mockResolvedValue(new URL('https://idp.example.com/authorize?unlink=1')),
    };

    mockConfiguration = {
      debug: vi.fn(),
      baseURL: 'https://app.example.com',
      routes: { link: '/auth/link', unlink: '/auth/unlink' },
    };

    mockContext = {
      var: {},
      req: {
        url: 'https://app.example.com/auth/link',
        method: 'GET',
        path: '/auth/link',
        query: vi.fn().mockImplementation(() => undefined),
      },
      redirect: vi.fn().mockImplementation((url) => ({ status: 302, headers: { location: url } })),
    } as unknown as Context;

    (getClient as Mock).mockReturnValue({ client: mockClient, configuration: mockConfiguration });
  });

  describe('linkUser', () => {
    it('calls startLinkUser with connection + connectionScope from params and redirects', async () => {
      const result = (await linkUser({ connection: 'google-oauth2', connectionScope: 'openid profile' })(
        mockContext,
        nextFn
      )) as Response;

      expect(mockClient.startLinkUser).toHaveBeenCalledWith(
        expect.objectContaining({ connection: 'google-oauth2', connectionScope: 'openid profile' }),
        mockContext
      );
      expect(mockContext.redirect).toHaveBeenCalledWith('https://idp.example.com/authorize?link=1');
      expect(result).toEqual({ status: 302, headers: { location: 'https://idp.example.com/authorize?link=1' } });
    });

    it('prefers query params over explicit params', async () => {
      mockContext.req.query = vi.fn().mockImplementation((p: string) =>
        ({ connection: 'github', connectionScope: 'repo' } as Record<string, string>)[p]
      );

      await linkUser({ connection: 'google-oauth2', connectionScope: 'openid profile' })(mockContext, nextFn);

      expect(mockClient.startLinkUser).toHaveBeenCalledWith(
        expect.objectContaining({ connection: 'github', connectionScope: 'repo' }),
        mockContext
      );
    });

    it('throws 400 when connection is missing', async () => {
      await expect(linkUser({ connection: '', connectionScope: 'openid' })(mockContext, nextFn)).rejects.toMatchObject({
        status: 400,
      });
      expect(mockClient.startLinkUser).not.toHaveBeenCalled();
    });

    it('throws 400 when connectionScope is missing', async () => {
      await expect(linkUser({ connection: 'google-oauth2', connectionScope: '' })(mockContext, nextFn)).rejects.toMatchObject(
        { status: 400 }
      );
      expect(mockClient.startLinkUser).not.toHaveBeenCalled();
    });

    it('maps server-js errors via mapServerError', async () => {
      mockClient.startLinkUser.mockRejectedValue(new Error('boom'));
      await expect(
        linkUser({ connection: 'google-oauth2', connectionScope: 'openid' })(mockContext, nextFn)
      ).rejects.toBeInstanceOf(Error);
    });
  });

  describe('unlinkUser', () => {
    beforeEach(() => {
      // @ts-ignore
      mockContext.req.path = '/auth/unlink';
    });

    it('calls startUnlinkUser with connection and redirects', async () => {
      const result = (await unlinkUser({ connection: 'google-oauth2' })(mockContext, nextFn)) as Response;

      expect(mockClient.startUnlinkUser).toHaveBeenCalledWith(
        expect.objectContaining({ connection: 'google-oauth2' }),
        mockContext
      );
      expect(mockContext.redirect).toHaveBeenCalledWith('https://idp.example.com/authorize?unlink=1');
      expect(result).toEqual({ status: 302, headers: { location: 'https://idp.example.com/authorize?unlink=1' } });
    });

    it('prefers query connection over explicit param', async () => {
      mockContext.req.query = vi.fn().mockImplementation((p: string) => (p === 'connection' ? 'github' : undefined));

      await unlinkUser({ connection: 'google-oauth2' })(mockContext, nextFn);

      expect(mockClient.startUnlinkUser).toHaveBeenCalledWith(
        expect.objectContaining({ connection: 'github' }),
        mockContext
      );
    });

    it('throws 400 when connection is missing', async () => {
      await expect(unlinkUser({ connection: '' })(mockContext, nextFn)).rejects.toMatchObject({ status: 400 });
      expect(mockClient.startUnlinkUser).not.toHaveBeenCalled();
    });
  });
});
