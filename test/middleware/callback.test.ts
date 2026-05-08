/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { getClient } from '../../src/config';
import { resumeSilentLogin } from '../../src/middleware';
import { callback } from '../../src/middleware/callback';
import { createRouteUrl } from '../../src/utils/util';

// Mock dependencies
vi.mock('../../src/config', () => ({
  getClient: vi.fn(),
}));

vi.mock('../../src/utils/util', () => ({
  createRouteUrl: vi.fn(),
  toSafeRedirect: vi.fn((url) => url), // Mock toSafeRedirect to return the input
}));

vi.mock('../../src/middleware/silentLogin', () => ({
  resumeSilentLogin: vi.fn(),
}));

describe('callback middleware', () => {
  let mockContext: Context;
  let mockClient: any;
  let mockConfiguration: any;
  const nextFn = vi.fn();
  const resumeSilentLoginMiddleware = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();

    (resumeSilentLogin as Mock).mockReturnValue(resumeSilentLoginMiddleware);

    // Create a mock client
    mockClient = {
      completeInteractiveLogin: vi.fn(),
      getSession: vi.fn().mockResolvedValue(null),
    };

    // Create a mock Hono context
    mockContext = {
      req: {
        url: 'https://app.example.com/callback?code=mock-code&state=mock-state',
      },
      redirect: vi.fn().mockImplementation((url) => {
        return { status: 302, headers: { location: url } };
      }),
    } as unknown as Context;

    // Create mock configuration
    mockConfiguration = {
      baseURL: 'https://app.example.com',
      routes: {
        callback: '/callback',
      },
    };

    // Setup the getClient mock
    (getClient as Mock).mockReturnValue({
      client: mockClient,
      configuration: mockConfiguration,
    });

    // Setup createRouteUrl mock
    (createRouteUrl as Mock).mockReturnValue('https://app.example.com/callback?code=mock-code&state=mock-state');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('when callback verification is successful', () => {
    beforeEach(async () => {
      // Setup the completeInteractiveLogin mock to return appState with returnTo
      mockClient.completeInteractiveLogin.mockResolvedValue({
        appState: { returnTo: '/dashboard' },
      });

      await callback()(mockContext, nextFn);
    });

    it('should call completeInteractiveLogin with correct parameters', () => {
      expect(mockClient.completeInteractiveLogin).toHaveBeenCalledWith(
        'https://app.example.com/callback?code=mock-code&state=mock-state',
        mockContext
      );
    });

    it('should call the resume silent login middleware', () => {
      expect(resumeSilentLoginMiddleware).toHaveBeenCalledWith(mockContext, nextFn);
    });

    it('should redirect to the returnTo URL by default', () => {
      expect(mockContext.redirect).toHaveBeenCalledWith('/dashboard');
    });
  });

  describe('when redirectAfterLogin parameter is provided', () => {
    let result: Response | void;

    beforeEach(async () => {
      // Setup the completeInteractiveLogin mock to return appState with returnTo
      mockClient.completeInteractiveLogin.mockResolvedValue({
        appState: { returnTo: '/dashboard' },
      });

      result = (await callback({
        redirectAfterLogin: '/custom-page',
      })(mockContext, nextFn)) as Response;
    });

    it('should redirect to the specified redirectAfterLogin URL', () => {
      expect(mockContext.redirect).toHaveBeenCalledWith('/custom-page');
    });

    it('should return the redirect response', () => {
      expect(result).toEqual({
        status: 302,
        headers: { location: '/custom-page' },
      });
    });
  });

  describe('when redirectAfterLogin is set to false', () => {
    let result: Response | void;

    beforeEach(async () => {
      // Setup the completeInteractiveLogin mock to return appState with returnTo
      mockClient.completeInteractiveLogin.mockResolvedValue({
        appState: { returnTo: '/dashboard' },
      });

      result = await callback({ redirectAfterLogin: false })(mockContext, nextFn);
    });

    it('should not redirect but continue to the next middleware', () => {
      expect(mockContext.redirect).not.toHaveBeenCalled();
      expect(nextFn).toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  describe('when returnTo is not provided in the appState', () => {
    beforeEach(async () => {
      // Setup the completeInteractiveLogin mock to return empty appState
      mockClient.completeInteractiveLogin.mockResolvedValue({
        appState: undefined,
      });

      await callback()(mockContext, nextFn);
    });

    it('should redirect to baseURL as fallback', () => {
      expect(mockContext.redirect).toHaveBeenCalledWith('https://app.example.com');
    });
  });

  describe('when completeInteractiveLogin throws an error', () => {
    beforeEach(() => {
      mockClient.completeInteractiveLogin.mockRejectedValue(new Error('Authorization code grant failed'));
    });

    it('should NOT call resumeSilentLogin on error path (prevents redirect loop)', async () => {
      await expect(callback()(mockContext, nextFn)).rejects.toThrow('Authorization code grant failed');
      expect(resumeSilentLoginMiddleware).not.toHaveBeenCalled();
    });
  });

  describe('when callback verification returns an error with specific message', () => {
    let err: Error;
    beforeEach(async () => {
      // Create an error with cause property like Auth0Exception would have
      const error = new Error('The authorization code is invalid or expired');
      error.cause = {
        error: 'invalid_grant',
        error_description: 'The authorization code is invalid or expired',
      };

      mockClient.completeInteractiveLogin.mockRejectedValue(error);

      try {
        await callback()(mockContext, nextFn);
      } catch (error) {
        err = error;
      }
    });

    it('should NOT call resumeSilentLogin on error path (prevents redirect loop)', () => {
      expect(resumeSilentLoginMiddleware).not.toHaveBeenCalled();
    });

    it('should throw the error', () => {
      expect(err).toBeDefined();
      expect(err.message).toBe('The authorization code is invalid or expired');
    });
  });
});
