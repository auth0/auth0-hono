/** @jsx jsx */
/** @jsxImportSource hono/jsx */

import { jsx } from 'hono/jsx';
import type { Auth0User } from '@auth0/auth0-hono';
import type { ToastItem } from './toasts.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface AppLayoutProps {
  user?: Auth0User | null;
  toasts?: ToastItem[];
  activePath?: string;
  children: any;
}

export interface SidebarProps {
  user: Auth0User;
  activePath: string;
}

export interface CardProps {
  title?: string;
  children: any;
  className?: string;
}

export interface AvatarProps {
  user: Auth0User;
  size: 'sm' | 'md' | 'lg';
  showBadge?: boolean;
}

export interface StatCardProps {
  label: string;
  value: string;
  trend?: 'up' | 'down';
}

export interface ActivityTableProps {
  rows: Array<{ action: string; user: string; time: string }>;
}

export interface TeamCardProps {
  name: string;
  role: string;
  avatar: string;
  isVerified?: boolean;
  picture?: string;
}

export interface IntegrationCardProps {
  service: string;
  status: 'connected' | 'expiring' | 'error';
  tokenExpiry?: string;
}

export interface StatusBadgeProps {
  status: 'connected' | 'expiring' | 'error';
  label?: string;
}


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getInitials(name?: string): string {
  if (!name || name.trim() === '') return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function truncateToken(token: string): string {
  if (token.length <= 40) return token;
  const start = token.slice(0, 20);
  const end = token.slice(-20);
  return `${start}...${end}`;
}


// ============================================================================
// SVG ICON COMPONENTS
// ============================================================================

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  );
}

function PlugIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 7h-1V2h-2v5h-4V2H9v5H8C6.9 7 6 7.9 6 9v5.17l2 2V20h3v-3h2v3h3v-3.83l2-2V9c0-1.1-.9-2-2-2z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.03-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
    </svg>
  );
}

// ============================================================================
// MAIN COMPONENTS
// ============================================================================

