# Auth0 Hono Demo

A full-featured demo application showcasing `@auth0/auth0-hono` with server-side rendered UI. Runs on both Node.js and Cloudflare Workers.

## Features

- Login / Logout with Auth0 Universal Login
- Protected routes with `requiresAuth()`
- Session management with `getSession()`
- Access token retrieval with `getAccessToken()`
- User profile display from OIDC claims
- Toast notifications showing SDK operations in real-time
- Dual-runtime support (Node.js + Cloudflare Workers)

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

Copy the example env file and fill in your Auth0 credentials:

**For Node.js:**
```bash
cp .env.example .env
```

**For Cloudflare Workers:**
```bash
cp .dev.vars.example .dev.vars
```

Edit the file with your Auth0 application credentials. You need a **Regular Web Application** in Auth0 with:
- Allowed Callback URL: `http://localhost:3000/auth/callback`
- Allowed Logout URL: `http://localhost:3000`

### 3. Run

**Node.js:**
```bash
pnpm dev
```

**Cloudflare Workers (local):**
```bash
pnpm dev:worker
```

Open http://localhost:3000

## Project Structure

```
app.tsx          - Hono routes and auth middleware setup
components.tsx   - JSX UI components (layout, cards, sidebar)
data.ts          - Static mock data for dashboard
toasts.ts        - Toast notification helpers
serve-node.ts    - Node.js server entry point
worker.ts        - Cloudflare Workers entry point
wrangler.toml    - Cloudflare Workers configuration
```

## Auth0 SDK Usage Demonstrated

| Feature | File | SDK API |
|---------|------|---------|
| Middleware setup | `app.tsx` | `auth0({ authRequired: false })` |
| Route protection | `app.tsx` | `requiresAuth()` |
| User claims | `app.tsx` | `c.var.auth0.user` |
| Session data | `app.tsx` | `getSession(c)` |
| Access tokens | `app.tsx` | `getAccessToken(c)` |
| Login callback hook | `app.tsx` | `onCallback` |
| Error handling | `app.tsx` | `LoginRequiredError`, `AccessDeniedError` |
| TypeScript types | `components.tsx` | `Auth0User`, `OIDCEnv` |
