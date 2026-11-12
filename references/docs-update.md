# Docs Update Rules

A PR that changes public API, configuration or integration patterns is not complete until the docs below are updated in the same PR. This is a library (npm package), so the mapping is by exported symbol and config option.

## Tracked docs

| Doc | Covers | Exists |
|-----|--------|--------|
| `README.md` | Install, quick start, configuration and env vars, middleware and helper reference, hooks, error classes, session stores, multi-runtime support, TypeScript types, troubleshooting | present |
| `EXAMPLES.md` | Not used by this repo; usage examples live in `README.md` and `examples/` | ❌ missing |
| `examples/basic`, `examples/auth-required` | Minimal runnable apps (run with `npm run example:*`) | present |
| `examples/demo` (+ `README.md`) | Full Node + Cloudflare Workers demo app with its own tests | present |

## Code to docs

| If you change… | Update… |
|----------------|---------|
| An export in `src/index.ts` (middleware, helper, error class, type) | `README.md` section for that symbol ("Middleware Reference", "Helpers", "Error Handling", "TypeScript") |
| `src/config/Schema.ts` / `Configuration.ts` / `envConfig.ts` (options, env vars, defaults) | `README.md` "Configuration" (env var table and explicit configuration) |
| `src/stores/KVSessionStore.ts` or `src/types/session.ts` | `README.md` "Session Stores"; `examples/demo/stores.ts` if it uses it |
| `src/errors/` (new or changed error, status, or code) | `README.md` "Error Handling" / "Error Classes" |
| `onCallback` hook behavior (`src/middleware/callback.ts`) | `README.md` "Hooks" |
| Runtime support (APIs used in `src/`) | `README.md` "Multi-Runtime Support" |
| Behavior shown in `examples/` | The affected example app and, for the demo, `examples/demo/README.md` |

When you touch code that maps to a doc above, update that doc in the same PR.
