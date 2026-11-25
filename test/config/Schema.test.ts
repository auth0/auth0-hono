import { describe, expect, it } from 'vitest';
import { ConfigurationSchema } from '../../src/config/Schema';

const validConfig = () => ({
  domain: 'auth.example.com',
  baseURL: 'https://app.example.com',
  clientID: 'test-client-id',
  clientSecret: 'test-client-secret',
  session: { secret: 'test encryption key fdsgfds gfds ' },
});

describe('ConfigurationSchema', () => {
  describe('numeric options that accept Infinity', () => {
    // zod 4's z.number() rejects Infinity; the schema must keep accepting it, as it did on zod 3.
    it.each(['clockTolerance', 'httpTimeout', 'discoveryCacheMaxAge'])('accepts Infinity for %s', (key) => {
      const parsed = ConfigurationSchema.parse({ ...validConfig(), [key]: Infinity });

      expect(parsed).toHaveProperty(key, Infinity);
    });

    it.each(['absoluteDuration', 'inactivityDuration'])('accepts Infinity for session.%s', (key) => {
      const parsed = ConfigurationSchema.parse({
        ...validConfig(),
        session: { ...validConfig().session, [key]: Infinity },
      });

      expect(parsed.session).toHaveProperty(key, Infinity);
    });

    it('accepts -Infinity only where zod 3 did (no minimum on the option)', () => {
      expect(ConfigurationSchema.safeParse({ ...validConfig(), clockTolerance: -Infinity }).success).toBe(true);
      expect(ConfigurationSchema.safeParse({ ...validConfig(), httpTimeout: -Infinity }).success).toBe(false);
      expect(ConfigurationSchema.safeParse({ ...validConfig(), discoveryCacheMaxAge: -Infinity }).success).toBe(false);
    });

    it.each(['clockTolerance', 'httpTimeout', 'discoveryCacheMaxAge'])('rejects NaN for %s', (key) => {
      expect(ConfigurationSchema.safeParse({ ...validConfig(), [key]: NaN }).success).toBe(false);
    });

    it('still reports range errors from the number branch', () => {
      const tooSmall = ConfigurationSchema.safeParse({ ...validConfig(), httpTimeout: 100 });
      const negative = ConfigurationSchema.safeParse({ ...validConfig(), discoveryCacheMaxAge: -1 });

      expect(tooSmall.success).toBe(false);
      expect(tooSmall.error?.issues[0]).toMatchObject({ code: 'too_small', path: ['httpTimeout'] });
      expect(negative.success).toBe(false);
      expect(negative.error?.issues[0]).toMatchObject({ code: 'too_small', path: ['discoveryCacheMaxAge'] });
    });

    it.each(['clockTolerance', 'httpTimeout', 'discoveryCacheMaxAge'])('explains that %s must be a number', (key) => {
      const result = ConfigurationSchema.safeParse({ ...validConfig(), [key]: '5000' });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]).toMatchObject({ path: [key], message: 'Expected a number' });
    });

    it.each(['absoluteDuration', 'inactivityDuration'])('explains that session.%s must be a number', (key) => {
      const result = ConfigurationSchema.safeParse({
        ...validConfig(),
        session: { ...validConfig().session, [key]: '5000' },
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]).toMatchObject({ path: ['session', key], message: 'Expected a number' });
    });
  });

  describe('authorizationParams defaults', () => {
    it('applies response_type and scope defaults when omitted', () => {
      const parsed = ConfigurationSchema.parse(validConfig());

      expect(parsed.authorizationParams).toEqual({ response_type: 'code', scope: 'openid profile email' });
    });
  });
});
