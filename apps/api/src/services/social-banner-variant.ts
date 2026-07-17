import { createHash } from 'crypto';
import { readGeneratedImageFile } from './blog-image-variations';
import type { SocialPlatform } from './campaign-social-generator';
import { saveObject } from './object-storage';

export interface SocialBannerPreset {
  platform: SocialPlatform;
  label: string;
  size: string;
  width: number;
  height: number;
}

export interface SocialBannerVariant {
  imageUrl: string;
  size: string;
  sourceImageUrl: string;
  paddingMode?: 'transparent';
  generatedAt: string;
}

export const SOCIAL_BANNER_PRESETS: Record<SocialPlatform, SocialBannerPreset> = {
  facebook: {
    platform: 'facebook',
    label: 'Facebook',
    size: '1200x628',
    width: 1200,
    height: 628,
  },
  instagram: {
    platform: 'instagram',
    label: 'Instagram',
    size: '1080x1080',
    width: 1080,
    height: 1080,
  },
  linkedin: {
    platform: 'linkedin',
    label: 'LinkedIn',
    size: '1200x628',
    width: 1200,
    height: 628,
  },
};

export function normalizeSocialPlatform(value: string): SocialPlatform | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'facebook' || normalized === 'fb') return 'facebook';
  if (normalized === 'instagram' || normalized === 'ig') return 'instagram';
  if (normalized === 'linkedin' || normalized === 'li') return 'linkedin';
  return null;
}

export function calculateContainRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): { x: number; y: number; width: number; height: number } {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  const width = sourceRatio > targetRatio
    ? targetWidth
    : targetHeight * sourceRatio;
  const height = sourceRatio > targetRatio
    ? targetWidth / sourceRatio
    : targetHeight;

  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height,
  };
}

export async function createSocialBannerVariant(args: {
  bannerId: string;
  sourceImageUrl: string;
  platform: SocialPlatform;
  backgroundColor?: string | null;
}): Promise<SocialBannerVariant> {
  const preset = SOCIAL_BANNER_PRESETS[args.platform];
  const version = createHash('sha1')
    .update(`${args.sourceImageUrl}|${preset.size}|transparent-padding-v2`)
    .digest('hex')
    .slice(0, 12);
  const filename = `social-banner-${args.bannerId}-${preset.size}-${version}.png`;

  const source = await readGeneratedImageFile(args.sourceImageUrl);
  if (!source) {
    throw new Error(`Could not read banner image ${args.sourceImageUrl}`);
  }

  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const image = await loadImage(Buffer.from(source.bytes));
  const canvas = createCanvas(preset.width, preset.height);
  const context = canvas.getContext('2d');
  const rect = calculateContainRect(
    image.width,
    image.height,
    preset.width,
    preset.height,
  );

  // Keep the letterbox/pillarbox area transparent. The social preview can
  // choose its own neutral background, and we avoid baking random brand colors
  // into Instagram square variants.
  context.clearRect(0, 0, preset.width, preset.height);
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height);

  const saved = await saveObject({
    key: `images/${filename}`,
    body: canvas.toBuffer('image/png'),
    contentType: 'image/png',
  });

  return {
    imageUrl: saved.url,
    size: preset.size,
    sourceImageUrl: args.sourceImageUrl,
    paddingMode: 'transparent',
    generatedAt: new Date().toISOString(),
  };
}
