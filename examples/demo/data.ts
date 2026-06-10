export interface ActivityRow {
  action: string;
  user: string;
  time: string;
}

export const ACTIVITY_DATA: ActivityRow[] = [
  { action: 'Deployed v1.2.0', user: 'Alice Chen', time: '5 minutes ago' },
  { action: 'Updated billing settings', user: 'Bob Martinez', time: '2 hours ago' },
  { action: 'Added team member', user: 'Emma Lee', time: '1 day ago' },
  { action: 'Reviewed PR', user: 'David Kim', time: '3 days ago' },
  { action: 'Updated documentation', user: 'Sarah Johnson', time: '5 days ago' },
];

export interface TeamMember {
  name: string;
  role: string;
  avatar: string;
  isVerified?: boolean;
}

export const TEAM_DATA: TeamMember[] = [
  { name: 'Emma Chen', role: 'Product Manager', avatar: 'EC', isVerified: true },
  { name: 'David Lee', role: 'Engineering Lead', avatar: 'DL', isVerified: true },
  { name: 'Sarah Williams', role: 'Design', avatar: 'SW', isVerified: false },
  { name: 'Marcus Johnson', role: 'DevOps', avatar: 'MJ', isVerified: true },
];

export interface Integration {
  service: string;
  status: 'connected' | 'expiring' | 'error';
  lastSync?: string;
}

export const INTEGRATIONS_DATA: Integration[] = [
  { service: 'GitHub', status: 'connected', lastSync: '5 minutes ago' },
  { service: 'Slack', status: 'connected', lastSync: '10 minutes ago' },
  { service: 'External API', status: 'connected', lastSync: 'live' },
];

export const STATS = {
  projects: 12,
  tasks: 47,
  uptime: '99.8%',
};
