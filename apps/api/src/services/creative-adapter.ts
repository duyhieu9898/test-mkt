/**
 * Creative Adapter — Adapts banner designs for different ad sizes.
 *
 * Takes original banner design + copy and produces adapted versions
 * optimized for each target format (portrait, square, landscape, small).
 */

interface BannerDesign {
  layout: 'left-text' | 'center' | 'split' | 'bold-cta' | 'testimonial';
  backgroundType: 'gradient' | 'image' | 'solid';
  backgroundValue: string;
  backgroundPrompt?: string;
  colorTheme: {
    primary: string;
    secondary: string;
    text: string;
    ctaBg: string;
    ctaText: string;
  };
  typography: {
    headlineSize: 'sm' | 'md' | 'lg' | 'xl';
    headlineWeight: number;
    alignment: 'left' | 'center' | 'right';
  };
  overlayOpacity?: number;
}

interface BannerCopy {
  headline: string;
  subheadline?: string;
  cta: string;
}

// Standard ad sizes with metadata
export const AD_SIZES = [
  { size: '1200x628', label: 'Facebook / LinkedIn Feed', category: 'Facebook' },
  { size: '1080x1080', label: 'Instagram / Facebook Square', category: 'Instagram' },
  { size: '1080x1920', label: 'Stories (IG / FB / TikTok)', category: 'Stories' },
  { size: '1920x1080', label: 'YouTube Thumbnail', category: 'YouTube' },
  { size: '300x250', label: 'Display Ad', category: 'Display' },
] as const;

export type AdSize = (typeof AD_SIZES)[number]['size'];

/**
 * Determines the aspect ratio category for a given size string.
 */
function getAspectCategory(size: string): 'portrait' | 'square' | 'landscape' | 'small' {
  const [w, h] = size.split('x').map(Number);
  if (w <= 300 && h <= 250) return 'small';
  const ratio = w / h;
  if (ratio < 0.7) return 'portrait';
  if (ratio <= 1.1) return 'square';
  return 'landscape';
}

/**
 * Truncates text to a maximum number of words.
 */
function truncateWords(text: string, maxWords: number): string {
  const words = text.split(' ');
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '...';
}

/**
 * Adapts a banner design and copy for a target ad size.
 *
 * Rules:
 * - Portrait (1080x1920): center layout, xl headline, no subheadline if headline > 5 words
 * - Square (1080x1080): center or bold-cta layout, lg headline
 * - Landscape wide (1920x1080): left-text or split layout, md headline
 * - Small (300x250): center layout, sm headline, truncate headline to 5 words, no subheadline
 */
export function adaptDesignForSize(
  originalDesign: BannerDesign,
  originalSize: string,
  targetSize: string,
  copy: BannerCopy,
): { design: BannerDesign; copy: BannerCopy } {
  // If target is the same as original, return as-is
  if (originalSize === targetSize) {
    return { design: { ...originalDesign }, copy: { ...copy } };
  }

  const category = getAspectCategory(targetSize);
  const adaptedDesign = { ...originalDesign, typography: { ...originalDesign.typography }, colorTheme: { ...originalDesign.colorTheme } };
  const adaptedCopy = { ...copy };

  switch (category) {
    case 'portrait': {
      // Stories format — center layout, xl, drop subheadline for long headlines
      adaptedDesign.layout = 'center';
      adaptedDesign.typography.headlineSize = 'xl';
      adaptedDesign.typography.alignment = 'center';
      const wordCount = copy.headline.split(' ').length;
      if (wordCount > 5) {
        adaptedCopy.subheadline = undefined;
      }
      break;
    }

    case 'square': {
      // Instagram square — keep center or switch to bold-cta, lg headline
      adaptedDesign.layout = originalDesign.layout === 'bold-cta' ? 'bold-cta' : 'center';
      adaptedDesign.typography.headlineSize = 'lg';
      adaptedDesign.typography.alignment = 'center';
      break;
    }

    case 'landscape': {
      // YouTube thumbnail — left-text or split, md headline
      adaptedDesign.layout = originalDesign.layout === 'split' ? 'split' : 'left-text';
      adaptedDesign.typography.headlineSize = 'md';
      adaptedDesign.typography.alignment = adaptedDesign.layout === 'center' ? 'center' : 'left';
      break;
    }

    case 'small': {
      // Display ad — center, sm, truncated, no subheadline
      adaptedDesign.layout = 'center';
      adaptedDesign.typography.headlineSize = 'sm';
      adaptedDesign.typography.alignment = 'center';
      adaptedCopy.headline = truncateWords(copy.headline, 5);
      adaptedCopy.subheadline = undefined;
      break;
    }
  }

  return { design: adaptedDesign, copy: adaptedCopy };
}
