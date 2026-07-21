# Red Team Security Audit — @auth0/auth0-hono

**Date**: 2026-05-29  
**Methodology**: 5 independent red team iterations, 3-expert quorum per iteration (15 expert perspectives)  
**Scope**: Full SDK source (~3640 lines TypeScript) + upstream @auth0/auth0-server-js boundary analysis  
**Classification**: Internal — Do Not Distribute

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 4 |
| Medium | 9 |
| Low/Informational | 5 |
| **Total** | **18** |

No critical remote code execution or authentication bypass found. Primary risk areas: **open redirects**, **session lifecycle gaps**, **multi-tenant isolation failures**, and **boundary mismatches with upstream server-js**.

---

## High Severity

### VULN-1: Open Redirect via Unvalidated `appState.returnTo`

- **Location**: `src/middleware/callback.ts:132-135`
- **Category**: CWE-601 Open Redirect
- **Attack Vector**: `appState.returnTo` extracted from OIDC provider response is used directly in `c.redirect(finalURL)` without passing through `toSafeRedirect()`. An attacker who controls the appState (via compromised IdP response or state manipulation) can redirect users to a malicious domain after successful login.
- **Impact**: Credential phishing, session token theft via controlled redirect target.
- **Evidence**:
  ```typescript
  const finalURL =
    (params.redirectAfterLogin ? toSafeRedirect(params.redirectAfterLogin, baseURL) : undefined) ??
    appState?.returnTo ??  // <-- NOT VALIDATED
    baseURL;
  return c.redirect(finalURL);
  ```
- **Recommendation**:
  ```typescript
  const finalURL =
    (params.redirectAfterLogin ? toSafeRedirect(params.redirectAfterLogin, baseURL) : undefined) ??
    toSafeRedirect(appState?.returnTo ?? '', baseURL) ??
    baseURL;
  ```

---

### VULN-2: Missing HttpOnly Flag Enforcement on Session Cookies

- **Location**: `src/session/HonoCookieHandler.ts:setCookie()`
- **Category**: CWE-614 Sensitive Cookie Without HttpOnly
- **Attack Vector**: `HonoCookieHandler.setCookie()` passes through upstream options without enforcing `httpOnly: true`. If `@auth0/auth0-server-js` changes behavior or omits the flag, session cookies become accessible to JavaScript via `document.cookie`.
- **Impact**: XSS attacks can exfiltrate session cookies for account takeover.
- **Evidence**:
  ```typescript
  setCookie(name: string, value: string, options?: CookieSerializeOptions, storeOptions?: Context): string {
    const cookieOptions: CookieOptions | undefined = options
      ? {
          ...options,  // No httpOnly enforcement
          sameSite: options.sameSite ? capitalize(options.sameSite) : undefined,
        }
      : undefined;
  ```
  Contrast with `silentLogin.ts` which explicitly sets `httpOnly: true`.
- **Recommendation**: Force `httpOnly: true` on all session-related cookies:
  ```typescript
  const cookieOptions: CookieOptions | undefined = options
    ? { ...options, httpOnly: true, sameSite: ... }
    : { httpOnly: true };
  ```

---

### VULN-13: Cookie `deleteCookie` Signature Mismatch with server-js Interface

- **Location**: `src/session/HonoCookieHandler.ts:deleteCookie()` vs `@auth0/auth0-server-js CookieHandler`
- **Category**: CWE-459 Incomplete Cleanup
- **Attack Vector**: The `CookieHandler` interface in server-js defines `deleteCookie(name, storeOptions?, options?)` with 3 parameters. `HonoCookieHandler` only accepts 2 (`name`, `storeOptions`), silently dropping `CookieSerializeOptions`. When `StatelessStateStore` calls `deleteCookie(key, options, cookieOpts)`, the third argument containing `sameSite`, `secure`, and `domain` attributes is lost. Chrome 118+ scheme-bound cookies require exact attribute match for deletion.
- **Impact**: Old session cookie chunks persist after rotation. Session fixation — attacker replays captured old session cookies that were never properly deleted.
- **Evidence**:
  ```typescript
  // server-js interface (auth0-server-js/src/store/cookie-handler.ts:64)
  deleteCookie: (name: string, storeOptions?: TStoreOptions, options?: CookieSerializeOptions) => void

  // auth0-hono implementation (MISSING third param)
  deleteCookie(name: string, storeOptions?: Context): void {
    // options parameter silently dropped
  }
  ```
- **Recommendation**:
  ```typescript
  deleteCookie(name: string, storeOptions?: Context, options?: CookieSerializeOptions): void {
    const ctx = this.getContext(storeOptions);
    const resolvedOptions = options ?? this.cookieOptionsCache.get(name);
    const cookieOptions: CookieOptions = {
      path: resolvedOptions?.path ?? '/',
      maxAge: 0,
      sameSite: resolvedOptions?.sameSite,
      secure: resolvedOptions?.secure,
      domain: resolvedOptions?.domain,
    };
    setCookie(ctx, name, '', cookieOptions);
  }
  ```

---

