import { describe, expect, it } from 'vitest';
import {
  calculateContainRect,
  normalizeSocialPlatform,
  SOCIAL_BANNER_PRESETS,
} from './social-banner-variant';

describe('social banner variants', () => {
  it('normalizes supported platform aliases', () => {
    expect(normalizeSocialPlatform('FB')).toBe('facebook');
    expect(normalizeSocialPlatform('instagram')).toBe('instagram');
    expect(normalizeSocialPlatform('li')).toBe('linkedin');
    expect(normalizeSocialPlatform('twitter')).toBeNull();
  });

  it('keeps a landscape banner intact on an Instagram square canvas', () => {
    const rect = calculateContainRect(1200, 628, 1080, 1080);
    expect(rect.x).toBe(0);
    expect(rect.y).toBeCloseTo(257.4);
    expect(rect.width).toBe(1080);
    expect(rect.height).toBeCloseTo(565.2);
  });

  it('uses the existing campaign ad sizes', () => {
    expect(SOCIAL_BANNER_PRESETS.facebook.size).toBe('1200x628');
    expect(SOCIAL_BANNER_PRESETS.instagram.size).toBe('1080x1080');
    expect(SOCIAL_BANNER_PRESETS.linkedin.size).toBe('1200x628');
  });
});
