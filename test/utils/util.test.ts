import { describe, expect, it } from 'vitest';
import { createCallbackUrl } from '../../src/utils/util';

describe('createCallbackUrl', () => {
  describe('when baseURL has correct protocol and host', () => {
    it('should preserve baseURL origin even when request URL has wrong protocol', () => {
      const requestUrl = 'http://internal-proxy-host:8080/callback?code=auth-code&state=state-123';
      const baseURL = 'https://app.example.com';

      const result = createCallbackUrl(requestUrl, baseURL).href;

      // Should use baseURL's origin (https://app.example.com)
      expect(result).toBe('https://app.example.com/callback?code=auth-code&state=state-123');
      // Ensure http is NOT in result
      expect(result).not.toMatch(/^http:\/\//);
    });

    it('should preserve request pathname and search params', () => {
      const requestUrl = 'http://wrong-host/callback?code=my-code&state=my-state&extra=param';
      const baseURL = 'https://app.example.com';

      const result = createCallbackUrl(requestUrl, baseURL).href;

      expect(result).toBe('https://app.example.com/callback?code=my-code&state=my-state&extra=param');
    });

    it('should handle baseURL with port', () => {
      const requestUrl = 'http://localhost:3000/callback?code=code&state=state';
      const baseURL = 'https://api.prod.com:8443';

      const result = createCallbackUrl(requestUrl, baseURL).href;

      expect(result).toBe('https://api.prod.com:8443/callback?code=code&state=state');
    });

    it('should handle request URL with port and baseURL without explicit port', () => {
      const requestUrl = 'http://127.0.0.1:9999/callback?code=xyz';
      const baseURL = 'https://myapp.io';

      const result = createCallbackUrl(requestUrl, baseURL).href;

      expect(result).toBe('https://myapp.io/callback?code=xyz');
    });

    it('should handle complex pathname', () => {
      const requestUrl = 'http://internal/auth/oidc/callback?code=abc&state=def';
      const baseURL = 'https://example.com/myapp';

      const result = createCallbackUrl(requestUrl, baseURL).href;

      expect(result).toBe('https://example.com/auth/oidc/callback?code=abc&state=def');
    });

    it('should preserve empty search params', () => {
      const requestUrl = 'http://wrong-host/callback';
      const baseURL = 'https://app.com';

      const result = createCallbackUrl(requestUrl, baseURL).href;

      expect(result).toBe('https://app.com/callback');
    });

    it('should match redirect_uri sent at login start', () => {
      // Simulate: login started with baseURL -> redirect_uri stored
      // Then callback comes through proxy with wrong protocol/host
      // This test ensures callback URL matches what was registered at login

      const baseURL = 'https://app.example.com';

      // URL registered at login start (from baseURL)
      const loginRedirectUri = `${new URL(baseURL).origin}/callback`;

      // URL seen at callback via proxy
      const proxyRequestUrl = 'http://internal-service:8080/callback?code=auth-code&state=state';

      // createCallbackUrl should produce the same redirect_uri
      const callbackUrl = createCallbackUrl(proxyRequestUrl, baseURL).href;

      expect(callbackUrl).toMatch(/^https:\/\/app\.example\.com\/callback/);
      expect(callbackUrl.split('?')[0]).toBe(loginRedirectUri);
    });
  });
});
