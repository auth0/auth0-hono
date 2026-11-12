# Commands

All commands run from the repo root. Use Node from `.nvmrc` (v22) and `npm` (the lockfile is `package-lock.json`).

```bash
# Install exactly what the lockfile pins (CI does this). `prepare` also builds and installs Husky hooks.
npm ci

# Lint (CI)
npm run lint
npm run lint:fix        # auto-fix

# Build (CI): tsc, then tsc-alias rewrites the `@/` paths in dist/
npm run build

# Tests (CI)
npm test                # vitest run
npm run test:watch      # vitest in watch mode
npm run test:coverage   # vitest run --coverage (v8; text + html reports in coverage/)
npm run test:ui         # vitest --ui

# Single file or test name
npx vitest run test/middleware/requiresAuth.test.ts
npx vitest run -t "name fragment"

# Commit message check (CI runs this on PR commits; Husky runs it per commit)
echo "fix(callback): handle X" | npx --no-install commitlint --verbose
```

## Example apps

The examples are not part of lint, build or the root test run.

```bash
# Root-level scripts read examples/.env (copy your values there first)
npm run example:basic           # tsx watch examples/basic/index.ts
npm run example:auth-required   # tsx watch examples/auth-required/index.tsx

# Demo app: its own package.json, README and tests (the demo README uses pnpm)
cd examples/demo
pnpm install
pnpm run dev            # Node
pnpm run dev:worker     # Cloudflare Workers via wrangler
pnpm test               # vitest run (examples/demo/test/)
```

## Notes

- `npm run build` is required before anything that imports from `dist/`; the package `main` points at `dist/index.js`.
- The `lint` script passes `--ext .ts`; with the flat `eslint.config.js` this flag is not needed but is harmless. Lint runs over the whole repo except `examples/` and git-ignored paths.
