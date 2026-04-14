'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Download, Edit3, RefreshCw, CheckCircle2, X, Save, Lightbulb,
  Image as ImageIcon, Palette, Type, Layout, Maximize2, Minimize2, Copy,
  ShieldCheck, AlertTriangle, XCircle, ChevronDown, ChevronUp, HelpCircle,
} from 'lucide-react';
import { WhyThisOutputDialog } from './why-this-output';

// ============================================================================
// TYPES
// ============================================================================

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

interface QualityCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

interface QualityReport {
  score: number;
  pass: boolean;
  checks: QualityCheck[];
}

interface BannerData {
  id: string;
  companyId: string;
  name: string;
  size: string;
  status: string;
  concept?: string;
  angle?: string;
  copy: { headline: string; subheadline?: string; cta: string; reasoning?: string; brandColor?: string };
  design?: BannerDesign;
  strategyTag?: string;
  imageUrl?: string;
  qualityScore?: number;
  qualityReport?: QualityReport;
}

interface BannerCardProps {
  banner: BannerData;
  onApprove?: (id: string) => void;
  onRegenerate?: (id: string) => void;
  onUpdateBanner?: (id: string, updates: { copy?: any; design?: any }) => void | Promise<void>;
  onGenerateBackground?: (id: string) => void | Promise<void>;
  onExportSizes?: (id: string) => void | Promise<void>;
  onPickImage?: (bannerId: string, callback: (imageUrl: string) => void) => void;
}

// ============================================================================
// SIZE CONFIG
// ============================================================================

// Preview scale — large enough to see full banner without clipping
const sizeDims: Record<string, { w: number; h: number; scale: number }> = {
  '1200x628': { w: 1200, h: 628, scale: 0.32 },
  '1080x1080': { w: 1080, h: 1080, scale: 0.25 },
  '1080x1920': { w: 1080, h: 1920, scale: 0.14 },
  '1920x1080': { w: 1920, h: 1080, scale: 0.2 },
  '300x250': { w: 300, h: 250, scale: 0.9 },
};

// Full-size preview scales
const previewDims: Record<string, { w: number; h: number; scale: number }> = {
  '1200x628': { w: 1200, h: 628, scale: 0.55 },
  '1080x1080': { w: 1080, h: 1080, scale: 0.42 },
  '1080x1920': { w: 1080, h: 1920, scale: 0.3 },
  '1920x1080': { w: 1920, h: 1080, scale: 0.38 },
  '300x250': { w: 300, h: 250, scale: 1.2 },
};

const headlineSizes: Record<string, number> = { sm: 13, md: 15, lg: 18, xl: 22 };

// ============================================================================
// DEFAULT DESIGN
// ============================================================================

const defaultDesign: BannerDesign = {
  layout: 'center',
  backgroundType: 'gradient',
  backgroundValue: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  colorTheme: {
    primary: '#6366f1', secondary: '#8b5cf6',
    text: '#ffffff', ctaBg: '#ffffff', ctaText: '#6366f1',
  },
  typography: { headlineSize: 'lg', headlineWeight: 800, alignment: 'center' },
  overlayOpacity: 0.6,
};

// ============================================================================
// WORD WRAP UTILITY
// ============================================================================

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [text];
}

// ============================================================================
// BANNER CARD COMPONENT
// ============================================================================

