/** Local-only smoke test for the real LLM brief; it does not persist a recommendation. */
import { analyzeMetaCampaign } from '../services/meta-ads-analysis';
import { generateMetaAdsBrief } from '../services/meta-ads-brief';

if (process.env.NODE_ENV === 'production') throw new Error('Meta Ads brief smoke test is disabled in production');
const companyId = process.argv.find((argument) => argument.startsWith('--company='))?.slice('--company='.length);
const campaignId = process.argv.find((argument) => argument.startsWith('--campaign='))?.slice('--campaign='.length);
if (!companyId || !campaignId) throw new Error('Pass --company=<company-id> --campaign=<campaign-id>');

const timezone = 'Asia/Ho_Chi_Minh';
const analysis = await analyzeMetaCampaign(companyId, campaignId, {
  baseline: { start: '2026-07-28', end: '2026-08-03', timezone },
  current: { start: '2026-08-04', end: '2026-08-10', timezone },
});
const brief = await generateMetaAdsBrief(companyId, {
  targetName: analysis.target.name,
  findings: analysis.findings,
  campaignContext: analysis.target.briefContext,
});
console.log(JSON.stringify({ isDevelopmentFixture: analysis.isDevelopmentFixture, findings: analysis.findings, brief }, null, 2));
