import { describe, expect, it } from 'vitest';
import {
  buildCampaignBlogKeyword,
  insertCampaignBlogImages,
} from './campaign-blog';

describe('campaign blog helpers', () => {
  it('builds a focused keyword from campaign goal and audience', () => {
    expect(buildCampaignBlogKeyword({
      goal: '  Summer   tours in Da Nang ',
      audience: ' families with children ',
    })).toBe('Summer tours in Da Nang for families with children');
  });

  it('inserts no more than two contextual images into article sections', () => {
    const html = '<p>Intro</p><h2>First</h2><p>A</p><h2>Second</h2><p>B</p>';
    const result = insertCampaignBlogImages(html, [
      { url: '/images/one.png', prompt: 'one', size: '1024x1024' },
      { url: '/images/two.png', prompt: 'two', size: '1024x1024' },
      { url: '/images/three.png', prompt: 'three', size: '1024x1024' },
    ], 'Da Nang guide');

    expect(result).toContain('/images/one.png');
    expect(result).toContain('/images/two.png');
    expect(result).not.toContain('/images/three.png');
    expect(result.match(/campaign-blog-image/g)).toHaveLength(2);
  });
});
