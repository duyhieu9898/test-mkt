'use client';

import type { ReactNode } from 'react';
import { BadgeCheck, BarChart2, Bookmark, Heart, MessageCircle, MoreHorizontal, Repeat2, Share } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PostPreviewMetrics } from './index';
import { ExpandablePostText } from './expandable-post-text';
import { PostMediaGrid } from './post-media-grid';
import { formatPostMetric, formatPostTimestamp, hasPostMetrics } from './post-preview-meta';

export interface XPostPreviewProps {
  content: string;
  hashtags?: string[] | null;
  brandName: string;
  brandAvatarUrl?: string;
  timestamp?: string | null;
  isPublished?: boolean;
  metrics?: PostPreviewMetrics | null;
  imageUrl?: string;
  mediaUrls?: string[] | null;
  verified?: boolean;
  darkMode?: boolean;
  headerAction?: ReactNode;
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
  timestamp,
  isPublished = false,
  metrics,
  imageUrl,
  mediaUrls,
  verified = false,
  darkMode = false,
  headerAction,
}: XPostPreviewProps) {
  const images = mediaUrls?.length ? mediaUrls : imageUrl ? [imageUrl] : [];
  const bg = darkMode ? 'bg-black' : 'bg-white';
  const border = darkMode ? 'border-neutral-800' : 'border-slate-200';
  const primaryText = darkMode ? 'text-white' : 'text-slate-900';
  const mutedText = darkMode ? 'text-neutral-500' : 'text-slate-500';
  const hoverBg = darkMode ? 'hover:bg-neutral-900' : 'hover:bg-slate-50';
  const publishedTime = formatPostTimestamp(timestamp);
  const showMetrics = isPublished && hasPostMetrics(metrics);

  return (
    <div className={cn('w-full max-w-md overflow-hidden rounded-xl border font-sans shadow-sm', bg, border)}>
      <div className="flex gap-3 p-3">
        {brandAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brandAvatarUrl} alt={brandName} className="h-10 w-10 flex-shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ backgroundColor: X_BLUE }}>
            {initialOf(brandName)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[15px]">
            <span className={cn('truncate font-bold', primaryText)} title={brandName}>{brandName}</span>
            {verified && <BadgeCheck className="h-4 w-4 flex-shrink-0" style={{ color: X_BLUE }} fill={X_BLUE} stroke={darkMode ? '#000' : '#fff'} />}
            <span className={cn('truncate', mutedText)}>@{handleFrom(brandName)}</span>
            {isPublished && publishedTime && <span className={mutedText} aria-hidden>·</span>}
            {isPublished && publishedTime && <span className={mutedText}>{publishedTime}</span>}
            {!isPublished && <span className={mutedText}>Draft preview</span>}
            <div className="ml-auto shrink-0">
              {headerAction ?? (
                <button type="button" className={cn('rounded-full p-1', hoverBg, mutedText)} aria-label="More">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <ExpandablePostText
            text={content}
            threshold={180}
            className={cn('mt-1 whitespace-pre-wrap break-words text-[15px] leading-snug', primaryText)}
            buttonClassName={cn(mutedText, 'hover:text-slate-700')}
          />
          {hashtags && hashtags.length > 0 && (
            <p className="mt-1 break-words text-[15px] leading-snug">
              {hashtags.map((hashtag) => (
                <span key={hashtag} className="mr-1" style={{ color: X_BLUE }}>
                  {hashtag.startsWith('#') ? hashtag : `#${hashtag}`}
                </span>
              ))}
            </p>
          )}

          <PostMediaGrid images={images} imageClassName={cn('mt-2 rounded-2xl border', border)} className={cn('mt-2 overflow-hidden rounded-2xl border', border)} />

          <div className={cn('mt-3 flex items-center justify-between text-xs', mutedText)}>
            <span className="flex items-center gap-1.5"><MessageCircle className="h-4 w-4" />{showMetrics && formatPostMetric(metrics?.comments ?? 0)}</span>
            <span className="flex items-center gap-1.5"><Repeat2 className="h-4 w-4" />{showMetrics && formatPostMetric(metrics?.shares ?? 0)}</span>
            <span className="flex items-center gap-1.5"><Heart className="h-4 w-4" />{showMetrics && formatPostMetric(metrics?.reactions ?? 0)}</span>
            <span className="flex items-center gap-1.5"><BarChart2 className="h-4 w-4" />{showMetrics && typeof metrics?.views === 'number' ? formatPostMetric(metrics.views) : null}</span>
            <div className="flex items-center gap-1"><Bookmark className="h-4 w-4" /><Share className="h-4 w-4" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
