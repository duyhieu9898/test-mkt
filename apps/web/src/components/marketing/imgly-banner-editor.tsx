'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CreativeEditor from '@cesdk/cesdk-js/react';
import type CreativeEditorSDK from '@cesdk/cesdk-js';
import {
  BlurAssetSource,
  ColorPaletteAssetSource,
  CropPresetsAssetSource,
  DemoAssetSources,
  EffectsAssetSource,
  FiltersAssetSource,
  ImageColorsAssetSource,
  PagePresetsAssetSource,
  StickerAssetSource,
  TextAssetSource,
  TextComponentAssetSource,
  TypefaceAssetSource,
  UploadAssetSources,
  VectorShapeAssetSource,
} from '@cesdk/cesdk-js/plugins';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, AlertTriangle, ImagePlus } from 'lucide-react';
import { BannerPhotoEditorConfig } from '@/lib/imgly/photo-editor-config';

type BannerForEditor = {
  id: string;
  companyId?: string;
  name?: string;
  size?: string;
  imageUrl?: string | null;
  copy?: {
    headline?: string;
    subheadline?: string;
    cta?: string;
  } | null;
  design?: {
    backgroundValue?: string;
    backgroundType?: string;
    backgroundImageProvider?: string;
    backgroundOnly?: boolean;
    imglyArchiveUrl?: string;
    imglyScene?: string;
    imglySceneImageUrl?: string;
    colorTheme?: {
      primary?: string;
      secondary?: string;
      text?: string;
      ctaBg?: string;
      ctaText?: string;
    };
    brandKit?: {
      logoUrl?: string | null;
    } | null;
  } | null;
};

type ImglyBannerEditorProps = {
  open: boolean;
  companyId: string;
  banner: BannerForEditor | null;
  token: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (banner: BannerForEditor & { imageUrl?: string; design?: any }) => void;
};

function parseSize(size?: string) {
  const [rawW, rawH] = (size || '1200x628').split('x').map((value) => Number(value));
  return {
    width: Number.isFinite(rawW) && rawW > 0 ? rawW : 1200,
    height: Number.isFinite(rawH) && rawH > 0 ? rawH : 628,
  };
}

function hexToColor(hex?: string) {
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

function getApiAssetBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1').replace(/\/api\/v1\/?$/, '');
}

function getApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1').replace(/\/+$/, '');
}

function shouldProxyRemoteAssetUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith('.amazonaws.com')
      || parsed.hostname.endsWith('.cloudfront.net')
      || /\/[^/]+\/(?:assets|images|campaigns)\//.test(parsed.pathname);
  } catch {
    return false;
  }
}

function toEditorAssetUrl(url?: string | null) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) {
    return shouldProxyRemoteAssetUrl(url)
      ? `${getApiBaseUrl()}/asset-proxy?url=${encodeURIComponent(url)}`
      : url;
  }
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (url.startsWith('/images/') || url.startsWith('/uploads/')) {
    return `${getApiAssetBaseUrl()}${url}`;
  }
  return url;
}

function loadImageForCanvas(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (!src.startsWith('data:')) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load background image'));
    image.src = src;
  });
}

function fitRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  mode: 'cover' | 'contain',
) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  const useWidth =
    mode === 'cover'
      ? sourceRatio < targetRatio
      : sourceRatio > targetRatio;
  const width = useWidth ? targetWidth : targetHeight * sourceRatio;
  const height = useWidth ? targetWidth / sourceRatio : targetHeight;
  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height,
  };
}

async function createFittedBackgroundDataUrl(src: string, width: number, height: number) {
  const image = await loadImageForCanvas(src);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return src;

  const cover = fitRect(image.naturalWidth, image.naturalHeight, width, height, 'cover');
  const contain = fitRect(image.naturalWidth, image.naturalHeight, width, height, 'contain');

  ctx.save();
  ctx.filter = 'blur(22px)';
  ctx.drawImage(image, cover.x, cover.y, cover.width, cover.height);
  ctx.restore();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, contain.x, contain.y, contain.width, contain.height);

  return canvas.toDataURL('image/png');
}

