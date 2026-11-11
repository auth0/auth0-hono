/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { redactError, redactSecrets, scrubString } from '../../src/utils/redact';

describe('redactSecrets', () => {
  describe('primitives', () => {
    it('returns primitives unchanged', () => {
      expect(redactSecrets('hello')).toBe('hello');
      expect(redactSecrets(42)).toBe(42);
      expect(redactSecrets(true)).toBe(true);
      expect(redactSecrets(null)).toBe(null);
      expect(redactSecrets(undefined)).toBe(undefined);
    });
  });

  describe('token redaction', () => {
    it('redacts any key containing "token"', () => {
      const out = redactSecrets({
        accessToken: 'eyJ.secret',
        refresh_token: 'rt_secret',
        id_token: 'idt_secret',
      }) as Record<string, unknown>;
      expect(out.accessToken).toBe('[REDACTED_TOKEN]');
      expect(out.refresh_token).toBe('[REDACTED_TOKEN]');
      expect(out.id_token).toBe('[REDACTED_TOKEN]');
    });

    it('redacts authorization and cookie headers', () => {
      const out = redactSecrets({
        authorization: 'Bearer abc',
        cookie: 'appSession=xyz',
        'set-cookie': 'appSession=xyz',
      }) as Record<string, unknown>;
      expect(out.authorization).toBe('[REDACTED_TOKEN]');
      expect(out.cookie).toBe('[REDACTED_TOKEN]');
      expect(out['set-cookie']).toBe('[REDACTED_TOKEN]');
    });
  });

  describe('secret redaction', () => {
    it('redacts secret and password keys', () => {
      const out = redactSecrets({
        clientSecret: 's1',
        secret: 's2',
        password: 'p1',
      }) as Record<string, unknown>;
      expect(out.clientSecret).toBe('[REDACTED_SECRET]');
      expect(out.secret).toBe('[REDACTED_SECRET]');
      expect(out.password).toBe('[REDACTED_SECRET]');
    });
  });

  describe('PII redaction', () => {
    it('redacts email, sub, user_id, name, phone_number', () => {
      const out = redactSecrets({
        email: 'a@b.com',
        sub: 'auth0|1',
        user_id: 'u1',
        name: 'Jane',
        phone_number: '+123',
      }) as Record<string, unknown>;
      expect(out.email).toBe('[REDACTED_PII]');
      expect(out.sub).toBe('[REDACTED_PII]');
      expect(out.user_id).toBe('[REDACTED_PII]');
      expect(out.name).toBe('[REDACTED_PII]');
      expect(out.phone_number).toBe('[REDACTED_PII]');
    });
  });

  describe('OIDC redaction', () => {
    it('redacts state, code, nonce, code_verifier', () => {
      const out = redactSecrets({
        state: 'st',
        code: 'cd',
        nonce: 'nc',
        code_verifier: 'cv',
      }) as Record<string, unknown>;
      expect(out.state).toBe('[REDACTED_OIDC]');
      expect(out.code).toBe('[REDACTED_OIDC]');
      expect(out.nonce).toBe('[REDACTED_OIDC]');
      expect(out.code_verifier).toBe('[REDACTED_OIDC]');
    });
  });

  describe('non-sensitive values', () => {
    it('keeps non-sensitive fields intact', () => {
      const out = redactSecrets({ scope: 'openid profile', count: 3 }) as Record<string, unknown>;
      expect(out.scope).toBe('openid profile');
      expect(out.count).toBe(3);
    });

    it('is case-insensitive on keys', () => {
      const out = redactSecrets({ Email: 'a@b.com', ACCESS_TOKEN: 'x' }) as Record<string, unknown>;
      expect(out.Email).toBe('[REDACTED_PII]');
      expect(out.ACCESS_TOKEN).toBe('[REDACTED_TOKEN]');
    });
  });

  describe('nested structures', () => {
    it('redacts nested objects', () => {
      const out = redactSecrets({
        user: { email: 'a@b.com', name: 'Jane' },
        meta: { requestId: 'r1' },
      }) as Record<string, any>;
      expect(out.user.email).toBe('[REDACTED_PII]');
      expect(out.user.name).toBe('[REDACTED_PII]');
      expect(out.meta.requestId).toBe('r1');
    });

    it('redacts inside arrays', () => {
      const out = redactSecrets({ items: [{ accessToken: 'a' }, { accessToken: 'b' }] }) as Record<string, any>;
      expect(out.items[0].accessToken).toBe('[REDACTED_TOKEN]');
      expect(out.items[1].accessToken).toBe('[REDACTED_TOKEN]');
    });

    it('does not mutate the input', () => {
      const input = { email: 'a@b.com' };
      redactSecrets(input);
      expect(input.email).toBe('a@b.com');
    });
  });

  describe('guards', () => {
    it('handles circular references without throwing', () => {
      const obj: Record<string, unknown> = { name: 'x' };
      obj.self = obj;
      const out = redactSecrets(obj) as Record<string, unknown>;
      expect(out.name).toBe('[REDACTED_PII]');
      expect(out.self).toBe('[REDACTED_CIRCULAR]');
    });

    it('bounds deep nesting with a depth limit', () => {
      // Build an object nested deeper than the depth limit (10).
      let deep: Record<string, unknown> = { value: 'leaf' };
      for (let i = 0; i < 15; i++) {
        deep = { nested: deep };
      }
      // Should not throw and should terminate.
      expect(() => redactSecrets(deep)).not.toThrow();
    });
  });

  describe('security invariant', () => {
    it('never emits a raw token/secret/PII value in serialized output', () => {
      const out = redactSecrets({
        accessToken: 'RAW_ACCESS_TOKEN_VALUE',
        clientSecret: 'RAW_CLIENT_SECRET',
        email: 'raw@example.com',
        code: 'RAW_AUTH_CODE',
        nested: { refresh_token: 'RAW_REFRESH' },
      });
      const serialized = JSON.stringify(out);
      expect(serialized).not.toContain('RAW_ACCESS_TOKEN_VALUE');
      expect(serialized).not.toContain('RAW_CLIENT_SECRET');
      expect(serialized).not.toContain('raw@example.com');
      expect(serialized).not.toContain('RAW_AUTH_CODE');
      expect(serialized).not.toContain('RAW_REFRESH');
    });
  });
});

