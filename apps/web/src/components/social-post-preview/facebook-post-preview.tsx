'use client';

import { MoreHorizontal, ThumbsUp, MessageCircle, Share2, Globe2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FacebookPostPreviewProps {
  content: string;
  hashtags?: string[] | null;
  brandName: string;
  brandAvatarUrl?: string;
  timestamp?: string;
  imageUrl?: string;
}

function initialOf(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

const FB_BLUE = '#1877F2';

export function FacebookPostPreview({
  content,
  hashtags,
  brandName,
  brandAvatarUrl,
  timestamp = 'now',
  imageUrl,
}: FacebookPostPreviewProps) {
  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-start gap-3 p-3">
        {brandAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brandAvatarUrl}
            alt={brandName}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
            style={{ backgroundColor: FB_BLUE }}
          >
            {initialOf(brandName)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-slate-900 truncate">{brandName}</div>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <span>Sponsored</span>
            <span>·</span>
            <span>{timestamp}</span>
            <span>·</span>
            <Globe2 className="w-3 h-3" />
          </div>
        </div>
        <button
          type="button"
          className="p-1 text-slate-500 hover:bg-slate-100 rounded-full"
          aria-label="More"
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="px-3 pb-3">
        <p className="text-[15px] leading-snug text-slate-900 whitespace-pre-wrap break-words">
          {content}
        </p>
        {hashtags && hashtags.length > 0 && (
          <p className="mt-2 text-[15px] leading-snug break-words">
            {hashtags.map((h, i) => (
              <span key={i} style={{ color: FB_BLUE }} className="mr-1">
                {h.startsWith('#') ? h : `#${h}`}
              </span>
            ))}
          </p>
        )}
      </div>

      {/* Optional image */}
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="w-full object-cover max-h-80" />
      )}

      {/* Reaction summary */}
      <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-500 border-t border-slate-100">
        <div className="flex items-center gap-1">
          <span
            className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px]"
            style={{ backgroundColor: FB_BLUE }}
          >
            <ThumbsUp className="w-2.5 h-2.5" fill="white" />
          </span>
          <span>1.2K</span>
        </div>
        <div>43 comments · 18 shares</div>
      </div>

      {/* Action bar */}
      <div className="grid grid-cols-3 border-t border-slate-100">
        {[
          { Icon: ThumbsUp, label: 'Like' },
          { Icon: MessageCircle, label: 'Comment' },
          { Icon: Share2, label: 'Share' },
        ].map(({ Icon, label }) => (
          <button
            key={label}
            type="button"
            className={cn(
              'flex items-center justify-center gap-2 py-2 text-sm font-medium text-slate-600',
              'hover:bg-slate-50 hover:text-[#1877F2] transition-colors',
            )}
          >
            <Icon className="w-5 h-5" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
