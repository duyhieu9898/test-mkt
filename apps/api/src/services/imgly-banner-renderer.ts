import path from 'node:path';
import { readObjectFromPublicUrl, saveObject } from './object-storage';
import type { BrandCreativeKit } from './brand-creative-kit';

export type BannerLayout = 'left-text' | 'split' | 'bold-cta';

export interface BannerRenderInput {
  bannerId: string;
  companyId: string;
  size?: string;
  keyword: string;
  headline: string;
  subheadline?: string;
  cta: string;
  layout: BannerLayout;
  colors: {
    primary: string;
    secondary: string;
    text: string;
    ctaBg: string;
    ctaText: string;
  };
  visualDirection?: string;
  backgroundImageUrl?: string | null;
  brandKit?: BrandCreativeKit | null;
}

export interface BannerRenderResult {
  imageUrl: string;
  imglyScene?: string;
  renderer: 'imgly-node' | 'canvas-fallback';
  brandLogoApplied?: boolean;
}

type Rgba = { r: number; g: number; b: number; a: number };

function parseSize(size?: string): { width: number; height: number } {
  const parts = (size || '1200x628').split('x').map((value) => Number(value));
  const rawW = parts[0] ?? Number.NaN;
  const rawH = parts[1] ?? Number.NaN;
  const width = Number.isFinite(rawW) && rawW > 0 ? rawW : 1200;
  const height = Number.isFinite(rawH) && rawH > 0 ? rawH : 628;
  return {
    width,
    height,
  };
}

function hexToColor(hex?: string): Rgba {
  const normalized = (hex || '#111827').replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
    a: 1,
  };
}

function toCssColor(hex?: string) {
  return hex && hex.startsWith('#') ? hex : '#111827';
}

async function imageUrlToDataUri(imageUrl?: string | null): Promise<string | null> {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('data:')) return imageUrl;
  try {
    const buffer = await readObjectFromPublicUrl(imageUrl);
    if (!buffer) return null;
    const contentType = inferImageContentType(imageUrl);
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.warn('[IMG.LY] Could not prepare banner background image:', (error as Error).message);
  }
  return null;
}

async function imageUrlToFittedDataUri(
  imageUrl: string | null | undefined,
  width: number,
  height: number,
): Promise<string | null> {
  if (!imageUrl) return null;
  try {
    const source = imageUrl.startsWith('data:')
      ? imageUrl
      : await readObjectFromPublicUrl(imageUrl);
    if (!source) return null;
    const { createCanvas, loadImage } = await import('@napi-rs/canvas');
    const image = await loadImage(source instanceof Buffer ? source : source);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const cover = calculateCoverRect(image.width, image.height, width, height);
    const contain = calculateContainRect(image.width, image.height, width, height);

    ctx.save();
    try {
      (ctx as any).filter = 'blur(22px)';
    } catch {
      // Blur is a nice-to-have; a covered backdrop is still better than crop.
    }
    ctx.drawImage(image, cover.x, cover.y, cover.width, cover.height);
    ctx.restore();

    ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, contain.x, contain.y, contain.width, contain.height);

    return `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`;
  } catch (error) {
    console.warn('[IMG.LY] Could not fit banner background image:', (error as Error).message);
    return imageUrlToDataUri(imageUrl);
  }
}

async function prepareLogoImage(
  imageUrl?: string | null,
  maxWidth = 160,
  maxHeight = 64,
): Promise<{ dataUri: string; width: number; height: number } | null> {
  if (!imageUrl) return null;
  try {
    const source = imageUrl.startsWith('data:')
      ? imageUrl
      : await readObjectFromPublicUrl(imageUrl);
    if (!source) return null;

    const { createCanvas, loadImage } = await import('@napi-rs/canvas');
    const image = await loadImage(source instanceof Buffer ? source : source);
    if (!image.width || !image.height) return null;

    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);
    return {
      dataUri: `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`,
      width,
      height,
    };
  } catch (error) {
    console.warn('[IMG.LY] Could not prepare brand logo:', (error as Error).message);
    return null;
  }
}

