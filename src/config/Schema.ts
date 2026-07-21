import { z } from 'zod';
import { Configuration } from './Configuration.js';

const isHttps = /^https:/i;

// Helper method to create response type/mode schema with proper dependencies
const createAuthParamsSchema = () => {
  return z
    .object({
      response_type: z.enum(['id_token', 'code id_token', 'code']).optional().default('code'),
      scope: z
        .string()
        .regex(/\bopenid\b/, 'Must contain openid')
        .optional()
        .default('openid profile email'),
      response_mode: z.string().optional(),
    })
    .passthrough();
};

// Create the configuration schema
export const ConfigurationSchema = z
  .object({
    session: z.object({
      store: z.any().optional(),
      secret: z.union([z.string().min(32), z.array(z.string().min(32)).min(1)]),
      rolling: z.boolean().optional().default(true),
      absoluteDuration: z
        .number()
        .optional()
        .default(60 * 60 * 24 * 3),
      inactivityDuration: z
        .number()
        .optional()
        .default(60 * 60 * 24),
      cookie: z
        .object({
          name: z.string().optional().default('appSession'),
          sameSite: z.enum(['lax', 'strict', 'none']).optional().default('lax'),
          secure: z.boolean().optional(),
        })
        .optional()
        .default({
          name: 'appSession',
          sameSite: 'lax',
        }),
    }),
    tokenEndpointParams: z.record(z.any()).optional(),
    authorizationParams: createAuthParamsSchema().optional().default({}),
    forwardAuthorizationParams: z.array(z.string()).optional().default([]),
    logoutParams: z.record(z.any()).optional(),
    baseURL: z.string().url(),
    clientID: z.string(),
    clientSecret: z.string().optional(),
    clockTolerance: z.number().optional().default(60),
    enableTelemetry: z.boolean().optional().default(true),
    errorOnRequiredAuth: z.boolean().optional().default(false),
    attemptSilentLogin: z.boolean().optional().default(false),
    excludedClaims: z
      .array(z.string())
      .optional()
      .default(['aud', 'iss', 'iat', 'exp', 'nbf', 'nonce', 'azp', 'auth_time', 's_hash', 'at_hash', 'c_hash']),
    idpLogout: z.boolean().optional().default(true),
    idTokenSigningAlg: z
      .string()
      .refine((val) => val.toLowerCase() !== 'none', {
        message: "Signing algorithm cannot be 'none'",
      })
      .optional()
      .default('RS256'),
    domain: z
      .string()
      .regex(
        /^(?=.{1,253}$)(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)\.)*(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)$/
      ),
    authRequired: z.boolean().optional().default(true),
    pushedAuthorizationRequests: z.boolean().optional().default(false),
    customRoutes: z
      .array(z.enum(['login', 'callback', 'logout', 'backchannelLogout']))
      .optional()
      .default([]),
    mountRoutes: z.boolean().optional().default(true),
    debug: z
      .custom<(message: string, metadata?: Record<string, unknown>) => void>((v) => typeof v === 'function')
      .optional()
      .default(() => () => {}),
    routes: z
      .object({
        login: z.string().regex(/^\//).optional().default('/auth/login'),
        logout: z.string().regex(/^\//).optional().default('/auth/logout'),
        callback: z.string().regex(/^\//).optional().default('/auth/callback'),
        backchannelLogout: z.string().regex(/^\//).optional().default('/auth/backchannel-logout'),
      })
      .optional()
      .default({}),
    clientAuthMethod: z
      .enum(['client_secret_basic', 'client_secret_post', 'client_secret_jwt', 'private_key_jwt', 'none'])
      .optional(),
    clientAssertionSigningKey: z.any().optional(),
    clientAssertionSigningAlg: z
      .enum(['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES256K', 'ES384', 'ES512', 'EdDSA'])
      .optional(),
    discoveryCacheMaxAge: z
      .number()
      .min(0)
      .optional()
      .default(10 * 60 * 1000),
    httpTimeout: z.number().min(500).optional().default(5000),
    httpUserAgent: z.string().optional().default('hono-openid-connect'),

    fetch: z
      .custom<typeof globalThis.fetch>((v) => typeof v === 'function')
      .optional()
      .default(() => globalThis.fetch),

    onCallback: z.custom<Configuration['onCallback']>((v) => typeof v === 'function').optional(),
  })
  .transform((data) => {
    const isSecure = /^https:/i.test(data.baseURL);

    // Compute default clientAuthMethod based on conditions
    let clientAuthMethod = data.clientAuthMethod;
    if (clientAuthMethod === undefined) {
      if (data.authorizationParams?.response_type === 'id_token' && !data.pushedAuthorizationRequests) {
        clientAuthMethod = 'none';
      } else if (data.clientAssertionSigningKey) {
        clientAuthMethod = 'private_key_jwt';
      } else {
        clientAuthMethod = 'client_secret_basic';
      }
    }

    // Compute response_mode default for non-code response types
    const authParams = { ...data.authorizationParams };
    if (!authParams.response_mode && authParams.response_type !== 'code') {
      authParams.response_mode = 'form_post';
    }

    return {
      ...data,
      clientAuthMethod,
      session: {
        ...data.session,
        cookie: {
          ...data.session.cookie,
          secure: data.session.cookie.secure ?? isSecure,
        },
      },
      authorizationParams: authParams,
    };
  })
  .superRefine((data, ctx) => {
    // Handle secure cookie validation based on baseURL
    if (data.session && typeof data.session !== 'boolean') {
      const cookie = data.session.cookie;
      if (isHttps.test(data.baseURL)) {
        if (cookie.secure === false) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Setting your cookie to insecure when over https is not recommended, I hope you know what you're doing.",
            path: ['session', 'cookie', 'secure'],
          });
        }
      } else if (cookie.secure === true) {
        // Error for HTTP with secure cookie
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Cookies set with the `Secure` property won't be attached to http requests",
          path: ['session', 'cookie', 'secure'],
        });
      }
    }

    // Validate response_mode based on response_type
    if (data.authorizationParams) {
      const responseType = data.authorizationParams.response_type;
      const responseMode = data.authorizationParams.response_mode;

      if (responseType === 'code') {
        if (responseMode && !['query', 'form_post'].includes(responseMode)) {
          ctx.addIssue({
            code: z.ZodIssueCode.invalid_enum_value,
            options: ['query', 'form_post'],
            received: responseMode,
            message: "For response_type 'code', response_mode must be 'query' or 'form_post'",
            path: ['authorizationParams', 'response_mode'],
          });
        }
      } else if (responseMode && responseMode !== 'form_post') {
        ctx.addIssue({
          code: z.ZodIssueCode.invalid_enum_value,
          options: ['form_post'],
          received: responseMode,
          message: "For this response_type, response_mode must be 'form_post'",
          path: ['authorizationParams', 'response_mode'],
        });
      }

      // Warning about form_post with HTTP baseURL
      if (data.authorizationParams.response_mode === 'form_post' && !isHttps.test(data.baseURL)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Using 'form_post' for response_mode may cause issues for you logging in over http, see https://github.com/auth0/express-openid-connect/blob/master/FAQ.md",
          path: ['baseURL'],
        });
      }
    }

    // Validate clientSecret requirements
    if (data.clientAuthMethod && data.clientAuthMethod.includes('client_secret') && !data.clientSecret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"clientSecret" is required for the "clientAuthMethod" "${data.clientAuthMethod}"`,
        path: ['clientSecret'],
      });
    }

    if (data.idTokenSigningAlg && data.idTokenSigningAlg.startsWith('HS') && !data.clientSecret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '"clientSecret" is required for ID tokens with HMAC based algorithms',
        path: ['clientSecret'],
      });
    }

    // Validate clientAuthMethod
    if (data.authorizationParams?.response_type?.includes('code') && data.clientAuthMethod === 'none') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Public code flow clients are not supported.',
        path: ['clientAuthMethod'],
      });
    }

    if (data.pushedAuthorizationRequests && data.clientAuthMethod === 'none') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Public PAR clients are not supported.',
        path: ['clientAuthMethod'],
      });
    }

    // Validate clientAssertionSigningKey
    if (data.clientAuthMethod === 'private_key_jwt' && !data.clientAssertionSigningKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '"clientAssertionSigningKey" is required for a "clientAuthMethod" of "private_key_jwt"',
        path: ['clientAssertionSigningKey'],
      });
    }
  });
