# Code Style

## Enforced by tooling

- **ESLint** (`eslint.config.js`): `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-config-prettier`. `examples/` and git-ignored paths are skipped. CI fails on lint errors. `@typescript-eslint/no-explicit-any` is on; test files that need `any` start with `/* eslint-disable @typescript-eslint/no-explicit-any */`.
- **TypeScript** (`tsconfig.json`): `strict`, target ES2022, `module`/`moduleResolution` `NodeNext`, `paths` `@/*` to `src/*`. Only `src/` is compiled.
- **Prettier** (`.prettierrc`): single quotes, `printWidth` 120, `trailingComma: 'es5'`, `arrowParens: 'always'`. Prettier is not run in CI or hooks, so match it by hand or with your editor.

## Conventions seen in `src/`

- **Imports:** `@/path/file.js` alias with an explicit `.js` extension (NodeNext resolution); sibling files in the same folder may use `./file.js`. `tsc-alias` rewrites the alias at build time.
- **Naming:** files `camelCase.ts` (`requiresAuth.ts`), classes and error types `PascalCase` (`HonoCookieHandler`, `MissingSessionError`), constants `UPPER_SNAKE_CASE` (`SESSION_CACHE_KEY`), error codes `snake_case` OAuth names (`invalid_grant`).
- **Middleware factories:** exported functions that return `async (c: Context<OIDCEnv>, next: Next) => {...}` (see `src/middleware/requiresAuth.ts`).
- **Errors:** subclasses of `Auth0Error` (which extends Hono's `HTTPException`) with `(description?, cause?)` constructors, an HTTP status, and an OAuth2 `code`. Map errors from `@auth0/auth0-server-js` through `src/errors/errorMap.ts`.
- **Config:** validated by a Zod schema in `src/config/Schema.ts`; defaults live in the schema, not at call sites.
- **Docs:** exported functions carry JSDoc with `@param`/`@example`; deprecated exports are marked `@deprecated` and point to the replacement (`auth` → `auth0`).
- **Request-scoped state:** stash per-request data on the Hono context via the keys in `src/lib/constants.ts`, not module-level variables (the SDK runs concurrent requests in one isolate).

## Example

✅ Good (mirrors `requiresAuth.ts`):

```ts
import { LoginRequiredError } from '@/errors/index.js';
import { getCachedSession } from '@/helpers/sessionCache.js';

export function requiresThing() {
  return async (c: Context<OIDCEnv>, next: Next) => {
    const session = await getCachedSession(c);
    if (!session) throw new LoginRequiredError('Authentication required');
    return next();
  };
}
```

❌ Bad:

```ts
import { LoginRequiredError } from '../errors/index'; // missing alias and .js extension
export async function requiresThing(c, next) {
  if (!process.env.AUTH0_DOMAIN) throw new Error('no domain'); // process.env and bare Error
  const session = await getSession(c);
  if (!session) return c.text('nope', 401); // bypasses auth0ErrorHandler
  return next();
}
```
