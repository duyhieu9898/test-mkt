import { resolveFeature } from './config-resolver';

export const INITIAL_FREE_CREDITS = 1000;

export const CREDIT_SUPPORT_MESSAGE =
  'You do not have enough credits for this action. Please contact support to add more credits.';

export const FIXED_CREDIT_COSTS = {
  launchCampaignBase: 50,
  campaignVideo: 50,
  socialPostPublish: 2,
  contentHubGenerateAllTopic: 80,
  knowledgeCrawlDiscover: 20,
  fallbackOpenAiCall: 5,
} as const;

export type CreditTier = 'fast' | 'balanced' | 'premium';

export async function getCampaignGenerateCost(tier: CreditTier = 'balanced') {
  const [bannerFeature, postFeature] = await Promise.all([
    resolveFeature('campaign_banner_copy', tier),
    resolveFeature('campaign_social_post', tier),
  ]);
  return bannerFeature.creditCost + postFeature.creditCost;
}

export async function getCampaignGenerateCosts() {
  const tiers: CreditTier[] = ['fast', 'balanced', 'premium'];
  const pairs = await Promise.all(
    tiers.map(async (tier) => [tier, await getCampaignGenerateCost(tier)] as const),
  );
  return Object.fromEntries(pairs) as Record<CreditTier, number>;
}

export async function getAdvisorCampaignBridgeCost() {
  const feature = await resolveFeature('ceo_advisor_brief', 'fast');
  return feature.creditCost;
}

export function getLaunchCampaignCost(input: {
  includeVideo?: boolean;
  imageMode?: 'ai' | 'uploaded';
}) {
  const imageDiscount = input.imageMode === 'uploaded' ? 30 : 0;
  return Math.max(
    20,
    FIXED_CREDIT_COSTS.launchCampaignBase
      - imageDiscount
      + (input.includeVideo ? FIXED_CREDIT_COSTS.campaignVideo : 0),
  );
}

export async function getUsageCreditCosts() {
  return {
    campaignGenerate: await getCampaignGenerateCosts(),
    advisorCampaignBridge: await getAdvisorCampaignBridgeCost(),
    launchCampaignBase: FIXED_CREDIT_COSTS.launchCampaignBase,
    launchCampaignUploadedImages: getLaunchCampaignCost({ imageMode: 'uploaded' }),
    campaignVideo: FIXED_CREDIT_COSTS.campaignVideo,
    socialPostPublish: FIXED_CREDIT_COSTS.socialPostPublish,
    contentHubGenerateAllTopic: FIXED_CREDIT_COSTS.contentHubGenerateAllTopic,
    knowledgeCrawlDiscover: FIXED_CREDIT_COSTS.knowledgeCrawlDiscover,
    openAiCall: FIXED_CREDIT_COSTS.fallbackOpenAiCall,
    supportMessage: CREDIT_SUPPORT_MESSAGE,
  };
}