export function AppLayout(props: AppLayoutProps) {
  const toasts = props.toasts || [];

  return (
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Acme Corp</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          {`
            :root {
              /* Backgrounds — Notion light */
              --bg-primary: #ffffff;
              --bg-surface: #f7f7f5;
              --bg-hover: #efefef;
              --bg-active: #f1f1ef;

              /* Text — Notion light */
              --text-primary: #37352f;
              --text-secondary: #787774;
              --text-tertiary: #9b9a97;

              /* Borders */
              --border: rgba(55,53,47,0.09);

              /* Status colors */
              --accent: #2383e2;
              --green: #0f7b6c;
              --amber: #d9730d;
              --red: #e03e3e;

              /* Toast */
              --toast-success-bg: #dbeddb;
              --toast-success-text: #1a5c1a;
              --toast-info-bg: #d3e5ef;
              --toast-info-text: #183b56;
              --toast-warning-bg: #fdecc8;
              --toast-warning-text: #6b3a00;
              --toast-error-bg: #ffe2dd;
              --toast-error-text: #6e1717;
            }

            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }

            html, body {
              width: 100%;
              height: 100%;
            }

            body {
              background-color: var(--bg-primary);
              color: var(--text-primary);
              font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              font-size: 13px;
              line-height: 1.5;
            }

            h1 { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
            .page-title-hero { font-size: 28px; font-weight: 700; }
            .nav-section { font-size: 11px; text-transform: uppercase; color: var(--text-tertiary); }
            .nav-item { font-size: 14px; }

            .card {
              background-color: var(--bg-surface);
              border-radius: 8px;
              padding: 16px;
            }

            .card:hover {
              background-color: var(--bg-hover);
            }

            .sidebar-item {
              padding: 8px 12px;
              border-radius: 4px;
              font-size: 14px;
              color: var(--text-secondary);
              transition: background-color 0.2s;
              display: flex;
              align-items: center;
              gap: 10px;
              text-decoration: none;
            }

            .sidebar-item:hover {
              background-color: var(--bg-hover);
            }

            .sidebar-item.active {
              background-color: var(--bg-active);
              color: var(--accent);
            }

            .status-dot {
              display: inline-block;
              width: 8px;
              height: 8px;
              border-radius: 50%;
            }

            .status-dot.success { background-color: var(--green); }
            .status-dot.warning { background-color: var(--amber); }
            .status-dot.error { background-color: var(--red); }

            /* Toast animations */
            @keyframes slideIn {
              from {
                transform: translateX(400px);
                opacity: 0;
              }
              to {
                transform: translateX(0);
                opacity: 1;
              }
            }

            @keyframes fadeOut {
              from { opacity: 1; }
              to { opacity: 0; }
            }

            .toast-container {
              position: fixed;
              top: 24px;
              right: 24px;
              z-index: 1000;
              display: flex;
              flex-direction: column;
              gap: 12px;
              max-width: 400px;
            }

            .toast {
              padding: 12px 16px;
              border-radius: 8px;
              font-size: 13px;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.05);
              min-width: 260px;
              opacity: 0;
              animation: slideIn 0.3s ease-out forwards, fadeOut 0.5s ease-in 5s forwards;
            }

            .toast.success { background-color: var(--toast-success-bg); color: var(--toast-success-text); }
            .toast.warning { background-color: var(--toast-warning-bg); color: var(--toast-warning-text); }
            .toast.info { background-color: var(--toast-info-bg); color: var(--toast-info-text); }
            .toast.error { background-color: var(--toast-error-bg); color: var(--toast-error-text); }

            /* Layout */
            .app-container {
              display: flex;
              min-height: 100vh;
            }

            .sidebar {
              width: 256px;
              background-color: var(--bg-surface);
              border-right: 1px solid var(--border);
              padding: 16px;
              flex-shrink: 0;
            }

            .sidebar-header {
              display: flex;
              align-items: center;
              gap: 12px;
              margin-bottom: 24px;
              padding-bottom: 16px;
              border-bottom: 1px solid var(--border);
            }

            .sidebar-header-text {
              font-size: 14px;
              font-weight: 600;
              color: var(--text-primary);
            }

            .sidebar-section {
              margin-bottom: 24px;
            }

            .sidebar-section-label {
              font-size: 11px;
              text-transform: uppercase;
              color: var(--text-tertiary);
              margin-bottom: 12px;
              font-weight: 600;
              letter-spacing: 0.5px;
            }

            .sidebar-section nav {
              display: flex;
              flex-direction: column;
              gap: 4px;
            }

            .main-content {
              flex: 1;
              overflow-auto;
            }

            .page-wrapper {
              max-width: 1200px;
              margin: 0 auto;
              padding: 32px 24px;
            }

            .page-header {
              margin-bottom: 32px;
            }

            .page-title {
              font-size: 28px;
              font-weight: 700;
              margin-bottom: 8px;
              color: var(--text-primary);
            }

            .page-subtitle {
              font-size: 11px;
              color: var(--text-tertiary);
              font-style: italic;
            }

            /* Grid layouts */
            .grid-3 {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
              gap: 24px;
              margin-bottom: 24px;
            }

            .grid-2 {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
              gap: 24px;
              margin-bottom: 24px;
            }

            .stat-card {
              background-color: var(--bg-surface);
              border-radius: 8px;
              padding: 20px;
              margin-bottom: 24px;
            }

            .stat-card-label {
              font-size: 11px;
              color: var(--text-tertiary);
              text-transform: uppercase;
              margin-bottom: 8px;
            }

            .stat-card-value {
              font-size: 24px;
              font-weight: 600;
              color: var(--text-primary);
            }

            /* Table styles */
            table {
              width: 100%;
              border-collapse: collapse;
              color: var(--text-primary);
            }

            thead {
              border-bottom: 1px solid var(--border);
            }

            th {
              text-align: left;
              padding: 12px 0;
              font-size: 11px;
              font-weight: 600;
              color: var(--text-tertiary);
              text-transform: uppercase;
            }

            td {
              padding: 12px 0;
              border-bottom: 1px solid var(--border);
              font-size: 13px;
            }

            tr:hover td {
              background-color: var(--bg-active);
            }

            /* Avatar styles */
            .avatar {
              display: flex;
              align-items: center;
              justify-content: center;
              border-radius: 50%;
              font-weight: 600;
              flex-shrink: 0;
              position: relative;
            }

            .avatar.sm {
              width: 24px;
              height: 24px;
              font-size: 11px;
            }

            .avatar.md {
              width: 32px;
              height: 32px;
              font-size: 13px;
            }

            .avatar.lg {
              width: 40px;
              height: 40px;
              font-size: 14px;
            }

            .avatar-img {
              width: 100%;
              height: 100%;
              border-radius: 50%;
              object-fit: cover;
            }

            .avatar.initials {
              background-color: var(--accent);
              color: #fff;
            }

            .avatar-badge {
              position: absolute;
              bottom: 0;
              right: 0;
              width: 8px;
              height: 8px;
              border-radius: 50%;
              background-color: var(--green);
              border: 2px solid var(--bg-primary);
            }

            /* Team card */
            .team-card {
              background-color: var(--bg-surface);
              border-radius: 8px;
              padding: 16px;
              margin-bottom: 24px;
              display: flex;
              align-items: center;
              gap: 16px;
            }

            .team-card-content {
              flex: 1;
            }

            .team-card-name {
              font-size: 14px;
              font-weight: 600;
              color: var(--text-primary);
              margin-bottom: 4px;
            }

            .team-card-role {
              font-size: 12px;
              color: var(--text-secondary);
              display: flex;
              align-items: center;
              gap: 8px;
            }

            /* Integration card */
            .integration-card {
              background-color: var(--bg-surface);
              border-radius: 8px;
              padding: 16px;
              margin-bottom: 24px;
            }

            .integration-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 12px;
            }

            .integration-title {
              font-size: 14px;
              font-weight: 600;
              color: var(--text-primary);
            }

            .integration-details {
              font-size: 12px;
              color: var(--text-secondary);
            }

            /* Buttons and links */
            a {
              color: var(--accent);
              text-decoration: none;
              transition: color 0.2s;
            }

            a:hover {
              color: #3a96f5;
            }

            /* Utility classes */
            .space-y-6 {
              display: flex;
              flex-direction: column;
              gap: 24px;
            }

            .space-y-4 {
              display: flex;
              flex-direction: column;
              gap: 16px;
            }

            .space-y-3 {
              display: flex;
              flex-direction: column;
              gap: 12px;
            }

            .gap-2 {
              gap: 8px;
            }

            .gap-3 {
              gap: 12px;
            }

            .flex {
              display: flex;
            }

            .flex-col {
              flex-direction: column;
            }

            .items-center {
              align-items: center;
            }

            .justify-between {
              justify-content: space-between;
            }

            .mb-4 {
              margin-bottom: 16px;
            }

            .mb-2 {
              margin-bottom: 8px;
            }

            .text-secondary {
              color: var(--text-secondary);
            }

            .text-tertiary {
              color: var(--text-tertiary);
            }
          `}
        </style>
      </head>
      <body>
        <div class="app-container">
          {props.user && <Sidebar user={props.user} activePath={props.activePath || ''} />}
          <main class="main-content">
            {props.children}
          </main>
        </div>
        {toasts.length > 0 && <ToastStack toasts={toasts} />}
      </body>
    </html>
  );
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="avatar sm initials">{getInitials(props.user.name)}</div>
        <div class="sidebar-header-text">Acme Corp</div>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-label">Workspace</div>
        <nav>
          <a href="/dashboard" class={`sidebar-item${props.activePath === '/dashboard' ? ' active' : ''}`}>
            <GridIcon />
            <span>Dashboard</span>
          </a>
          <a href="/team" class={`sidebar-item${props.activePath === '/team' ? ' active' : ''}`}>
            <UsersIcon />
            <span>Team</span>
          </a>
        </nav>
      </div>

      <div class="sidebar-section">
        <div class="sidebar-section-label">Account</div>
        <nav>
          <a href="/settings" class={`sidebar-item${props.activePath === '/settings' ? ' active' : ''}`}>
            <GearIcon />
            <span>Settings</span>
          </a>
          <a href="/auth/logout" class="sidebar-item">
            <SignOutIcon />
            <span>Logout</span>
          </a>
        </nav>
      </div>
    </aside>
  );
}