async function persistBannerPng(filename: string, buffer: Buffer): Promise<string> {
  const saved = await saveObject({
    key: `images/${filename}`,
    body: buffer,
    contentType: 'image/png',
    cacheControl: 'public, max-age=60, must-revalidate',
  });
  return saved.url;
}

function inferImageContentType(url: string): string {
  const lower = path.basename(url.split('?')[0] || '').toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

function calculateContainRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): { x: number; y: number; width: number; height: number } {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  const width = sourceRatio > targetRatio ? targetWidth : targetHeight * sourceRatio;
  const height = sourceRatio > targetRatio ? targetWidth / sourceRatio : targetHeight;
  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height,
  };
}

function calculateCoverRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): { x: number; y: number; width: number; height: number } {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  const width = sourceRatio > targetRatio ? targetHeight * sourceRatio : targetWidth;
  const height = sourceRatio > targetRatio ? targetHeight : targetWidth / sourceRatio;
  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height,
  };
}

function addSolidRect(engine: any, page: number, x: number, y: number, width: number, height: number, color: Rgba) {
  const block = engine.block.create('graphic');
  engine.block.setShape(block, engine.block.createShape('rect'));
  engine.block.setPosition(block, x, y);
  engine.block.setWidth(block, width);
  engine.block.setHeight(block, height);
  const fill = engine.block.createFill('color');
  engine.block.setFill(block, fill);
  engine.block.setFillSolidColor(block, color.r, color.g, color.b, color.a);
  engine.block.appendChild(page, block);
  return block;
}

function addText(
  engine: any,
  page: number,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  color: Rgba,
) {
  const block = engine.block.create('text');
  engine.block.replaceText(block, text);
  engine.block.setPosition(block, x, y);
  engine.block.setWidth(block, width);
  engine.block.setHeight(block, height);
  engine.block.setFloat(block, 'text/fontSize', fontSize);
  engine.block.setTextColor(block, color);
  engine.block.appendChild(page, block);
  return block;
}

async function addImageBackground(engine: any, page: number, width: number, height: number, imageUrl?: string | null) {
  const dataUri = await imageUrlToFittedDataUri(imageUrl, width, height);
  if (!dataUri) return false;

  const block = engine.block.create('graphic');
  engine.block.setShape(block, engine.block.createShape('rect'));
  engine.block.setPosition(block, 0, 0);
  engine.block.setWidth(block, width);
  engine.block.setHeight(block, height);
  const fill = engine.block.createFill('image');
  engine.block.setString(fill, 'fill/image/imageFileURI', dataUri);
  engine.block.setFill(block, fill);
  engine.block.appendChild(page, block);
  return true;
}

async function addBrandLogo(
  engine: any,
  page: number,
  width: number,
  height: number,
  logoUrl?: string | null,
): Promise<boolean> {
  const maxLogoWidth = Math.max(112, width * 0.14);
  const maxLogoHeight = Math.max(42, height * 0.08);
  const logo = await prepareLogoImage(logoUrl, maxLogoWidth, maxLogoHeight);
  if (!logo) return false;

  const padding = Math.max(10, width * 0.012);
  const margin = Math.max(24, width * 0.032);
  const x = width - logo.width - padding * 2 - margin;
  const y = margin;

  addSolidRect(
    engine,
    page,
    x,
    y,
    logo.width + padding * 2,
    logo.height + padding * 2,
    { r: 1, g: 1, b: 1, a: 0.86 },
  );

  const block = engine.block.create('graphic');
  engine.block.setShape(block, engine.block.createShape('rect'));
  engine.block.setPosition(block, x + padding, y + padding);
  engine.block.setWidth(block, logo.width);
  engine.block.setHeight(block, logo.height);
  const fill = engine.block.createFill('image');
  engine.block.setString(fill, 'fill/image/imageFileURI', logo.dataUri);
  engine.block.setFill(block, fill);
  engine.block.appendChild(page, block);
  return true;
}

