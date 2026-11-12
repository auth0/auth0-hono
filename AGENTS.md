# AI Agent Guidelines for auth0-hono

## Your Role

You are a TypeScript SDK engineer working on `@auth0/auth0-hono`, Auth0 authentication middleware for Hono. You write small, well-tested code that runs on Node.js, Cloudflare Workers, Bun and Deno.

---

## Project Structure

```
src/
├── index.ts          # Public API barrel: everything exported to consumers
├── auth.ts           # auth0() middleware: config init, mounts login/callback/logout routes
├── config/           # Zod schema, Configuration, env resolution (via hono/adapter env(c))
├── middleware/       # login, callback, logout, backchannelLogout, requiresAuth/Org/Scopes, claims, silentLogin, auth0ErrorHandler
├── helpers/          # getSession, getUser, updateSession, getAccessToken, getAccessTokenForConnection
├── session/          # HonoCookieHandler, captureRegistry (concurrency-safe session capture)
├── stores/           # KVSessionStore (Cloudflare KV-style stateful sessions)
├── errors/           # Auth0Error (extends HTTPException) + typed subclasses, errorMap
├── lib/              # client.ts (ServerClient setup), constants.ts, honoEnv.ts (OIDCEnv types)
├── types/            # Auth0Context, Auth0Session, SessionStore types
└── utils/            # toSafeRedirect/createRouteUrl, redact (debug-log redaction)
test/                 # Vitest: unit tests mirror src/, plus flows/ and integration/ (in-process)
examples/             # basic/, auth-required/, demo/ (Node + Workers app); not linted or built by root scripts
.github/workflows/    # ci.yml (commitlint, lint, build, test), release.yml (npm publish on release/* PR merge)
```

Build output goes to `dist/` (generated, git-ignored). The only public entry points are `.` and `./lib/honoEnv` (see `exports` in `package.json`).

---

## Boundaries

### ✅ Always Do

- Run `npm run lint`, `npm run build` and `npm test` before committing. CI runs the same three.
- Make surgical changes: touch only what the request requires; don't refactor or reformat adjacent code.
- Follow existing style: single quotes, 120-column lines, `@/` import alias with `.js` extensions in `src/` (see [references/code-style.md](references/code-style.md)).
- Add unit tests for new behavior under `test/`, mirroring the `src/` path.
- Throw typed errors that extend `Auth0Error` (from `src/errors/`), never bare `Error` or ad-hoc `HTTPException` from request paths.
- Read environment variables through Hono's `env(c)` (`hono/adapter`), never `process.env`, so the SDK stays runtime-agnostic.
- Export every new public symbol from `src/index.ts`.
- Update `README.md` in the same PR when you change the public API, configuration options or supported integration patterns. Update the affected apps under `examples/` too (see [references/docs-update.md](references/docs-update.md)).
- Pass any value that reaches debug logs through `redactSecrets` (`src/utils/redact.ts`).

### ⚠️ Ask First

- **Any breaking change.** Stop and ask the maintainer before writing it.
- Adding or bumping dependencies in `package.json` (`@auth0/auth0-server-js` is the core runtime dependency).
- Changing public API signatures, `exports` in `package.json`, or the `hono` peer range.
- Changing CI/CD (`.github/workflows/`), `commitlint.config.cjs`, or the Husky hooks.
- Touching security-sensitive code: redirect validation (`toSafeRedirect`), cookie handling (`HonoCookieHandler`, `silentLogin`, `logout`), session encryption/stores, token refresh, or `redactSecrets`.
- Changing the shape of what's stored in the session (`src/types/session.ts`, `KVSessionStore`); existing sessions must keep decrypting.

### 🚫 Never Do

- Commit secrets, client secrets, session encryption keys, or `.env` / `.dev.vars` files.
- Edit generated or vendored output by hand: `dist/`, `node_modules/`, `coverage/`, `package-lock.json` (change it only via `npm install`/`npm ci` flows).
- Remove or skip failing tests (`it.skip`, `describe.skip`) without fixing the cause.
- Log or return raw tokens, cookies, secrets, `state`/`nonce`/`code_verifier`, or user PII.
- Use `process.env` or Node-only APIs (`node:*`, `fs`, `Buffer`) in `src/`; Workers and Deno must keep working. `src/` has none today.
- Hand-edit `.version` or the `version` in `package.json`; releases are cut through the release flow.
- Break backward compatibility without asking first and getting explicit approval.

