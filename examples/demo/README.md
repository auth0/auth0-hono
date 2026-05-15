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

| Setting | Value |
|---------|-------|
| Allowed Callback URLs | `http://localhost:3000/auth/callback` |
| Allowed Logout URLs | `http://localhost:3000` |

Then create your environment file:

**Node.js** — create `.env`:
```bash
APP_BASE_URL=http://localhost:3000
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_SECRET=a-random-secret-at-least-32-characters
```

**Cloudflare Workers** — create `.dev.vars`:
```bash
APP_BASE_URL=http://localhost:3000
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_SECRET=a-random-secret-at-least-32-characters
```

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

| Feature | SDK API | Route |
|---------|---------|-------|
| Middleware setup | `auth0({ authRequired: false })` | All routes |
| Route protection | `requiresAuth()` | `/dashboard`, `/team`, `/settings` |
| User claims | `c.var.auth0.user` | All authenticated pages |
| Session inspection | `getSession(c)` | `/settings` |
| Access token retrieval | `getAccessToken(c)` | `/settings` |
| Login callback hook | `onCallback` | `/auth/callback` |
| Error handling | `LoginRequiredError`, `AccessDeniedError` | Global error handler |

## Project Structure

```
app.tsx          Hono routes and auth middleware setup (shared across runtimes)
components.tsx   Server-rendered JSX components (layout, cards, sidebar)
worker.ts        Cloudflare Workers entry point
serve-node.ts    Node.js entry point
data.ts          Static mock data for dashboard and team (demo only)
toasts.ts        Toast notification helpers showing SDK operations
wrangler.toml    Cloudflare Workers configuration
```

## Deploying to Cloudflare Workers

```bash
# Set secrets
wrangler secret put AUTH0_DOMAIN
wrangler secret put AUTH0_CLIENT_ID
wrangler secret put AUTH0_SECRET
wrangler secret put APP_BASE_URL

# Deploy
wrangler deploy
```

Update your Auth0 application's Allowed Callback and Logout URLs to match your deployed Worker URL.
