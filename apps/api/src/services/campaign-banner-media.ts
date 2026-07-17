export interface CampaignBannerMedia {
  id: string;
  imageUrl: string | null;
}

const BANNER_IMAGE_PATTERN =
  /(?:imgly-banner|imgly-auto-banner|canvas-auto-banner|social-banner)-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:-|\.|$)/i;

export function bannerIdFromMediaUrl(url: string): string | null {
  const pathname = (() => {
    try {
      return new URL(url, 'http://localhost').pathname;
    } catch {
      return url.split('?')[0] ?? url;
    }
  })();
  return pathname.match(BANNER_IMAGE_PATTERN)?.[1]?.toLowerCase() ?? null;
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls.filter(Boolean))];
}

function urlWithoutQuery(url: string): string {
  try {
    const parsed = new URL(url, 'http://localhost');
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split('?')[0] ?? url;
  }
}

/** Remove every exported/custom version of one banner while preserving unrelated media. */
export function removeCampaignBannerMedia(args: {
  mediaUrls: string[];
  bannerId: string;
  knownBannerUrls?: string[];
}): string[] {
  const bannerId = args.bannerId.toLowerCase();
  const bannerPath = `/banners/${bannerId}/`;
  const knownUrls = new Set((args.knownBannerUrls ?? []).map(urlWithoutQuery));

  return uniqueUrls(args.mediaUrls.filter((url) => {
    const normalizedUrl = urlWithoutQuery(url).toLowerCase();
    return bannerIdFromMediaUrl(url) !== bannerId
      && !normalizedUrl.includes(bannerPath)
      && !knownUrls.has(urlWithoutQuery(url));
  }));
}

/**
 * Replace every historical URL for one banner with its newest export.
 * The banner remains unattached when it was not already present.
 */
export function replaceAttachedBannerVersion(args: {
  mediaUrls: string[];
  bannerId: string;
  previousImageUrl?: string | null;
  nextImageUrl: string;
}): string[] {
  const normalizedBannerId = args.bannerId.toLowerCase();
  let wasAttached = false;
  const next = args.mediaUrls.map((url) => {
    const isSameBanner =
      bannerIdFromMediaUrl(url) === normalizedBannerId
      || Boolean(args.previousImageUrl && url === args.previousImageUrl);
    if (!isSameBanner) return url;
    wasAttached = true;
    return args.nextImageUrl;
  });
  return wasAttached ? uniqueUrls(next) : uniqueUrls(args.mediaUrls);
}

/**
 * Preserve unrelated post media, remove every old/current campaign banner
 * version, then attach only the latest URLs for the selected banner IDs.
 */
export function applyLatestCampaignBannerMedia(args: {
  mediaUrls: string[];
  campaignBanners: CampaignBannerMedia[];
  selectedBannerIds: string[];
}): string[] {
  const campaignBannerIds = new Set(args.campaignBanners.map((banner) => banner.id.toLowerCase()));
  const currentCampaignUrls = new Set(
    args.campaignBanners
      .map((banner) => banner.imageUrl)
      .filter((url): url is string => Boolean(url)),
  );
  const selectedIds = new Set(args.selectedBannerIds.map((id) => id.toLowerCase()));
  const nonBannerMedia = args.mediaUrls.filter((url) => {
    const embeddedBannerId = bannerIdFromMediaUrl(url);
    return !currentCampaignUrls.has(url)
      && !(embeddedBannerId && campaignBannerIds.has(embeddedBannerId));
  });
  const selectedLatestUrls = args.campaignBanners
    .filter((banner) => selectedIds.has(banner.id.toLowerCase()) && banner.imageUrl)
    .map((banner) => banner.imageUrl as string);

  return uniqueUrls([...nonBannerMedia, ...selectedLatestUrls]);
}