async function createLogoDataUrl(src: string, maxWidth: number, maxHeight: number) {
  const image = await loadImageForCanvas(src);
  const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl: src, width, height };
  ctx.drawImage(image, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL('image/png'), width, height };
}

function normalizeSceneAssetUrls(scene: string) {
  const apiBase = getApiAssetBaseUrl();
  return scene
    .replace(/(:\s*")\/images\//g, `$1${apiBase}/images/`)
    .replace(/(:\s*")\/uploads\//g, `$1${apiBase}/uploads/`);
}

async function loadEditorScene(cesdk: CreativeEditorSDK, scene: string) {
  const normalizedScene = normalizeSceneAssetUrls(scene);
  if (typeof (cesdk as any).loadFromString === 'function') {
    await (cesdk as any).loadFromString(normalizedScene);
    return;
  }
  const engine = (cesdk as any).engine;
  await engine.scene.loadFromString(normalizedScene);
}

async function saveEditorScene(cesdk: CreativeEditorSDK) {
  const engine = (cesdk as any).engine;
  if (engine?.scene && typeof engine.scene.saveToString === 'function') {
    return await engine.scene.saveToString({
      allowedResourceSchemes: ['data', 'http', 'https', 'blob', 'bundle'],
    });
  }
  if (typeof (cesdk as any).save === 'function') {
    const saved = await (cesdk as any).save();
    if (typeof saved === 'string') return saved;
    if (saved instanceof Blob) return await saved.text();
    if (saved && typeof saved === 'object') return JSON.stringify(saved);
    return '';
  }
  return '';
}

async function flushEditorChanges(cesdk: CreativeEditorSDK): Promise<void> {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement) {
    activeElement.blur();
  }

  const engine = (cesdk as any).engine;
  try {
    engine?.editor?.setEditMode?.('Transform');
  } catch {
    // Some block types do not expose edit modes. Blur + render frames still
    // commit the inspector input before export.
  }

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

async function createBannerScene(cesdk: CreativeEditorSDK, banner: BannerForEditor) {
  const engine = (cesdk as any).engine;
  const { width, height } = parseSize(banner.size);
  const theme = banner.design?.colorTheme || {};
  const copy = banner.copy || {};

  if (banner.design?.imglyArchiveUrl) {
    try {
      const archiveUrl = toEditorAssetUrl(banner.design.imglyArchiveUrl);
      if (typeof (cesdk as any).loadFromArchiveURL === 'function') {
        await (cesdk as any).loadFromArchiveURL(archiveUrl);
      } else {
        await engine.scene.loadFromArchiveURL(archiveUrl);
      }
      return;
    } catch (error) {
      console.warn('[IMG.LY] Could not load saved archive, trying fallback scene:', error);
    }
  }

  const hasEditedExportImage = Boolean(banner.imageUrl?.includes('imgly-banner-'));
  const sceneMatchesCurrentImage = banner.design?.imglySceneImageUrl === banner.imageUrl;
  const hasInitialGeneratedScene = Boolean(
    banner.design?.imglyScene
    && !banner.design?.imglySceneImageUrl
    && (
      banner.imageUrl?.includes('imgly-auto-banner-')
      || banner.imageUrl?.includes('canvas-auto-banner-')
    ),
  );
  if (banner.design?.imglyScene && (hasInitialGeneratedScene || (hasEditedExportImage && sceneMatchesCurrentImage))) {
    try {
      await loadEditorScene(cesdk, banner.design.imglyScene);
      return;
    } catch (error) {
      console.warn('[IMG.LY] Could not load saved scene, creating a new one:', error);
    }
  }

  const scene = engine.scene.create('Free', { designUnit: 'Pixel' });
  let page = engine.scene.getCurrentPage() || engine.scene.getPages()[0];
  if (!page) {
    page = engine.block.create('page');
    engine.block.appendChild(scene, page);
  }
  if (!page) throw new Error('IMG.LY editor could not create a page.');
  engine.block.setWidth(page, width);
  engine.block.setHeight(page, height);

  const background = engine.block.create('graphic');
  engine.block.setShape(background, engine.block.createShape('rect'));
  engine.block.setPositionX(background, 0);
  engine.block.setPositionY(background, 0);
  engine.block.setWidth(background, width);
  engine.block.setHeight(background, height);
  const backgroundImageUrl = banner.design?.backgroundType === 'image'
    ? banner.design.backgroundValue
    : undefined;
  if (backgroundImageUrl) {
    const backgroundFill = engine.block.createFill('image');
    const editorImageUrl = toEditorAssetUrl(backgroundImageUrl);
    const fittedImageUrl = await createFittedBackgroundDataUrl(editorImageUrl, width, height)
      .catch(() => editorImageUrl);
    engine.block.setString(backgroundFill, 'fill/image/imageFileURI', fittedImageUrl);
    engine.block.setFill(background, backgroundFill);
  } else {
    const backgroundFill = engine.block.createFill('color');
    engine.block.setFill(background, backgroundFill);
    engine.block.setFillSolidColor(
      background,
      hexToColor(theme.primary || '#0f766e').r,
      hexToColor(theme.primary || '#0f766e').g,
      hexToColor(theme.primary || '#0f766e').b,
      1,
    );
  }
  engine.block.appendChild(page, background);

  const backgroundOnly = banner.design?.backgroundOnly === true
    || banner.design?.backgroundImageProvider === 'uploaded_assets';
  if (backgroundOnly) {
    engine.scene.zoomToBlock(page);
    return;
  }

  if (backgroundImageUrl) {
    const overlay = engine.block.create('graphic');
    engine.block.setShape(overlay, engine.block.createShape('rect'));
    engine.block.setPositionX(overlay, 0);
    engine.block.setPositionY(overlay, 0);
    engine.block.setWidth(overlay, width);
    engine.block.setHeight(overlay, height);
    const overlayFill = engine.block.createFill('color');
    engine.block.setFill(overlay, overlayFill);
    engine.block.setFillSolidColor(overlay, 0, 0, 0, 0.28);
    engine.block.appendChild(page, overlay);
  } else {
    const accent = engine.block.create('graphic');
    engine.block.setShape(accent, engine.block.createShape('rect'));
    engine.block.setPositionX(accent, width * 0.62);
    engine.block.setPositionY(accent, 0);
    engine.block.setWidth(accent, width * 0.38);
    engine.block.setHeight(accent, height);
    const accentFill = engine.block.createFill('color');
    const accentColor = hexToColor(theme.secondary || '#f59e0b');
    engine.block.setFill(accent, accentFill);
    engine.block.setFillSolidColor(accent, accentColor.r, accentColor.g, accentColor.b, 1);
    engine.block.appendChild(page, accent);
  }

  const headline = engine.block.create('text');
  engine.block.replaceText(headline, copy.headline || banner.name || 'Campaign headline');
  engine.block.setPositionX(headline, width * 0.08);
  engine.block.setPositionY(headline, height * 0.24);
  engine.block.setWidth(headline, width * 0.54);
  engine.block.setHeight(headline, height * 0.22);
  engine.block.setFloat(headline, 'text/fontSize', Math.max(48, width * 0.055));
  engine.block.setTextColor(headline, hexToColor(theme.text || '#ffffff'));
  engine.block.appendChild(page, headline);

  const subheadline = engine.block.create('text');
  engine.block.replaceText(subheadline, copy.subheadline || 'Add a concise supporting message here.');
  engine.block.setPositionX(subheadline, width * 0.08);
  engine.block.setPositionY(subheadline, height * 0.5);
  engine.block.setWidth(subheadline, width * 0.48);
  engine.block.setHeight(subheadline, height * 0.16);
  engine.block.setFloat(subheadline, 'text/fontSize', Math.max(24, width * 0.026));
  engine.block.setTextColor(subheadline, hexToColor(theme.text || '#ffffff'));
  engine.block.appendChild(page, subheadline);

  const ctaBox = engine.block.create('graphic');
  engine.block.setShape(ctaBox, engine.block.createShape('rect'));
  engine.block.setPositionX(ctaBox, width * 0.08);
  engine.block.setPositionY(ctaBox, height * 0.72);
  engine.block.setWidth(ctaBox, width * 0.22);
  engine.block.setHeight(ctaBox, height * 0.1);
  const ctaFill = engine.block.createFill('color');
  const ctaBg = hexToColor(theme.ctaBg || '#ffffff');
  engine.block.setFill(ctaBox, ctaFill);
  engine.block.setFillSolidColor(ctaBox, ctaBg.r, ctaBg.g, ctaBg.b, 1);
  engine.block.appendChild(page, ctaBox);

  const cta = engine.block.create('text');
  engine.block.replaceText(cta, copy.cta || 'Learn More');
  engine.block.setPositionX(cta, width * 0.095);
  engine.block.setPositionY(cta, height * 0.745);
  engine.block.setWidth(cta, width * 0.19);
  engine.block.setHeight(cta, height * 0.05);
  engine.block.setFloat(cta, 'text/fontSize', Math.max(20, width * 0.02));
  engine.block.setTextColor(cta, hexToColor(theme.ctaText || '#111827'));
  engine.block.appendChild(page, cta);

  const logoUrl = banner.design?.brandKit?.logoUrl;
  if (logoUrl) {
    try {
      const maxLogoWidth = Math.max(112, width * 0.14);
      const maxLogoHeight = Math.max(42, height * 0.08);
      const logo = await createLogoDataUrl(toEditorAssetUrl(logoUrl), maxLogoWidth, maxLogoHeight);
      const padding = Math.max(10, width * 0.012);
      const margin = Math.max(24, width * 0.032);
      const x = width - logo.width - padding * 2 - margin;
      const y = margin;

      const logoBg = engine.block.create('graphic');
      engine.block.setShape(logoBg, engine.block.createShape('rect'));
      engine.block.setPositionX(logoBg, x);
      engine.block.setPositionY(logoBg, y);
      engine.block.setWidth(logoBg, logo.width + padding * 2);
      engine.block.setHeight(logoBg, logo.height + padding * 2);
      const logoBgFill = engine.block.createFill('color');
      engine.block.setFill(logoBg, logoBgFill);
      engine.block.setFillSolidColor(logoBg, 1, 1, 1, 0.86);
      engine.block.appendChild(page, logoBg);

      const logoBlock = engine.block.create('graphic');
      engine.block.setShape(logoBlock, engine.block.createShape('rect'));
      engine.block.setPositionX(logoBlock, x + padding);
      engine.block.setPositionY(logoBlock, y + padding);
      engine.block.setWidth(logoBlock, logo.width);
      engine.block.setHeight(logoBlock, logo.height);
      const logoFill = engine.block.createFill('image');
      engine.block.setString(logoFill, 'fill/image/imageFileURI', logo.dataUrl);
      engine.block.setFill(logoBlock, logoFill);
      engine.block.appendChild(page, logoBlock);
    } catch (error) {
      console.warn('[IMG.LY] Could not add brand logo to editable scene:', error);
    }
  }

  engine.scene.zoomToBlock(page);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timeout));
  });
}

