import { eq } from 'drizzle-orm';
import type { BusinessPlan, GrowthMasterPlan } from '@1person/core/db';
import { companies } from '@1person/core/db';
import { db } from '../lib/db';
import { ensureTenantForCompany, getTenantAI } from '../lib/tenant-ai';
import { autoExtractBrainFromCompany } from './brain-autoextract';
import { buildBusinessContext } from './business-context';
import { generateAndSaveCeoBrief } from './ceo-advisor';
import { ensureGroundedBrandIq } from './grounded-brand-iq';
import { websiteAnalyzerService } from './website-analyzer';

export interface FtuxFinalizationResult {
  masterPlan: GrowthMasterPlan;
  brandIqReady: boolean;
  advisorReady: boolean;
}

export async function finalizeFtuxCompany(
  companyId: string,
  actor: string,
): Promise<FtuxFinalizationResult> {
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
  });
  if (!company) throw new Error('Company not found');

  const existingPlan = company.businessPlan as BusinessPlan | null;
  const context = await buildBusinessContext(companyId);

  let masterPlan = existingPlan?.growthPlan;
  if (!masterPlan) {
    const generated = await websiteAnalyzerService.generateMasterPlanFromPrompt(
      company.description || company.name,
      {
        market: company.industry,
        model: company.businessType,
      },
      context.fullContext,
      context.language,
    );
    masterPlan = generated.masterPlan;
  }

  const businessPlan: BusinessPlan = {
    vision: existingPlan?.vision || masterPlan.seoGrowthPlan.description,
    mission: existingPlan?.mission || existingPlan?.valueProposition || company.description || '',
    targetAudience: {
      demographics: existingPlan?.targetAudience?.demographics?.length
        ? existingPlan.targetAudience.demographics
        : context.targetAudience,
      painPoints: existingPlan?.targetAudience?.painPoints ?? [],
    },
    valueProposition: existingPlan?.valueProposition || company.description || '',
    revenueModel: existingPlan?.revenueModel || company.businessType || '',
    offerings: existingPlan?.offerings?.length
      ? existingPlan.offerings
      : context.products,
    competitors: existingPlan?.competitors ?? [],
    suggestedAgents: existingPlan?.suggestedAgents ?? [],
    growthPlan: masterPlan,
    growthPlanVersion: existingPlan?.growthPlanVersion ?? 1,
    growthPlanGeneratedAt: existingPlan?.growthPlanGeneratedAt ?? new Date().toISOString(),
    growthPlanApprovedAt: existingPlan?.growthPlanApprovedAt,
    growthPlanUpdateReasons: existingPlan?.growthPlanUpdateReasons,
    growthPlanHistory: existingPlan?.growthPlanHistory,
  };

  await db
    .update(companies)
    .set({ businessPlan, updatedAt: new Date() })
    .where(eq(companies.id, companyId));

  await autoExtractBrainFromCompany(companyId, company.name);
  await ensureGroundedBrandIq(companyId, company.name);

  const tenantId = await ensureTenantForCompany(companyId, company.name);
  const existingAdvice = await getTenantAI().ceoAdvisor.latest(tenantId);
  if (!existingAdvice) {
    await generateAndSaveCeoBrief({
      companyId,
      companyName: company.name,
      actor,
    });
  }

  return {
    masterPlan,
    brandIqReady: true,
    advisorReady: true,
  };
}
