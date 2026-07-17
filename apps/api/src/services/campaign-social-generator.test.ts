import { describe, expect, it } from 'vitest';
import { normalizeSocialPost } from './campaign-social-generator';

describe('normalizeSocialPost', () => {
  it('removes hashtags from content and keeps one normalized copy', () => {
    expect(normalizeSocialPost(
      'Explore Da Nang today.\n\n#DaNang #VietnamTravel',
      ['#DaNang', 'VietnamTravel', 'TravelTips'],
    )).toEqual({
      content: 'Explore Da Nang today.',
      hashtags: ['DaNang', 'VietnamTravel', 'TravelTips'],
    });
  });

  it('deduplicates hashtags without changing content casing', () => {
    expect(normalizeSocialPost(
      'A better summer journey starts here.',
      ['SummerTravel', '#summertravel', 'DaNang'],
    )).toEqual({
      content: 'A better summer journey starts here.',
      hashtags: ['SummerTravel', 'DaNang'],
    });
  });
});
