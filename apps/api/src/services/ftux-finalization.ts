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

async function runOptionalFinalizationStage<T>(
  stage: string,
  companyId: string,
  operation: () => Promise<T>,
): Promise<{ success: true; value: T } | { success: false }> {
  try {
    const value = await operation();
    console.log(`[FTUX Finalize] ${stage} ready for company ${companyId}`);
    return { success: true, value };
  } catch (error) {
    // These datasets improve the first dashboard visit, but users can safely
    // regenerate them later. Do not discard an already persisted Growth Plan.
    console.error(`[FTUX Finalize] ${stage} failed for company ${companyId}:`, error);
    return { success: false };
  }
}

export async function finalizeFtuxCompany(
  companyId: string,
  actor: string,
): Promise<FtuxFinalizationResult> {
  let company: typeof companies.$inferSelect;
  let masterPlan: GrowthMasterPlan;

  try {
    const foundCompany = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });
    if (!foundCompany) throw new Error('Company not found');
    company = foundCompany;

    const existingPlan = company.businessPlan as BusinessPlan | null;
    const context = await buildBusinessContext(companyId);

    const generatedPlan = existingPlan?.growthPlan
      ? null
      : await websiteAnalyzerService.generateMasterPlanFromPrompt(
          company.description || company.name,
          {
            market: company.industry,
            model: company.businessType,
          },
          context.fullContext,
          context.language,
        );
    masterPlan = existingPlan?.growthPlan ?? generatedPlan!.masterPlan;

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
    console.log(`[FTUX Finalize] Growth Plan persisted for company ${companyId}`);
  } catch (error) {
    // The Growth Plan is the required result of this screen. Keep this failure
    // blocking, but make its production cause visible instead of logging only 500.
    console.error(`[FTUX Finalize] Growth Plan failed for company ${companyId}:`, error);
    throw error;
  }

  await runOptionalFinalizationStage('Business Brain', companyId, () =>
    autoExtractBrainFromCompany(companyId, company.name),
  );

  const brandIq = await runOptionalFinalizationStage('Brand IQ', companyId, () =>
    ensureGroundedBrandIq(companyId, company.name),
  );

  const advisor = await runOptionalFinalizationStage('CEO Advisor', companyId, async () => {
    const tenantId = await ensureTenantForCompany(companyId, company.name);
    await getTenantAI().credits.getOrCreateBalance(tenantId);
    const existingAdvice = await getTenantAI().ceoAdvisor.latest(tenantId);
    if (existingAdvice) return existingAdvice;

    return generateAndSaveCeoBrief({
      companyId,
      companyName: company.name,
      actor,
      // Initial company intelligence is free. Paid refreshes happen later.
      chargeCredits: false,
    });
  });

  return {
    masterPlan,
    brandIqReady: brandIq.success,
    advisorReady: advisor.success,
  };
}