async function loadExtendedEditorAssets(cesdk: CreativeEditorSDK) {
  const version = (cesdk as any).version || '1.76.0';
  const assetBaseUrl = `https://cdn.img.ly/packages/imgly/cesdk-js/${version}/assets/`;
  const plugins = [
    new ImageColorsAssetSource(),
    new ColorPaletteAssetSource({ baseURL: assetBaseUrl }),
    new TypefaceAssetSource({ baseURL: assetBaseUrl }),
    new TextAssetSource({ baseURL: assetBaseUrl }),
    new TextComponentAssetSource({ baseURL: assetBaseUrl }),
    new VectorShapeAssetSource({ baseURL: assetBaseUrl }),
    new StickerAssetSource({ baseURL: assetBaseUrl }),
    new EffectsAssetSource({ baseURL: assetBaseUrl }),
    new FiltersAssetSource({ baseURL: assetBaseUrl }),
    new BlurAssetSource({ baseURL: assetBaseUrl }),
    new PagePresetsAssetSource({ baseURL: assetBaseUrl }),
    new CropPresetsAssetSource({ baseURL: assetBaseUrl }),
    new UploadAssetSources({
      include: [
        {
          id: 'ly.img.image.upload',
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
        },
      ],
    }),
    new DemoAssetSources({
      baseURL: assetBaseUrl,
      include: ['ly.img.image', 'ly.img.templates'],
    }),
  ];

  for (const plugin of plugins) {
    try {
      await withTimeout((cesdk as any).addPlugin(plugin), 8000, plugin.name);
    } catch (error) {
      console.warn(`[IMG.LY] Could not load editor plugin ${plugin.name}:`, error);
    }
  }
}

