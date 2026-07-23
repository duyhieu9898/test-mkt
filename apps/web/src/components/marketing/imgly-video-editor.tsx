'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CreativeEditor from '@cesdk/cesdk-js/react';
import type CreativeEditorSDK from '@cesdk/cesdk-js';
import {
  ColorPaletteAssetSource,
  DemoAssetSources,
  ImageColorsAssetSource,
  PagePresetsAssetSource,
  TextAssetSource,
  TextComponentAssetSource,
  TypefaceAssetSource,
  UploadAssetSources,
  VectorShapeAssetSource,
} from '@cesdk/cesdk-js/plugins';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2, Save, Video } from 'lucide-react';

type CampaignVideoForEditor = {
  id: string;
  title: string;
  aspectRatio: '9:16' | '16:9' | '1:1';
  outputUrl?: string | null;
  script?: {
    imglyScene?: string;
    imglySceneVideoUrl?: string;
    overlay?: {
      headline?: string;
      subheadline?: string;
      cta?: string;
    };
    brandKit?: {
      colors?: {
        primary?: string;
        secondary?: string;
        text?: string;
        ctaBg?: string;
        ctaText?: string;
      };
      logoUrl?: string | null;
      companyName?: string;
    };
  } | null;
};

type ImglyVideoEditorProps = {
  open: boolean;
  companyId: string;
  video: CampaignVideoForEditor | null;
  token: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: (video: CampaignVideoForEditor & { outputUrl?: string }) => void;
};

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

function videoCanvasSize(aspectRatio?: string) {
  if (aspectRatio === '16:9') return { width: 1920, height: 1080 };
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 };
  return { width: 1080, height: 1920 };
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
  await (cesdk as any).engine.scene.loadFromString(normalizedScene);
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
  }
  return '';
}

async function flushEditorChanges(cesdk: CreativeEditorSDK): Promise<void> {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement) activeElement.blur();
  try {
    (cesdk as any).engine?.editor?.setEditMode?.('Transform');
  } catch {
    // Some SDK builds do not expose transform mode for video blocks.
  }
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function createTextBlock(engine: any, page: number, args: {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
}) {
  const block = engine.block.create('text');
  engine.block.replaceText(block, args.text);
  engine.block.setPositionX(block, args.x);
  engine.block.setPositionY(block, args.y);
  engine.block.setWidth(block, args.width);
  engine.block.setHeight(block, args.height);
  engine.block.setFloat(block, 'text/fontSize', args.fontSize);
  engine.block.setTextColor(block, hexToColor(args.color));
  engine.block.appendChild(page, block);
  return block;
}

