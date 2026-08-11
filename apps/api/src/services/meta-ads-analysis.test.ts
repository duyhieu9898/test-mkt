import { describe, expect, it } from 'vitest';
import {
  calculateAggregateCpa,
  calculateCostPerConversion,
  deriveAnalysisStatus,
} from './meta-ads-analysis';

describe('Meta Ads Analysis Domain Logic', () => {
  describe('deriveAnalysisStatus', () => {
    it('returns not_analyzed when no analysis exists', () => {
      const status = deriveAnalysisStatus({
        hasAnalysis: false,
        windowImpressions: 50_000,
        hasNegativeFindings: false,
      });
      expect(status).toBe('not_analyzed');
    });

    it('returns insufficient_data when window impressions are below 1,000', () => {
      const status = deriveAnalysisStatus({
        hasAnalysis: true,
        windowImpressions: 650,
        hasNegativeFindings: false,
      });
      expect(status).toBe('insufficient_data');
    });

    it('returns insufficient_data when window impressions are null or undefined', () => {
      const statusNull = deriveAnalysisStatus({
        hasAnalysis: true,
        windowImpressions: null,
        hasNegativeFindings: false,
      });
      expect(statusNull).toBe('insufficient_data');
    });

    it('returns needs_review when there are active negative findings', () => {
      const status = deriveAnalysisStatus({
        hasAnalysis: true,
        windowImpressions: 12_000,
        hasNegativeFindings: true,
      });
      expect(status).toBe('needs_review');
    });

    it('returns no_issues_detected when impressions >= 1,000 and 0 negative findings', () => {
      const status = deriveAnalysisStatus({
        hasAnalysis: true,
        windowImpressions: 12_000,
        hasNegativeFindings: false,
      });
      expect(status).toBe('no_issues_detected');
    });
  });

  describe('calculateCostPerConversion', () => {
    it('calculates CPA correctly when conversions > 0', () => {
      expect(calculateCostPerConversion(100, 10)).toBe(10);
      expect(calculateCostPerConversion('250.50', 5)).toBe(50.1);
    });

    it('returns 0 when spend is $0 and conversions > 0', () => {
      expect(calculateCostPerConversion(0, 5)).toBe(0);
    });

    it('returns null when conversions <= 0 to avoid division by zero / misleading $0.00', () => {
      expect(calculateCostPerConversion(100, 0)).toBeNull();
      expect(calculateCostPerConversion(100, -1)).toBeNull();
      expect(calculateCostPerConversion(0, 0)).toBeNull();
    });

    it('handles null and undefined spend/conversions gracefully', () => {
      expect(calculateCostPerConversion(null, null)).toBeNull();
      expect(calculateCostPerConversion(undefined, undefined)).toBeNull();
    });
  });

  describe('calculateAggregateCpa', () => {
    it('calculates weighted sum CPA correctly', () => {
      // Campaign A: $100 / 10 convs = $10
      // Campaign B: $100 / 1 conv = $100
      // Weighted CPA: Total Spend $200 / Total Convs 11 = $18.18 (NOT simple average $55)
      expect(calculateAggregateCpa(200, 11)).toBe(18.18);
    });

    it('returns null when totalConversions <= 0', () => {
      expect(calculateAggregateCpa(500, 0)).toBeNull();
    });
  });
});