async function renderWithImgly(input: BannerRenderInput): Promise<BannerRenderResult> {
  const CreativeEngine = (await import('@cesdk/node')).default;
  const license = process.env.CESDK_LICENSE || '';
  const engine = await CreativeEngine.init({
    license,
    userId: input.companyId,
    role: 'Creator',
  } as any);

  try {
    const { width, height } = parseSize(input.size);
    const scene = engine.scene.create('Free', { designUnit: 'Pixel' });
    const page = engine.block.create('page');
    engine.block.setWidth(page, width);
    engine.block.setHeight(page, height);
    engine.block.appendChild(scene, page);

    const primary = hexToColor(input.colors.primary);
    const secondary = hexToColor(input.colors.secondary);
    const textColor = hexToColor(input.colors.text);
    const ctaBg = hexToColor(input.colors.ctaBg);
    const ctaText = hexToColor(input.colors.ctaText);

    const hasImageBackground = await addImageBackground(engine, page, width, height, input.backgroundImageUrl);
    if (!hasImageBackground) {
      addSolidRect(engine, page, 0, 0, width, height, primary);
    } else {
      addSolidRect(engine, page, 0, 0, width, height, { r: 0, g: 0, b: 0, a: 0.28 });
    }

    if (input.layout === 'split') {
      if (!hasImageBackground) addSolidRect(engine, page, width * 0.58, 0, width * 0.42, height, secondary);
      if (!hasImageBackground) {
        addSolidRect(engine, page, width * 0.62, height * 0.12, width * 0.26, height * 0.68, hexToColor('#ffffff'));
      }
    } else if (input.layout === 'bold-cta') {
      addSolidRect(engine, page, 0, height * 0.7, width, height * 0.3, hasImageBackground ? { ...secondary, a: 0.88 } : secondary);
      if (!hasImageBackground) addSolidRect(engine, page, width * 0.06, height * 0.12, width * 0.16, height * 0.06, secondary);
    } else {
      if (!hasImageBackground) addSolidRect(engine, page, width * 0.64, 0, width * 0.36, height, secondary);
      if (!hasImageBackground) {
        addSolidRect(engine, page, width * 0.68, height * 0.16, width * 0.2, height * 0.52, hexToColor('#ffffff'));
      }
    }

    addText(engine, page, input.headline, width * 0.07, height * 0.2, width * 0.54, height * 0.24, Math.max(46, width * 0.052), textColor);
    addText(engine, page, input.subheadline || input.visualDirection || '', width * 0.07, height * 0.49, width * 0.48, height * 0.15, Math.max(24, width * 0.025), textColor);
    addSolidRect(engine, page, width * 0.07, height * 0.72, width * 0.22, height * 0.1, ctaBg);
    addText(engine, page, input.cta, width * 0.09, height * 0.745, width * 0.18, height * 0.05, Math.max(20, width * 0.02), ctaText);
    const brandLogoApplied = await addBrandLogo(engine, page, width, height, input.brandKit?.logoUrl);

    const blob = await engine.block.export(page, { mimeType: 'image/png' });
    const arrayBuffer = await blob.arrayBuffer();
    const filename = `campaigns/${input.companyId}/banners/${input.bannerId}/imgly-auto-banner-${input.bannerId}-current.png`;
    const imageUrl = await persistBannerPng(filename, Buffer.from(arrayBuffer));
    const imglyScene = await engine.scene.saveToString({ allowedResourceSchemes: ['data', 'bundle'] });
    return { imageUrl, imglyScene, renderer: 'imgly-node', brandLogoApplied };
  } finally {
    engine.dispose();
  }
}

function wrapText(ctx: any, text: string, maxWidth: number, maxLines: number) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

