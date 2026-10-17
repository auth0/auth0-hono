/**
 * Ensures the value does not have a leading slash.
 * If it does, it will trim it.
 * @param value The value to ensure has no leading slash.
 * @returns The value without a leading slash.
 */
function ensureNoLeadingSlash(value: string) {
  return value && value.startsWith('/') ? value.substring(1, value.length) : value;
}

/**
 * Ensures the value has a trailing slash.
 * If it does not, it will append one.
 * @param value The value to ensure has a trailing slash.
 * @returns The value with a trailing slash.
 */
function ensureTrailingSlash(value: string) {
  return value && !value.endsWith('/') ? `${value}/` : value;
}

/**
 * Utility function to ensure Route URLs are created correctly when using both the root and subpath as base URL.
 * @param url The URL to use.
 * @param base The base URL to use.
 * @returns A URL object, combining the base and url.
 */
export function createRouteUrl(url: string, base: string) {
  return new URL(ensureNoLeadingSlash(url), ensureTrailingSlash(base));
}

/**
 * Builds a callback URL using the baseURL's origin (protocol + host) combined with
 * the request's pathname and search. This ensures reverse proxies that strip TLS
 * don't cause redirect_uri mismatches.
 *
 * When behind a reverse proxy (e.g., AWS ALB), the incoming request URL may have
 * the wrong protocol (http instead of https) or host. This helper extracts the
 * pathname+search from the request and combines them with the configured baseURL's
 * origin, ensuring the callback URL matches the redirect_uri sent to Auth0.
 *
 * @param requestUrl The request URL as seen by Hono (may have wrong protocol/host from proxy)
 * @param baseURL The configured base URL (has correct protocol/host/port)
 * @returns A URL whose origin comes from baseURL and pathname+search from the request
 */
export function createCallbackUrl(requestUrl: string, baseURL: string): URL {
  const baseUrlObj = new URL(baseURL);
  const requestUrlObj = new URL(requestUrl);

  // Use baseURL's origin (protocol + host + port) with request's pathname + search
  return new URL(`${baseUrlObj.origin}${requestUrlObj.pathname}${requestUrlObj.search}`);
}

/**
 * Function to ensure a redirect URL is safe to use, as in, it has the same origin as the safeBaseUrl.
 * @param dangerousRedirect The redirect URL to check.
 * @param safeBaseUrl The base URL to check against.
 * @returns A safe redirect URL or undefined if the redirect URL is not safe.
 */
export function toSafeRedirect(dangerousRedirect: string, safeBaseUrl: string): string | undefined {
  let url: URL;

  try {
    url = createRouteUrl(dangerousRedirect, safeBaseUrl);
  } catch {
    return undefined;
  }

  if (url.origin === new URL(safeBaseUrl).origin) {
    return url.toString();
  }

  return undefined;
}