async function createVideoScene(cesdk: CreativeEditorSDK, video: CampaignVideoForEditor) {
  if (!video.outputUrl) throw new Error('This video does not have a rendered file yet.');
  const savedSceneMatches = video.script?.imglyScene && video.script.imglySceneVideoUrl === video.outputUrl;
  if (savedSceneMatches) {
    try {
      await loadEditorScene(cesdk, video.script!.imglyScene!);
      return;
    } catch (error) {
      console.warn('[IMG.LY] Could not load saved video scene, creating a new one:', error);
    }
  }

  const engine = (cesdk as any).engine;
  const { width, height } = videoCanvasSize(video.aspectRatio);
  const theme = video.script?.brandKit?.colors ?? {};
  const overlay = video.script?.overlay ?? {};
  const scene = typeof engine.scene.createVideo === 'function'
    ? engine.scene.createVideo()
    : engine.scene.create('Free', { designUnit: 'Pixel' });
  let page = engine.scene.getCurrentPage?.() || engine.scene.getPages?.()[0];
  if (!page) {
    page = engine.block.create('page');
    engine.block.appendChild(scene, page);
  }
  engine.block.setWidth(page, width);
  engine.block.setHeight(page, height);
  engine.block.setDuration?.(page, 8);

  const videoBlock = engine.block.create('graphic');
  engine.block.setShape(videoBlock, engine.block.createShape('rect'));
  engine.block.setPositionX(videoBlock, 0);
  engine.block.setPositionY(videoBlock, 0);
  engine.block.setWidth(videoBlock, width);
  engine.block.setHeight(videoBlock, height);
  engine.block.setDuration?.(videoBlock, 8);
  const videoFill = engine.block.createFill('video');
  engine.block.setString(videoFill, 'fill/video/fileURI', toEditorAssetUrl(video.outputUrl));
  engine.block.setFill(videoBlock, videoFill);

  try {
    const track = engine.block.create('track');
    engine.block.appendChild(page, track);
    engine.block.appendChild(track, videoBlock);
    engine.block.fillParent?.(track);
  } catch {
    engine.block.appendChild(page, videoBlock);
  }

  const shade = engine.block.create('graphic');
  engine.block.setShape(shade, engine.block.createShape('rect'));
  engine.block.setPositionX(shade, 0);
  engine.block.setPositionY(shade, 0);
  engine.block.setWidth(shade, width);
  engine.block.setHeight(shade, height);
  const shadeFill = engine.block.createFill('color');
  engine.block.setFill(shade, shadeFill);
  engine.block.setFillSolidColor(shade, 0, 0, 0, 0.24);
  engine.block.appendChild(page, shade);

  const isPortrait = height > width;
  const left = isPortrait ? width * 0.08 : width * 0.07;
  const headlineTop = isPortrait ? height * 0.18 : height * 0.22;
  createTextBlock(engine, page, {
    text: overlay.headline || video.title,
    x: left,
    y: headlineTop,
    width: isPortrait ? width * 0.82 : width * 0.52,
    height: isPortrait ? height * 0.16 : height * 0.18,
    fontSize: isPortrait ? 76 : 70,
    color: theme.text || '#ffffff',
  });
  createTextBlock(engine, page, {
    text: overlay.subheadline || 'A short campaign message goes here.',
    x: left,
    y: headlineTop + (isPortrait ? height * 0.18 : height * 0.21),
    width: isPortrait ? width * 0.78 : width * 0.48,
    height: isPortrait ? height * 0.1 : height * 0.12,
    fontSize: isPortrait ? 36 : 34,
    color: theme.text || '#ffffff',
  });

  const ctaBox = engine.block.create('graphic');
  engine.block.setShape(ctaBox, engine.block.createShape('rect'));
  engine.block.setPositionX(ctaBox, left);
  engine.block.setPositionY(ctaBox, isPortrait ? height * 0.72 : height * 0.7);
  engine.block.setWidth(ctaBox, isPortrait ? width * 0.42 : width * 0.22);
  engine.block.setHeight(ctaBox, isPortrait ? height * 0.07 : height * 0.1);
  const ctaFill = engine.block.createFill('color');
  engine.block.setFill(ctaBox, ctaFill);
  const ctaBg = hexToColor(theme.ctaBg || theme.secondary || '#6366f1');
  engine.block.setFillSolidColor(ctaBox, ctaBg.r, ctaBg.g, ctaBg.b, 0.94);
  engine.block.appendChild(page, ctaBox);
  createTextBlock(engine, page, {
    text: overlay.cta || 'Learn More',
    x: left + (isPortrait ? width * 0.035 : width * 0.025),
    y: (isPortrait ? height * 0.72 : height * 0.7) + (isPortrait ? height * 0.02 : height * 0.028),
    width: isPortrait ? width * 0.35 : width * 0.17,
    height: isPortrait ? height * 0.04 : height * 0.05,
    fontSize: isPortrait ? 32 : 28,
    color: theme.ctaText || '#ffffff',
  });

  engine.scene.zoomToBlock?.(page);
}

