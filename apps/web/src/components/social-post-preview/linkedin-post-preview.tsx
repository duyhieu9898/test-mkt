'use client';

import { MoreHorizontal, ThumbsUp, MessageCircle, Repeat2, Send, Globe2 } from 'lucide-react';

export interface LinkedInPostPreviewProps {
  content: string;
  hashtags?: string[] | null;
  brandName: string;
  brandAvatarUrl?: string;
  timestamp?: string;
  imageUrl?: string;
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
  timestamp = '2h',
  imageUrl,
}: LinkedInPostPreviewProps) {
  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-start gap-3 p-3">
        {brandAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brandAvatarUrl}
            alt={brandName}
            className="w-12 h-12 rounded-md object-cover"
          />
        ) : (
          <div
            className="w-12 h-12 rounded-md flex items-center justify-center text-white font-semibold text-lg"
            style={{ backgroundColor: LI_BLUE }}
          >
            {initialOf(brandName)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-slate-900 truncate leading-tight">
            {brandName}
          </div>
          <div className="text-xs text-slate-500 truncate">
            Founder @ {brandName} · Promoted
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
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
        <p className="text-[14px] leading-relaxed text-slate-800 whitespace-pre-wrap break-words">
          {content}
        </p>
        {hashtags && hashtags.length > 0 && (
          <p className="mt-2 text-[14px] leading-relaxed break-words">
            {hashtags.map((h, i) => (
              <span
                key={i}
                className="mr-1 font-medium hover:underline"
                style={{ color: LI_BLUE }}
              >
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
        <div className="flex items-center">
          <span className="inline-flex -space-x-1">
            <span className="w-4 h-4 rounded-full bg-blue-500 border border-white flex items-center justify-center text-[9px]">👍</span>
            <span className="w-4 h-4 rounded-full bg-red-500 border border-white flex items-center justify-center text-[9px]">❤️</span>
            <span className="w-4 h-4 rounded-full bg-amber-400 border border-white flex items-center justify-center text-[9px]">🎉</span>
          </span>
          <span className="ml-1.5">342</span>
        </div>
        <div>28 comments · 12 reposts</div>
      </div>

      {/* Action bar */}
      <div className="grid grid-cols-4 border-t border-slate-100">
        {[
          { Icon: ThumbsUp, label: 'Like' },
          { Icon: MessageCircle, label: 'Comment' },
          { Icon: Repeat2, label: 'Repost' },
          { Icon: Send, label: 'Send' },
        ].map(({ Icon, label }) => (
          <button
            key={label}
            type="button"
            className="flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50 hover:text-[#0A66C2] transition-colors"
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
