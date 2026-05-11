/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { getClient } from '../../src/config';
import { resumeSilentLogin } from '../../src/middleware';
import { logout } from '../../src/middleware/logout';
import { toSafeRedirect } from '../../src/utils/util';

// Mock dependencies
vi.mock('../../src/config', () => ({
  getClient: vi.fn(),
}));

vi.mock('../../src/utils/util', () => ({
  toSafeRedirect: vi.fn(),
}));

vi.mock('../../src/middleware/silentLogin', () => ({
  resumeSilentLogin: vi.fn(),
}));

describe('logout middleware', () => {
  let mockContext: Context;
  let mockOidcSession: any;
  let mockConfiguration: any;
  let mockClient: any;
  const nextFn = vi.fn();
  const resumeSilentLoginMiddleware = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();

    (resumeSilentLogin as Mock).mockReturnValue(resumeSilentLoginMiddleware);
    // Mock OIDC session data
    mockOidcSession = {
      id_token: 'mock-id-token',
      access_token: 'mock-access-token',
    };

    // Create a mock client
    mockClient = {
      logout: vi.fn().mockResolvedValue('https://idp.example.com/logout'),
      getSession: vi.fn().mockResolvedValue(mockOidcSession),
    };

    // Create a mock Hono context
    mockContext = {
      var: {
        oidcClient: {
          /* mock OIDC client */
        },
      },
      redirect: vi.fn().mockImplementation((url) => {
        return { status: 302, headers: { location: url } };
      }),
    } as unknown as Context;

    // Create mock configuration
    mockConfiguration = {
      baseURL: 'https://app.example.com',
      idpLogout: false,
    };

    // Setup the getClient mock
    (getClient as Mock).mockReturnValue({
      client: mockClient,
      configuration: mockConfiguration,
    });

    // Setup toSafeRedirect mock
    (toSafeRedirect as Mock).mockImplementation((url) => {
      // Simple mock that returns the input URL if it's valid, or baseURL if not
      return url;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('when user has an active session', () => {
    let result: Response;

    beforeEach(async () => {
      result = (await logout()(mockContext, nextFn)) as Response;
    });

    it('should get the client and configuration', () => {
      expect(getClient).toHaveBeenCalledWith(mockContext);
    });

    it('should call client.logout with the correct parameters', () => {
      expect(mockClient.logout).toHaveBeenCalledWith({ returnTo: 'https://app.example.com' }, mockContext);
    });
    it('should redirect to the baseURL by default', () => {
      expect(mockContext.redirect).toHaveBeenCalledWith('https://app.example.com');
    });

    it('should return the redirect', () => {
      expect(result).toEqual({
        status: 302,
        headers: { location: 'https://app.example.com' },
      });
    });

    it('should call resumeSilentLogin middleware', () => {
      expect(resumeSilentLoginMiddleware).toHaveBeenCalledWith(mockContext, nextFn);
    });
  });

  describe('when redirectAfterLogout parameter is provided', () => {
    let result: Response;
    const customPath = '/custom-logout-page';

    beforeEach(async () => {
      result = (await logout({
        redirectAfterLogout: customPath,
      })(mockContext, nextFn)) as Response;
    });

    it('should call toSafeRedirect with the custom path', () => {
      expect(toSafeRedirect).toHaveBeenCalledWith(customPath, mockConfiguration.baseURL);
    });

    it('should redirect to the specified redirectAfterLogout URL', () => {
      expect(mockContext.redirect).toHaveBeenCalledWith(customPath);
    });

    it('should return the redirect response', () => {
      expect(result).toEqual({
        status: 302,
        headers: { location: customPath },
      });
    });
  });

  describe('when session is not available', () => {
    let result: Response;

    beforeEach(async () => {
      mockClient.getSession.mockImplementation(() => undefined);
      result = (await logout()(mockContext, nextFn)) as Response;
    });

    it('should still redirect to the baseURL', () => {
      expect(mockContext.redirect).toHaveBeenCalledWith(mockConfiguration.baseURL);
    });

    it('should return the redirect response', () => {
      expect(result).toEqual({
        status: 302,
        headers: { location: mockConfiguration.baseURL },
      });
    });
  });

  describe('when IdP logout is enabled', () => {
    let result: Response;

    beforeEach(async () => {
      // Configure with IdP logout enabled
      mockConfiguration.idpLogout = true;
      result = (await logout()(mockContext, nextFn)) as Response;
    });

    it('should redirect to the IdP end session URL', () => {
      expect(mockContext.redirect).toHaveBeenCalledWith('https://idp.example.com/logout');
    });

    it('should return the redirect response', () => {
      expect(result).toEqual({
        status: 302,
        headers: { location: 'https://idp.example.com/logout' },
      });
    });
  });

  describe('when IdP logout is enabled with a custom redirect', () => {
    let result: Response;
    const customPath = '/custom-logged-out';

    beforeEach(async () => {
      // Configure with IdP logout enabled and custom redirect
      mockConfiguration.idpLogout = true;
      result = (await logout({
        redirectAfterLogout: customPath,
      })(mockContext, nextFn)) as Response;
    });

    it('should call client.logout with the custom redirect URL', () => {
      expect(mockClient.logout).toHaveBeenCalledWith({ returnTo: customPath }, mockContext);
    });

    it('should redirect to the IdP end session URL', () => {
      expect(mockContext.redirect).toHaveBeenCalledWith('https://idp.example.com/logout');
    });

    it('should return the redirect response', () => {
      expect(result).toEqual({
        status: 302,
        headers: { location: 'https://idp.example.com/logout' },
      });
    });
  });
});
