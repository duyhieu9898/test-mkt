/**
 * Creative Quality Validator
 *
 * Checks banner quality across copy, contrast, and accessibility.
 * Used by: Banner generation pipeline, manual validation endpoint.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface QualityCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

export interface QualityReport {
  score: number; // 0-100
  pass: boolean; // score >= 70
  checks: QualityCheck[];
}

// ============================================================================
// CONTRAST HELPERS (WCAG 2.0)
// ============================================================================

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function getRelativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ============================================================================
// VALIDATOR
// ============================================================================

const GENERIC_CTAS = ['learn more', 'click here', 'submit'];

export function validateBanner(banner: {
  copy: { headline: string; subheadline?: string; cta: string };
  design: { colorTheme: { text: string; ctaBg: string; primary: string }; layout: string };
  size: string;
}): QualityReport {
  const checks: QualityCheck[] = [];
  const { copy, design } = banner;

  // 1. Headline length
  const headlineWords = copy.headline.trim().split(/\s+/).length;
  if (headlineWords <= 8) {
    checks.push({ name: 'Headline length', status: 'pass', message: `${headlineWords} words — concise and punchy` });
  } else if (headlineWords <= 10) {
    checks.push({ name: 'Headline length', status: 'warn', message: `${headlineWords} words — try to keep under 8` });
  } else {
    checks.push({ name: 'Headline length', status: 'fail', message: `${headlineWords} words — too long, max 10 words` });
  }

  // 2. CTA length
  const ctaWords = copy.cta.trim().split(/\s+/).length;
  if (ctaWords >= 2 && ctaWords <= 4) {
    checks.push({ name: 'CTA length', status: 'pass', message: `${ctaWords} words — good action phrase` });
  } else if (ctaWords === 5) {
    checks.push({ name: 'CTA length', status: 'warn', message: '5 words — slightly long for a button' });
  } else {
    checks.push({ name: 'CTA length', status: 'fail', message: `${ctaWords} word${ctaWords === 1 ? '' : 's'} — CTA should be 2-4 words` });
  }

  // 3. CTA quality — no generic CTAs
  const ctaLower = copy.cta.trim().toLowerCase();
  if (GENERIC_CTAS.includes(ctaLower)) {
    checks.push({ name: 'CTA quality', status: 'fail', message: `"${copy.cta}" is generic — use a specific action verb` });
  } else {
    checks.push({ name: 'CTA quality', status: 'pass', message: 'CTA is specific and actionable' });
  }

  // 4. Text contrast (WCAG AA: >= 4.5:1)
  try {
    const textContrast = getContrastRatio(design.colorTheme.text, design.colorTheme.primary);
    if (textContrast >= 4.5) {
      checks.push({ name: 'Text contrast', status: 'pass', message: `${textContrast.toFixed(1)}:1 ratio — meets accessibility standards` });
    } else if (textContrast >= 3.0) {
      checks.push({ name: 'Text contrast', status: 'warn', message: `${textContrast.toFixed(1)}:1 ratio — below WCAG AA (4.5:1)` });
    } else {
      checks.push({ name: 'Text contrast', status: 'fail', message: `${textContrast.toFixed(1)}:1 ratio — text may be hard to read` });
    }
  } catch {
    checks.push({ name: 'Text contrast', status: 'warn', message: 'Could not calculate contrast' });
  }

  // 5. Headline clarity — should be about the customer, not the company
  const headlineLower = copy.headline.toLowerCase();
  if (/\b(we|our)\b/.test(headlineLower)) {
    checks.push({ name: 'Headline clarity', status: 'warn', message: 'Headline uses "we/our" — focus on the customer instead' });
  } else {
    checks.push({ name: 'Headline clarity', status: 'pass', message: 'Headline is customer-focused' });
  }

  // 6. Subheadline length
  if (copy.subheadline) {
    const subWords = copy.subheadline.trim().split(/\s+/).length;
    if (subWords <= 15) {
      checks.push({ name: 'Subheadline length', status: 'pass', message: `${subWords} words — good supporting text` });
    } else {
      checks.push({ name: 'Subheadline length', status: 'warn', message: `${subWords} words — try to keep under 15` });
    }
  }

  // 7. No all-caps headline
  if (copy.headline === copy.headline.toUpperCase() && copy.headline.length > 3) {
    checks.push({ name: 'No all-caps', status: 'warn', message: 'ALL CAPS headline feels aggressive — use title case' });
  } else {
    checks.push({ name: 'No all-caps', status: 'pass', message: 'Headline uses proper casing' });
  }

  // 8. CTA contrast — ctaBg vs primary background must be visually distinct
  try {
    const ctaContrast = getContrastRatio(design.colorTheme.ctaBg, design.colorTheme.primary);
    if (ctaContrast >= 3.0) {
      checks.push({ name: 'CTA contrast', status: 'pass', message: `${ctaContrast.toFixed(1)}:1 — CTA button stands out` });
    } else if (ctaContrast >= 1.5) {
      checks.push({ name: 'CTA contrast', status: 'warn', message: `${ctaContrast.toFixed(1)}:1 — CTA button could stand out more` });
    } else {
      checks.push({ name: 'CTA contrast', status: 'fail', message: `${ctaContrast.toFixed(1)}:1 — CTA blends into background` });
    }
  } catch {
    checks.push({ name: 'CTA contrast', status: 'warn', message: 'Could not calculate CTA contrast' });
  }

  // Calculate score
  let score = 100;
  for (const check of checks) {
    if (check.status === 'fail') score -= 15;
    if (check.status === 'warn') score -= 5;
  }
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    pass: score >= 70,
    checks,
  };
}
