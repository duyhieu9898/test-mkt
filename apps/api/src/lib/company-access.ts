import { and, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from './db';
import { companies, companyMembers, users } from '@1person/core/db';
import { defaultPermissionMessage, permissionErrorCode } from './permission-messages';

export const COMPANY_ROLES = [
  'owner',
  'admin',
  'marketing_lead',
  'content_creator',
  'analyst',
  'viewer',
] as const;

export type CompanyRole = typeof COMPANY_ROLES[number];

export const COMPANY_ROLE_LABELS: Record<CompanyRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  marketing_lead: 'Marketing Lead',
  content_creator: 'Content Creator',
  analyst: 'Analyst',
  viewer: 'Viewer',
};

export const COMPANY_ROLE_DESCRIPTIONS: Record<CompanyRole, string> = {
  owner: 'Full control over this company, credits, members, channels, and publishing.',
  admin: 'Manage most company settings, members, and marketing work.',
  marketing_lead: 'Create, launch, and publish marketing campaigns.',
  content_creator: 'Create and edit content drafts, assets, blogs, and landing page drafts.',
  analyst: 'View strategy, market, campaign, and performance data.',
  viewer: 'View company information without changing or publishing anything.',
};

export const COMPANY_ROLE_PERMISSIONS = {
  owner: ['*'],
  admin: [
    'company.view',
    'company.edit',
    'company.manage_members',
    'brand_iq.view',
    'brand_iq.edit',
    'knowledge.view_internal',
    'knowledge.view_confidential',
    'knowledge.upload',
    'knowledge.approve',
    'ceo_advisor.view',
    'ceo_advisor.refresh',
    'growth_plan.view',
    'growth_plan.update',
    'market.view',
    'market.scan',
    'campaign.view',
    'campaign.create',
    'campaign.generate_ai',
    'campaign.edit',
    'campaign.launch',
    'campaign.publish_social',
    'landing_page.create',
    'landing_page.edit',
    'landing_page.publish_request',
    'landing_page.publish_direct',
    'channels.connect',
    'channels.publish',
    'chatbot.configure',
    'chatbot.view_conversations',
    'credits.view',
    'credits.spend',
    'credits.manage',
  ],
  marketing_lead: [
    'company.view',
    'brand_iq.view',
    'brand_iq.edit',
    'knowledge.view_internal',
    'knowledge.upload',
    'ceo_advisor.view',
    'growth_plan.view',
    'market.view',
    'market.scan',
    'campaign.view',
    'campaign.create',
    'campaign.generate_ai',
    'campaign.edit',
    'campaign.launch',
    'campaign.publish_social',
    'landing_page.create',
    'landing_page.edit',
    'landing_page.publish_request',
    'channels.publish',
    'chatbot.view_conversations',
    'credits.view',
    'credits.spend',
  ],
  content_creator: [
    'company.view',
    'brand_iq.view',
    'knowledge.view_internal',
    'knowledge.upload',
    'ceo_advisor.view',
    'growth_plan.view',
    'market.view',
    'campaign.view',
    'campaign.create',
    'campaign.generate_ai',
    'campaign.edit',
    'landing_page.create',
    'landing_page.edit',
    'landing_page.publish_request',
    'chatbot.view_conversations',
    'credits.view',
    'credits.spend',
  ],
  analyst: [
    'company.view',
    'brand_iq.view',
    'knowledge.view_internal',
    'ceo_advisor.view',
    'growth_plan.view',
    'market.view',
    'campaign.view',
    'chatbot.view_conversations',
    'credits.view',
  ],
  viewer: [
    'company.view',
    'brand_iq.view',
    'ceo_advisor.view',
    'growth_plan.view',
    'market.view',
    'campaign.view',
    'credits.view',
  ],
} satisfies Record<CompanyRole, string[]>;

export type CompanyPermission =
  | '*'
  | 'company.view'
  | 'company.edit'
  | 'company.manage_members'
  | 'brand_iq.view'
  | 'brand_iq.edit'
  | 'knowledge.view_internal'
  | 'knowledge.view_confidential'
  | 'knowledge.upload'
  | 'knowledge.approve'
  | 'ceo_advisor.view'
  | 'ceo_advisor.refresh'
  | 'growth_plan.view'
  | 'growth_plan.update'
  | 'market.view'
  | 'market.scan'
  | 'campaign.view'
  | 'campaign.create'
  | 'campaign.generate_ai'
  | 'campaign.edit'
  | 'campaign.launch'
  | 'campaign.publish_social'
  | 'landing_page.create'
  | 'landing_page.edit'
  | 'landing_page.publish_request'
  | 'landing_page.publish_direct'
  | 'channels.connect'
  | 'channels.publish'
  | 'chatbot.configure'
  | 'chatbot.view_conversations'
  | 'credits.view'
  | 'credits.spend'
  | 'credits.manage';

export function normalizeCompanyRole(value: unknown): CompanyRole {
  return COMPANY_ROLES.includes(value as CompanyRole) ? value as CompanyRole : 'viewer';
}

export function roleHasPermission(role: CompanyRole, permission: CompanyPermission) {
  const permissions = COMPANY_ROLE_PERMISSIONS[role];
  return permissions.includes('*') || permissions.includes(permission);
}

export function listRolePermissions(role: CompanyRole) {
  return COMPANY_ROLE_PERMISSIONS[role].includes('*')
    ? Array.from(new Set(Object.values(COMPANY_ROLE_PERMISSIONS).flat().filter((item) => item !== '*')))
    : COMPANY_ROLE_PERMISSIONS[role];
}

export async function getCompanyAccess(userId: string, companyId: string) {
  const [company, currentUser] = await Promise.all([
    db.query.companies.findFirst({
      where: eq(companies.id, companyId),
      columns: { id: true, name: true, ownerId: true, settings: true },
    }),
    db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, role: true },
    }),
  ]);

  if (!company) {
    throw new HTTPException(404, { message: 'Company not found' });
  }

  const isPlatformAdmin = currentUser?.role === 'admin';
  const isOwner = company.ownerId === userId;
  if (isOwner) {
    return {
      company,
      role: 'owner' as CompanyRole,
      isOwner,
      isPlatformAdmin,
      permissions: listRolePermissions('owner'),
    };
  }

  const membership = await db.query.companyMembers.findFirst({
    where: and(
      eq(companyMembers.companyId, companyId),
      eq(companyMembers.userId, userId),
      eq(companyMembers.status, 'active'),
    ),
  });

  if (!membership) {
    if (isPlatformAdmin) {
      return {
        company,
        role: 'owner' as CompanyRole,
        isOwner: false,
        isPlatformAdmin,
        permissions: listRolePermissions('owner'),
      };
    }

    return {
      company,
      role: null,
      isOwner: false,
      isPlatformAdmin,
      permissions: [] as string[],
    };
  }

  const role = normalizeCompanyRole(membership.role);
  return {
    company,
    membership,
    role,
    isOwner: false,
    isPlatformAdmin,
    permissions: listRolePermissions(role),
  };
}

export async function authorizeCompanyAccess(
  userId: string,
  companyId: string,
  permission: CompanyPermission,
) {
  const access = await getCompanyAccess(userId, companyId);
  if (!access.role || !roleHasPermission(access.role, permission)) {
    const error = new HTTPException(403, { message: defaultPermissionMessage(permission) });
    (error as HTTPException & { code?: string }).code = permissionErrorCode(permission);
    throw error;
  }
  return access;
}

export async function assertCompanyAccess(companyId: string, userId: string) {
  return authorizeCompanyAccess(userId, companyId, 'company.view');
}
