'use client';

import { cn } from '@/lib/utils';

interface PostMediaGridProps {
  images?: string[] | null;
  className?: string;
  imageClassName?: string;
}

function isVideoMedia(url: string): boolean {
  const cleanUrl = url.split('?')[0]?.toLowerCase() ?? url.toLowerCase();
  return /\.(mp4|webm|mov|m4v)$/.test(cleanUrl);
}

function PostMediaItem({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  if (isVideoMedia(url)) {
    return (
      <video
        src={url}
        className={cn('h-auto w-full bg-black object-contain', className)}
        controls
        playsInline
        preload="metadata"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className={cn('w-full object-cover max-h-80', className)}
    />
  );
}

export function PostMediaGrid({
  images,
  className,
  imageClassName,
}: PostMediaGridProps) {
  const media = (images || []).filter(Boolean);
  const videos = media.filter(isVideoMedia);
  const imageMedia = media.filter((url) => !isVideoMedia(url));
  const visibleImages = imageMedia.slice(0, 4);

  if (videos.length === 0 && visibleImages.length === 0) return null;

  if (videos.length > 0) {
    return (
      <div className={cn('space-y-2 bg-white', className)}>
        {videos.map((video, index) => (
          <PostMediaItem
            key={`${video}-${index}`}
            url={video}
            className={cn('max-h-none rounded-none', imageClassName)}
          />
        ))}
        {visibleImages.length === 1 && (
          <PostMediaItem url={visibleImages[0]!} className={imageClassName} />
        )}
        {visibleImages.length > 1 && (
          <div className="grid grid-cols-2 gap-0.5 bg-slate-100">
            {visibleImages.map((image, index) => (
              <div key={`${image}-${index}`} className="relative aspect-[1200/628] overflow-hidden bg-slate-100">
                <PostMediaItem url={image} className="h-full w-full object-cover" />
                {index === 3 && imageMedia.length > 4 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-semibold text-white">
                    +{imageMedia.length - 4}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (visibleImages.length === 1) {
    return (
      <PostMediaItem url={visibleImages[0]!} className={imageClassName} />
    );
  }

  return (
    <div className={cn('grid grid-cols-2 gap-0.5 bg-slate-100', className)}>
      {visibleImages.map((image, index) => (
        <div key={`${image}-${index}`} className="relative aspect-[1200/628] overflow-hidden bg-slate-100">
          <PostMediaItem url={image} className="h-full w-full object-cover" />
          {index === 3 && imageMedia.length > 4 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-semibold text-white">
              +{imageMedia.length - 4}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
