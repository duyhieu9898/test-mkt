/**
 * Public landing page — /pages/:subdomain (doc 10 §L3, Đợt 5)
 * No dashboard chrome. Fetches public endpoint, renders blocks, injects SEO.
 */
import type { Metadata } from 'next';
import { BlockListRenderer } from '@/components/landing-pages/blocks/block-renderer';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';

interface PublicPage {
  id: string; name: string; subdomain: string;
  content: { blocks?: any[] } | null;
  seo: { title?: string; description?: string; keywords?: string[] } | null;
  style: string | null; primaryColor: string | null;
  secondaryColor: string | null; fontFamily: string | null;
}

async function fetchPage(sub: string): Promise<PublicPage | null> {
  try {
    const r = await fetch(`${API}/landing-pages/public/by-subdomain/${encodeURIComponent(sub)}`, { next: { revalidate: 60 } });
    return r.ok ? (await r.json()) as PublicPage : null;
  } catch { return null; }
}

export async function generateMetadata({ params }: { params: { subdomain: string } }): Promise<Metadata> {
  const p = await fetchPage(params.subdomain);
  if (!p) return { title: 'Page not found' };
  return { title: p.seo?.title || p.name, description: p.seo?.description, keywords: p.seo?.keywords };
}

export default async function PublicLandingPage({ params }: { params: { subdomain: string } }) {
  const page = await fetchPage(params.subdomain);
  if (!page) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-800 mb-2">Page not available</h1>
          <p className="text-gray-500">This page hasn't been published yet.</p>
        </div>
      </div>
    );
  }
  const blocks = page.content?.blocks || [];
  const primary = page.primaryColor || '#3b82f6';
  return (
    <div className="min-h-screen bg-white" style={{
      ['--lp-primary' as any]: primary,
      ['--lp-secondary' as any]: page.secondaryColor || primary,
      fontFamily: `${page.fontFamily || 'Inter'}, system-ui, sans-serif`,
    }}>
      {blocks.length > 0
        ? <BlockListRenderer blocks={blocks as any} primaryColor={primary} />
        : <div className="py-32 text-center text-gray-400">This page has no content yet.</div>}
    </div>
  );
}
