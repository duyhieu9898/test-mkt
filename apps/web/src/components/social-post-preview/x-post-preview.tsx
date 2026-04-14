'use client';

import {
  MoreHorizontal,
  MessageCircle,
  Repeat2,
  Heart,
  BarChart2,
  Bookmark,
  Share,
  BadgeCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface XPostPreviewProps {
  content: string;
  hashtags?: string[] | null;
  brandName: string;
  brandAvatarUrl?: string;
  timestamp?: string;
  imageUrl?: string;
  verified?: boolean;
  darkMode?: boolean;
}

const X_BLUE = '#1D9BF0';

function initialOf(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function handleFrom(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 15) || 'brand';
}

export function XPostPreview({
  content,
  hashtags,
  brandName,
  brandAvatarUrl,
  timestamp = '2h',
  imageUrl,
  verified = true,
  darkMode = false,
}: XPostPreviewProps) {
  const bg = darkMode ? 'bg-black' : 'bg-white';
  const border = darkMode ? 'border-neutral-800' : 'border-slate-200';
  const primaryText = darkMode ? 'text-white' : 'text-slate-900';
  const mutedText = darkMode ? 'text-neutral-500' : 'text-slate-500';
  const hoverBg = darkMode ? 'hover:bg-neutral-900' : 'hover:bg-slate-50';

  return (
    <div
      className={cn(
        'w-full max-w-md rounded-xl border shadow-sm overflow-hidden font-sans',
        bg,
        border,
      )}
    >
      <div className="p-3 flex gap-3">
        {brandAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brandAvatarUrl}
            alt={brandName}
            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
            style={{ backgroundColor: X_BLUE }}
          >
            {initialOf(brandName)}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-1 text-[15px]">
            <span className={cn('font-bold truncate', primaryText)}>{brandName}</span>
            {verified && (
              <BadgeCheck className="w-4 h-4 flex-shrink-0" style={{ color: X_BLUE }} fill={X_BLUE} stroke={darkMode ? '#000' : '#fff'} />
            )}
            <span className={cn('truncate', mutedText)}>@{handleFrom(brandName)}</span>
            <span className={mutedText}>·</span>
            <span className={mutedText}>{timestamp}</span>
            <button
              type="button"
              className={cn('ml-auto p-1 rounded-full', hoverBg, mutedText)}
              aria-label="More"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <p className={cn('mt-1 text-[15px] leading-snug whitespace-pre-wrap break-words', primaryText)}>
            {content}
          </p>
          {hashtags && hashtags.length > 0 && (
            <p className="mt-1 text-[15px] leading-snug break-words">
              {hashtags.map((h, i) => (
                <span key={i} className="mr-1" style={{ color: X_BLUE }}>
                  {h.startsWith('#') ? h : `#${h}`}
                </span>
              ))}
            </p>
          )}

          {/* Optional image */}
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              className={cn('mt-2 rounded-2xl border w-full object-cover max-h-80', border)}
            />
          )}

          {/* Action bar */}
          <div className={cn('mt-3 flex items-center justify-between text-xs', mutedText)}>
            <button type="button" className="flex items-center gap-1.5 hover:text-[#1D9BF0]">
              <MessageCircle className="w-4 h-4" />
              <span>42</span>
            </button>
            <button type="button" className="flex items-center gap-1.5 hover:text-green-500">
              <Repeat2 className="w-4 h-4" />
              <span>128</span>
            </button>
            <button type="button" className="flex items-center gap-1.5 hover:text-pink-500">
              <Heart className="w-4 h-4" />
              <span>1.2K</span>
            </button>
            <button type="button" className="flex items-center gap-1.5 hover:text-[#1D9BF0]">
              <BarChart2 className="w-4 h-4" />
              <span>24K</span>
            </button>
            <div className="flex items-center gap-1">
              <button type="button" className="p-1 rounded-full hover:text-[#1D9BF0]">
                <Bookmark className="w-4 h-4" />
              </button>
              <button type="button" className="p-1 rounded-full hover:text-[#1D9BF0]">
                <Share className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