export function BannerCard({ banner, onApprove, onRegenerate, onUpdateBanner, onGenerateBackground, onExportSizes, onPickImage }: BannerCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);
  const [showQualityDetails, setShowQualityDetails] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const companyId = banner.companyId;
  const [editCopy, setEditCopy] = useState(banner.copy);
  const [editDesign, setEditDesign] = useState<BannerDesign>(banner.design || defaultDesign);
  const bannerRef = useRef<HTMLDivElement>(null);

  // Sync state when banner prop updates (after save + refetch)
  useEffect(() => {
    if (!isEditing) {
      setEditCopy(banner.copy);
      setEditDesign(banner.design || defaultDesign);
    }
  }, [banner.copy, banner.design, banner.imageUrl, isEditing]);

  const design = isEditing ? editDesign : (banner.design || defaultDesign);
  const copy = isEditing ? editCopy : banner.copy;
  const currentDims = isPreviewing
    ? (previewDims[banner.size] || previewDims['1200x628'])
    : (sizeDims[banner.size] || sizeDims['1200x628']);
  const dims = sizeDims[banner.size] || sizeDims['1200x628']; // for download
  const renderW = currentDims.w * currentDims.scale;
  const renderH = currentDims.h * currentDims.scale;

  const hSize = headlineSizes[design.typography.headlineSize] || 17;
  const subSize = Math.round(hSize * 0.65);
  const ctaSize = Math.round(hSize * 0.55);
  const isSmall = banner.size === '300x250';

  const handleSave = () => {
    onUpdateBanner?.(banner.id, { copy: editCopy, design: editDesign });
    setIsEditing(false);
  };

  const cycleLayout = () => {
    const layouts: BannerDesign['layout'][] = ['left-text', 'center', 'split', 'bold-cta', 'testimonial'];
    const currentIdx = layouts.indexOf(editDesign.layout);
    const nextLayout = layouts[(currentIdx + 1) % layouts.length];
    setEditDesign({
      ...editDesign,
      layout: nextLayout,
      typography: {
        ...editDesign.typography,
        alignment: nextLayout === 'left-text' || nextLayout === 'split' ? 'left' : 'center',
        headlineSize: nextLayout === 'bold-cta' ? 'xl' : nextLayout === 'center' ? 'lg' : 'md',
      },
    });
  };

  // ========== DOWNLOAD ==========
  const handleDownload = useCallback(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    if (design.backgroundType === 'image' && (banner.imageUrl || design.backgroundValue)) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = banner.imageUrl || design.backgroundValue;
        });
        // Draw with cover-fit (maintain aspect ratio, crop to fill)
        const imgRatio = img.naturalWidth / img.naturalHeight;
        const canvasRatio = dims.w / dims.h;
        let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
        if (imgRatio > canvasRatio) {
          // Image wider than canvas — crop sides
          sw = img.naturalHeight * canvasRatio;
          sx = (img.naturalWidth - sw) / 2;
        } else {
          // Image taller than canvas — crop top/bottom
          sh = img.naturalWidth / canvasRatio;
          sy = (img.naturalHeight - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dims.w, dims.h);
        // Overlay
        ctx.fillStyle = `rgba(0,0,0,${design.overlayOpacity || 0.5})`;
        ctx.fillRect(0, 0, dims.w, dims.h);
      } catch {
        drawGradient(ctx, dims.w, dims.h, design.colorTheme.primary, design.colorTheme.secondary);
      }
    } else if (design.backgroundType === 'solid') {
      ctx.fillStyle = design.backgroundValue || design.colorTheme.primary;
      ctx.fillRect(0, 0, dims.w, dims.h);
    } else {
      drawGradient(ctx, dims.w, dims.h, design.colorTheme.primary, design.colorTheme.secondary);
    }

    // Text
    const fullH = Math.round(hSize / dims.scale);
    const fullSub = Math.round(subSize / dims.scale);
    const fullCta = Math.round(ctaSize / dims.scale);
    const maxW = dims.w * (design.layout === 'split' ? 0.45 : 0.7);
    const isLeft = design.typography.alignment === 'left';
    const textX = isLeft ? dims.w * 0.08 : dims.w / 2;

    ctx.textAlign = isLeft ? 'left' : 'center';
    ctx.fillStyle = design.colorTheme.text;
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 6;

    // Headline
    ctx.font = `${design.typography.headlineWeight} ${fullH}px system-ui`;
    const lines = wrapText(ctx, copy.headline, maxW);
    let y = design.layout === 'bold-cta' ? dims.h * 0.3 : dims.h * 0.35;
    for (const line of lines) {
      ctx.fillText(line, textX, y, maxW);
      y += fullH * 1.2;
    }

    // Subheadline
    if (copy.subheadline && design.layout !== 'bold-cta') {
      ctx.font = `400 ${fullSub}px system-ui`;
      ctx.globalAlpha = 0.9;
      y += fullSub * 0.3;
      const subLines = wrapText(ctx, copy.subheadline, maxW);
      for (const line of subLines) {
        ctx.fillText(line, textX, y, maxW);
        y += fullSub * 1.2;
      }
      ctx.globalAlpha = 1;
    }

    // CTA
    ctx.shadowBlur = 0;
    const ctaW = Math.max(180, copy.cta.length * fullCta * 0.65);
    const ctaH = fullCta * 2.8;
    const ctaX = isLeft ? dims.w * 0.08 : (dims.w - ctaW) / 2;
    const ctaY = Math.min(y + fullSub * 0.5, dims.h * 0.78);
    ctx.fillStyle = design.colorTheme.ctaBg;
    ctx.beginPath();
    ctx.roundRect(ctaX, ctaY, ctaW, ctaH, 8);
    ctx.fill();
    ctx.fillStyle = design.colorTheme.ctaText;
    ctx.textAlign = 'center';
    ctx.font = `700 ${fullCta}px system-ui`;
    ctx.fillText(copy.cta, ctaX + ctaW / 2, ctaY + ctaH / 2 + fullCta * 0.35);

    const link = document.createElement('a');
    link.download = `banner-${banner.size}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [banner, copy, design, dims, hSize, subSize, ctaSize]);

  // ========== RENDER BANNER ==========
  const hasImage = design.backgroundType === 'image' && !!(banner.imageUrl || design.backgroundValue);
  const imageUrl = hasImage ? (banner.imageUrl || design.backgroundValue) : '';
  const bgColor = design.backgroundType === 'solid'
    ? design.backgroundValue
    : (design.backgroundValue || `linear-gradient(135deg, ${design.colorTheme.primary}, ${design.colorTheme.secondary})`);

  const textShadow = hasImage ? '0 1px 4px rgba(0,0,0,0.7)' : 'none';

  const sharedStyle: React.CSSProperties = {
    width: renderW, height: renderH, position: 'relative',
    overflow: 'hidden', borderRadius: 6, fontFamily: 'system-ui',
    background: hasImage ? undefined : bgColor,
  };

  // Image background element — separate for proper object-fit: cover
  const imageBgElement = hasImage ? (
    <img
      src={imageUrl}
      alt=""
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', objectPosition: 'center',
        zIndex: 0,
      }}
    />
  ) : null;

  const overlayStyle: React.CSSProperties | undefined = hasImage ? {
    position: 'absolute', inset: 0,
    background: `rgba(0,0,0,${design.overlayOpacity || 0.5})`,
  } : undefined;

  const textStyle = (size: number, weight = 400, opacity = 1): React.CSSProperties => ({
    fontSize: size, fontWeight: weight, color: design.colorTheme.text,
    lineHeight: 1.2, textShadow, opacity,
    textAlign: design.typography.alignment,
  });

  const ctaBtnStyle: React.CSSProperties = {
    display: 'inline-block',
    background: design.colorTheme.ctaBg,
    color: design.colorTheme.ctaText,
    fontSize: ctaSize, fontWeight: 700,
    padding: `${isSmall ? 3 : 6}px ${isSmall ? 10 : 20}px`,
    borderRadius: 6,
  };

  const renderContent = () => {
    const textBlock = (
      <>
        <p style={textStyle(hSize, design.typography.headlineWeight)}>{copy.headline}</p>
        {copy.subheadline && design.layout !== 'bold-cta' && (
          <p style={{ ...textStyle(subSize, 400, 0.85), marginTop: 4 }}>{copy.subheadline}</p>
        )}
        <div style={{ marginTop: isSmall ? 6 : 10, textAlign: design.typography.alignment }}>
          <span style={ctaBtnStyle}>{copy.cta}</span>
        </div>
      </>
    );

    const padding = `${renderH * 0.1}px ${renderW * 0.06}px`;

    switch (design.layout) {
      case 'left-text':
        return (
          <div style={{ ...sharedStyle, display: 'flex', alignItems: 'center' }}>
            {imageBgElement}
            {overlayStyle && <div style={overlayStyle} />}
            <div style={{ padding, position: 'relative', zIndex: 1, maxWidth: '60%' }}>{textBlock}</div>
          </div>
        );

      case 'split':
        return (
          <div style={{ ...sharedStyle, display: 'flex' }}>
            <div style={{ flex: '0 0 55%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `0 ${renderW * 0.05}px`, position: 'relative', zIndex: 1 }}>
              {imageBgElement}
            {overlayStyle && <div style={overlayStyle} />}
              <div style={{ position: 'relative', zIndex: 1 }}>{textBlock}</div>
            </div>
            <div style={{ flex: '0 0 45%', background: `linear-gradient(135deg, ${design.colorTheme.secondary}40, ${design.colorTheme.primary}20)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '50%', height: '50%', borderRadius: '20%', background: `${design.colorTheme.secondary}30`, border: `2px solid ${design.colorTheme.secondary}20` }} />
            </div>
          </div>
        );

      case 'bold-cta':
        return (
          <div style={{ ...sharedStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            {imageBgElement}
            {overlayStyle && <div style={overlayStyle} />}
            <div style={{ position: 'relative', zIndex: 1, padding: `0 ${renderW * 0.08}px` }}>
              <p style={{ ...textStyle(hSize * 1.2, 900), marginBottom: 12 }}>{copy.headline}</p>
              <span style={{ ...ctaBtnStyle, fontSize: ctaSize * 1.3, padding: `${isSmall ? 5 : 10}px ${isSmall ? 16 : 32}px` }}>{copy.cta}</span>
            </div>
          </div>
        );

      case 'testimonial':
        return (
          <div style={{ ...sharedStyle, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
            {imageBgElement}
            {overlayStyle && <div style={overlayStyle} />}
            <div style={{ position: 'relative', zIndex: 1, padding: `0 ${renderW * 0.1}px` }}>
              <p style={{ ...textStyle(hSize * 0.5, 400, 0.6), marginBottom: 4 }}>What parents say</p>
              <p style={{ ...textStyle(hSize, 600), fontStyle: 'italic' }}>&ldquo;{copy.headline}&rdquo;</p>
              {copy.subheadline && <p style={{ ...textStyle(subSize, 400, 0.7), marginTop: 6 }}>— {copy.subheadline}</p>}
              <div style={{ marginTop: 10 }}><span style={ctaBtnStyle}>{copy.cta}</span></div>
            </div>
          </div>
        );

      default: // center
        return (
          <div style={{ ...sharedStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            {imageBgElement}
            {overlayStyle && <div style={overlayStyle} />}
            <div style={{ position: 'relative', zIndex: 1, padding: `0 ${renderW * 0.1}px`, maxWidth: '90%' }}>{textBlock}</div>
          </div>
        );
    }
  };

  const handleGenerateBackground = async () => {
    if (!onGenerateBackground || isGeneratingBg) return;
    setIsGeneratingBg(true);
    try {
      await onGenerateBackground(banner.id);
    } finally {
      setIsGeneratingBg(false);
    }
  };

  const handleExportSizes = async () => {
    if (!onExportSizes || isExporting) return;
    setIsExporting(true);
    try {
      await onExportSizes(banner.id);
    } finally {
      setIsExporting(false);
    }
  };

  // ========== CARD UI ==========
  return (
    <>
      <Card className="overflow-hidden">
        {/* Banner Preview — click to expand */}
        <div
          ref={bannerRef}
          className="flex justify-center bg-muted/30 p-2 cursor-pointer group relative"
          onClick={() => !isEditing && setIsPreviewing(true)}
        >
          {renderContent()}
          {/* Preview hint overlay */}
          {!isEditing && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-all">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full p-2 shadow">
                <Maximize2 className="w-4 h-4 text-foreground" />
              </div>
            </div>
          )}
        </div>

        <CardContent className="p-3">
          {isEditing ? (
            <div className="space-y-2">
              <Input value={editCopy.headline} onChange={(e) => setEditCopy({ ...editCopy, headline: e.target.value })} placeholder="Headline (max 8 words)" className="text-xs h-7" />
              <Input value={editCopy.subheadline || ''} onChange={(e) => setEditCopy({ ...editCopy, subheadline: e.target.value })} placeholder="Subheadline" className="text-xs h-7" />
              <Input value={editCopy.cta} onChange={(e) => setEditCopy({ ...editCopy, cta: e.target.value })} placeholder="CTA (2-4 words)" className="text-xs h-7" />

              {/* Design controls */}
              <div className="flex gap-1 pt-1 flex-wrap">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={cycleLayout}>
                  <Layout className="w-3 h-3" /> {editDesign.layout}
                </Button>
                {onPickImage && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
                    onPickImage(banner.id, (imageUrl) => {
                      setEditDesign({
                        ...editDesign,
                        backgroundType: 'image',
                        backgroundValue: imageUrl,
                        overlayOpacity: 0.55,
                      });
                    });
                  }}>
                    <ImageIcon className="w-3 h-3" /> Pick Image
                  </Button>
                )}
                {onGenerateBackground && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleGenerateBackground} disabled={isGeneratingBg}>
                    {isGeneratingBg ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
                    {isGeneratingBg ? 'Generating...' : 'AI Image'}
                  </Button>
                )}
              </div>

              {/* Color quick picks */}
              <div className="flex gap-1.5">
                {['#6366f1', '#dc2626', '#059669', '#1e3a5f', '#7c3aed', '#ea580c'].map((color) => (
                  <button
                    key={color}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${editDesign.colorTheme.primary === color ? 'border-foreground scale-110' : 'border-transparent hover:border-foreground/30'}`}
                    style={{ background: color }}
                    onClick={() => setEditDesign({
                      ...editDesign,
                      colorTheme: { ...editDesign.colorTheme, primary: color },
                      backgroundValue: `linear-gradient(135deg, ${color}, ${editDesign.colorTheme.secondary})`,
                      backgroundType: 'gradient',
                    })}
                  />
                ))}
              </div>

              <div className="flex gap-1">
                <Button size="sm" className="flex-1 gap-1 h-7 text-xs" onClick={handleSave}><Save className="w-3 h-3" /> Save</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setIsEditing(false); setEditCopy(banner.copy); setEditDesign(banner.design || defaultDesign); }}><X className="w-3 h-3" /></Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Badge className={`text-[9px] ${banner.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{banner.status}</Badge>
                {banner.angle && <Badge variant="outline" className="text-[9px]">{banner.angle}</Badge>}
                <span className="text-[9px] text-muted-foreground ml-auto">{banner.size}</span>
              </div>

              {banner.copy?.reasoning && (
                <p className="text-[10px] text-muted-foreground italic mb-1.5 line-clamp-2 flex items-start gap-1">
                  <Lightbulb className="w-3 h-3 shrink-0 mt-0.5 text-amber-500" />
                  {banner.copy.reasoning}
                </p>
              )}

              {/* Quality Score Indicator */}
              {banner.qualityScore !== undefined && (
                <div className="mb-1.5">
                  <button
                    className="flex items-center gap-1.5 text-[10px] w-full rounded px-1.5 py-1 hover:bg-muted/50 transition-colors"
                    onClick={() => setShowQualityDetails(!showQualityDetails)}
                  >
                    {banner.qualityScore >= 80 ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                        <span className="font-medium text-green-700">Ad ready</span>
                      </>
                    ) : banner.qualityScore >= 50 ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                        <span className="font-medium text-yellow-700">Review</span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                        <span className="font-medium text-red-700">Fix issues</span>
                      </>
                    )}
                    <span className="text-muted-foreground ml-auto">{banner.qualityScore}/100</span>
                    {showQualityDetails
                      ? <ChevronUp className="w-3 h-3 text-muted-foreground" />
                      : <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    }
                  </button>
                  {showQualityDetails && banner.qualityReport?.checks && (
                    <div className="mt-1 space-y-0.5 pl-1">
                      {banner.qualityReport.checks.map((check, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[10px]">
                          {check.status === 'pass' ? (
                            <ShieldCheck className="w-3 h-3 text-green-500 shrink-0 mt-0.5" />
                          ) : check.status === 'warn' ? (
                            <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                          )}
                          <span className="text-muted-foreground">
                            <span className="font-medium text-foreground">{check.name}:</span> {check.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-1 flex-wrap">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setIsPreviewing(true)}>
                  <Maximize2 className="w-3 h-3" /> Preview
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 flex-1" onClick={() => setIsEditing(true)}>
                  <Edit3 className="w-3 h-3" /> Edit
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleDownload}>
                  <Download className="w-3 h-3" />
                </Button>
                {onExportSizes && (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleExportSizes} disabled={isExporting}>
                    {isExporting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                    {isExporting ? 'Exporting...' : 'All Sizes'}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 text-indigo-600 hover:text-indigo-700 border-indigo-200"
                  onClick={() => setExplainOpen(true)}
                  title="See which model, tier, and Business Brain sources shaped this banner"
                >
                  <HelpCircle className="w-3 h-3" /> Why?
                </Button>
                {banner.status === 'draft' && onApprove && (
                  <Button size="sm" className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700" onClick={() => onApprove(banner.id)}>
                    <CheckCircle2 className="w-3 h-3" /> Use
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ========== PREVIEW MODAL ========== */}
      {isPreviewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setIsPreviewing(false)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            {/* Large preview — renderContent uses previewDims when isPreviewing=true */}
            {renderContent()}
            {/* Close + actions */}
            <div className="flex items-center justify-center gap-2 mt-3">
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={handleDownload}>
                <Download className="w-4 h-4" /> Download PNG
              </Button>
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => { setIsPreviewing(false); setIsEditing(true); }}>
                <Edit3 className="w-4 h-4" /> Edit
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5 text-white hover:text-white hover:bg-white/20" onClick={() => setIsPreviewing(false)}>
                <X className="w-4 h-4" /> Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* "Why this output?" explainability panel */}
      <WhyThisOutputDialog
        open={explainOpen}
        onClose={() => setExplainOpen(false)}
        fetchUrl={
          explainOpen
            ? `/marketing/company/${companyId}/banners/${banner.id}/explain`
            : null
        }
      />
    </>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function drawGradient(ctx: CanvasRenderingContext2D, w: number, h: number, color1: string, color2: string) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, color1);
  grad.addColorStop(1, color2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}
