/**
 * Local-only data for manually exercising the Facebook Ads UI and evidence
 * loop. It does not contact Meta and it refuses to run in production.
 *
 * Usage: pnpm --filter @1person/api dev:seed-meta-ads -- --company=<company-id>
 */
import { and, eq } from 'drizzle-orm';
import { adCampaigns, adConnections, adSets, ads } from '@1person/core/db';
import { db } from '../lib/db';
import { DEV_DEMO_META_CAMPAIGN_IDS } from '../services/meta-ads-analysis';

if (process.env.NODE_ENV === 'production') throw new Error('Demo Meta Ads seed is disabled in production');
const companyId = process.argv.find((argument) => argument.startsWith('--company='))?.slice('--company='.length);
if (!companyId) throw new Error('Pass --company=<company-id>');

const connection = await db.query.adConnections.findFirst({
  where: and(eq(adConnections.companyId, companyId), eq(adConnections.platform, 'facebook'), eq(adConnections.status, 'connected')),
});
if (!connection) throw new Error('Connect and select a Facebook Ad Account before seeding the demo');

const demos = [
  { id: DEV_DEMO_META_CAMPAIGN_IDS.budgetAndCtr, name: '[DEV DEMO] Budget increase + CTR decline', budget: '300.00', spend: '300.00', impressions: 13_000, clicks: 104, ctr: '0.80', headline: 'Help your child speak English' },
  { id: DEV_DEMO_META_CAMPAIGN_IDS.ctrOnly, name: '[DEV DEMO] CTR decline, stable budget', budget: '150.00', spend: '155.00', impressions: 12_500, clicks: 125, ctr: '1.00', headline: 'English learning made playful' },
  { id: DEV_DEMO_META_CAMPAIGN_IDS.spendOnly, name: '[DEV DEMO] Spend increase, no budget history', budget: '200.00', spend: '200.00', impressions: 11_000, clicks: 165, ctr: '1.50', headline: 'Build English confidence' },
  { id: DEV_DEMO_META_CAMPAIGN_IDS.stable, name: '[DEV DEMO] Stable delivery', budget: '150.00', spend: '152.00', impressions: 12_100, clicks: 182, ctr: '1.50', headline: 'Keep building English confidence' },
  { id: DEV_DEMO_META_CAMPAIGN_IDS.ctrNoCreative, name: '[DEV DEMO] CTR decline, no synced creative', budget: '150.00', spend: '155.00', impressions: 12_500, clicks: 125, ctr: '1.00', headline: 'No creative is synced', createCreative: false },
  { id: DEV_DEMO_META_CAMPAIGN_IDS.insufficient, name: '[DEV DEMO] Insufficient data', budget: '300.00', spend: '30.00', impressions: 90, clicks: 1, ctr: '1.10', headline: 'Try English activities today' },
] as const;

const seeded: Array<{ campaignId: string; name: string; url: string }> = [];
for (const demo of demos) {
  let campaign = await db.query.adCampaigns.findFirst({ where: and(eq(adCampaigns.companyId, companyId), eq(adCampaigns.platformCampaignId, demo.id)) });
  // Upgrade the first fixture created before the scenario matrix existed.
  if (!campaign && demo.id === DEV_DEMO_META_CAMPAIGN_IDS.budgetAndCtr) {
    const legacy = await db.query.adCampaigns.findFirst({ where: and(eq(adCampaigns.companyId, companyId), eq(adCampaigns.platformCampaignId, '1person_dev_demo_campaign')) });
    if (legacy) {
      const [updated] = await db.update(adCampaigns).set({ platformCampaignId: demo.id, name: demo.name, updatedAt: new Date() }).where(eq(adCampaigns.id, legacy.id)).returning();
      campaign = updated;
    }
  }
  const sourceAccountId = connection.platformAccountId ? connection.platformAccountId.replace(/^act_/, '') : 'dev_fixture';
  if (!campaign) {
    const [created] = await db.insert(adCampaigns).values({
      companyId, connectionId: connection.id, platform: 'facebook', platformCampaignId: demo.id, sourceAccountId,
      name: demo.name, objective: 'traffic', status: 'active', dailyBudget: demo.budget,
      impressions: demo.impressions, clicks: demo.clicks, conversions: 7, reach: Math.round(demo.impressions * 0.75), spentAmount: demo.spend, ctr: demo.ctr, cpc: '1.00', cpm: '20.00',
    }).returning();
    if (!created) throw new Error(`Could not create ${demo.name}`);
    campaign = created;
  }
  const adSetPlatformId = `${demo.id}_adset`;
  let adSet = await db.query.adSets.findFirst({ where: and(eq(adSets.companyId, companyId), eq(adSets.campaignId, campaign.id), eq(adSets.platformAdSetId, adSetPlatformId)) });
  if (!adSet) {
    const [created] = await db.insert(adSets).values({ companyId, campaignId: campaign.id, platformAdSetId: adSetPlatformId, sourceAccountId, name: '[DEV DEMO] Parents in Ho Chi Minh City', status: 'active', dailyBudget: demo.budget, impressions: demo.impressions, clicks: demo.clicks, conversions: 7, spentAmount: demo.spend }).returning();
    if (!created) throw new Error(`Could not create Ad Set for ${demo.name}`);
    adSet = created;
  }
  if (demo.createCreative !== false) {
    const adPlatformId = `${demo.id}_ad`;
    const existingAd = await db.query.ads.findFirst({ where: and(eq(ads.companyId, companyId), eq(ads.campaignId, campaign.id), eq(ads.platformAdId, adPlatformId)) });
    if (!existingAd) await db.insert(ads).values({ companyId, campaignId: campaign.id, adSetId: adSet.id, platformAdId: adPlatformId, platformCreativeId: `${demo.id}_creative`, sourceAccountId, name: '[DEV DEMO] Creative A', type: 'image', status: 'active', headline: demo.headline, primaryText: 'A local development fixture. It never reaches Meta.', callToAction: 'Learn More', impressions: demo.impressions, clicks: demo.clicks, conversions: 7, spentAmount: demo.spend, ctr: demo.ctr });
  }
  seeded.push({ campaignId: campaign.id, name: demo.name, url: `/${companyId}/campaigns/facebook-ads/${campaign.id}` });
}

console.log(JSON.stringify({ message: 'Local demo matrix seeded. Every row is labeled [DEV DEMO] and never calls Meta.', scenarios: seeded }, null, 2));
