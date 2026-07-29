import type { CompanyPermission } from './company-access';

type PermissionMessageKey =
  | 'default'
  | 'company.manage_members'
  | 'channels.connect'
  | 'brand_iq.edit'
  | 'market.scan'
  | 'campaign.publish_social'
  | 'campaign.launch'
  | 'campaign.create'
  | 'campaign.generate_ai'
  | 'campaign.edit'
  | 'knowledge.upload'
  | 'knowledge.view_internal'
  | 'knowledge.approve'
  | 'ceo_advisor.refresh'
  | 'landing_page.create'
  | 'landing_page.edit'
  | 'landing_page.publish_request'
  | 'landing_page.publish_direct'
  | 'credits.spend'
  | 'credits.manage'
  | 'credits.view';

const permissionMessages: Record<PermissionMessageKey, string> = {
  default: 'You do not have access to perform this action in this company.',
  'company.manage_members': 'Only the company Owner or Admin can manage team access.',
  'channels.connect': 'Only the company Owner or Admin can connect external channels because this grants publishing access.',
  'brand_iq.edit': 'You can view Brand IQ, but only the company Owner, Admin, or Marketing Lead can edit it.',
  'market.scan': 'You can review market insights, but your role cannot add competitors or run market scans.',
  'campaign.publish_social': 'You can review this campaign, but only an Owner, Admin, or Marketing Lead can publish it.',
  'campaign.launch': 'You can review this campaign, but only an Owner, Admin, or Marketing Lead can launch it.',
  'campaign.create': 'You can review campaigns, but your role cannot create campaigns or spend AI credits.',
  'campaign.generate_ai': 'You can review campaigns, but your role cannot generate AI campaign content.',
  'campaign.edit': 'You can review this campaign, but your role cannot edit campaign assets or social posts.',
  'knowledge.upload': 'You can view company knowledge, but your role cannot upload documents or meetings.',
  'knowledge.view_internal': 'Your role cannot view internal company knowledge or meeting records.',
  'knowledge.approve': 'You can review knowledge items, but your role cannot approve them into the company brain.',
  'ceo_advisor.refresh': 'You can view CEO Advisor, but only the company Owner or Admin can generate or refresh advice.',
  'landing_page.create': 'You can review landing pages, but your role cannot create new pages.',
  'landing_page.edit': 'You can review landing pages, but your role cannot edit them.',
  'landing_page.publish_request': 'Your role cannot request landing page publishing.',
  'landing_page.publish_direct': 'Only an Owner or Admin can publish or take landing pages offline directly.',
  'credits.spend': 'Your role cannot spend company credits. Ask an Owner or Admin to change your access.',
  'credits.manage': 'Only the company Owner or Admin can manage company credits and billing.',
  'credits.view': 'You do not have access to view company credits.',
};

export function defaultPermissionMessage(permission: CompanyPermission) {
  return permissionMessages[permission as PermissionMessageKey] ?? permissionMessages.default;
}

export function permissionErrorCode(permission: CompanyPermission) {
  if (permission === '*') return 'PERMISSION_DENIED';
  return `PERMISSION_${permission.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_DENIED`;
}
