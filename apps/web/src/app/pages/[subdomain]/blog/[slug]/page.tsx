import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

const API = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:8004/api/v1';

interface Data {
  page: { id: string; name: string; subdomain: string };
  post: {
    id: string; slug: string; title: string; excerpt: string | null; content: string | null;
    coverImageUrl: string | null; publishedAt: string | null;
    seo: { metaTitle?: string; metaDescription?: string; keywords?: string[] } | null;
  };
}

async function load(sub: string, slug: string): Promise<Data | null> {
  try { const r = await fetch(`${API}/blog/public/${encodeURIComponent(sub)}/${encodeURIComponent(slug)}`, { cache: 'no-store' }); return r.ok ? r.json() : null; }
  catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ subdomain: string; slug: string }> }): Promise<Metadata> {
  const { subdomain, slug } = await params;
  const d = await load(subdomain, slug);
  if (!d) return { title: 'Not found' };
  return { title: d.post.seo?.metaTitle || d.post.title, description: d.post.seo?.metaDescription || d.post.excerpt || undefined, keywords: d.post.seo?.keywords };
}

export default async function PublicBlogPost({ params }: { params: Promise<{ subdomain: string; slug: string }> }) {
  const { subdomain, slug } = await params;
  const data = await load(subdomain, slug);
  if (!data) notFound();
  const { page, post } = data;

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <Link href={`/pages/${subdomain}/blog`} className="text-sm text-neutral-500 hover:text-neutral-900">&larr; Back to blog</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        {post.coverImageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={post.coverImageUrl} alt="" className="w-full h-64 md:h-80 object-cover rounded-lg mb-8" />
        )}
        <h1 className="text-4xl md:text-5xl font-bold leading-tight">{post.title}</h1>
        {post.publishedAt && (
          <p className="mt-3 text-sm text-neutral-500">{new Date(post.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        )}
        <article className="prose lg:prose-lg mt-8 max-w-none" dangerouslySetInnerHTML={{ __html: post.content || '' }} />
      </main>
    </div>
  );
}
