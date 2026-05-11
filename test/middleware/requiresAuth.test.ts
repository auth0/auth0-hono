/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono';
import { accepts } from 'hono/accepts';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { getClient } from '../../src/config/index';
import { login } from '../../src/middleware/login';
import { requiresAuth } from '../../src/middleware/requiresAuth';
import { LoginRequiredError } from '../../src/errors/index';
import { getCachedSession } from '../../src/helpers/sessionCache';

// Mock dependencies
vi.mock('hono/accepts', () => ({
  accepts: vi.fn(),
}));

vi.mock('../../src/config/index', () => ({
  getClient: vi.fn(),
}));

vi.mock('../../src/middleware/login', () => ({
  login: vi.fn(),
}));

vi.mock('../../src/helpers/sessionCache', () => ({
  getCachedSession: vi.fn(),
}));

describe('requiresAuth middleware', () => {
  let mockContext: Context;
  let mockNext: Mock;
  let mockConfiguration: any;
  let mockLoginMiddleware: Mock;
  let mockClient: any;

  beforeEach(() => {
    vi.resetAllMocks();

    // Mock for next middleware function
    mockNext = vi.fn().mockResolvedValue(undefined);

    // Mock client with session
    mockClient = {
      getSession: vi.fn().mockResolvedValue(null),
    };

    // Mock context
    mockContext = {} as unknown as Context;

    // Default: no session (getCachedSession returns null)
    (getCachedSession as Mock).mockResolvedValue(null);

    // Mock login middleware
    mockLoginMiddleware = vi.fn().mockImplementation(() => Promise.resolve(undefined));
    (login as Mock).mockReturnValue(mockLoginMiddleware);

    // Mock configuration
    mockConfiguration = {
      errorOnRequiredAuth: false,
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

  describe('when user is authenticated', () => {
    beforeEach(() => {
      // Set authenticated by returning a session
      (getCachedSession as Mock).mockResolvedValue({ user: { sub: '123' } });
    });

    it('should continue to the next middleware', async () => {
      await requiresAuth()(mockContext, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should not call login middleware', async () => {
      await requiresAuth()(mockContext, mockNext);
      expect(login).not.toHaveBeenCalled();
    });
  });

  describe('when user is not authenticated', () => {
    beforeEach(() => {
      // Ensure no session is returned
      mockClient.getSession.mockResolvedValue(null);
    });

    describe('when request accepts HTML and errorOnRequiredAuth is false', () => {
      beforeEach(() => {
        (accepts as Mock).mockReturnValue('text/html');
        mockConfiguration.errorOnRequiredAuth = false;
      });

      it('should redirect to login by calling the login middleware', async () => {
        await requiresAuth()(mockContext, mockNext);

        expect(accepts).toHaveBeenCalledWith(mockContext, {
          header: 'Accept',
          supports: ['text/html', 'application/json'],
          default: 'application/json',
        });

        expect(login).toHaveBeenCalled();
        expect(mockLoginMiddleware).toHaveBeenCalledWith(mockContext, mockNext);
      });

      it('should not call next middleware directly', async () => {
        await requiresAuth()(mockContext, mockNext);
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    describe("when behavior is explicitly set to 'login'", () => {
      beforeEach(() => {
        (accepts as Mock).mockReturnValue('text/html');
        mockConfiguration.errorOnRequiredAuth = true; // This would normally cause an error
      });

      it('should override configuration and redirect to login', async () => {
        await requiresAuth('login')(mockContext, mockNext);

        expect(login).toHaveBeenCalled();
        expect(mockLoginMiddleware).toHaveBeenCalledWith(mockContext, mockNext);
      });
    });

    describe('when request does not accept HTML', () => {
      beforeEach(() => {
        (accepts as Mock).mockReturnValue('application/json');
      });

      it('should throw a 401 error', async () => {
        await expect(requiresAuth()(mockContext, mockNext)).rejects.toThrow(LoginRequiredError);

        try {
          await requiresAuth()(mockContext, mockNext);
        } catch (error) {
          expect((error as LoginRequiredError).status).toBe(401);
          expect((error as LoginRequiredError).code).toBe('login_required');
        }

        expect(login).not.toHaveBeenCalled();
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    describe('when errorOnRequiredAuth is true in configuration', () => {
      beforeEach(() => {
        (accepts as Mock).mockReturnValue('text/html');
        mockConfiguration.errorOnRequiredAuth = true;
      });

      it('should throw a 401 error even if request accepts HTML', async () => {
        await expect(requiresAuth()(mockContext, mockNext)).rejects.toThrow(LoginRequiredError);

        try {
          await requiresAuth()(mockContext, mockNext);
        } catch (error) {
          expect((error as LoginRequiredError).status).toBe(401);
          expect((error as LoginRequiredError).code).toBe('login_required');
        }

        expect(login).not.toHaveBeenCalled();
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    describe("when behavior is explicitly set to 'error'", () => {
      beforeEach(() => {
        (accepts as Mock).mockReturnValue('text/html');
        mockConfiguration.errorOnRequiredAuth = false; // This would normally redirect to login
      });

      it('should override configuration and throw a 401 error', async () => {
        await expect(requiresAuth('error')(mockContext, mockNext)).rejects.toThrow(LoginRequiredError);

        try {
          await requiresAuth('error')(mockContext, mockNext);
        } catch (error) {
          expect((error as LoginRequiredError).status).toBe(401);
          expect((error as LoginRequiredError).code).toBe('login_required');
        }

        expect(login).not.toHaveBeenCalled();
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    describe('when oidc is not initialized', () => {
      beforeEach(() => {
        // We're already testing no session returned
        (accepts as Mock).mockReturnValue('text/html');
      });

      it('should treat as unauthenticated and redirect to login', async () => {
        await requiresAuth()(mockContext, mockNext);

        expect(login).toHaveBeenCalled();
        expect(mockLoginMiddleware).toHaveBeenCalledWith(mockContext, mockNext);
        expect(mockNext).not.toHaveBeenCalled();
      });
    });
  });
});