### VULN-11: CRLF Header Injection via `forwardAuthorizationParams`

- **Location**: `src/middleware/login.ts:123-128`
- **Category**: CWE-113 HTTP Response Splitting
- **Attack Vector**: Query parameters forwarded to the authorization URL via `forwardAuthorizationParams` are not validated for CRLF characters (`\r\n`). If configuration allows forwarding `login_hint` or custom params, an attacker can inject: `/auth/login?login_hint=user%0D%0ASet-Cookie:%20admin=true`. The injected value ends up in the Location header redirect.
- **Impact**: Response header injection enabling Set-Cookie injection, cache poisoning, XSS via injected headers.
- **Evidence**:
  ```typescript
  for (const param of forwardParams) {
    if (BLOCKED_FORWARD_PARAMS.has(param)) continue;
    const value = c.req.query(param);
    if (value) {
      const normalizedValue = Array.isArray(value) ? value[0] : value;
      paramsFromQuery[param] = normalizedValue;  // No CRLF validation
    }
  }
  ```
- **Recommendation**:
  ```typescript
  if (value) {
    const normalizedValue = Array.isArray(value) ? value[0] : value;
    if (/[\r\n]/.test(normalizedValue)) {
      debug(`Blocked param "${param}" containing CRLF characters`);
      continue;
    }
    paramsFromQuery[param] = normalizedValue;
  }
  ```

---

## Medium Severity

### VULN-7: Cookie Options Cache Singleton Contamination

- **Location**: `src/session/HonoCookieHandler.ts:66`
- **Category**: CWE-362 Race Condition / Multi-Tenant Isolation
- **Attack Vector**: `cookieOptionsCache` is an instance-level `Map` that persists across all requests. In multi-tenant deployments with different cookie attributes per tenant, last-write-wins causes `deleteCookie()` to use wrong tenant's options.
- **Impact**: Cross-tenant session persistence; cookies survive deletion.
- **Recommendation**: Make cache request-scoped or compute options from config on deletion.

---

### VULN-8: Configuration Cache Collision via JSON.stringify

- **Location**: `src/config/index.ts:48-56`
- **Category**: CWE-706 Use of Incorrectly-Resolved Name
- **Attack Vector**: Tier-2 config cache uses `JSON.stringify(config)` as key. Two configs with identical serializable fields but different function fields (debug, onCallback) share same cache entry, causing wrong hooks to execute.
- **Impact**: Cross-tenant configuration poisoning in multi-tenant deployments.
- **Recommendation**: Include `domain + clientID` as explicit cache discriminators or use cryptographic hash.

---

### VULN-9: Init Race Condition on Cold Start

- **Location**: `src/auth.ts:85-86`
- **Category**: CWE-362 TOCTOU Race Condition
- **Attack Vector**: Non-atomic `if (!initPromise) { initPromise = ... }` allows two concurrent cold-start requests to create separate OIDC client instances.
- **Impact**: Multiple client instances with potentially different env bindings in multi-tenant Workers.
- **Recommendation**: Use `initPromise ??= Promise.resolve().then(...)` (logical assignment is atomic in JS event loop).

---

### VULN-14: Unbounded Cookie Options Cache Growth (DoS)

- **Location**: `src/session/HonoCookieHandler.ts:66`
- **Category**: CWE-400 Uncontrolled Resource Consumption
- **Attack Vector**: `cookieOptionsCache` Map grows without limit. Stateless session chunking creates cookies like `appSession.0`, `appSession.1`, etc. Dynamic cookie names exhaust memory over time.
- **Impact**: OOM crash in long-running server processes.
- **Recommendation**: Implement LRU eviction (max 100 entries) or compute options on-the-fly.

---

### VULN-15: Transaction Cookie Not Deleted on Logout

- **Location**: `src/middleware/logout.ts`
- **Category**: CWE-459 Incomplete Cleanup
- **Attack Vector**: `client.logout()` only deletes state store session cookie, not `__a0_tx` transaction cookie containing PKCE `codeVerifier`. Persisted codeVerifier enables post-logout session hijacking if attacker captures the cookie.
- **Impact**: Post-logout replay attack with captured transaction cookie.
- **Recommendation**: Explicitly delete transaction cookie in logout handler.

---

### VULN-16: Session Cache Not Invalidated After Logout

- **Location**: `src/middleware/logout.ts`
- **Category**: CWE-613 Insufficient Session Expiration
- **Attack Vector**: After `client.logout()` succeeds, `__auth0_session_cache` context variable still holds old session data. Downstream handlers in same request can read stale tokens.
- **Impact**: Token reuse within request lifecycle after logout.
- **Recommendation**: Call `invalidateSessionCache(c)` after logout.

---

### VULN-25: Capture Interceptor Re-entry Overwrites Session Data

- **Location**: `src/session/captureRegistry.ts:48-67`
- **Category**: CWE-362 Reentrancy
- **Attack Vector**: If `onCallback` hook calls `updateSession()` → `stateStore.set()`, the capture interceptor overwrites the WeakMap entry with the enriched session instead of the original OAuth session data.
- **Impact**: Wrong session state captured; double-enrichment or enrichment data loss.
- **Recommendation**: Use a stack or guard flag to prevent overwrite during nested calls.

