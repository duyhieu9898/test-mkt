import { describe, expect, it } from 'vitest';
import {
  bannerNeedsRetry,
  buildCampaignBannerBackgroundPrompt,
  buildCampaignBannerVisualBrief,
  parseBannerQualityAssessment,
  sanitizeBannerSourceContext,
} from './campaign-banner-creative';

describe('campaign banner creative prompt', () => {
  it('grounds the visual in campaign-specific facts and forbids text', () => {
    const prompt = buildCampaignBannerBackgroundPrompt({
      goal: 'Promote Da Nang family summer tours',
      audience: 'Families traveling with young children',
      reason: 'Parents repeatedly asked for child-friendly itineraries',
      offer: 'A five-day beach and culture package',
      businessContext: 'The package includes My Khe beach, local food and a guided trip to Ba Na Hills.',
      visualDirection: 'A family enjoying the beach with Da Nang scenery in the distance',
      angle: 'benefit',
      size: '1200x628',
      variantIndex: 1,
    });

    expect(prompt).toContain('Promote Da Nang family summer tours');
    expect(prompt).toContain('Families traveling with young children');
    expect(prompt).toContain('My Khe beach');
    expect(prompt).toContain('ZERO typography');
    expect(prompt).toContain('Do not fall back to generic office');
  });

  it('removes URLs, formatting, and CTA phrases from source context', () => {
    expect(sanitizeBannerSourceContext(
      '## Visit https://example.com and "Book now" to **Learn More** about Da Nang.',
    )).toBe('Visit and to about Da Nang.');
  });

  it('builds a concrete brief with a copy-safe composition', () => {
    const brief = buildCampaignBannerVisualBrief({
      goal: 'Help families choose a Da Nang holiday',
      audience: 'Parents with young children',
      offer: 'Five-day family tour',
      businessContext: 'My Khe beach and Ba Na Hills',
      variantIndex: 0,
    });

    expect(brief.subject).toBe('Five-day family tour');
    expect(brief.composition).toContain('left 55%');
    expect(brief.exclusions.join(' ')).toContain('deformed anatomy');
  });

  it('retries low-quality or unsafe image candidates', () => {
    const assessment = parseBannerQualityAssessment({
      score: 65,
      relevant: true,
      textFree: false,
      technicallySound: true,
      issues: ['A shop sign contains text'],
      retryPrompt: 'Remove the sign and use a clean beach setting.',
    });

    expect(assessment).not.toBeNull();
    expect(bannerNeedsRetry(assessment!)).toBe(true);
    expect(assessment?.retryPrompt).toContain('Remove the sign');
  });

  it('accepts a relevant, text-free, technically sound candidate', () => {
    expect(bannerNeedsRetry({
      score: 84,
      relevant: true,
      textFree: true,
      technicallySound: true,
      issues: [],
    })).toBe(false);
  });
});
