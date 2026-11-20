# @auth0/auth0-hono

[![npm](https://img.shields.io/npm/v/@auth0/auth0-hono.svg?style=flat-square)](https://www.npmjs.com/package/@auth0/auth0-hono)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

The official Auth0 SDK for the [Hono](https://hono.dev) web framework — login, logout, session management, token access, and route protection as native Hono middleware. Works across Node.js, Cloudflare Workers, Bun, Deno, and Vercel Edge.

## Overview

Hono is one of the fastest-growing web frameworks in the JS ecosystem, running everywhere — edge, serverless, traditional servers — with a unified API. This SDK brings Auth0 authentication to Hono with zero setup: one `auth0()` middleware call and auth just works.

Built on the foundation of `@auth0/auth0-server-js`, this SDK provides Hono-idiomatic middleware for authentication, authorization, session management, and token handling — without rewriting OIDC code.

## Installation

```bash
npm install @auth0/auth0-hono
```

## Quick Start

```typescript
import { Hono } from 'hono'
import { auth0, requiresAuth } from '@auth0/auth0-hono'

const app = new Hono()

// Add auth to every route
app.use('*', auth0())

// Public route
app.get('/', (c) => c.text('Home'))

// Protected route
app.get('/profile', requiresAuth(), (c) => {
  const user = c.var.auth0.user
  return c.json({ name: user?.name, sub: user?.sub })
})

export default app
```

## Configuration

### Environment Variables

The SDK reads configuration from Hono's environment (works across all runtimes — Node.js, CF Workers, Bun, Deno):

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH0_DOMAIN` | Yes | Auth0 domain (e.g., `tenant.auth0.com`) |
| `AUTH0_CLIENT_ID` | Yes | Auth0 application client ID |
| `AUTH0_CLIENT_SECRET` | No | Client secret (required for refresh token flow) |
| `AUTH0_SESSION_ENCRYPTION_KEY` | Yes | 32+ character encryption key for session cookies |
| `APP_BASE_URL` | Yes | Base URL of your application (e.g., `https://myapp.com`) |
| `AUTH0_DEBUG` | No | Set to `true` (or `1`/`yes`/`on`) to enable a built-in debug logger. Off by default. |

> **Debug logging:** When `AUTH0_DEBUG` is truthy and you have not supplied your own `debug` function in config, the SDK installs a default logger that writes to `console.log`. All log metadata is passed through a redactor first, so access tokens, refresh tokens, client secrets, authorization/cookie headers, and PII (email, `sub`, name) are replaced with `[REDACTED_*]` placeholders and never written to the log. An explicit `debug` function in your config always takes precedence over this environment variable.

**.env example:**

```
AUTH0_DOMAIN=tenant.auth0.com
AUTH0_CLIENT_ID=abc123
AUTH0_CLIENT_SECRET=secret123
AUTH0_SESSION_ENCRYPTION_KEY=very_long_string_with_at_least_32_characters
APP_BASE_URL=https://myapp.com
```

### Explicit Configuration

Override or augment environment variables with explicit config:

```typescript
app.use(
  '*',
  auth0({
    domain: 'tenant.auth0.com',
    clientID: 'abc123',
    clientSecret: 'secret123',
    baseURL: 'https://myapp.com',
    session: {
      secret: 'your_32_char_secret_key_here',
      cookie: {
        name: 'auth_session',
        sameSite: 'lax',
        secure: true,
      },
    },
    authorizationParams: {
      scope: 'openid profile email',
      audience: 'https://api.myapp.com',
    },
  })
)
```

**Config precedence:** explicit config > environment variables > schema defaults

> **Known limitation:** Configuration is captured from the first request (singleton pattern). Multi-tenant deployments where different requests have different environment bindings (e.g., Cloudflare Workers with per-route env) should use separate `auth0()` middleware instances with explicit config objects rather than relying on environment variables.

## Middleware Reference

### `auth0(config?)`

Main middleware — sets up routes, session management, and context population.

```typescript
app.use('*', auth0())
```

**What it handles automatically:**
- Login/callback/logout routes (`/auth/login`, `/auth/callback`, `/auth/logout`)
- Backchannel logout
- Session encryption and cookie management
- User data available on every request via `c.var.auth0.user`
- Token refresh (transparent, deduplicated)

**Options:**
```typescript
{
  domain?: string                           // Auth0 domain
  clientID?: string                         // Client ID
  clientSecret?: string                     // Client secret
  baseURL?: string                          // App base URL
  session?: {
    secret: string | string[]               // Encryption key(s) — supports rotation
    cookie?: {
      name?: string                         // Default: 'appSession'
      domain?: string
      sameSite?: 'lax' | 'strict' | 'none'
      secure?: boolean
    }
    store?: SessionStore                    // Custom session store (optional)
  }
  authorizationParams?: Record<string, any> // Scope, audience, etc.
  routes?: {
    login?: string                          // Default: '/auth/login'
    callback?: string                       // Default: '/auth/callback'
    logout?: string                         // Default: '/auth/logout'
    backchannelLogout?: string              // Default: '/auth/backchannel-logout'
  }
  onCallback?: (c, error, session) => ...   // Post-login hook (see Hooks below)
  attemptSilentLogin?: boolean              // Default: false
  fetch?: typeof global.fetch               // Custom fetch (optional)
}
```

### `requiresAuth()`

Enforce authentication on protected routes. Returns 401 on unauthenticated requests.

```typescript
app.get('/dashboard', requiresAuth(), (c) => {
  // c.var.auth0.user is guaranteed to exist here
  return c.json(c.var.auth0.user)
})
```

### `requiresOrg(options?)`

Enforce organization membership. Throws `AccessDeniedError` if user is not in the specified organization.

```typescript
// Any organization
app.get('/admin', requiresAuth(), requiresOrg(), handler)

// Specific organization
app.get('/admin', requiresAuth(), requiresOrg({ orgId: 'org_123' }), handler)

// Custom check
app.get('/admin', requiresAuth(), requiresOrg((c) => {
  return c.var.auth0.user?.org_id === 'org_123'
}), handler)
```

### `claimEquals(claim, value)`

Check if a claim equals an expected value.

```typescript
app.get('/admin',
  requiresAuth(),
  claimEquals('role', 'admin'),
  handler
)
```

### `claimIncludes(claim, ...values)`

Check if a claim array includes any of the provided values.

```typescript
app.get('/reports',
  requiresAuth(),
  claimIncludes('permissions', 'read:reports', 'admin:reports'),
  handler
)
```

### `claimCheck(fn)`

Custom claim validation function.

```typescript
app.get('/restricted',
  requiresAuth(),
  claimCheck((user) => user.email_verified === true),
  handler
)
```

### `requiresScopes(...scopes)`

Require that the authenticated user was granted **all** of the given OAuth2 scopes. Scopes are read from the user's `scope` claim (a space-delimited string per RFC 6749). Must run after `requiresAuth()`. Throws `Auth0Error` (HTTP 403, code `insufficient_claims`) if any scope is missing.

```typescript
app.use('/api/data', requiresAuth(), requiresScopes('read:data'))
app.use('/api/admin', requiresAuth(), requiresScopes('read:data', 'write:data'))
```

### `requiresPermissions(...permissions)`

Require that the authenticated user holds **all** of the given permissions. Permissions are read from the user's `permissions` claim (an array of strings, populated by Auth0 RBAC). Must run after `requiresAuth()`. Throws `Auth0Error` (HTTP 403, code `insufficient_claims`) if any permission is missing.

```typescript
app.use('/admin', requiresAuth(), requiresPermissions('admin'))
app.use('/billing', requiresAuth(), requiresPermissions('read:billing', 'write:billing'))
```

## Helpers

### `getSession(c)`

Retrieve the full session object. Returns `null` if unauthenticated.

```typescript
const session = await getSession(c)
if (session) {
  console.log(session.user.email)
}
```

### `getUser(c)`

Get the authenticated user. Throws `MissingSessionError` if not authenticated.

```typescript
const user = getUser(c)
console.log(user.name)
```

### `getAccessToken(c)`

Get an access token. Automatically refreshes if expired. The token audience is determined by `authorizationParams.audience` in the `auth0()` middleware config.

```typescript
const { accessToken } = await getAccessToken(c)

// Use in API call
const res = await fetch('https://api.example.com/data', {
  headers: { Authorization: `Bearer ${accessToken}` }
})
```

**Token deduplication:** If 5 parallel requests call `getAccessToken()` and a refresh is needed, only 1 refresh request is made. Others await the same promise.

**Options:** `getAccessToken(c, options?)` accepts an optional second argument. Omitting it preserves the original behavior exactly.

```typescript
const { accessToken } = await getAccessToken(c, {
  audience: 'https://api.myapp.com', // must match the configured audience (see below)
  scope: 'read:data',                // partitions the per-request token cache
  refresh: true,                     // force a refresh, bypassing the cache
})
```

| Option | Type | Description |
|--------|------|-------------|
| `audience` | `string` | Target audience. The underlying client binds its audience once (from `authorizationParams.audience`), so this must equal the configured audience. Passing a different value throws `Auth0Error` with code `unsupported_audience_override` (HTTP 400) rather than silently returning a token for the wrong audience. |
| `scope` | `string` | Scope hint used to partition the per-request cache so different scopes never share a cached token. |
| `refresh` | `boolean` | When `true`, bypass any cached in-flight token for this key and force a fresh request. Default `false`. |

> **Note:** For connection-scoped tokens (e.g., Google OAuth2), use `getAccessTokenForConnection()` instead.

### `getAccessTokenForConnection(c, options)`

Get a token for a specific connection (for service-to-service communication).

```typescript
const token = await getAccessTokenForConnection(c, {
  connection: 'google-oauth2',
  loginHint: 'user@example.com'
})
```

### `updateSession(c, data)`

Merge custom data into the session. Reserved fields (`user`, `idToken`, `refreshToken`, `internal`) are protected.

```typescript
await updateSession(c, {
  permissions: ['read:data', 'write:data'],
  customField: 'custom value'
})

// Now available on all subsequent requests
const perms = c.var.auth0.session?.permissions
```

## Standalone Handlers

Use authentication handlers without the `auth0()` middleware:

```typescript
import {
  handleLogin,
  handleLogout,
  handleCallback,
  handleBackchannelLogout
} from '@auth0/auth0-hono'

// Mount handlers on custom routes
app.get('/login', handleLogin())
app.get('/logout', handleLogout())
app.get('/callback', handleCallback())
app.post('/logout-notify', handleBackchannelLogout())
```

These resolve configuration from environment variables automatically.

## Hooks

### `onCallback(c, error, session)`

Run custom logic after a successful login or on login error. Use for session enrichment, error customization, or logging.

```typescript
app.use('*', auth0({
  async onCallback(c, error, session) {
    if (error) {
      // Error path: return custom error page or response
      return c.redirect('/login?error=true')
    }

    // Success path: enrich session with custom data
    const permissions = await fetchUserPermissions(session.user.sub)
    return {
      ...session,
      permissions
    }
  }
}))
```

**Contract:**
- **Success:** `error` is `null`, `session` is populated. Return enriched `SessionData` or `Response`.
- **Error:** `error` is `Auth0Error`, `session` is `null`. Return `Response` to override error page. Return value ignored otherwise.
- **Promise rejection in hook:** Original error always propagates.

## Error Handling

### `auth0ErrorHandler` (recommended)

For the common case, wire the built-in handler directly into `app.onError`. It maps SDK errors to sensible responses so you don't have to hand-map them:

```typescript
import { auth0ErrorHandler } from '@auth0/auth0-hono'

app.onError(auth0ErrorHandler)
```

Behavior:

- `LoginRequiredError` on an HTML request (`Accept: text/html`) → **302 redirect** to the configured login route, preserving the original path as `returnTo`.
- Any other `Auth0Error` (or `LoginRequiredError` on a JSON request) → JSON body `{ error, error_description, statusCode }` using the error's own status (falling back to 500).
- Non-Auth0 errors are **re-thrown untouched**, so your own error handling and Hono's default still apply — the handler never swallows unexpected errors.

### Custom handling

If you need custom behavior, the SDK throws typed errors that extend Hono's `HTTPException`. Catch and handle them in `app.onError`:

```typescript
import {
  Auth0Error,
  AccessDeniedError,
  LoginRequiredError,
  InvalidGrantError
} from '@auth0/auth0-hono'

app.onError((err, c) => {
  if (err instanceof AccessDeniedError) {
    return c.json({ error: 'Access denied' }, 403)
  }

  if (err instanceof LoginRequiredError) {
    return c.redirect('/auth/login')
  }

  if (err instanceof InvalidGrantError) {
    return c.json({ error: 'Token expired, please log in again' }, 401)
  }

  if (err instanceof Auth0Error) {
    return c.json(
      { error: err.code, error_description: err.description },
      err.status
    )
  }

  // Other errors
  return c.json({ error: 'Internal server error' }, 500)
})
```

### Error Classes

| Class | HTTP Status | Code | When Thrown |
|-------|-------------|------|------------|
| `Auth0Error` | 500 | `unknown_error` | Base class — catch-all |
| `LoginRequiredError` | 401 | `login_required` | `requiresAuth()` on unauthenticated request |
| `AccessDeniedError` | 403 | `access_denied` | Authorization check failed (claims, organization) |
| `InvalidGrantError` | 401 | `invalid_grant` | Refresh token expired or invalid |
| `MissingSessionError` | 401 | `missing_session` | `getUser()` called without session |
| `MissingTransactionError` | 400 | `missing_transaction` | Callback without login transaction |
| `TokenRefreshError` | 401 | `token_refresh_error` | Token refresh failed |
| `ConnectionTokenError` | 401 | `connection_token_error` | Connection token request failed |

All errors respond with OAuth2-compliant JSON:

```json
{
  "error": "access_denied",
  "error_description": "User does not belong to the required organization"
}
```

## Session Stores

By default sessions are stored in encrypted cookies (stateless). Backchannel Logout (BCLO) invalidation by `sid` requires a **stateful** store. For Cloudflare Workers, use the built-in `KVSessionStore`, which persists sessions in Workers KV so they survive isolate restarts and are shared across isolates.

```typescript
import { auth0, KVSessionStore } from '@auth0/auth0-hono'

// `AUTH0_SESSIONS` is a KV namespace binding declared in wrangler.toml
app.use('*', (c, next) =>
  auth0({
    session: {
      secret: c.env.AUTH0_SESSION_ENCRYPTION_KEY,
      store: new KVSessionStore(c.env.AUTH0_SESSIONS),
    },
  })(c, next)
)
```

**wrangler.toml:**

```toml
[[kv_namespaces]]
binding = "AUTH0_SESSIONS"
id = "<your-kv-namespace-id>"
```

The store keys sessions by identifier and maintains lookup indexes so BCLO logout tokens can be resolved: a `sid` maps to a single session, while a `sub` maps to **all** of that subject's sessions (one index entry per session), so a `sub`-only logout token terminates every session for the user, per RFC 9700 §2.4. All entries carry a TTL derived from `absoluteDuration` (clamped to the Workers KV 60-second minimum), so stale entries are cleaned up automatically even if an explicit delete is missed. Inactivity/absolute expiry itself is enforced by the SDK at the encrypted session-cookie layer, not by this store. You can override the durations:

```typescript
new KVSessionStore(c.env.AUTH0_SESSIONS, {
  absoluteDuration: 60 * 60 * 24 * 7, // 7 days
  inactivityDuration: 60 * 60 * 12,   // 12 hours
})
```

`KVSessionStore` accepts any object matching the `KVNamespaceLike` shape (`get`/`put`/`delete`), so it does not add a hard dependency on `@cloudflare/workers-types`. For Node.js, continue to use a cookie session or provide your own `SessionStore` implementation (e.g. Redis-backed).

## Multi-Runtime Support

This SDK works across multiple JavaScript runtimes:

| Runtime | Level | Status |
|---------|-------|--------|
| Node.js 18+ | Primary | Full support |
| Cloudflare Workers | Primary | Full support |
| Bun 1.x+ | Secondary | Works, best-effort testing |
| Deno 1.x/2.x | Secondary | Works, best-effort testing |
| Vercel Edge | Secondary | Works, best-effort testing |

**Key:** The SDK uses Hono's `env(c)` adapter for all environment variable access, making it runtime-agnostic. No `process.env` anywhere on the critical path.

## TypeScript

Full TypeScript support with types for context, session, user, and tokens.

### Context Types

Use `OIDCEnv` for strict typing of middleware handlers:

```typescript
import { OIDCEnv, requiresAuth } from '@auth0/auth0-hono'

app.get('/protected', requiresAuth(), (c: Context<OIDCEnv>) => {
  // c.var.auth0 is fully typed and non-null here
  const user = c.var.auth0.user
  const session = c.var.auth0.session
  const org = c.var.auth0.org
  return c.json({ user, session, org })
})
```

### Augmenting Hono's ContextVariableMap

To get autocomplete on `c.var.auth0` globally, import the type augmentation:

```typescript
import '@auth0/auth0-hono/lib/honoEnv'

app.get('/', (c) => {
  // c.var.auth0 now has autocomplete (but still optional — null check required)
  if (c.var.auth0?.user) {
    return c.json(c.var.auth0.user)
  }
})
```

### Type Definitions

```typescript
// User claims
export interface Auth0User extends UserClaims {
  sub: string           // Subject (user ID)
  name?: string
  email?: string
  email_verified?: boolean
  org_id?: string       // Organization ID (if in org)
  org_name?: string     // Organization name (if in org)
  [key: string]: any    // Custom claims
}

// Organization context
export interface Auth0Organization {
  id: string
  name?: string
}

// Full session (all tokens, user, custom fields)
export interface Auth0Session {
  user: Auth0User
  idToken: string
  refreshToken?: string
  tokenSets: TokenSet[]
  // + custom fields from updateSession()
  [key: string]: unknown
}

// Main context variable
export interface Auth0Context {
  user: Auth0User | null
  session: Auth0Session | null
  org: Auth0Organization | null
}

// Token set
export type Auth0TokenSet = {
  accessToken: string
  audience: string
  scope?: string
  expiresAt: number
}
```

## API Reference

For detailed API documentation, see [DESIGN.md](./forge/design/DESIGN.md) (technical spec) and [BETA-OVERVIEW.md](./forge/design/BETA-OVERVIEW.md) (feature overview).

## Troubleshooting

### Environment variables not read on Cloudflare Workers?

Ensure you're using environment variables correctly in your `wrangler.toml`:

```toml
[env.production]
vars = { AUTH0_DOMAIN = "tenant.auth0.com", AUTH0_CLIENT_ID = "abc123" }
```

The SDK uses Hono's `env(c)` adapter, which correctly reads CF Workers bindings.

### HonoX on Cloudflare Pages

If deploying a [HonoX](https://honox.dev) project (Hono + React SSR) on Cloudflare Pages, register the auth middleware in `app/routes/_middleware.ts`, not `server.ts`. Use HonoX's `createRoute` wrapper and access CF bindings via `c.env`:

```typescript
// app/routes/_middleware.ts
import { createRoute } from 'honox/factory'
import { Context, Next } from 'hono'
import { auth0 } from '@auth0/auth0-hono'
import type { OIDCEnv } from '@auth0/auth0-hono'

type Env = {
  AUTH0_DOMAIN: string
  AUTH0_CLIENT_ID: string
  AUTH0_CLIENT_SECRET: string
  AUTH0_SESSION_ENCRYPTION_KEY: string
  APP_BASE_URL: string
}

export const myAuth = (c: Context<OIDCEnv<{ Bindings: Env }>>, next: Next) => {
  const a = auth0({
    domain: c.env.AUTH0_DOMAIN,
    clientID: c.env.AUTH0_CLIENT_ID,
    clientSecret: c.env.AUTH0_CLIENT_SECRET,
    session: { secret: c.env.AUTH0_SESSION_ENCRYPTION_KEY },
    baseURL: c.env.APP_BASE_URL,
  })
  return a(c, next)
}

export default createRoute(myAuth)
```

Bind variables in `wrangler.toml`:

```toml
env.pages
vars = { AUTH0_DOMAIN = "...", AUTH0_CLIENT_ID = "...", APP_BASE_URL = "..." }
```

The SDK uses Hono's `env(c)` adapter internally, so no `process.env` is needed on the critical path—the concern above is solely for accessing your own config values from CF bindings.

### Session cookie too large?

If you're enriching sessions with large data via `updateSession()`, consider using a custom stateful session store:

```typescript
import { SessionStore } from '@auth0/auth0-hono'

const customStore: SessionStore = {
  async set(name, data, isTransaction, ctx) {
    // Store session data in your database
    await db.sessions.set(data.internal.sid, data)
  },
  async get(name, ctx) {
    // Retrieve from database
    return await db.sessions.get(sessionId)
  },
  // ... delete, clear
}

app.use('*', auth0({
  session: { secret: '...', store: customStore }
}))
```

### Token not refreshing?

Ensure `AUTH0_CLIENT_SECRET` is set and that the client has offline access enabled in your Auth0 dashboard.

## Contributing

We appreciate feedback and contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Vulnerability Reporting

Please do not report security vulnerabilities on GitHub. Use Auth0's [Responsible Disclosure Program](https://auth0.com/responsible-disclosure-policy).

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) file for details.

---

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="https://cdn.auth0.com/website/sdks/logos/auth0_light_mode.png" width="150">
    <source media="(prefers-color-scheme: dark)" srcset="https://cdn.auth0.com/website/sdks/logos/auth0_dark_mode.png" width="150">
    <img alt="Auth0 Logo" src="https://cdn.auth0.com/website/sdks/logos/auth0_light_mode.png" width="150">
  </picture>
</p>
<p align="center">Auth0 is an easy to implement, adaptable authentication and authorization platform. Learn more at <a href="https://auth0.com/why-auth0">Why Auth0?</a></p>