---

## Security Considerations

- **Redirects:** every user-influenced redirect target (`returnTo`, `redirectAfterLogin`, `redirectAfterLogout`, error-handler redirects) must go through `toSafeRedirect(value, baseURL)` in `src/utils/util.ts` to prevent open redirects. Don't build redirect URLs from raw query params.
- **Login parameters:** `login.ts` never forwards the SDK-computed params in `BLOCKED_FORWARD_PARAMS` (`client_id`, `redirect_uri`, `response_type`, PKCE, `state`, …) from the query string, and drops values containing CR/LF/NUL. Don't remove entries or those checks.
- **Cookies:** session cookies default to `SameSite=lax` and `secure` follows an `https:` `baseURL` (`src/config/Schema.ts`); `HttpOnly` is enforced by `@auth0/auth0-server-js`, and `silentLogin`/`logout` set and clear the `__a0_tx` transaction cookie with `HttpOnly`. Don't weaken these defaults.
- **Secrets:** `AUTH0_CLIENT_SECRET` and `AUTH0_SESSION_ENCRYPTION_KEY` (32+ chars) come only from the runtime env or explicit config. Tests use obvious fake values.
- **Debug logging:** `AUTH0_DEBUG` enables a default logger; all metadata is redacted first (tokens, secrets, PII, OIDC params). New log calls must not bypass this.
- **Token handling:** access tokens are refreshed through `getAccessToken` with per-request deduplication of concurrent refreshes (`REFRESH_CACHE_KEY`). Don't add parallel refresh paths.
- **Reserved session fields:** `updateSession()` silently drops `user`, `idToken`, `refreshToken`, `tokenSets`, `connectionTokenSets`, `internal` (`RESERVED_FIELDS` in `src/lib/constants.ts`). Keep that list intact.
- Report vulnerabilities through Auth0's [Responsible Disclosure Program](https://auth0.com/responsible-disclosure-policy), not GitHub issues.

---

> The sections below are reference material. Read the linked file only when the task needs it.

## Commands

Core commands (exactly what CI runs after `npm ci`):

```bash
npm run lint     # eslint . --ext .ts
npm run build    # tsc && tsc-alias  (output in dist/)
npm test         # vitest run
```

See [references/commands.md](references/commands.md) for coverage, single-file runs, watch mode and the example apps. Read only when you need to run something beyond the three above.

## Testing

Vitest 3 on Node; tests live in `test/` (`*.test.ts`, `*.spec.ts`) and the default `npm test` suite runs with no credentials or network. See [references/testing.md](references/testing.md) for fixtures, mocking patterns and the flow/integration layout. Read when writing or fixing tests.

## Code Style

ESLint (`typescript-eslint` recommended + `eslint-config-prettier`) is the only CI-enforced check; Prettier settings are single quotes, 120-column width, ES5 trailing commas, always-parenthesized arrow params. See [references/code-style.md](references/code-style.md) for naming, import and error patterns. Read when adding new modules.

## Git Workflow

Commits must follow Conventional Commits; commitlint runs in the Husky `commit-msg` hook and on every PR in CI. Allowed types: `feat`, `fix`, `docs`, `chore`, `style`, `refactor`, `ci`, `test`, `revert`, `perf`, `vercel`. See [references/git-workflow.md](references/git-workflow.md) for branch naming and PR conventions. Read before opening a PR.

## Common Pitfalls

See [references/pitfalls.md](references/pitfalls.md) for repo-specific gotchas (`enableTelemetry`, example apps outside CI, dual version files, mocks hiding real store behavior). Read before touching config, sessions, examples or releases.

## Docs Update Rules

`README.md` is the only user-facing API doc and `examples/` holds runnable samples; both must change in the same PR as the code they describe. See [references/docs-update.md](references/docs-update.md) for the code-to-docs mapping. Read when your change touches public API or config.
