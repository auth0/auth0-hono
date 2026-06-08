/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { parseConfiguration } from '../src/config';
import { InitConfiguration } from '../src/config/Configuration';
import { assignFromEnv } from '../src/config/envConfig';

describe('Configuration Parser', () => {
  it('should parse a valid configuration', () => {
    const validConfig: InitConfiguration = {
      domain: 'auth.example.com',
      baseURL: 'https://app.example.com',
      clientID: 'test-client-id',
      clientSecret: 'test',
      session: {
        secret: 'test encryption key fdsgfds gfds ',
      },
    };

    const parsedConfig = parseConfiguration(validConfig);

    expect(parsedConfig).toHaveProperty('domain', 'auth.example.com');
    expect(parsedConfig).toHaveProperty('baseURL', 'https://app.example.com');
    expect(parsedConfig).toHaveProperty('clientID', 'test-client-id');
    expect(parsedConfig).toHaveProperty('authRequired', true); // default value
    expect(parsedConfig).toHaveProperty('fetch', globalThis.fetch); // default value
    expect(parsedConfig).toMatchSnapshot();
  });

  it('should throw an error for invalid configuration', () => {
    const invalidConfig = {
      // Missing required domain
      baseURL: 'https://app.example.com',
      clientID: 'test-client-id',
    };

    expect(() => parseConfiguration(invalidConfig as any)).toThrow();
  });

  it('should apply default values to configuration', () => {
    const minimalConfig: InitConfiguration = {
      domain: 'auth.example.com',
      baseURL: 'https://app.example.com',
      clientID: 'test-client-id',
      clientSecret: 'test-client-secret',
      session: {
        secret: 'test encryption key fdsgfds gfds ',
      },
    };

    const parsedConfig = parseConfiguration(minimalConfig);

    expect(parsedConfig).toHaveProperty('authRequired', true);
    expect(parsedConfig).toHaveProperty('clockTolerance', 60);
    expect(parsedConfig).toHaveProperty('routes');

    expect(parsedConfig.routes).toEqual({
      login: '/auth/login',
      logout: '/auth/logout',
      callback: '/auth/callback',
      backchannelLogout: '/auth/backchannel-logout',
    });
  });

  it('should cache parsed configurations', () => {
    const config: InitConfiguration = {
      domain: 'auth.example.com',
      baseURL: 'https://app.example.com',
      clientID: 'test-client-id',
      clientSecret: 'test',
      session: {
        secret: 'test encryption key fdsgfds gfds ',
      },
    };

    const firstParsed = parseConfiguration(config);
    const secondParsed = parseConfiguration(config);

    expect(firstParsed).toBe(secondParsed); // Should be the same object instance (cached)
  });

  // REQ-B4: Verify config object is not mutated during validation
  it('should not mutate original config object during validation', () => {
    const originalConfig: InitConfiguration = {
      domain: 'auth.example.com',
      baseURL: 'https://app.example.com',
      clientID: 'test-client-id',
      clientSecret: 'test',
      session: {
        secret: 'test encryption key fdsgfds gfds ',
        cookie: {
          secure: undefined, // Will be defaulted to true
        },
      },
    };

    // Store original state
    const originalSecureValue = originalConfig.session?.cookie?.secure;

    // Parse configuration (should apply defaults)
    parseConfiguration(originalConfig);

    // Verify input object was not mutated
    expect(originalConfig.session?.cookie?.secure).toBe(originalSecureValue);
    expect(originalConfig.session?.cookie?.secure).toBeUndefined();
  });

  it('should not accumulate mutations across multiple validations', () => {
    const config: InitConfiguration = {
      domain: 'auth.example.com',
      baseURL: 'https://app.example.com',
      clientID: 'test-client-id',
      clientSecret: 'test',
      session: {
        secret: 'test encryption key fdsgfds gfds ',
        cookie: {
          secure: undefined,
        },
      },
    };

    // First validation
    const result1 = parseConfiguration(config);

    // Second validation with same config object
    const result2 = parseConfiguration(config);

    // Both results should have same secure value (no accumulated mutations)
    expect(result1.session.cookie.secure).toBe(result2.session.cookie.secure);
    expect(result1.session.cookie.secure).toBe(true); // Should be defaulted
  });

  it('should not allow custom routes to be set to relative paths', () => {
    const config: InitConfiguration = {
      domain: 'auth.example.com',
      baseURL: 'https://app.example.com',
      clientID: 'test-client-id',
      routes: {
        login: 'login',
      },
      session: {
        secret: 'test encryption key fdsgfds gfds ',
      },
    };

    expect(() => parseConfiguration(config)).toThrow();
  });

  it('should work with a custom cookie name', () => {
    const config: InitConfiguration = {
      domain: 'auth.example.com',
      baseURL: 'https://app.example.com',
      clientID: 'test-client-id',
      clientSecret: 'test-secret',
      session: {
        secret: 'test encryption key fdsgfds gfds ',
        cookie: {
          name: 'my_custom_session',
        },
      },
    };

    const parsedConfig = parseConfiguration(config);

    expect(parsedConfig).toHaveProperty('session.cookie.name', 'my_custom_session');
  });
});

