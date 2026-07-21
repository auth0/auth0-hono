/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { getClient } from '../../src/config';
import { linkCallback } from '../../src/middleware/linkCallback';
import { unlinkCallback } from '../../src/middleware/unlinkCallback';
import { createRouteUrl, toSafeRedirect } from '../../src/utils/util';

vi.mock('../../src/config', () => ({
  getClient: vi.fn(),
}));

vi.mock('../../src/utils/util', () => ({
  createRouteUrl: vi.fn(),
  toSafeRedirect: vi.fn(),
}));

describe('account linking callback middleware', () => {
  let mockContext: Context;
  let mockClient: any;
  let mockConfiguration: any;
  const nextFn = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();

    mockClient = {
      completeLinkUser: vi.fn().mockResolvedValue({ appState: undefined }),
      completeUnlinkUser: vi.fn().mockResolvedValue({ appState: undefined }),
    };

    mockConfiguration = { debug: vi.fn(), baseURL: 'https://app.example.com' };

    mockContext = {
      var: {},
      req: { url: 'https://app.example.com/auth/link/callback?code=abc', method: 'GET', path: '/auth/link/callback' },
      redirect: vi.fn().mockImplementation((url) => ({ status: 302, headers: { location: url } })),
    } as unknown as Context;

    (getClient as Mock).mockReturnValue({ client: mockClient, configuration: mockConfiguration });
    (createRouteUrl as Mock).mockReturnValue(new URL('https://app.example.com/auth/link/callback?code=abc'));
    (toSafeRedirect as Mock).mockImplementation((url) => url);
  });

  describe('linkCallback', () => {
    it('completes linking and redirects to baseURL by default', async () => {
      const result = (await linkCallback()(mockContext, nextFn)) as Response;

      expect(mockClient.completeLinkUser).toHaveBeenCalledWith(expect.any(URL), mockContext);
      expect(mockContext.redirect).toHaveBeenCalledWith('https://app.example.com');
      expect(result).toEqual({ status: 302, headers: { location: 'https://app.example.com' } });
    });

    it('redirects to a custom safe redirectAfterLinking', async () => {
      await linkCallback({ redirectAfterLinking: '/dashboard' })(mockContext, nextFn);
      expect(toSafeRedirect).toHaveBeenCalledWith('/dashboard', 'https://app.example.com');
      expect(mockContext.redirect).toHaveBeenCalledWith('/dashboard');
    });

    it('calls next() when redirectAfterLinking is false', async () => {
      await linkCallback({ redirectAfterLinking: false })(mockContext, nextFn);
      expect(nextFn).toHaveBeenCalled();
      expect(mockContext.redirect).not.toHaveBeenCalled();
    });

    it('maps server-js errors via mapServerError', async () => {
      mockClient.completeLinkUser.mockRejectedValue(new Error('boom'));
      await expect(linkCallback()(mockContext, nextFn)).rejects.toBeInstanceOf(Error);
    });
  });

  describe('unlinkCallback', () => {
    it('completes unlinking and redirects to baseURL by default', async () => {
      const result = (await unlinkCallback()(mockContext, nextFn)) as Response;

      expect(mockClient.completeUnlinkUser).toHaveBeenCalledWith(expect.any(URL), mockContext);
      expect(mockContext.redirect).toHaveBeenCalledWith('https://app.example.com');
      expect(result).toEqual({ status: 302, headers: { location: 'https://app.example.com' } });
    });

    it('calls next() when redirectAfterUnlinking is false', async () => {
      await unlinkCallback({ redirectAfterUnlinking: false })(mockContext, nextFn);
      expect(nextFn).toHaveBeenCalled();
      expect(mockContext.redirect).not.toHaveBeenCalled();
    });
  });
});