async function loadEditorAssets(cesdk: CreativeEditorSDK) {
  try {
    const version = (cesdk as any).version || '1.76.0';
    const assetBaseUrl = `https://cdn.img.ly/packages/imgly/cesdk-js/${version}/assets/`;
    await Promise.allSettled([
      (cesdk as any).addPlugin?.(new TextAssetSource({ baseURL: assetBaseUrl })),
      (cesdk as any).addPlugin?.(new TextComponentAssetSource({ baseURL: assetBaseUrl })),
      (cesdk as any).addPlugin?.(new TypefaceAssetSource({ baseURL: assetBaseUrl })),
      (cesdk as any).addPlugin?.(new VectorShapeAssetSource({ baseURL: assetBaseUrl })),
      (cesdk as any).addPlugin?.(new ColorPaletteAssetSource({ baseURL: assetBaseUrl })),
      (cesdk as any).addPlugin?.(new ImageColorsAssetSource()),
      (cesdk as any).addPlugin?.(new PagePresetsAssetSource({ baseURL: assetBaseUrl })),
      (cesdk as any).addPlugin?.(new UploadAssetSources({
        include: [
          { id: 'ly.img.video.upload', mimeTypes: ['video/mp4', 'video/webm'] },
          { id: 'ly.img.image.upload', mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'] },
        ],
      })),
      (cesdk as any).addPlugin?.(new DemoAssetSources({
        baseURL: assetBaseUrl,
        include: ['ly.img.video', 'ly.img.image', 'ly.img.templates'],
      })),
    ]);
  } catch {
    // Extra asset sources are a convenience; the generated scene still works.
  }
}

export function ImglyVideoEditor({
  open,
  companyId,
  video,
  token,
  onOpenChange,
  onSaved,
}: ImglyVideoEditorProps) {
  const cesdkRef = useRef<CreativeEditorSDK | null>(null);
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
    if (open && video) {
      setReady(false);
    } else {
      cesdkRef.current = null;
      setReady(false);
      setSaving(false);
    }
  }, [open, video?.id]);

  const save = async () => {
    if (!video || !token || !cesdkRef.current) return;
    setSaving(true);
    try {
      const engine = (cesdkRef.current as any).engine;
      const page = engine.scene.getCurrentPage?.() || engine.scene.getPages?.()[0];
      if (!page) throw new Error('No editable video page found.');
      await flushEditorChanges(cesdkRef.current);
      const scene = await saveEditorScene(cesdkRef.current);
      const exportOptions = { mimeType: 'video/mp4' };
      const blob = await engine.block.export(page, exportOptions);
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error('IMG.LY did not export a video file.');
      }

      const formData = new FormData();
      formData.append('file', blob, `${video.id}.mp4`);
      formData.append('scene', scene);
      formData.append('duration', '8');

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';
      const response = await fetch(`${apiUrl}/marketing/company/${companyId}/videos/${video.id}/imgly-export`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || result?.message || 'Failed to save edited video.');
      }
      toast.success('Video saved.');
      onSaved?.(result.video);
      onOpenChange(false);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save video.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditorInit = useCallback(async (cesdk: CreativeEditorSDK) => {
    if (!video) return;
    cesdkRef.current = cesdk;
    try {
      await createVideoScene(cesdk, video);
    } catch (error) {
      console.error('[IMG.LY] Could not create video scene:', error);
      toast.error((error as Error).message || 'Could not create video editor scene.');
    } finally {
      setReady(true);
    }
    void loadEditorAssets(cesdk);
  }, [video]);

  const handleEditorError = useCallback((error: { message?: string }) => {
    toast.error(error.message || 'IMG.LY video editor failed to load.');
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] w-[96vw] max-w-[96vw] overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle>Edit campaign video</DialogTitle>
              <DialogDescription>
                Edit the video visually, then save an MP4 for campaign publishing.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 pr-8">
              {!license && (
                <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700">
                  <AlertTriangle className="h-3 w-3" />
                  Evaluation mode: watermark
                </Badge>
              )}
              <Button onClick={save} disabled={!ready || saving || !video?.outputUrl} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save video
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="h-[calc(92vh-74px)] bg-muted">
          {video && open ? (
            <CreativeEditor
              key={video.id}
              config={config as any}
              width="100%"
              height="100%"
              init={handleEditorInit}
              onError={handleEditorError}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-500">
              <Video className="mr-2 h-4 w-4" />
              No video selected
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
