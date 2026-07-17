import { buildAdvisorContext } from './advisor-context-builder';
import {
  generateBrandIq,
  getActiveBrandIq,
  type BrandIqInput,
} from './brand-iq-extractor';
import { ensureTenantForCompany } from '../lib/tenant-ai';

async function buildBrandIqCompanyContext(
  companyId: string,
  companyName: string,
): Promise<string> {
  try {
    const tenantId = await ensureTenantForCompany(companyId, companyName);
    const context = await buildAdvisorContext({ companyId, tenantId });
    return JSON.stringify({
      business: context.business,
      recentCampaigns: context.campaigns.slice(0, 10),
      recentBlogs: context.blogs.slice(0, 12),
      landingPages: context.landingPages.slice(0, 8),
      marketSignals: context.marketSignals.slice(0, 8),
      customerAndBusinessEvidence: context.evidence
        .filter((item) => ['business', 'brain', 'learning', 'market', 'sales'].includes(item.sourceType))
        .slice(0, 30)
        .map((item) => ({
          sourceType: item.sourceType,
          label: item.label,
          detail: item.detail,
        })),
    }, null, 2);
  } catch (error) {
    console.warn('[brand-iq] rich company context unavailable, using company profile:', error);
    return '';
  }
}

export async function generateGroundedBrandIq(
  companyId: string,
  companyName: string,
  input: Pick<BrandIqInput, 'url' | 'samples'> = {},
) {
  const companyContext = await buildBrandIqCompanyContext(companyId, companyName);
  return generateBrandIq(companyId, { ...input, companyContext });
}

export async function ensureGroundedBrandIq(
  companyId: string,
  companyName: string,
) {
  const existing = await getActiveBrandIq(companyId);
  return existing ?? generateGroundedBrandIq(companyId, companyName);
}
