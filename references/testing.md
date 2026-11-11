# Testing

- **Framework:** Vitest 3, `environment: 'node'` (`vitest.config.ts`). The `@` alias resolves to `src/`.
- **Locations:** `test/**/*.test.ts` and `test/**/*.spec.ts`.
- **Coverage:** `@vitest/coverage-v8`; `npm run test:coverage`. No coverage threshold is configured.
- **Credentials:** the default `npm test` suite needs none and makes no network calls. No live-tenant test tier was detected.

## Layout

| Path | What it covers |
|------|----------------|
| `test/<area>/*.test.ts` | Unit tests mirroring `src/` (`middleware/`, `helpers/`, `config/`, `errors/`, `session/`, `stores/`, `utils/`) |
| `test/flows/*.spec.ts` | End-to-end middleware flows through a real `Hono` app with `@auth0/auth0-server-js` mocked (auth flow, authorization, hooks, token dedup) |
| `test/integration/*.test.ts` | In-process tests against the real `StatelessStateStore` and an in-memory cookie handler; not a live tenant |
| `test/fixtures/index.ts` | Shared factories: `createMockContext`, `createMockClient`, `createMockConfig`, `createMockSession`, `createMapServerErrorMock` |
| `test/mocks/stateStore.mock.ts` | Mock state store |
| `test/__snapshots__/` | Vitest snapshots (`config.test.ts`) |

## Conventions

- Tests import from `../../src/...` relative paths (not the `@/` alias).
- `describe` per unit, `it('does X when Y')`, `beforeEach`/`afterEach` to reset mocks.
- Use fixture factories instead of hand-built mock contexts so shape changes stay in one place.
- Mock `@auth0/auth0-server-js`, `hono/adapter` (`env`) and `hono/cookie` with `vi.mock` for unit and flow tests.
- When a bug involves the real state store (e.g. `internal.createdAt` being dropped), add a test under `test/integration/` using the real `StatelessStateStore`; fully mocked tests have hidden such bugs before.
- Test secrets are obvious fakes (`test_client_secret_xxx…`, 32+ char strings for encryption keys). Never paste real credentials.
- Update snapshots deliberately (`npx vitest run -u`) and review the diff.
