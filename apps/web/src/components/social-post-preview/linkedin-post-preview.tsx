'use client';

import type { ReactNode } from 'react';
import { Globe2, MessageCircle, MoreHorizontal, Repeat2, Send, ThumbsUp } from 'lucide-react';
import type { PostPreviewMetrics } from './index';
import { ExpandablePostText } from './expandable-post-text';
import { PostMediaGrid } from './post-media-grid';
import { formatPostMetric, formatPostTimestamp, hasPostMetrics } from './post-preview-meta';

export interface LinkedInPostPreviewProps {
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

const LI_BLUE = '#0A66C2';

function initialOf(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

export function LinkedInPostPreview({
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
}: LinkedInPostPreviewProps) {
  const images = mediaUrls?.length ? mediaUrls : imageUrl ? [imageUrl] : [];
  const publishedTime = formatPostTimestamp(timestamp);
  const showMetrics = isPublished && hasPostMetrics(metrics);

  return (
    <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white font-sans shadow-sm">
      <div className="flex items-start gap-3 p-3">
        {brandAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brandAvatarUrl} alt={brandName} className="h-12 w-12 rounded-md object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-md text-lg font-semibold text-white" style={{ backgroundColor: LI_BLUE }}>
            {initialOf(brandName)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold leading-tight text-slate-900" title={brandName}>{brandName}</div>
          <div className="truncate text-xs text-slate-500">{isPublished ? 'Company post' : 'Draft preview'}</div>
          {isPublished && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
              {publishedTime && <span>{publishedTime}</span>}
              {publishedTime && <span aria-hidden>·</span>}
              <Globe2 className="h-3 w-3" aria-label="Public" />
            </div>
          )}
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
          className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-slate-800"
          buttonClassName="text-slate-500 hover:text-slate-700"
        />
        {hashtags && hashtags.length > 0 && (
          <p className="mt-2 break-words text-[14px] leading-relaxed">
            {hashtags.map((hashtag) => (
              <span key={hashtag} className="mr-1 font-medium hover:underline" style={{ color: LI_BLUE }}>
                {hashtag.startsWith('#') ? hashtag : `#${hashtag}`}
              </span>
            ))}
          </p>
        )}
      </div>

      <PostMediaGrid images={images} />

      {showMetrics && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
          {typeof metrics?.reactions === 'number' && <span>{formatPostMetric(metrics.reactions)} reactions</span>}
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {typeof metrics?.views === 'number' && <span>{formatPostMetric(metrics.views)} views</span>}
            {typeof metrics?.comments === 'number' && <span>{formatPostMetric(metrics.comments)} comments</span>}
            {typeof metrics?.shares === 'number' && <span>{formatPostMetric(metrics.shares)} reposts</span>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 border-t border-slate-100">
        {[
          { Icon: ThumbsUp, label: 'Like' },
          { Icon: MessageCircle, label: 'Comment' },
          { Icon: Repeat2, label: 'Repost' },
          { Icon: Send, label: 'Send' },
        ].map(({ Icon, label }) => (
          <button key={label} type="button" className="flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-[#0A66C2]">
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
