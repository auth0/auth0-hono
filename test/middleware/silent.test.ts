/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono';
import { accepts } from 'hono/accepts';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { getClient } from '../../src/config/index';
import { login } from '../../src/middleware/login';
import { attemptSilentLogin, pauseSilentLogin, resumeSilentLogin } from '../../src/middleware/silentLogin';

// Mock dependencies
vi.mock('hono/accepts', () => ({
  accepts: vi.fn(),
}));

vi.mock('hono/cookie', () => ({
  deleteCookie: vi.fn(),
  getCookie: vi.fn(),
  setCookie: vi.fn(),
}));

vi.mock('../../src/config/index', () => ({
  getClient: vi.fn(),
}));

vi.mock('../../src/middleware/login', () => ({
  login: vi.fn(),
}));

describe('silentLogin middleware', () => {
  let mockContext: Context;
  let mockNext: Mock;
  let mockConfiguration: any;
  let mockLoginMiddleware: Mock;
  let mockClient: any;

  beforeEach(() => {
    vi.resetAllMocks();

    // Mock for next middleware function
    mockNext = vi.fn().mockResolvedValue(undefined);

    // Mock context
    mockContext = {
      var: {
        oidc: undefined,
      },
    } as unknown as Context;

    // Mock login middleware
    mockLoginMiddleware = vi.fn().mockImplementation(() => Promise.resolve(undefined));
    (login as Mock).mockReturnValue(mockLoginMiddleware);

    // Mock client
    mockClient = {
      getSession: vi.fn().mockResolvedValue(null),
    };

    // Mock configuration
    mockConfiguration = {
      baseURL: 'https://app.example.com',
      session: {
        cookie: {
          sameSite: 'Lax',
          path: '/',
          httpOnly: true,
          maxAge: 86400,
        },
      },
    };

    // Setup the getClient mock
    (getClient as Mock).mockReturnValue({
      client: mockClient,
      configuration: mockConfiguration,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('pauseSilentLogin middleware', () => {
    let middleware: any;

    beforeEach(() => {
      middleware = pauseSilentLogin();
    });

    it('should return a middleware function', () => {
      expect(typeof middleware).toBe('function');
    });

    describe('when executed', () => {
      beforeEach(async () => {
        await middleware(mockContext, mockNext);
      });

      it('should get client info from context', () => {
        expect(getClient).toHaveBeenCalledWith(mockContext);
      });

      it('should set a cookie to pause silent login', () => {
        expect(setCookie).toHaveBeenCalledWith(
          mockContext,
          'oidc_skip_silent_login',
          'true',
          mockConfiguration.session.cookie
        );
      });
    });

    describe('when cookie options are not in configuration', () => {
      beforeEach(async () => {
        // Reset mock and provide configuration without cookie options
        (getClient as Mock).mockReturnValue({
          client: mockClient,
          configuration: {
            baseURL: 'https://app.example.com',
          },
        });
        await middleware(mockContext, mockNext);
      });

      it('should use default cookie options', () => {
        expect(setCookie).toHaveBeenCalledWith(mockContext, 'oidc_skip_silent_login', 'true', {
          sameSite: 'Lax',
          path: '/',
          httpOnly: true,
        });
      });
    });
  });

  describe('resumeSilentLogin middleware', () => {
    let middleware: any;

    beforeEach(() => {
      middleware = resumeSilentLogin();
    });

    it('should return a middleware function', () => {
      expect(typeof middleware).toBe('function');
    });

    describe('when executed', () => {
      beforeEach(async () => {
        await middleware(mockContext, mockNext);
      });

      it('should get client info from context', () => {
        expect(getClient).toHaveBeenCalledWith(mockContext);
      });

      it('should delete the cookie to resume silent login', () => {
        expect(deleteCookie).toHaveBeenCalledWith(
          mockContext,
          'oidc_skip_silent_login',
          mockConfiguration.session.cookie
        );
      });
    });

    describe('when cookie options are not in configuration', () => {
      beforeEach(async () => {
        // Reset mock and provide configuration without cookie options
        (getClient as Mock).mockReturnValue({
          client: mockClient,
          configuration: {
            baseURL: 'https://app.example.com',
          },
        });
        await middleware(mockContext, mockNext);
      });

      it('should use default cookie options', () => {
        expect(deleteCookie).toHaveBeenCalledWith(mockContext, 'oidc_skip_silent_login', {
          sameSite: 'Lax',
          path: '/',
          httpOnly: true,
        });
      });
    });
  });

  // Note: There's a bug in the original code where attemptSilentLogin doesn't
  // return the middleware it creates. Since we're just writing tests, we'll
  // test the presumed intention where it does return the middleware.
  describe('attemptSilentLogin middleware', () => {
    it('should return a middleware function', () => {
      const result = attemptSilentLogin();
      expect(typeof result).toBe('function');
    });

    describe('when the client accepts HTML', () => {
      beforeEach(() => {
        (accepts as Mock).mockReturnValue('text/html');
      });

      describe('and there is no skip cookie', () => {
        beforeEach(() => {
          (getCookie as Mock).mockReturnValue(undefined);
        });

        describe('and the user is not authenticated', () => {
          beforeEach(async () => {
            mockClient.getSession.mockResolvedValue(null);
            await attemptSilentLogin()(mockContext, mockNext);
          });

          it('should check if the client accepts HTML', () => {
            expect(accepts).toHaveBeenCalledWith(mockContext, {
              header: 'Accept',
              supports: ['text/html', 'application/json'],
              default: 'application/json',
            });
          });

          it('should check for skip cookie', () => {
            expect(getCookie).toHaveBeenCalledWith(mockContext, 'oidc_skip_silent_login');
          });

          it('should set the skip cookie', () => {
            expect(setCookie).toHaveBeenCalled();
          });

          it('should call the login middleware with silent flag', () => {
            expect(login).toHaveBeenCalledWith({ silent: true });
            expect(mockLoginMiddleware).toHaveBeenCalledWith(mockContext, mockNext);
          });

          it('should not call next middleware directly', () => {
            expect(mockNext).not.toHaveBeenCalled();
          });
        });

        describe('but the user is already authenticated', () => {
          beforeEach(async () => {
            mockClient.getSession.mockResolvedValue({ user: { sub: '123' } });
            await attemptSilentLogin()(mockContext, mockNext);
          });

          it('should skip silent login', () => {
            expect(login).not.toHaveBeenCalled();
          });

          it('should call next middleware', () => {
            expect(mockNext).toHaveBeenCalled();
          });
        });
      });

      describe('but there is a skip cookie', () => {
        beforeEach(async () => {
          (getCookie as Mock).mockReturnValue('true');
          await attemptSilentLogin()(mockContext, mockNext);
        });

        it('should skip silent login', () => {
          expect(login).not.toHaveBeenCalled();
        });

        it('should call next middleware', () => {
          expect(mockNext).toHaveBeenCalled();
        });
      });
    });

    describe('when the client does not accept HTML', () => {
      beforeEach(async () => {
        (accepts as Mock).mockReturnValue('application/json');
        await attemptSilentLogin()(mockContext, mockNext);
      });

      it('should skip silent login', () => {
        expect(login).not.toHaveBeenCalled();
      });

      it('should call next middleware', () => {
        expect(mockNext).toHaveBeenCalled();
      });
    });
  });
});