---

### VULN-3: Sensitive Token Exposure in Error Causes

- **Location**: `src/errors/Auth0Error.ts` + `src/errors/errorMap.ts`
- **Category**: CWE-532 Information Exposure Through Log Files
- **Attack Vector**: `mapServerError()` wraps upstream errors as `cause` without redacting sensitive fields (tokens, secrets). Error handlers/observability tools log full cause chain.
- **Impact**: Token/secret leakage to logging infrastructure.
- **Recommendation**: Sanitize cause objects before storing — redact fields matching `token`, `secret`, `key` patterns.

---

### VULN-19: Type Coercion Bypass in org_id Comparison

- **Location**: `src/middleware/requiresOrg.ts:70`
- **Category**: CWE-697 Incorrect Comparison
- **Attack Vector**: `orgId !== options.orgId` uses strict equality. If token contains numeric `org_id` (e.g., `12345`) and middleware expects string `"12345"`, check passes incorrectly or fails when it shouldn't.
- **Impact**: Organization membership bypass.
- **Recommendation**: Normalize: `String(orgId) !== String(options.orgId)`

---

## Low / Informational

### VULN-4: Unsanitized Claim Names in Error Descriptions

- **Location**: `src/middleware/claims.ts:39-40`
- **Vector**: Claim names/values reflected in JSON error body via `JSON.stringify(value)`
- **Impact**: Minor information disclosure; potential XSS if error pages render HTML

### VULN-5: Debug Function Can Expose Sensitive Config

- **Location**: `src/config/Schema.ts:85-86`
- **Vector**: Developer overriding `debug` with `console.log` exposes internal state
- **Impact**: Configuration/token leakage in production logs

### VULN-6: Nonce Reuse Risk with Stateless Sessions

- **Location**: `src/lib/client.ts` (StatelessStateStore path)
- **Vector**: No explicit nonce invalidation after successful callback
- **Impact**: Theoretical token replay if nonce is reused

### VULN-17: Cookie Chunk Deletion Metadata Leakage

- **Location**: upstream `auth0-server-js` StatelessStateStore
- **Vector**: Number of Set-Cookie deletion headers reveals session size changes
- **Impact**: Behavioral analysis of session mutation patterns

### VULN-23: Silent Login Timing Oracle

- **Location**: `src/middleware/silentLogin.ts:89-120`
- **Vector**: Timing differences between authenticated/unauthenticated paths
- **Impact**: Session state inference; user enumeration

---

## Areas Confirmed Secure

| Area | Verification |
|------|-------------|
| PKCE + State validation | Delegated to server-js; cryptographically sound |
| WeakMap session capture | Per-request Context keys; auto-GC; no cross-contamination |
| Reserved field protection | `RESERVED_FIELDS` Set correctly filters in `updateSession()` |
| SameSite cookie default | `Lax` prevents CSRF |
| `toSafeRedirect` (user input) | Origin check is strict for direct user-provided URLs |
| Backchannel logout | Content-type + token validation + delegation to server-js |
| `idTokenSigningAlg != 'none'` | Zod refine blocks algorithm downgrade |
| Domain validation | Regex prevents malformed domains |
| Secret minimum length | Zod enforces `min(32)` on session secret |

---

## Priority Remediation Order

| Priority | Vuln | Effort | Risk Reduction |
|----------|------|--------|----------------|
| 1 | VULN-13 (deleteCookie signature) | Low | High — fixes session fixation |
| 2 | VULN-1 (appState redirect) | Low | High — one-line fix |
| 3 | VULN-11 (CRLF injection) | Low | High — add regex check |
| 4 | VULN-2 (HttpOnly) | Low | High — defense in depth |
| 5 | VULN-15 (tx cookie cleanup) | Medium | Medium — logout hardening |
| 6 | VULN-7/8 (multi-tenant isolation) | Medium | Medium — affects Workers deployments |
| 7 | VULN-16 (cache invalidation) | Low | Medium — one-line fix |
| 8 | VULN-25 (interceptor re-entry) | Medium | Medium — composition safety |
| 9 | VULN-9 (init race) | Low | Low — use ??= |
| 10 | VULN-14 (cache growth) | Low | Low — add LRU |

---

## Methodology Notes

- **Iteration 1**: Protocol, Application Layer, Supply Chain experts
- **Iteration 2**: Timing/Concurrency, Injection/Parsing, Deployment/Environment experts
- **Iteration 3**: Cryptographic/Key Management, Authorization Bypass, Client-Side/Browser experts
- **Iteration 4**: Upstream Dependency, Session Lifecycle, DoS/Resource Exhaustion experts (with server-js source)
- **Iteration 5**: Semantic Gap, Composition, Spec Compliance experts (with server-js source)

Each iteration received prior findings to prevent duplicate discovery and force novel attack angle exploration.

---

*Generated by automated red team analysis. Findings require manual validation before remediation.*
