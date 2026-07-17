'use client';

import type { ReactNode } from 'react';
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  Camera,
} from 'lucide-react';
import { ExpandablePostText } from './expandable-post-text';
import type { PostPreviewMetrics } from './index';
import { formatPostMetric, formatPostTimestamp, hasPostMetrics } from './post-preview-meta';

export interface InstagramPostPreviewProps {
  content: string;
  hashtags?: string[] | null;
  brandName: string;
  brandAvatarUrl?: string;
  timestamp?: string | null;
  isPublished?: boolean;
  metrics?: PostPreviewMetrics | null;
  imageUrl?: string;
  mediaUrls?: string[] | null;
  headerAction?: ReactNode;
}

const IG_LINK = '#00376B';

function initialOf(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function handleFrom(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'brand';
}

export function InstagramPostPreview({
  content,
  hashtags,
  brandName,
  brandAvatarUrl,
  timestamp,
  isPublished = false,
  metrics,
  imageUrl,
  mediaUrls,
  headerAction,
}: InstagramPostPreviewProps) {
  const handle = handleFrom(brandName);
  const images = mediaUrls?.length ? mediaUrls : imageUrl ? [imageUrl] : [];
  const primaryImage = images[0];
  const publishedTime = formatPostTimestamp(timestamp);
  const showMetrics = isPublished && hasPostMetrics(metrics);

  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden font-sans">
      <div className="flex items-center gap-3 p-3">
        <div className="relative">
          <div className="p-[2px] rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
            <div className="p-[2px] bg-white rounded-full">
              {brandAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brandAvatarUrl}
                  alt={brandName}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center text-white text-xs font-semibold">
                  {initialOf(brandName)}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold text-slate-900 truncate leading-tight" title={brandName}>
            {handle}
          </div>
          <div className="truncate text-[11px] text-slate-500">
            {isPublished ? publishedTime : 'Draft preview'}
          </div>
        </div>
        {headerAction ?? (
          <button
            type="button"
            className="p-1 text-slate-700 hover:bg-slate-100 rounded-full"
            aria-label="More"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="relative aspect-square w-full bg-white flex items-center justify-center">
        {primaryImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={primaryImage} alt="" className="w-full h-full object-contain" />
        ) : (
          <Camera className="w-16 h-16 text-slate-300" strokeWidth={1.5} />
        )}
      </div>

      <div className="flex items-center justify-between px-3 pt-3">
        <div className="flex items-center gap-4">
          <button type="button" className="text-slate-900 hover:text-slate-500">
            <Heart className="w-6 h-6" strokeWidth={2} />
          </button>
          <button type="button" className="text-slate-900 hover:text-slate-500">
            <MessageCircle className="w-6 h-6" strokeWidth={2} />
          </button>
          <button type="button" className="text-slate-900 hover:text-slate-500">
            <Send className="w-6 h-6" strokeWidth={2} />
          </button>
        </div>
        <button type="button" className="text-slate-900 hover:text-slate-500">
          <Bookmark className="w-6 h-6" strokeWidth={2} />
        </button>
      </div>

      {showMetrics && typeof metrics?.reactions === 'number' && (
        <div className="px-3 pt-2 text-[14px] font-semibold text-slate-900">
          {formatPostMetric(metrics.reactions)} likes
        </div>
      )}

      <div className="px-3 pt-1 pb-1 text-[14px] text-slate-900 leading-snug break-words">
        <span className="font-semibold mr-1.5">{handle}</span>
        <ExpandablePostText
          as="span"
          text={content}
          threshold={125}
          className="whitespace-pre-wrap"
          buttonClassName="text-slate-500 hover:text-slate-700"
        />
        {hashtags && hashtags.length > 0 && (
          <span className="block mt-1">
            {hashtags.map((h, i) => (
              <span key={i} className="mr-1" style={{ color: IG_LINK }}>
                {h.startsWith('#') ? h : `#${h}`}
              </span>
            ))}
          </span>
        )}
      </div>

      {showMetrics && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 pt-1 text-[13px] text-slate-500">
          {typeof metrics?.comments === 'number' && <span>{formatPostMetric(metrics.comments)} comments</span>}
          {typeof metrics?.shares === 'number' && <span>{formatPostMetric(metrics.shares)} shares</span>}
          {typeof metrics?.views === 'number' && <span>{formatPostMetric(metrics.views)} views</span>}
        </div>
      )}
      {isPublished && publishedTime && (
        <div className="px-3 pb-3 pt-1 text-[10px] uppercase tracking-wide text-slate-400">
          {publishedTime}
        </div>
      )}
    </div>
  );
}