describe('Environment Configuration', () => {
  describe('assignFromEnv', () => {
    const validEnv = {
      AUTH0_DOMAIN: 'test.auth0.com',
      AUTH0_CLIENT_ID: 'test-client-id',
      APP_BASE_URL: 'https://example.com',
      AUTH0_CLIENT_SECRET: 'test-secret',
      AUTH0_AUDIENCE: 'https://api.example.com',
    };

    it('should assign audience from env to authorizationParams when audience only exists in env and not config', () => {
      const config = {};
      const env = validEnv;

      const result = assignFromEnv(config, env);

      expect(result.authorizationParams).toEqual({
        audience: 'https://api.example.com',
      });
    });

    it('should prioritize config authorizationParams.audience over env audience when both exist', () => {
      const config = {
        authorizationParams: {
          audience: 'https://config-audience.com',
          scope: 'openid profile',
        },
      };
      const env = validEnv;

      const result = assignFromEnv(config, env);

      expect(result.authorizationParams).toEqual({
        audience: 'https://config-audience.com',
        scope: 'openid profile',
      });
    });

    it('should propagate all other authorizationParams from config and merge with env audience if there is no config audience', () => {
      const config = {
        authorizationParams: {
          scope: 'openid profile email',
          prompt: 'login',
          max_age: 3600,
          ui_locales: 'en-US',
        },
      };
      const env = validEnv;

      const result = assignFromEnv(config, env);

      expect(result.authorizationParams).toEqual({
        scope: 'openid profile email',
        prompt: 'login',
        max_age: 3600,
        ui_locales: 'en-US',
        audience: 'https://api.example.com',
      });
    });

    it('should assign env audience when config has empty authorizationParams object', () => {
      const config = {
        authorizationParams: {},
      };
      const env = validEnv;

      const result = assignFromEnv(config, env);

      expect(result.authorizationParams).toEqual({
        audience: 'https://api.example.com',
      });
    });

    it('should assign env audience when config has no authorizationParams defined', () => {
      const config = {};
      const env = validEnv;

      const result = assignFromEnv(config, env);

      expect(result.authorizationParams).toEqual({
        audience: 'https://api.example.com',
      });
    });

    it('should not set audience when audience is absent from both env and config', () => {
      const config = {
        authorizationParams: {
          scope: 'openid profile',
        },
      };
      const envWithoutAudience = {
        AUTH0_DOMAIN: 'test.auth0.com',
        AUTH0_CLIENT_ID: 'test-client-id',
        APP_BASE_URL: 'https://example.com',
      };

      const result = assignFromEnv(config, envWithoutAudience);

      expect(result.authorizationParams).toEqual({
        scope: 'openid profile',
      });
    });

    it('should handle undefined config gracefully and use env values', () => {
      const config = undefined;
      const env = validEnv;

      const result = assignFromEnv(config, env);

      expect(result.authorizationParams).toEqual({
        audience: 'https://api.example.com',
      });
      expect(result.domain).toBe('test.auth0.com');
      expect(result.clientID).toBe('test-client-id');
      expect(result.baseURL).toBe('https://example.com');
    });

    it("should return config as-is when env doesn't have required fields", () => {
      const config = {
        domain: 'config.auth0.com',
        clientID: 'config-client-id',
        authorizationParams: {
          scope: 'openid profile',
        },
      };
      const invalidEnv = {
        // Missing required AUTH0_DOMAIN, AUTH0_CLIENT_ID, APP_BASE_URL
        AUTH0_AUDIENCE: 'https://api.example.com',
      };

      const result = assignFromEnv(config, invalidEnv);

      expect(result).toEqual(config);
    });
  });

  describe('Secret rotation support (REQ-CFG-2)', () => {
    it('should pass through single string secret as-is', () => {
      const config: InitConfiguration = {
        domain: 'auth.example.com',
        baseURL: 'https://app.example.com',
        clientID: 'test-client-id',
        clientSecret: 'test-secret',
        session: {
          secret: 'this-is-a-secret-key-longer-than-32-characters',
        },
      };

      const parsedConfig = parseConfiguration(config);

      expect(parsedConfig.session.secret).toBe('this-is-a-secret-key-longer-than-32-characters');
    });

    it('should validate secret array with multiple valid secrets', () => {
      const secretArray = ['active-secret-longer-than-32-chars', 'fallback-secret-longer-than-32-c'];
      const config: InitConfiguration = {
        domain: 'auth.example.com',
        baseURL: 'https://app.example.com',
        clientID: 'test-client-id',
        clientSecret: 'test-secret',
        session: {
          secret: secretArray,
        },
      };

      const parsedConfig = parseConfiguration(config);

      expect(parsedConfig.session.secret).toStrictEqual(secretArray);
    });

    it('should reject empty secret array', () => {
      const config: InitConfiguration = {
        domain: 'auth.example.com',
        baseURL: 'https://app.example.com',
        clientID: 'test-client-id',
        clientSecret: 'test-secret',
        session: {
          secret: [],
        },
      };

      expect(() => parseConfiguration(config)).toThrow();
    });

    it('should reject secret array with secrets shorter than 32 characters', () => {
      const secretArray = ['short-secret', 'this-is-a-valid-secret-longer-than-32-chars'];
      const config: InitConfiguration = {
        domain: 'auth.example.com',
        baseURL: 'https://app.example.com',
        clientID: 'test-client-id',
        clientSecret: 'test-secret',
        session: {
          secret: secretArray,
        },
      };

      expect(() => parseConfiguration(config)).toThrow();
    });
  });

  describe('Config resolution order (REQ-CFG-1)', () => {
    it('should override env values with explicit config', () => {
      const config: InitConfiguration = {
        domain: 'config.auth0.com',
        baseURL: 'https://config.example.com',
        clientID: 'config-client-id',
        clientSecret: 'config-secret',
        session: {
          secret: 'config-secret-longer-than-32-chars-here',
        },
      };

      const env = {
        AUTH0_DOMAIN: 'env.auth0.com',
        AUTH0_CLIENT_ID: 'env-client-id',
        APP_BASE_URL: 'https://env.example.com',
      };

      const result = assignFromEnv(config, env);

      expect(result.domain).toBe('config.auth0.com');
      expect(result.baseURL).toBe('https://config.example.com');
      expect(result.clientID).toBe('config-client-id');
    });

    it('should use env values when explicit config is empty', () => {
      const config: InitConfiguration = {
        domain: '',
        baseURL: '',
        clientID: '',
        clientSecret: '',
        session: {
          secret: '',
        },
      };

      const env = {
        AUTH0_DOMAIN: 'env.auth0.com',
        AUTH0_CLIENT_ID: 'env-client-id',
        APP_BASE_URL: 'https://env.example.com',
        AUTH0_CLIENT_SECRET: 'env-secret',
        AUTH0_SESSION_ENCRYPTION_KEY: 'env-secret-longer-than-32-chars',
      };

      const result = assignFromEnv(config, env);

      expect(result.domain).toBe('');
      expect(result.clientID).toBe('');
    });

    it('should apply schema defaults when both config and env are missing', () => {
      const config: InitConfiguration = {
        domain: 'auth.example.com',
        baseURL: 'https://app.example.com',
        clientID: 'test-client-id',
        clientSecret: 'test-secret',
        session: {
          secret: 'test-secret-longer-than-32-chars',
        },
      };

      const parsedConfig = parseConfiguration(config);

      expect(parsedConfig.authRequired).toBe(true);
      expect(parsedConfig.clockTolerance).toBe(60);
      expect(parsedConfig.routes).toEqual({
        login: '/auth/login',
        logout: '/auth/logout',
        callback: '/auth/callback',
        backchannelLogout: '/auth/backchannel-logout',
      });
    });
  });

  describe('AUTH0_SESSION_ENCRYPTION_KEY resolution (REQ-BUG-1)', () => {
    it('should resolve session secret from AUTH0_SESSION_ENCRYPTION_KEY env var', () => {
      const env = {
        AUTH0_DOMAIN: 'test.auth0.com',
        AUTH0_CLIENT_ID: 'test-client-id',
        APP_BASE_URL: 'https://example.com',
        AUTH0_SESSION_ENCRYPTION_KEY: 'env-secret-longer-than-32-chars-x',
      };

      const result = assignFromEnv({}, env);

      expect(result.session?.secret).toBe('env-secret-longer-than-32-chars-x');
    });

    it('should prioritize explicit config secret over env variable', () => {
      const config = {
        session: {
          secret: 'config-secret-longer-than-32-chars',
        },
      };

      const env = {
        AUTH0_DOMAIN: 'test.auth0.com',
        AUTH0_CLIENT_ID: 'test-client-id',
        APP_BASE_URL: 'https://example.com',
        AUTH0_SESSION_ENCRYPTION_KEY: 'env-secret-longer-than-32-chars-x',
      };

      const result = assignFromEnv(config, env);

      expect(result.session?.secret).toBe('config-secret-longer-than-32-chars');
    });

    it('should leave session secret undefined when not provided', () => {
      const env = {
        AUTH0_DOMAIN: 'test.auth0.com',
        AUTH0_CLIENT_ID: 'test-client-id',
        APP_BASE_URL: 'https://example.com',
      };

      const result = assignFromEnv({}, env);

      expect(result.session?.secret).toBeUndefined();
    });
  });

  // Verify two-tier cache doesn't allow cross-contamination
  describe('Config cache Tier-1/Tier-2 isolation (VULN-8)', () => {
    it('should use Tier-1 (ref equality) for configs with functions — no Tier-2 collision', () => {
      const configWithFn: InitConfiguration = {
        domain: 'auth.example.com',
        baseURL: 'https://app.example.com',
        clientID: 'client-a',
        clientSecret: 'test-secret',
        session: { secret: 'test-secret-longer-than-32-chars' },
        debug: () => {}, // Function field → Tier-1 only
      };

      const result1 = parseConfiguration(configWithFn);
      const result2 = parseConfiguration(configWithFn);

      // Same reference → Tier-1 cache hit
      expect(result1).toBe(result2);
      expect(result1.clientID).toBe('client-a');
    });

    it('should use Tier-2 (JSON key) for env-only configs without functions', () => {
      // Simulates ensureClient() creating new objects with same values per-request
      const makeEnvConfig = (): InitConfiguration => ({
        domain: 'auth.example.com',
        baseURL: 'https://app.example.com',
        clientID: 'client-b',
        clientSecret: 'test-secret',
        session: { secret: 'test-secret-longer-than-32-chars' },
      });

      const result1 = parseConfiguration(makeEnvConfig());
      const result2 = parseConfiguration(makeEnvConfig());

      // Different references but same values → Tier-2 hit
      expect(result1).toBe(result2);
      expect(result1.clientID).toBe('client-b');
    });

    it('should NOT collide between function-bearing and function-free configs with same serializable fields', () => {
      // Key insight: JSON.stringify drops functions. If Tier-2 cached the function-bearing
      // config (wrong), then the function-free lookup would return a result with a custom
      // debug function. If correctly routed to Tier-1, the function stays isolated.

      // Config WITH custom debug function (should route to Tier-1 only)
      const configWithFn: InitConfiguration = {
        domain: 'auth.example.com',
        baseURL: 'https://app.example.com',
        clientID: 'client-c',
        clientSecret: 'test-secret',
        session: { secret: 'test-secret-longer-than-32-chars' },
        debug: () => { /* custom logger */ },
      };

      // Config WITHOUT function (should route to Tier-2) — same serializable fields
      const configWithoutFn: InitConfiguration = {
        domain: 'auth.example.com',
        baseURL: 'https://app.example.com',
        clientID: 'client-c',
        clientSecret: 'test-secret',
        session: { secret: 'test-secret-longer-than-32-chars' },
      };

      const resultWithFn = parseConfiguration(configWithFn);
      const resultWithoutFn = parseConfiguration(configWithoutFn);

      // Critical assertion: function-bearing config retains custom debug
      expect(resultWithFn.debug).toBe(configWithFn.debug);

      // Function-free config gets default debug (not the custom one from Tier-1)
      // If there WAS a collision, resultWithoutFn.debug would be configWithFn.debug
      expect(resultWithoutFn.debug).not.toBe(configWithFn.debug);
    });

    it('should NOT collide between two different env-only configs in Tier-2', () => {
      const configA: InitConfiguration = {
        domain: 'tenant-a.auth0.com',
        baseURL: 'https://app-a.example.com',
        clientID: 'client-a',
        clientSecret: 'secret-a-longer-than-32-chars-xx',
        session: { secret: 'secret-a-longer-than-32-chars-xx' },
      };

      const configB: InitConfiguration = {
        domain: 'tenant-b.auth0.com',
        baseURL: 'https://app-b.example.com',
        clientID: 'client-b',
        clientSecret: 'secret-b-longer-than-32-chars-xx',
        session: { secret: 'secret-b-longer-than-32-chars-xx' },
      };

      const resultA = parseConfiguration(configA);
      const resultB = parseConfiguration(configB);

      // Different JSON keys → different cache entries → no collision
      expect(resultA.domain).toBe('tenant-a.auth0.com');
      expect(resultB.domain).toBe('tenant-b.auth0.com');
      expect(resultA).not.toBe(resultB);
    });
  });

  describe('No process.env usage verification (REQ-BUG-1)', () => {
    it('should resolve config entirely from env(c) parameter without accessing process.env', () => {
      const config: InitConfiguration = {
        domain: 'auth.example.com',
        baseURL: 'https://app.example.com',
        clientID: 'test-client-id',
        clientSecret: 'test-secret',
        session: {
          secret: 'test-secret-longer-than-32-chars',
        },
      };

      const runtimeEnv = {
        AUTH0_DOMAIN: 'runtime.auth0.com',
        AUTH0_CLIENT_ID: 'runtime-client-id',
        APP_BASE_URL: 'https://runtime.example.com',
      };

      const result = assignFromEnv(config, runtimeEnv);

      expect(result.domain).toBe('auth.example.com');
      expect(result.clientID).toBe('test-client-id');
      expect(result.baseURL).toBe('https://app.example.com');
    });
  });

  describe('Missing required config fields (REQ-BUG-1)', () => {
    it('should throw validation error when domain is missing', () => {
      const config = {
        baseURL: 'https://app.example.com',
        clientID: 'test-client-id',
        session: {
          secret: 'test-secret-longer-than-32-chars',
        },
      } as any;

      expect(() => parseConfiguration(config)).toThrow();
    });

    it('should throw validation error when clientID is missing', () => {
      const config = {
        domain: 'auth.example.com',
        baseURL: 'https://app.example.com',
        session: {
          secret: 'test-secret-longer-than-32-chars',
        },
      } as any;

      expect(() => parseConfiguration(config)).toThrow();
    });

    it('should throw validation error when baseURL is missing', () => {
      const config = {
        domain: 'auth.example.com',
        clientID: 'test-client-id',
        session: {
          secret: 'test-secret-longer-than-32-chars',
        },
      } as any;

      expect(() => parseConfiguration(config)).toThrow();
    });

    it('should throw validation error when session.secret is missing', () => {
      const config = {
        domain: 'auth.example.com',
        baseURL: 'https://app.example.com',
        clientID: 'test-client-id',
        session: {},
      } as any;

      expect(() => parseConfiguration(config)).toThrow();
    });

    it('should throw validation error when session.secret is too short', () => {
      const config: InitConfiguration = {
        domain: 'auth.example.com',
        baseURL: 'https://app.example.com',
        clientID: 'test-client-id',
        clientSecret: 'test-secret',
        session: {
          secret: 'short',
        },
      };

      expect(() => parseConfiguration(config)).toThrow();
    });
  });
});
