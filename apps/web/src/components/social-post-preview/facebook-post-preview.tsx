'use client';

import type { ReactNode } from 'react';
import { Globe2, MessageCircle, MoreHorizontal, Share2, ThumbsUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PostPreviewMetrics } from './index';
import { ExpandablePostText } from './expandable-post-text';
import { PostMediaGrid } from './post-media-grid';
import { formatPostMetric, formatPostTimestamp, hasPostMetrics } from './post-preview-meta';

export interface FacebookPostPreviewProps {
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

function initialOf(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

const FB_BLUE = '#1877F2';

export function FacebookPostPreview({
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
}: FacebookPostPreviewProps) {
  const images = mediaUrls?.length ? mediaUrls : imageUrl ? [imageUrl] : [];
  const publishedTime = formatPostTimestamp(timestamp);
  const showMetrics = isPublished && hasPostMetrics(metrics);

  return (
    <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white font-sans shadow-sm">
      <div className="flex items-start gap-3 p-3">
        {brandAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brandAvatarUrl} alt={brandName} className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full font-semibold text-white"
            style={{ backgroundColor: FB_BLUE }}
          >
            {initialOf(brandName)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-slate-900" title={brandName}>
            {brandName}
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            {isPublished ? (
              <>
                {publishedTime && <span>{publishedTime}</span>}
                {publishedTime && <span aria-hidden>·</span>}
                <Globe2 className="h-3 w-3" aria-label="Public" />
              </>
            ) : (
              <span>Draft preview</span>
            )}
          </div>
        </div>
        {headerAction ?? (
          <button type="button" className="rounded-full p-1 text-slate-500 hover:bg-slate-100" aria-label="More">
            <MoreHorizontal className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="px-3 pb-3">
        <ExpandablePostText
          text={content}
          threshold={180}
          className="whitespace-pre-wrap break-words text-[15px] leading-snug text-slate-900"
          buttonClassName="text-slate-500 hover:text-slate-700"
        />
        {hashtags && hashtags.length > 0 && (
          <p className="mt-2 break-words text-[15px] leading-snug">
            {hashtags.map((hashtag) => (
              <span key={hashtag} style={{ color: FB_BLUE }} className="mr-1">
                {hashtag.startsWith('#') ? hashtag : `#${hashtag}`}
              </span>
            ))}
          </p>
        )}
      </div>

      <PostMediaGrid images={images} />

      {showMetrics && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
          <div className="flex items-center gap-1">
            <span className="flex h-4 w-4 items-center justify-center rounded-full text-white" style={{ backgroundColor: FB_BLUE }}>
              <ThumbsUp className="h-2.5 w-2.5" fill="white" />
            </span>
            <span>{formatPostMetric(metrics?.reactions ?? 0)}</span>
          </div>
          <div className="flex flex-wrap justify-end gap-x-2 gap-y-1">
            {typeof metrics?.views === 'number' && <span>{formatPostMetric(metrics.views)} views</span>}
            {typeof metrics?.comments === 'number' && <span>{formatPostMetric(metrics.comments)} comments</span>}
            {typeof metrics?.shares === 'number' && <span>{formatPostMetric(metrics.shares)} shares</span>}
          </div>
        </div>
      )}

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
              'transition-colors hover:bg-slate-50 hover:text-[#1877F2]',
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
