'use client';

import type { ReactNode } from 'react';
import { FacebookPostPreview } from './facebook-post-preview';
import { LinkedInPostPreview } from './linkedin-post-preview';
import { XPostPreview } from './x-post-preview';
import { InstagramPostPreview } from './instagram-post-preview';

export type PostPlatform =
  | 'facebook'
  | 'linkedin'
  | 'x'
  | 'twitter'
  | 'instagram';

export interface PostPreviewMetrics {
  views?: number;
  reach?: number;
  reactions?: number;
  comments?: number;
  shares?: number;
}

export interface PostPreviewProps {
  platform: PostPlatform | string;
  content: string;
  hashtags?: string[] | null;
  brandName: string;
  brandAvatarUrl?: string;
  /** default 'now' */
  timestamp?: string | null;
  /** true only after the post has been published to the platform */
  isPublished?: boolean;
  /** real platform metrics; omitted while unavailable */
  metrics?: PostPreviewMetrics | null;
  /** optional banner/image for IG or inline media */
  imageUrl?: string;
  /** optional post media gallery */
  mediaUrls?: string[] | null;
  /** optional action rendered in the native post header, replacing the menu dots */
  headerAction?: ReactNode;
}

export function PostPreview(props: PostPreviewProps) {
  const { platform, ...rest } = props;
  const p = (platform || '').toLowerCase();
  switch (p) {
    case 'linkedin':
      return <LinkedInPostPreview {...rest} />;
    case 'x':
    case 'twitter':
      return <XPostPreview {...rest} />;
    case 'instagram':
    case 'ig':
      return <InstagramPostPreview {...rest} />;
    case 'facebook':
    case 'fb':
    default:
      return <FacebookPostPreview {...rest} />;
  }
}

export {
  FacebookPostPreview,
  LinkedInPostPreview,
  XPostPreview,
  InstagramPostPreview,
};
