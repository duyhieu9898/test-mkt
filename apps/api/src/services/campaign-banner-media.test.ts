import { describe, expect, it } from 'vitest';
import {
  applyLatestCampaignBannerMedia,
  bannerIdFromMediaUrl,
  removeCampaignBannerMedia,
  replaceAttachedBannerVersion,
} from './campaign-banner-media';

const bannerId = 'a0daf920-526a-4588-b548-33527140362d';
const otherBannerId = 'ea6eb7c5-adba-4559-9786-be64464562c8';

describe('campaign banner media', () => {
  it('removes exported and custom versions of one banner only', () => {
    const bannerId = '11111111-1111-4111-8111-111111111111';
    const otherBannerId = '22222222-2222-4222-8222-222222222222';
    const customUrl = `https://cdn.example.com/development/campaigns/company/campaign/banners/${bannerId}/custom-original.jpg`;

    expect(removeCampaignBannerMedia({
      bannerId,
      knownBannerUrls: [customUrl],
      mediaUrls: [
        `${customUrl}?v=2`,
        `https://cdn.example.com/social-banner-${bannerId}-instagram.png`,
        `https://cdn.example.com/social-banner-${otherBannerId}-instagram.png`,
        'https://cdn.example.com/unrelated-product.jpg',
      ],
    })).toEqual([
      `https://cdn.example.com/social-banner-${otherBannerId}-instagram.png`,
      'https://cdn.example.com/unrelated-product.jpg',
    ]);
  });

  it('extracts banner identity from automatic and edited exports', () => {
    expect(bannerIdFromMediaUrl(`/images/imgly-banner-${bannerId}-100.png`)).toBe(bannerId);
    expect(bannerIdFromMediaUrl(`/images/imgly-auto-banner-${bannerId}-200.png`)).toBe(bannerId);
    expect(bannerIdFromMediaUrl(`/images/canvas-auto-banner-${bannerId}-300.png`)).toBe(bannerId);
    expect(bannerIdFromMediaUrl(`/images/social-banner-${bannerId}-1080x1080-version.png`)).toBe(bannerId);
  });

  it('replaces duplicate old versions with one latest URL', () => {
    const nextUrl = `/images/imgly-banner-${bannerId}-300.png`;
    expect(replaceAttachedBannerVersion({
      bannerId,
      previousImageUrl: `/images/imgly-banner-${bannerId}-100.png`,
      nextImageUrl: nextUrl,
      mediaUrls: [
        `/images/imgly-banner-${bannerId}-100.png`,
        `/images/imgly-banner-${bannerId}-200.png`,
        '/uploads/customer-photo.png',
      ],
    })).toEqual([
      nextUrl,
      '/uploads/customer-photo.png',
    ]);
  });

  it('keeps unrelated media and applies only selected latest banners', () => {
    expect(applyLatestCampaignBannerMedia({
      mediaUrls: [
        `/images/imgly-banner-${bannerId}-100.png`,
        `/images/imgly-banner-${bannerId}-200.png`,
        `/images/imgly-auto-banner-${otherBannerId}-100.png`,
        '/uploads/customer-photo.png',
      ],
      campaignBanners: [
        { id: bannerId, imageUrl: `/images/imgly-banner-${bannerId}-300.png` },
        { id: otherBannerId, imageUrl: `/images/imgly-auto-banner-${otherBannerId}-200.png` },
      ],
      selectedBannerIds: [bannerId],
    })).toEqual([
      '/uploads/customer-photo.png',
      `/images/imgly-banner-${bannerId}-300.png`,
    ]);
  });

  it('keeps a new social post image-free until a banner is explicitly selected', () => {
    const campaignBanners = [
      { id: bannerId, imageUrl: `/images/imgly-banner-${bannerId}-300.png` },
    ];

    expect(applyLatestCampaignBannerMedia({
      mediaUrls: [],
      campaignBanners,
      selectedBannerIds: [],
    })).toEqual([]);

    expect(applyLatestCampaignBannerMedia({
      mediaUrls: [],
      campaignBanners,
      selectedBannerIds: [bannerId],
    })).toEqual([`/images/imgly-banner-${bannerId}-300.png`]);
  });
});