export function Card(props: CardProps) {
  return (
    <div class={`card ${props.className || ''}`}>
      {props.title && <h2 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)' }}>{props.title}</h2>}
      {props.children}
    </div>
  );
}

export function Avatar(props: AvatarProps) {
  const sizeClass = props.size;
  const hasVerified = props.showBadge && props.user.email_verified;

  if (props.user.picture) {
    return (
      <div class={`avatar ${sizeClass}`} style={{ position: 'relative' }}>
        <img src={props.user.picture} alt={props.user.name} class="avatar-img" />
        {hasVerified && <div class="avatar-badge" />}
      </div>
    );
  }

  return (
    <div class={`avatar ${sizeClass} initials`} style={{ position: 'relative' }}>
      {getInitials(props.user.name)}
      {hasVerified && <div class="avatar-badge" />}
    </div>
  );
}

export function StatCard(props: StatCardProps) {
  return (
    <div class="stat-card">
      <div class="stat-card-label">{props.label}</div>
      <div class="stat-card-value">{props.value}</div>
    </div>
  );
}

export function ActivityTable(props: ActivityTableProps) {
  return (
    <table>
      <thead>
        <tr>
          <th>Action</th>
          <th>User</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr>
            <td>{row.action}</td>
            <td>{row.user}</td>
            <td class="text-tertiary">{row.time}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TeamCard(props: TeamCardProps) {
  return (
    <div class="team-card">
      {props.picture ? (
        <div class="avatar md">
          <img src={props.picture} alt={props.name} class="avatar-img" />
        </div>
      ) : (
        <div class="avatar md initials">{props.avatar}</div>
      )}
      <div class="team-card-content">
        <div class="team-card-name">{props.name}</div>
        <div class="team-card-role">
          {props.role}
          {props.isVerified && <span class="status-dot success" />}
        </div>
      </div>
    </div>
  );
}

export function StatusBadge(props: StatusBadgeProps) {
  const statusClass =
    props.status === 'connected' ? 'success' :
    props.status === 'expiring' ? 'warning' : 'error';

  return (
    <span class="flex items-center gap-2">
      <span class={`status-dot ${statusClass}`} />
      {props.label}
    </span>
  );
}

export function IntegrationCard(props: IntegrationCardProps) {
  const statusClass =
    props.status === 'connected' ? 'success' :
    props.status === 'expiring' ? 'warning' : 'error';

  return (
    <div class="integration-card">
      <div class="integration-header">
        <div class="integration-title">{props.service}</div>
        <span class={`status-dot ${statusClass}`} />
      </div>
      {props.tokenExpiry && (
        <div class="integration-details">
          Expires: {props.tokenExpiry}
        </div>
      )}
    </div>
  );
}

export function ToastStack(props: { toasts: ToastItem[] }) {
  return (
    <div class="toast-container">
      {props.toasts.map((toast, i) => (
        <div class={`toast ${toast.variant}`} style={{ animationDelay: `${i * 150}ms, ${4 + i * 150 / 1000}s` }}>
          <div style={{ fontWeight: '600', fontSize: '13px' }}>{toast.text}</div>
          <div style={{ fontSize: '11px', opacity: '0.7', marginTop: '2px' }}>{toast.detail}</div>
        </div>
      ))}
    </div>
  );
}
