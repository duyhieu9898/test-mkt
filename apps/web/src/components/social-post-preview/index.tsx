'use client';

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

export interface PostPreviewProps {
  platform: PostPlatform | string;
  content: string;
  hashtags?: string[] | null;
  brandName: string;
  brandAvatarUrl?: string;
  /** default 'now' */
  timestamp?: string;
  /** optional banner/image for IG or inline media */
  imageUrl?: string;
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
