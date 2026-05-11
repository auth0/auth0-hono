/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { getClient } from '../../src/config';
import { login } from '../../src/middleware/login';
import { toSafeRedirect } from '../../src/utils/util';

// Mock dependencies
vi.mock('../../src/config', () => ({
  getClient: vi.fn(),
}));

vi.mock('../../src/utils/util', () => ({
  toSafeRedirect: vi.fn(),
}));

describe('login middleware', () => {
  let mockContext: Context;
  let mockClient: any;
  let mockConfiguration: any;
  const nextFn = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();

    // Mock client
    mockClient = {
      startInteractiveLogin: vi.fn().mockResolvedValue({ href: 'https://idp.example.com/auth' }),
    };

    // Create a mock Hono context
    mockContext = {
      var: {},
      req: {
        url: 'https://app.example.com/login',
        method: 'GET',
        path: '/login',
        query: vi.fn().mockImplementation(() => null),
      },
      redirect: vi.fn().mockImplementation((url) => {
        return { status: 302, headers: { location: url } };
      }),
    } as unknown as Context;

    // Create mock configuration
    mockConfiguration = {
      debug: vi.fn(),
      baseURL: 'https://app.example.com',
      routes: {
        login: '/login',
        callback: '/callback',
      },
      pushedAuthorizationRequests: false,
      authorizationParams: {
        response_type: 'code',
        scope: 'openid profile email',
      },
      forwardAuthorizationParams: [],
    };

    // Setup the getClient mock
    (getClient as Mock).mockReturnValue({
      client: mockClient,
      configuration: mockConfiguration,
    });

    // Setup toSafeRedirect mock
    (toSafeRedirect as Mock).mockImplementation((url) => (url === 'https://malicious.example.com' ? '/' : url));
  });

  describe('basic login flow', () => {
    let result: Response;

    beforeEach(async () => {
      result = (await login()(mockContext, nextFn)) as Response;
    });

    it('should get the client and configuration', () => {
      expect(getClient).toHaveBeenCalledWith(mockContext);
    });

    it('should validate the returnTo URL', () => {
      expect(toSafeRedirect).toHaveBeenCalledWith('/', mockConfiguration.baseURL);
    });

    it('should call startInteractiveLogin with correct parameters', () => {
      expect(mockClient.startInteractiveLogin).toHaveBeenCalledWith(
        {
          pushedAuthorizationRequests: false,
          appState: { returnTo: '/' },
          authorizationParams: {},
        },
        mockContext
      );
    });

    it('should redirect to the authorization URL', () => {
      expect(mockContext.redirect).toHaveBeenCalledWith('https://idp.example.com/auth');
    });

    it('should return a 302 response', () => {
      expect(result).toEqual({
        status: 302,
        headers: { location: 'https://idp.example.com/auth' },
      });
    });
  });

  describe('when redirectAfterLogin is specified', () => {
    beforeEach(async () => {
      await login({
        redirectAfterLogin: '/dashboard',
      })(mockContext, nextFn);
    });

    it('should use the specified redirectAfterLogin as the returnTo value', () => {
      expect(toSafeRedirect).toHaveBeenCalledWith('/dashboard', mockConfiguration.baseURL);
      expect(mockClient.startInteractiveLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          appState: { returnTo: '/dashboard' },
        }),
        mockContext
      );
    });
  });

  describe('when redirectAfterLogin is malicious', () => {
    beforeEach(async () => {
      (await login({
        redirectAfterLogin: 'https://malicious.example.com',
      })(mockContext, nextFn)) as Response;
    });

    it("should sanitize the URL and use '/' path", () => {
      expect(toSafeRedirect).toHaveBeenCalledWith('https://malicious.example.com', mockConfiguration.baseURL);
      expect(mockClient.startInteractiveLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          appState: { returnTo: '/' },
        }),
        mockContext
      );
    });
  });

  describe('when request is not GET', () => {
    beforeEach(async () => {
      // @ts-ignore
      mockContext.req.method = 'POST';
      await login()(mockContext, nextFn);
    });

    it('should use the default / as returnTo', () => {
      expect(mockClient.startInteractiveLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          appState: { returnTo: '/' },
        }),
        mockContext
      );
    });
  });

  describe('when silent parameter is true', () => {
    beforeEach(async () => {
      await login({ silent: true })(mockContext, nextFn);
    });

    it('should add prompt=none to the authorization parameters', () => {
      expect(mockClient.startInteractiveLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationParams: expect.objectContaining({
            prompt: 'none',
          }),
        }),
        mockContext
      );
    });
  });

  describe('when authorizationParams is provided', () => {
    beforeEach(async () => {
      await login({
        authorizationParams: {
          prompt: 'consent',
          acr_values: 'level1',
          login_hint: 'user@example.com',
        },
      })(mockContext, nextFn);
    });

    it('should pass the authorizationParams to startInteractiveLogin', () => {
      expect(mockClient.startInteractiveLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationParams: expect.objectContaining({
            prompt: 'consent',
            acr_values: 'level1',
            login_hint: 'user@example.com',
          }),
        }),
        mockContext
      );
    });
  });

  describe('when both silent and authorizationParams.prompt are specified', () => {
    beforeEach(async () => {
      (await login({
        silent: true,
        authorizationParams: {
          prompt: 'consent',
        },
      })(mockContext, nextFn)) as Response;
    });

    it('should override prompt with none due to silent parameter', () => {
      expect(mockClient.startInteractiveLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationParams: expect.objectContaining({
            prompt: 'none',
          }),
        }),
        mockContext
      );
    });
  });

  describe('when forwardAuthorizationParams is provided', () => {
    beforeEach(async () => {
      // Mock the query parameters in the request
      mockContext.req.query = vi.fn().mockImplementation((param) => {
        const params: Record<string, string> = {
          locale: 'en-US',
          campaign: 'spring2025',
          empty: '',
        };
        return params[param] || null;
      });

      await login({
        forwardAuthorizationParams: ['locale', 'campaign', 'nonexistent'],
      })(mockContext, nextFn);
    });

    it('should forward specified query parameters to the authorization request', () => {
      expect(mockClient.startInteractiveLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationParams: expect.objectContaining({
            locale: 'en-US',
            campaign: 'spring2025',
          }),
        }),
        mockContext
      );
    });

    it('should not forward non-existent or empty query parameters', () => {
      const authParams = mockClient.startInteractiveLogin.mock.calls[0][0].authorizationParams;
      expect(authParams).not.toHaveProperty('nonexistent');
      expect(authParams).not.toHaveProperty('empty');
    });
  });

  describe('when configuration has forwardAuthorizationParams', () => {
    beforeEach(async () => {
      // Set up configuration with forwardAuthorizationParams
      mockConfiguration.forwardAuthorizationParams = ['locale', 'campaign'];

      // Mock the query parameters in the request
      mockContext.req.query = vi.fn().mockImplementation((param) => {
        const params: Record<string, string> = {
          locale: 'en-US',
          campaign: 'spring2025',
        };
        return params[param] || null;
      });

      await login()(mockContext, nextFn);
    });

    it("should use configuration's forwardAuthorizationParams", () => {});

    it("should use configuration's forwardAuthorizationParams", () => {
      expect(mockClient.startInteractiveLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationParams: expect.objectContaining({
            locale: 'en-US',
            campaign: 'spring2025',
          }),
        }),
        mockContext
      );
    });
  });

  // REQ-A3: Handle duplicate query parameters (array handling)
  describe('when query parameter appears multiple times (duplicate/array)', () => {
    beforeEach(async () => {
      // Mock query() to return an array (duplicate parameters)
      mockContext.req.query = vi.fn().mockImplementation((param) => {
        if (param === 'ui_locales') {
          return ['en', 'fr']; // Array indicates multiple values
        }
        return null;
      });

      mockConfiguration.forwardAuthorizationParams = ['ui_locales'];

      await login()(mockContext, nextFn);
    });

    it('should normalize duplicate query params to string (first value)', () => {
      const authParams = mockClient.startInteractiveLogin.mock.calls[0][0].authorizationParams;

      // Should be string, not array
      expect(authParams.ui_locales).toBe('en');
      expect(typeof authParams.ui_locales).toBe('string');
      expect(Array.isArray(authParams.ui_locales)).toBe(false);
    });

    it('should not pass array to authorization params', () => {
      const authParams = mockClient.startInteractiveLogin.mock.calls[0][0].authorizationParams;

      // Ensure no [object Object] conversion
      expect(authParams.ui_locales).not.toEqual(['en', 'fr']);
    });
  });

  describe('when query parameter is a single value (string)', () => {
    beforeEach(async () => {
      mockContext.req.query = vi.fn().mockImplementation((param) => {
        if (param === 'ui_locales') {
          return 'en';
        }
        return null;
      });

      mockConfiguration.forwardAuthorizationParams = ['ui_locales'];

      await login()(mockContext, nextFn);
    });

    it('should pass single value as-is', () => {
      const authParams = mockClient.startInteractiveLogin.mock.calls[0][0].authorizationParams;

      expect(authParams.ui_locales).toBe('en');
      expect(typeof authParams.ui_locales).toBe('string');
    });
  });

  describe('when mixed single and multi-value params are provided', () => {
    beforeEach(async () => {
      mockContext.req.query = vi.fn().mockImplementation((param) => {
        const params: Record<string, string | string[]> = {
          ui_locales: ['en', 'fr'], // Array
          scope: 'openid profile', // String
        };
        return params[param] || null;
      });

      mockConfiguration.forwardAuthorizationParams = ['ui_locales', 'scope'];

      await login()(mockContext, nextFn);
    });

    it('should handle both array and string params correctly', () => {
      const authParams = mockClient.startInteractiveLogin.mock.calls[0][0].authorizationParams;

      // Array param should be normalized to first value
      expect(authParams.ui_locales).toBe('en');
      expect(typeof authParams.ui_locales).toBe('string');

      // String param should pass through
      expect(authParams.scope).toBe('openid profile');
      expect(typeof authParams.scope).toBe('string');
    });
  });
});
