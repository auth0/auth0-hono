/** @jsx jsx */
/** @jsxImportSource hono/jsx */

import { Hono } from 'hono';
import { jsx } from 'hono/jsx';
import { jsxRenderer } from 'hono/jsx-renderer';
import {
  auth0,
  requiresAuth,
  getSession,
  getAccessToken,
  LoginRequiredError,
  AccessDeniedError,
  type OIDCEnv,
} from '@auth0/auth0-hono';
import {
  AppLayout, Card, Avatar, StatCard, ActivityTable,
  TeamCard, StatusBadge, getInitials,
} from './components.js';
import { ACTIVITY_DATA, TEAM_DATA, STATS } from './data.js';
import { eventToast, SDK, type ToastItem } from './toasts.js';


// app setup
const app = new Hono<OIDCEnv>();
app.use('*', jsxRenderer());


// use auth0 middleware
app.use('*', auth0({
  authRequired: false,
  onCallback: (c, error) => {
    if (!error) return c.redirect('/dashboard?t=login_success');
  },
}));

// ============================================================================
// Routes
// ============================================================================

/** Public landing page */
app.get('/', (c) => {
  const user = c.var.auth0?.user;
  const toasts: ToastItem[] = [SDK.auth0];
  const evt = eventToast(c.req.url);
  if (evt) toasts.unshift(evt);
  if (user) toasts.push(SDK.userClaims);

  return c.render(
    <AppLayout user={user} toasts={toasts}>
      <div class="page-wrapper" style={{ maxWidth: '640px' }}>
        <div style={{ paddingTop: '80px', paddingBottom: '40px' }}>
          <h1 style={{ fontSize: '40px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px', letterSpacing: '-0.5px' }}>
            Acme Corp
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)', marginBottom: '32px', lineHeight: '1.6' }}>
            Internal workspace for engineering, ops, and product teams.
            Powered by Auth0 authentication.
          </p>
          {!user ? (
            <a href="/auth/login" style={{ display: 'inline-block', padding: '8px 16px', backgroundColor: 'var(--accent)', color: '#fff', borderRadius: '4px', fontSize: '14px', fontWeight: '500', textDecoration: 'none' }}>
              Sign in
            </a>
          ) : (
            <a href="/dashboard" style={{ display: 'inline-block', padding: '8px 16px', backgroundColor: 'var(--accent)', color: '#fff', borderRadius: '4px', fontSize: '14px', fontWeight: '500', textDecoration: 'none' }}>
              Open Dashboard
            </a>
          )}
        </div>

        {!user && (
          <div class="grid-3" style={{ marginTop: '48px' }}>
            <Card>
              <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>Authentication</div>
              <p class="text-secondary">OAuth 2.0 / OIDC login with session cookies</p>
            </Card>
            <Card>
              <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>Session Management</div>
              <p class="text-secondary">Encrypted HTTP-only cookies, auto refresh</p>
            </Card>
            <Card>
              <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>Multi-Runtime</div>
              <p class="text-secondary">Works on Node.js and Cloudflare Workers</p>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
});

/** Protected dashboard — stats and activity */
app.get('/dashboard', requiresAuth(), async (c) => {
  const user = c.var.auth0?.user;
  if (!user) throw new LoginRequiredError();

  const toasts: ToastItem[] = [SDK.requiresAuth, SDK.userClaims, SDK.getSession];
  const evt = eventToast(c.req.url);
  if (evt) toasts.unshift(evt);

  return c.render(
    <AppLayout user={user} toasts={toasts} activePath="/dashboard">
      <div class="page-wrapper">
        <div class="page-header">
          <h1 class="page-title">Welcome back, {user.name || 'there'}</h1>
          <p class="page-subtitle">powered by requiresAuth · c.var.auth0.user · getSession</p>
        </div>

        <div class="grid-3">
          <StatCard label="Projects" value={String(STATS.projects)} />
          <StatCard label="Tasks" value={String(STATS.tasks)} />
          <StatCard label="Uptime" value={STATS.uptime} />
        </div>

        <Card title="Recent Activity">
          <ActivityTable rows={ACTIVITY_DATA} />
        </Card>
      </div>
    </AppLayout>
  );
});

/** Team directory — real user + fake colleagues */
app.get('/team', requiresAuth(), (c) => {
  const user = c.var.auth0?.user;
  if (!user) throw new LoginRequiredError();

  const toasts: ToastItem[] = [SDK.requiresAuth, SDK.userClaims, SDK.userPicture, SDK.emailVerified];

  return c.render(
    <AppLayout user={user} toasts={toasts} activePath="/team">
      <div class="page-wrapper">
        <div class="page-header">
          <h1 class="page-title">Team</h1>
          <p class="page-subtitle">powered by requiresAuth · user claims</p>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <div class="nav-section" style={{ marginBottom: '12px' }}>You</div>
          <TeamCard
            name={user.name || 'User'}
            role="Developer"
            avatar={getInitials(user.name)}
            isVerified={user.email_verified}
            picture={user.picture}
          />
        </div>

        <div>
          <div class="nav-section" style={{ marginBottom: '12px' }}>Colleagues</div>
          <div class="grid-2">
            {TEAM_DATA.map((member) => (
              <TeamCard name={member.name} role={member.role} avatar={member.avatar} isVerified={member.isVerified} />
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
});

/** Account settings — session, token, profile */
app.get('/settings', requiresAuth(), async (c) => {
  const user = c.var.auth0?.user;
  if (!user) throw new LoginRequiredError();

  const toasts: ToastItem[] = [SDK.requiresAuth, SDK.getSession];

  // Session info via getSession()
  const session = await getSession(c);
  const sessionActive = !!session;
  const tokenSetCount = session?.tokenSets?.length ?? 0;
  const hasIdToken = !!session?.idToken;
  const claimsCount = session?.user ? Object.keys(session.user).length : 0;

  // Access token via getAccessToken()
  let tokenStatus: 'connected' | 'expiring' | 'error' = 'error';
  let tokenExpiry: string | undefined;
  let tokenError: string | null = null;

  try {
    const tokenSet = await getAccessToken(c);
    if (tokenSet?.accessToken) {
      tokenStatus = 'connected';
      const exp = tokenSet.expiresAt;
      if (typeof exp === 'number' && exp > 0) {
        if ((exp - Math.floor(Date.now() / 1000)) / 3600 < 1) tokenStatus = 'expiring';
        tokenExpiry = new Date(exp * 1000).toLocaleString();
      }
    } else {
      tokenError = 'No access token available';
    }
    toasts.push(SDK.getAccessToken(tokenStatus !== 'error'));
  } catch (err: unknown) {
    tokenError = err instanceof Error ? err.message : 'Token retrieval failed';
    toasts.push(SDK.getAccessToken(false));
  }

  const Row = (p: { label: string; children: any }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div class="text-tertiary" style={{ fontSize: '13px' }}>{p.label}</div>
      <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{p.children}</div>
    </div>
  );

  return c.render(
    <AppLayout user={user} toasts={toasts} activePath="/settings">
      <div class="page-wrapper">
        <div class="page-header">
          <h1 class="page-title">Settings</h1>
          <p class="page-subtitle">powered by requiresAuth · getSession · getAccessToken</p>
        </div>

        <Card title="Profile">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Avatar user={user} size="lg" showBadge={true} />
            <div>
              <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>{user.name || 'User'}</div>
              <div class="text-secondary">{user.email}</div>
              {user.email_verified && (
                <div style={{ fontSize: '11px', color: 'var(--green)', marginTop: '4px' }}>Verified</div>
              )}
            </div>
          </div>
        </Card>

        <Card title="Session">
          <Row label="Status">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span class={`status-dot ${sessionActive ? 'success' : 'error'}`} />
              {sessionActive ? 'Active' : 'Inactive'}
            </div>
          </Row>
          <Row label="Token sets">{tokenSetCount}</Row>
          <Row label="ID token">{hasIdToken ? 'Present' : 'None'}</Row>
          <Row label="User claims">{claimsCount} fields</Row>
        </Card>

        <Card title="API Access">
          <Row label="Access token">
            <StatusBadge status={tokenStatus} label={tokenStatus === 'connected' ? 'Valid' : tokenStatus === 'expiring' ? 'Expiring' : 'Unavailable'} />
          </Row>
          {tokenExpiry && <Row label="Expires">{tokenExpiry}</Row>}
          {tokenError && (
            <div style={{ marginTop: '8px', padding: '8px 12px', backgroundColor: 'var(--toast-error-bg)', color: 'var(--toast-error-text)', borderRadius: '4px', fontSize: '12px' }}>
              {tokenError}
            </div>
          )}
        </Card>

        <Card title="Security">
          <a href="/auth/logout" style={{ color: 'var(--red)', fontWeight: '500', fontSize: '13px' }}>
            Sign out of Acme Corp
          </a>
        </Card>
      </div>
    </AppLayout>
  );
});

// ============================================================================
// Error handling
// ============================================================================

app.onError((err, c) => {
  if (err instanceof LoginRequiredError) return c.redirect('/auth/login');
  if (err instanceof AccessDeniedError) {
    return c.render(
      <AppLayout user={c.var.auth0?.user}>
        <div class="page-wrapper">
          <Card title="Access Denied">
            <p class="text-secondary">You do not have permission to access this resource.</p>
          </Card>
        </div>
      </AppLayout>
    );
  }
  return c.render(
    <AppLayout user={c.var.auth0?.user}>
      <div class="page-wrapper">
        <Card title="Something went wrong">
          <p class="text-secondary">An unexpected error occurred. Please try again.</p>
        </Card>
      </div>
    </AppLayout>
  );
});

export default app;
