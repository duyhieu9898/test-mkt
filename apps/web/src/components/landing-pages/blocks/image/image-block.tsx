'use client';

import { Image as ImageIcon } from 'lucide-react';
import {
  normalizeLandingPageLink,
  type ImageContent,
} from '@1person/workflow/landing-pages/blocks';

interface ImageBlockProps {
  content: ImageContent;
  primaryColor: string;
  isEditing?: boolean;
  onFieldClick?: (fieldPath: string[]) => void;
}

const aspectClasses: Record<ImageContent['aspectRatio'], string> = {
  auto: '',
  wide: 'aspect-video',
  square: 'aspect-square max-w-2xl',
  portrait: 'aspect-[4/5] max-w-xl',
};

export function ImageBlock({ content, isEditing, onFieldClick }: ImageBlockProps) {
  const image = content.url ? (
    <img
      src={content.url}
      alt={content.alt || ''}
      className={`mx-auto w-full rounded-md ${aspectClasses[content.aspectRatio || 'wide']} ${
        content.fit === 'contain' ? 'object-contain' : 'object-cover'
      }`}
    />
  ) : (
    <div className="flex aspect-video items-center justify-center rounded-md border border-dashed bg-gray-50 text-gray-500">
      <ImageIcon className="mr-2 h-6 w-6" />
      Choose an image
    </div>
  );

  return (
    <section
      className={`px-4 py-12 ${isEditing ? 'cursor-pointer' : ''}`}
      onClick={(event) => {
        if (!isEditing) return;
        event.preventDefault();
        event.stopPropagation();
        onFieldClick?.(['url']);
      }}
    >
      <figure className="container mx-auto max-w-5xl">
        {content.linkUrl ? (
          <a
            href={normalizeLandingPageLink(content.linkUrl)}
            target={!isEditing && content.openInNewTab ? '_blank' : undefined}
            rel={!isEditing && content.openInNewTab ? 'noopener noreferrer' : undefined}
          >
            {image}
          </a>
        ) : image}
        {content.caption && (
          <figcaption className="mt-3 text-center text-sm text-gray-500">
            {content.caption}
          </figcaption>
        )}
      </figure>
    </section>
  );
}