export function ImglyBannerEditor({
  open,
  companyId,
  banner,
  token,
  onOpenChange,
  onSaved,
}: ImglyBannerEditorProps) {
  const cesdkRef = useRef<CreativeEditorSDK | null>(null);
  const backgroundInputRef = useRef<HTMLInputElement | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const licenseValue = process.env.NEXT_PUBLIC_CESDK_LICENSE || '';
  const license = licenseValue || null;

  const config = useMemo(() => ({
    license,
    userId: companyId,
    role: 'Creator',
  }), [companyId, license]);

  useEffect(() => {
    if (open && banner) {
      setReady(false);
    } else {
      cesdkRef.current = null;
      setReady(false);
      setSaving(false);
    }
  }, [banner?.id, open]);

  const openInspector = () => {
    const cesdk = cesdkRef.current as any;
    if (!cesdk) return;
    try {
      cesdk.ui?.setView?.('advanced');
      cesdk.ui?.openPanel?.('//ly.img.panel/inspector', { position: 'right' });
    } catch (error) {
      toast.error((error as Error).message || 'Could not open editor controls');
    }
  };

  const selectBlock = (block: number) => {
    const engine = (cesdkRef.current as any)?.engine;
    if (!engine) return;
    try {
      engine.block.select?.(block);
    } catch {
      try {
        engine.block.setSelected?.(block, true);
      } catch {
        // Selection is a convenience only; editing still works from canvas.
      }
    }
  };

  const replaceBackground = async (file: File) => {
    const engine = (cesdkRef.current as any)?.engine;
    if (!engine) return;
    try {
      const page = engine.scene.getCurrentPage() || engine.scene.getPages()[0];
      if (!page) throw new Error('No editable page found');
      const width = engine.block.getWidth?.(page) || parseSize(banner?.size).width;
      const height = engine.block.getHeight?.(page) || parseSize(banner?.size).height;
      const dataUrl = await readFileAsDataUrl(file);
      const fittedDataUrl = await createFittedBackgroundDataUrl(dataUrl, width, height)
        .catch(() => dataUrl);
      const children = engine.block.getChildren?.(page) || [];
      let background = children.find((child: number) => engine.block.getType?.(child) === '//ly.img.ubq/graphic');
      if (!background) {
        background = engine.block.create('graphic');
        engine.block.setShape(background, engine.block.createShape('rect'));
        engine.block.setPositionX(background, 0);
        engine.block.setPositionY(background, 0);
        engine.block.setWidth(background, width);
        engine.block.setHeight(background, height);
        engine.block.appendChild(page, background);
      }
      const fill = engine.block.createFill('image');
      engine.block.setString(fill, 'fill/image/imageFileURI', fittedDataUrl);
      engine.block.setFill(background, fill);
      engine.block.setPositionX(background, 0);
      engine.block.setPositionY(background, 0);
      engine.block.setWidth(background, width);
      engine.block.setHeight(background, height);
      selectBlock(background);
      openInspector();
      toast.success('Background image replaced.');
    } catch (error) {
      toast.error((error as Error).message || 'Could not replace background');
    } finally {
      if (backgroundInputRef.current) backgroundInputRef.current.value = '';
    }
  };

  const save = async () => {
    if (!banner || !token || !cesdkRef.current) return;
    setSaving(true);
    try {
      const engine = (cesdkRef.current as any).engine;
      const page = engine.scene.getCurrentPage() || engine.scene.getPages()[0];
      if (!page) throw new Error('No editable banner page found.');
      await flushEditorChanges(cesdkRef.current);
      const width = Math.round(engine.block.getWidth?.(page) || parseSize(banner.size).width);
      const height = Math.round(engine.block.getHeight?.(page) || parseSize(banner.size).height);
      const scene = await saveEditorScene(cesdkRef.current);
      if (!scene.trim()) {
        throw new Error('Could not save the editable banner design. Please reload the editor and try again.');
      }
      const blob = await engine.block.export(page, { mimeType: 'image/png' });
      const formData = new FormData();
      formData.append('file', blob, `${banner.id}.png`);
      formData.append('scene', scene);
      formData.append('size', `${width}x${height}`);

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';
      const response = await fetch(`${apiUrl}/marketing/company/${companyId}/banners/${banner.id}/imgly-export`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || result?.message || 'Failed to save IMG.LY banner export');
      }
      toast.success('Banner image saved.');
      onSaved?.(result.banner);
      onOpenChange(false);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save banner image');
    } finally {
      setSaving(false);
    }
  };

  const handleEditorInit = useCallback(async (cesdk: CreativeEditorSDK) => {
    if (!banner) return;
    cesdkRef.current = cesdk;
    try {
      await (cesdk as any).addPlugin(new BannerPhotoEditorConfig());
      (cesdk as any).engine?.editor?.setSetting?.(
        'upload/supportedMimeTypes',
        'image/png,image/jpeg,image/webp,image/svg+xml',
      );
    } catch (error) {
      console.warn('[IMG.LY] Could not apply editor settings:', error);
    }
    try {
      await createBannerScene(cesdk, banner);
    } catch (error) {
      console.error('[IMG.LY] Could not create banner scene:', error);
      toast.error((error as Error).message || 'Could not create banner editor scene');
    } finally {
      setReady(true);
    }
    void loadExtendedEditorAssets(cesdk);
  }, [banner]);

  const handleEditorError = useCallback((error: { message?: string }) => {
    toast.error(error.message || 'IMG.LY editor failed to load');
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] w-[96vw] h-[92vh] p-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle>Edit banner image</DialogTitle>
              <DialogDescription>
                Edit the banner visually, then save a PNG for social publishing.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 pr-8">
              <input
                ref={backgroundInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void replaceBackground(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => backgroundInputRef.current?.click()}
                disabled={!ready || saving || !banner}
                className="gap-2"
              >
                <ImagePlus className="w-4 h-4" />
                Background
              </Button>
              {!license && (
                <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700">
                  <AlertTriangle className="w-3 h-3" />
                  Evaluation mode: watermark
                </Badge>
              )}
              <Button onClick={save} disabled={!ready || saving || !banner} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save image
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="h-[calc(92vh-74px)] bg-muted">
          {banner && open && (
            <CreativeEditor
              key={banner.id}
              config={config as any}
              width="100%"
              height="100%"
              init={handleEditorInit}
              onError={handleEditorError}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