describe('redactSecrets prototype safety', () => {
  it('ignores an own __proto__ key instead of changing the prototype', () => {
    const input = JSON.parse('{"__proto__": {"polluted": true}, "a": 1}');
    const out = redactSecrets(input) as Record<string, unknown>;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(out.a).toBe(1);
    expect((out as any).polluted).toBeUndefined();
  });
});

describe('redactError', () => {
  it('preserves message, name, stack and string code while redacting other fields', () => {
    const err = new TypeError('bad thing') as TypeError & Record<string, unknown>;
    err.code = 'some_code';
    err.id_token = 'jwt.value';
    err.detail = { password: 'hunter2', note: 'ok' };

    const out = redactError(err) as Error & Record<string, any>;

    expect(out).toBeInstanceOf(Error);
    expect(out).not.toBe(err);
    expect(out.name).toBe('TypeError');
    expect(out.message).toBe('bad thing');
    expect(out.stack).toBe(err.stack);
    expect(out.code).toBe('some_code');
    expect(out.id_token).toBe('[REDACTED_TOKEN]');
    expect(out.detail).toEqual({ password: '[REDACTED_SECRET]', note: 'ok' });
    expect(err.id_token).toBe('jwt.value');
  });

  it('delegates non-Error values to redactSecrets', () => {
    expect(redactError({ access_token: 'x', a: 1 })).toEqual({ access_token: '[REDACTED_TOKEN]', a: 1 });
    expect(redactError('plain')).toBe('plain');
    expect(redactError(undefined)).toBeUndefined();
  });
});

describe('scrubString', () => {
  const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl';

  it('scrubs compact JWS and JWE values, including an empty encrypted-key segment', () => {
    const jwe = 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..aXY.Y3Q.dGFn';
    expect(scrubString(`a ${jwt} b ${jwe} c`)).toBe('a [REDACTED_TOKEN] b [REDACTED_TOKEN] c');
  });

  it('scrubs name=value pairs', () => {
    expect(scrubString('https://x/cb?code=abc&state=xyz&ok=1&refresh_token=opaque')).toBe(
      'https://x/cb?code=[REDACTED]&state=[REDACTED]&ok=1&refresh_token=[REDACTED]'
    );
  });

  it('scrubs JSON and colon-separated values for token and secret names', () => {
    expect(scrubString('{"refresh_token":"abc.def","other":"keep"}')).toBe(
      '{"refresh_token":"[REDACTED]","other":"keep"}'
    );
    expect(scrubString('client_secret: xyz123 next')).toBe('client_secret: [REDACTED] next');
    expect(scrubString("password: 'hunter2'")).toBe("password: '[REDACTED]'");
  });

  it('scrubs opaque bearer credentials', () => {
    expect(scrubString('Authorization: Bearer v1.opaque-Token_123=')).toBe('Authorization: Bearer [REDACTED]');
  });

  it('leaves ordinary text and non-strings alone', () => {
    expect(scrubString('Error code: 401 from upstream')).toBe('Error code: 401 from upstream');
    expect(scrubString(42)).toBe(42);
    expect(scrubString(undefined)).toBeUndefined();
  });

  it('runs in linear time on long hyphenated input', () => {
    const input = 'a-'.repeat(40_000);
    const start = performance.now();
    scrubString(input);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe('redactError string leaves and non-Error values', () => {
  it('scrubs strings inside a plain-object cause', () => {
    const out = redactError({
      error: 'invalid_grant',
      error_description: 'bad request refresh_token=opaque123 for client',
      nested: ['Bearer abc.def'],
    }) as any;
    expect(out.error).toBe('invalid_grant');
    expect(out.error_description).toBe('bad request refresh_token=[REDACTED] for client');
    expect(out.nested[0]).toBe('Bearer [REDACTED]');
  });

  it('redacts code on plain objects (may be an authorization code) but keeps it on Errors', () => {
    expect((redactError({ code: 'abc' }) as any).code).toBe('[REDACTED_OIDC]');
    expect((redactError(Object.assign(new Error('x'), { code: 'some_code' })) as any).code).toBe('some_code');
  });

  it('reports a cyclic cause as circular', () => {
    const err = new Error('loop') as Error & { cause?: unknown };
    err.cause = err;
    expect((redactError(err) as any).cause).toBe('[REDACTED_CIRCULAR]');
  });

  it('does not throw on a non-string message', () => {
    const err = new Error('x') as any;
    err.message = 42;
    expect(() => redactError(err)).not.toThrow();
  });
});
