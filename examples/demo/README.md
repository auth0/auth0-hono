# Auth0 Hono Demo

A demo application showing how to add Auth0 authentication to a [Hono](https://hono.dev) app using `@auth0/auth0-hono`. Runs on both **Node.js** and **Cloudflare Workers** with zero code changes.

> **Note:** The dashboard stats, activity feed, and team directory use fake data for demonstration purposes. In a real app, these would come from your own data sources. The authentication flow, session management, and access tokens are fully real and powered by Auth0.

## Quick Start

### 1. Install

```bash
cd examples/demo
pnpm install
```

### 2. Configure Auth0

You need a **Regular Web Application** in the [Auth0 Dashboard](https://manage.auth0.com/) with these settings:

| Setting               | Value                                 |
| --------------------- | ------------------------------------- |
| Allowed Callback URLs | `http://localhost:3000/auth/callback` |
| Allowed Logout URLs   | `http://localhost:3000`               |

Then create your environment file (copy from the provided example):

**Node.js** — `cp .env.example .env`, then fill in:

```bash
APP_BASE_URL=http://localhost:3000
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_SESSION_ENCRYPTION_KEY=generate-with-openssl-rand-hex-32
```

**Cloudflare Workers** — `cp .dev.vars.example .dev.vars`, then fill in:

```bash
APP_BASE_URL=http://localhost:3000
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_SESSION_ENCRYPTION_KEY=generate-with-openssl-rand-hex-32
```

> Using JWT Client Assertion instead? Omit `AUTH0_CLIENT_SECRET` and see [JWT Client Assertion](#2-jwt-client-assertion-private_key_jwt) below.

### 3. Run

**Node.js:**

```bash
pnpm dev
```

**Cloudflare Workers (local):**

```bash
pnpm dev:worker
```

Open [http://localhost:3000](http://localhost:3000)

## What's Demonstrated

| Feature                                | SDK API                                   | Route                                       |
| -------------------------------------- | ----------------------------------------- | ------------------------------------------- |
| Middleware setup                       | `auth0({ authRequired: false })`          | All routes                                  |
| Route protection                       | `requiresAuth()`                          | `/dashboard`, `/team`, `/settings`          |
| User claims                            | `c.var.auth0.user`                        | All authenticated pages                     |
| Session inspection                     | `getSession(c)`                           | `/settings`                                 |
| Access token retrieval                 | `getAccessToken(c)`                       | `/settings`                                 |
| Login callback hook                    | `onCallback`                              | `/auth/callback`                            |
| Error handling                         | `LoginRequiredError`, `AccessDeniedError` | Global error handler                        |
| Pushed Authorization Requests (PAR)    | `pushedAuthorizationRequests`             | auth-config.ts (via env)                    |
| JWT Client Assertion (private_key_jwt) | `clientAssertionSigningKey`               | auth-config.ts (via env)                    |
| Backchannel Logout (BCLO)              | `session.store`                           | auth-config.ts + `/auth/backchannel-logout` |

## Project Structure

```
app.tsx                      Hono routes and auth middleware setup (shared across runtimes)
auth-config.ts              Auth0 config factory supporting PAR, JWT-CA, BCLO features
stores.ts                   Session store implementations (in-memory + KV skeleton)
components.tsx              Server-rendered JSX components (layout, cards, sidebar)
worker.ts                   Cloudflare Workers entry point
serve-node.ts               Node.js entry point
data.ts                     Static mock data for dashboard and team (demo only)
toasts.ts                   Toast notification helpers showing SDK operations
test/                       Unit tests for auth-config factory and stores (vitest)
vitest.config.ts            Vitest configuration for test running
scripts/generate-keypair.sh Utility to generate RSA keypair for JWT-CA
wrangler.toml               Cloudflare Workers configuration
```

## Running the Tests

The demo includes unit tests for the auth config factory and session store:

```bash
pnpm test  # or: npm test
```

Tests are written in [Vitest](https://vitest.dev/) and cover:

- `createAuth0Config()` factory with PAR, JWT-CA, and BCLO feature flags
- `InMemorySessionStore` CRUD and backchannel logout by 'sid' or 'sub'

## Advanced Confidential-Client Features

This demo supports three optional features for confidential clients:

### 1. Pushed Authorization Requests (PAR)

**What it does:** Decouples the authorization request from user interaction by pushing the request to Auth0 first, improving security and compliance.

**Enable it:**

```bash
# Add to .env or .dev.vars
AUTH0_PUSHED_AUTHORIZATION_REQUESTS=true
```

**How to test:**

- Login and observe the network tab: you'll see a POST to `https://YOUR_TENANT.auth0.com/oauth/par` before the authorization redirect
- The dashboard shows a "Pushed Authorization Request" toast notification

### 2. JWT Client Assertion (private_key_jwt)

**What it does:** Uses asymmetric cryptography (private key) for client authentication instead of sharing a secret.

**Setup:**

```bash
# Generate a keypair (requires OpenSSL installed)
pnpm gen-keypair
```

The script prints to your terminal:

1. An `AUTH0_CLIENT_ASSERTION_SIGNING_KEY=...` line — copy it into your `.env` or `.dev.vars`.
2. A PUBLIC key block — register it in the Auth0 Dashboard:
   `Applications > Your App > Credentials tab > Application Authentication > select "Private Key JWT" > add the public key`.

> **IMPORTANT:** Omit `AUTH0_CLIENT_SECRET` so the SDK resolves to `private_key_jwt`.
> Auth0 only stores your PUBLIC key/JWKS — the private key stays in `.env`.

**How to test:**

- Ensure `AUTH0_CLIENT_SECRET` is not set in .env or .dev.vars
- Login and check the network tab: the token endpoint call includes `client_assertion` (JWT) instead of `client_secret`

### 3. Backchannel Logout (BCLO)

**What it does:** Allows Auth0 to notify your app when a user's session is terminated (logout, password reset, etc.), enabling real-time session invalidation.

**How it works:**

- The demo enables BCLO with a stateful session store (required to look up sessions by Auth0's `sid` claim)
- When Auth0 sends a backchannel logout notification to `/auth/backchannel-logout`, the SDK validates the logout token
- The app's store immediately invalidates the matching session
- The user is logged out on their next request

**How to test (manual — requires a public HTTPS URL):**

- Auth0 rejects backchannel logout URLs that are non-HTTPS or `localhost`, so this
  **cannot be tested against `http://localhost:3000`.** Use a deployed Workers URL
  or an HTTPS tunnel (e.g. `cloudflared tunnel` / `ngrok`).
- Register the backchannel logout URI in the Auth0 Dashboard
  (Applications > Your App > Sessions / Logout): `https://YOUR_PUBLIC_HOST/auth/backchannel-logout`
- Login as a user, then trigger a logout for that user from the Auth0 Dashboard
- Auth0 POSTs a `logout_token` to `/auth/backchannel-logout`; the store invalidates the session
- The user's next request shows them as unauthenticated

**Store implementation:**

- **Node.js (dev/production):** `InMemorySessionStore` (Map-based) for single-process. For multi-process, use Redis or a database store.
- **Cloudflare Workers (dev):** `InMemorySessionStore` works locally. For production, uncomment the `KVSessionStore` skeleton in `stores.ts` and configure a KV namespace.

## Deploying to Cloudflare Workers

```bash
# Set secrets
wrangler secret put AUTH0_DOMAIN
wrangler secret put AUTH0_CLIENT_ID
wrangler secret put AUTH0_CLIENT_SECRET
wrangler secret put APP_BASE_URL
wrangler secret put AUTH0_SESSION_ENCRYPTION_KEY

# Deploy
wrangler deploy
```

Update your Auth0 application's Allowed Callback and Logout URLs to match your deployed Worker URL.
