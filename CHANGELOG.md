# Change Log

## [v2.0.0-beta.0](https://github.com/auth0/auth0-hono/tree/v2.0.0-beta.0) (2026-05-29)

**Added**
- feat: beta release - OIDC helpers, authorization middleware, typed errors, multi-runtime support [#17](https://github.com/auth0/auth0-hono/pull/17) ([tusharpandey13](https://github.com/tusharpandey13))

**Fixed**
- fix: resolve 404 on redirect due to next() poisoning (callback, logout) [#20](https://github.com/auth0/auth0-hono/pull/20) ([tusharpandey13](https://github.com/tusharpandey13))
- fix(security): harden config cache, block max_age, document accepted risks [#23](https://github.com/auth0/auth0-hono/pull/23) ([tusharpandey13](https://github.com/tusharpandey13))
- fix(callback): replace per-request monkey-patch with WeakMap capture [#28](https://github.com/auth0/auth0-hono/pull/28) ([tusharpandey13](https://github.com/tusharpandey13))
- fix: Security hardening [#29](https://github.com/auth0/auth0-hono/pull/29) ([tusharpandey13](https://github.com/tusharpandey13))
