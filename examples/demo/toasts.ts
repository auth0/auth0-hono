/**
 * Toast notification helpers for SDK operation feedback.
 * Internal — keeps app.tsx clean for demo purposes.
 */

export interface ToastItem {
  text: string;
  detail: string;
  variant: 'success' | 'info' | 'warning' | 'error';
}

/** Parse login event from URL query param */
export function eventToast(url: string): ToastItem | null {
  const t = new URL(url).searchParams.get('t');
  if (t === 'login_success') {
    return { text: 'Signed in', detail: 'Session cookie encrypted and stored', variant: 'success' };
  }
  return null;
}

/** Pre-built toasts for SDK operations */
export const SDK = {
  auth0: { text: 'auth0()', detail: 'Session loaded from encrypted cookie', variant: 'info' } as ToastItem,
  requiresAuth: { text: 'requiresAuth()', detail: 'Route protected — user verified', variant: 'info' } as ToastItem,
  getSession: { text: 'getSession()', detail: 'Full session data retrieved', variant: 'info' } as ToastItem,
  userClaims: { text: 'c.var.auth0.user', detail: 'User claims read from session', variant: 'info' } as ToastItem,
  userPicture: { text: 'user.picture', detail: 'Avatar loaded from OIDC claims', variant: 'info' } as ToastItem,
  emailVerified: { text: 'user.email_verified', detail: 'Verification status from identity provider', variant: 'info' } as ToastItem,
  getAccessToken: (ok: boolean): ToastItem => ok
    ? { text: 'getAccessToken()', detail: 'Access token valid', variant: 'success' }
    : { text: 'getAccessToken()', detail: 'Token unavailable', variant: 'error' },
};