async function renderWithCanvasFallback(input: BannerRenderInput): Promise<BannerRenderResult> {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const { width, height } = parseSize(input.size);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const dataUri = await imageUrlToFittedDataUri(input.backgroundImageUrl, width, height);
  if (dataUri) {
    try {
      const image = await loadImage(dataUri);
      ctx.drawImage(image, 0, 0, width, height);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
      ctx.fillRect(0, 0, width, height);
    } catch {
      ctx.fillStyle = toCssColor(input.colors.primary);
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, toCssColor(input.colors.primary));
    gradient.addColorStop(0.58, toCssColor(input.colors.primary));
    gradient.addColorStop(1, toCssColor(input.colors.secondary));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.fillStyle = toCssColor(input.colors.secondary);
  if (input.layout === 'split') {
    if (!dataUri) ctx.fillRect(width * 0.6, 0, width * 0.4, height);
  } else if (input.layout === 'bold-cta') {
    ctx.fillRect(0, height * 0.7, width, height * 0.3);
  } else {
    if (!dataUri) ctx.fillRect(width * 0.66, 0, width * 0.34, height);
  }

  if (!dataUri) {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.arc(width * 0.82, height * 0.35, height * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }

  const headlineFont = input.brandKit?.fonts.headline || 'Arial';
  const bodyFont = input.brandKit?.fonts.body || 'Arial';
  ctx.fillStyle = toCssColor(input.colors.text);
  ctx.font = `800 ${Math.max(58, width * 0.06)}px "${headlineFont}", Arial`;
  for (const [index, line] of wrapText(ctx, input.headline, width * 0.54, 2).entries()) {
    ctx.fillText(line, width * 0.07, height * 0.25 + index * height * 0.12);
  }

  ctx.font = `400 ${Math.max(26, width * 0.028)}px "${bodyFont}", Arial`;
  for (const [index, line] of wrapText(ctx, input.subheadline || input.visualDirection || '', width * 0.5, 3).entries()) {
    ctx.fillText(line, width * 0.07, height * 0.53 + index * height * 0.065);
  }

  const ctaX = width * 0.07;
  const ctaY = height * 0.74;
  const ctaW = width * 0.22;
  const ctaH = height * 0.1;
  ctx.fillStyle = toCssColor(input.colors.ctaBg);
  ctx.roundRect(ctaX, ctaY, ctaW, ctaH, 12);
  ctx.fill();
  ctx.fillStyle = toCssColor(input.colors.ctaText);
  ctx.font = `700 ${Math.max(22, width * 0.022)}px "${bodyFont}", Arial`;
  ctx.fillText(input.cta, ctaX + width * 0.025, ctaY + ctaH * 0.62);

  let brandLogoApplied = false;
  const logo = await prepareLogoImage(input.brandKit?.logoUrl, Math.max(112, width * 0.14), Math.max(42, height * 0.08));
  if (logo) {
    const padding = Math.max(10, width * 0.012);
    const margin = Math.max(24, width * 0.032);
    const x = width - logo.width - padding * 2 - margin;
    const y = margin;
    const logoImage = await loadImage(logo.dataUri);
    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.fillRect(x, y, logo.width + padding * 2, logo.height + padding * 2);
    ctx.drawImage(logoImage, x + padding, y + padding, logo.width, logo.height);
    brandLogoApplied = true;
  }

  const buffer = canvas.toBuffer('image/png');
  const filename = `campaigns/${input.companyId}/banners/${input.bannerId}/canvas-auto-banner-${input.bannerId}-current.png`;
  const imageUrl = await persistBannerPng(filename, buffer);
  return { imageUrl, renderer: 'canvas-fallback', brandLogoApplied };
}

export async function renderBannerImage(input: BannerRenderInput): Promise<BannerRenderResult> {
  try {
    return await renderWithImgly(input);
  } catch (error) {
    console.warn('[IMG.LY] Headless banner render failed; using canvas fallback:', (error as Error).message);
    return renderWithCanvasFallback(input);
  }
}
