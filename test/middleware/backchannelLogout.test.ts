/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { getClient } from '../../src/config/index.js';
import { backchannelLogout } from '../../src/middleware/backchannelLogout.js';
import { Auth0Error } from '../../src/errors/Auth0Error.js';

// Mock dependencies
vi.mock('../../src/config/index.js', () => ({
  getClient: vi.fn(),
}));

describe('backchannelLogout middleware', () => {
  let mockContext: Context;
  let mockClient: any;
  const nextFn = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();

    // Create a mock client
    mockClient = {
      handleBackchannelLogout: vi.fn().mockResolvedValue(undefined),
    };

    // Create a mock Hono context
    mockContext = {
      req: {
        header: vi.fn().mockImplementation((name) => {
          if (name === 'content-type') {
            return 'application/x-www-form-urlencoded';
          }
          return null;
        }),
        parseBody: vi.fn().mockResolvedValue({
          logout_token: 'mock-logout-token',
        }),
      },
    } as unknown as Context;

    // Setup the getClient mock
    (getClient as Mock).mockReturnValue({
      client: mockClient,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('when a valid logout request is received', () => {
    let result: Response;

    beforeEach(async () => {
      result = (await backchannelLogout()(mockContext, nextFn)) as Response;
    });

    it('should check the content type', () => {
      expect(mockContext.req.header).toHaveBeenCalledWith('content-type');
    });

    it('should parse the request body', () => {
      expect(mockContext.req.parseBody).toHaveBeenCalled();
    });

    it('should get the client', () => {
      expect(getClient).toHaveBeenCalledWith(mockContext);
    });

    it('should call client.handleBackchannelLogout with the logout token', () => {
      expect(mockClient.handleBackchannelLogout).toHaveBeenCalledWith('mock-logout-token', mockContext);
    });

    it('should return a 204 No Content response', () => {
      expect(result.status).toBe(204);
    });
  });

  describe('when the content type is invalid', () => {
    beforeEach(() => {
      // Override the header mock to return an invalid content type
      mockContext.req.header = vi.fn().mockReturnValue('application/json');
    });

    it('should throw a 400 error with appropriate message', async () => {
      await expect(backchannelLogout()(mockContext, nextFn)).rejects.toThrow(Auth0Error);

      try {
        await backchannelLogout()(mockContext, nextFn);
      } catch (error) {
        expect((error as Auth0Error).status).toBe(400);
        expect((error as Auth0Error).code).toBe('invalid_request');
      }
    });
  });

  describe('when the content type is missing', () => {
    beforeEach(() => {
      // Override the header mock to return null (missing content type)
      mockContext.req.header = vi.fn().mockReturnValue(null);
    });

    it('should throw a 400 error with appropriate message', async () => {
      await expect(backchannelLogout()(mockContext, nextFn)).rejects.toThrow(Auth0Error);

      try {
        await backchannelLogout()(mockContext, nextFn);
      } catch (error) {
        expect((error as Auth0Error).status).toBe(400);
        expect((error as Auth0Error).code).toBe('invalid_request');
      }
    });
  });

  describe('when the logout token is missing', () => {
    beforeEach(() => {
      // Override the parseBody mock to return an empty object
      mockContext.req.parseBody = vi.fn().mockResolvedValue({});
    });

    it('should throw a 400 error with appropriate message', async () => {
      await expect(backchannelLogout()(mockContext, nextFn)).rejects.toThrow(Auth0Error);

      try {
        await backchannelLogout()(mockContext, nextFn);
      } catch (error) {
        expect((error as Auth0Error).status).toBe(400);
        expect((error as Auth0Error).code).toBe('invalid_request');
      }
    });
  });

  describe('when the logout token is not a string', () => {
    beforeEach(() => {
      // Override the parseBody mock to return a non-string logout token
      mockContext.req.parseBody = vi.fn().mockResolvedValue({
        logout_token: 123,
      });
    });

    it('should throw a 400 error with appropriate message', async () => {
      await expect(backchannelLogout()(mockContext, nextFn)).rejects.toThrow(Auth0Error);

      try {
        await backchannelLogout()(mockContext, nextFn);
      } catch (error) {
        expect((error as Auth0Error).status).toBe(400);
        expect((error as Auth0Error).code).toBe('invalid_request');
      }
    });
  });

  describe('when client.handleBackchannelLogout throws an error', () => {
    const errorMessage = 'Invalid logout token';

    beforeEach(() => {
      // Override the handleBackchannelLogout mock to throw a server-js error
      // server-js throws errors with a `code` property
      const serverError = Object.assign(new Error(errorMessage), {
        code: 'backchannel_logout_error',
      });
      mockClient.handleBackchannelLogout = vi.fn().mockRejectedValue(serverError);
    });

    it('should throw a mapped Auth0Error via mapServerError', async () => {
      await expect(backchannelLogout()(mockContext, nextFn)).rejects.toThrow(Auth0Error);
      await expect(backchannelLogout()(mockContext, nextFn)).rejects.toMatchObject({
        status: 400,
        code: 'backchannel_logout_error',
      });
    });
  });

  // REQ-A2: Handle parseBody errors (crash prevention)
  describe('when parseBody throws an error (malformed request)', () => {
    beforeEach(() => {
      // Override parseBody to throw SyntaxError (truncated body)
      mockContext.req.parseBody = vi.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON input'));
    });

    it('should throw Auth0Error with 400 status', async () => {
      await expect(backchannelLogout()(mockContext, nextFn)).rejects.toThrow(Auth0Error);

      try {
        await backchannelLogout()(mockContext, nextFn);
      } catch (error) {
        expect((error as Auth0Error).status).toBe(400);
        expect((error as Auth0Error).code).toBe('invalid_request');
      }
    });
  });

  describe('when parseBody throws error with invalid encoding', () => {
    beforeEach(() => {
      // Override parseBody to throw URIError
      mockContext.req.parseBody = vi.fn().mockRejectedValue(new URIError('URI malformed'));
    });

    it('should throw Auth0Error with 400 status', async () => {
      await expect(backchannelLogout()(mockContext, nextFn)).rejects.toThrow(Auth0Error);

      try {
        await backchannelLogout()(mockContext, nextFn);
      } catch (error) {
        expect((error as Auth0Error).status).toBe(400);
        expect((error as Auth0Error).code).toBe('invalid_request');
      }
    });
  });

  describe('when request body is empty', () => {
    beforeEach(() => {
      mockContext.req.parseBody = vi.fn().mockResolvedValue({});
    });

    it('should throw Auth0Error for missing logout_token', async () => {
      await expect(backchannelLogout()(mockContext, nextFn)).rejects.toThrow(Auth0Error);

      try {
        await backchannelLogout()(mockContext, nextFn);
      } catch (error) {
        expect((error as Auth0Error).status).toBe(400);
        expect((error as Auth0Error).code).toBe('invalid_request');
      }
    });
  });
});
