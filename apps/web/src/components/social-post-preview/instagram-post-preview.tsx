'use client';

import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  Camera,
} from 'lucide-react';

export interface InstagramPostPreviewProps {
  content: string;
  hashtags?: string[] | null;
  brandName: string;
  brandAvatarUrl?: string;
  timestamp?: string;
  imageUrl?: string;
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
  timestamp = '2h',
  imageUrl,
}: InstagramPostPreviewProps) {
  const handle = handleFrom(brandName);

  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden font-sans">
      {/* Header */}
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
          <div className="text-[14px] font-semibold text-slate-900 truncate leading-tight">
            {handle}
          </div>
          <div className="text-[11px] text-slate-500 truncate">Sponsored</div>
        </div>
        <button
          type="button"
          className="p-1 text-slate-700 hover:bg-slate-100 rounded-full"
          aria-label="More"
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Square image area */}
      <div className="relative aspect-square w-full bg-gradient-to-br from-pink-500 via-rose-400 to-orange-400 flex items-center justify-center">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <Camera className="w-16 h-16 text-white/80" strokeWidth={1.5} />
        )}
      </div>

      {/* Action bar */}
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

      {/* Likes */}
      <div className="px-3 pt-2 text-[14px] font-semibold text-slate-900">
        1,284 likes
      </div>

      {/* Caption */}
      <div className="px-3 pt-1 pb-1 text-[14px] text-slate-900 leading-snug break-words">
        <span className="font-semibold mr-1.5">{handle}</span>
        <span className="whitespace-pre-wrap">
          {content.length > 125 ? (
            <>
              {content.slice(0, 125)}
              <span className="text-slate-500">… </span>
              <button type="button" className="text-slate-500">more</button>
            </>
          ) : (
            content
          )}
        </span>
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

      {/* Comments */}
      <div className="px-3 pt-1 text-[13px] text-slate-500">View all 48 comments</div>
      <div className="px-3 pb-3 pt-1 text-[10px] text-slate-400 uppercase tracking-wide">
        {timestamp} ago
      </div>
    </div>
  );
}
