export const COMPANY_ROLE_OPTIONS = [
  {
    role: 'admin',
    label: 'Admin',
    description: 'Manage most company settings, members, and marketing work.',
  },
  {
    role: 'marketing_lead',
    label: 'Marketing Lead',
    description: 'Create, launch, and publish marketing campaigns.',
  },
  {
    role: 'content_creator',
    label: 'Content Creator',
    description: 'Create and edit content drafts, assets, blogs, and landing page drafts.',
  },
  {
    role: 'analyst',
    label: 'Analyst',
    description: 'View strategy, market, campaign, and performance data.',
  },
  {
    role: 'viewer',
    label: 'Viewer',
    description: 'View company information without changing or publishing anything.',
  },
] as const;

export type CompanyAssignableRole = typeof COMPANY_ROLE_OPTIONS[number]['role'];
export type CompanyRole = 'owner' | CompanyAssignableRole;

export const COMPANY_ROLE_LABELS: Record<CompanyRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  marketing_lead: 'Marketing Lead',
  content_creator: 'Content Creator',
  analyst: 'Analyst',
  viewer: 'Viewer',
};

export const ROLE_HELP_TEXT: Record<CompanyRole, string[]> = {
  owner: [
    'Full control over company settings, credits, members, channels, and publishing.',
    'Can remove members and make high-risk changes.',
  ],
  admin: [
    'Can manage most company settings and invite team members.',
    'Can create, launch, and publish marketing work.',
  ],
  marketing_lead: [
    'Can create campaigns, scan the market, publish social posts, and use company credits.',
    'Cannot manage billing or invite/remove members.',
  ],
  content_creator: [
    'Can create and edit drafts for campaigns, blogs, banners, and landing pages using company credits.',
    'Publishing may require a lead or admin.',
  ],
  analyst: [
    'Can review strategy, market intelligence, performance, and company credit balance.',
    'Cannot create or publish marketing assets.',
  ],
  viewer: [
    'Can view key pages, strategy context, and company credit balance.',
    'Cannot change data or spend credits.',
  ],
};

export function hasCompanyPermission(
  access: { permissions?: string[] } | null | undefined,
  permission: string,
) {
  const permissions = access?.permissions ?? [];
  return permissions.includes('*') || permissions.includes(permission);
}
