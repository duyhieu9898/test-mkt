'use client';

import { cn } from '@/lib/utils';

interface PostMediaGridProps {
  images?: string[] | null;
  className?: string;
  imageClassName?: string;
}

export function PostMediaGrid({
  images,
  className,
  imageClassName,
}: PostMediaGridProps) {
  const visibleImages = (images || []).filter(Boolean).slice(0, 4);

  if (visibleImages.length === 0) return null;

  if (visibleImages.length === 1) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={visibleImages[0]}
        alt=""
        className={cn('w-full object-cover max-h-80', imageClassName)}
      />
    );
  }

  return (
    <div className={cn('grid grid-cols-2 gap-0.5 bg-slate-100', className)}>
      {visibleImages.map((image, index) => (
        <div key={`${image}-${index}`} className="relative aspect-[1200/628] overflow-hidden bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="h-full w-full object-cover" />
          {index === 3 && (images?.length || 0) > 4 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-semibold text-white">
              +{(images?.length || 0) - 4}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
