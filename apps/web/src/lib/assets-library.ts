export interface ImageAsset {
  id: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  source?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';

export async function uploadImageAsset(
  companyId: string,
  file: File,
  token: string,
  options?: {
    tags?: string[];
    campaignId?: string;
  },
): Promise<ImageAsset> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', file.name.replace(/\.[^/.]+$/, ''));
  if (options?.tags?.length) formData.append('tags', JSON.stringify(options.tags));
  if (options?.campaignId) formData.append('campaignId', options.campaignId);

  const response = await fetch(
    `${API_URL}/assets-library/company/${companyId}/upload`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    },
  );

  const result = await response.json().catch(() => ({}));
  const data = result.data || result.asset || result;
  if (!response.ok || !data?.url) {
    throw new Error(result.error?.message || result.message || 'Image upload failed');
  }

  return {
    id: data.id || data.asset?.id || data.url,
    name: data.name || file.name,
    url: data.url,
    thumbnailUrl: data.thumbnailUrl,
    width: data.width,
    height: data.height,
    source: data.source || 'upload',
  };
}
