import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

const API = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:8004/api/v1';

interface Data {
  page: { id: string; name: string; subdomain: string };
  posts: { id: string; slug: string; title: string; excerpt: string | null; coverImageUrl: string | null; publishedAt: string | null }[];
}

async function load(sub: string): Promise<Data | null> {
  try { const r = await fetch(`${API}/blog/public/${encodeURIComponent(sub)}`, { cache: 'no-store' }); return r.ok ? r.json() : null; }
  catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ subdomain: string }> }): Promise<Metadata> {
  const d = await load((await params).subdomain);
  return d ? { title: `Blog — ${d.page.name}` } : { title: 'Not found' };
}

export default async function PublicBlogList({ params }: { params: Promise<{ subdomain: string }> }) {
  const { subdomain } = await params;
  const data = await load(subdomain);
  if (!data) notFound();

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <Link href={`/pages/${subdomain}`} className="text-sm text-neutral-500 hover:text-neutral-900">&larr; {data.page.name}</Link>
          <h1 className="mt-3 text-4xl font-bold">Blog</h1>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-12">
        {data.posts.length === 0 ? <p className="text-neutral-500">No articles published yet.</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {data.posts.map((p) => (
              <Link key={p.id} href={`/pages/${subdomain}/blog/${p.slug}`} className="group block border rounded-lg overflow-hidden hover:shadow-lg transition">
                {p.coverImageUrl
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={p.coverImageUrl} alt="" className="w-full h-48 object-cover" />
                  : <div className="w-full h-48 bg-neutral-100" />}
                <div className="p-5">
                  <h2 className="text-xl font-semibold group-hover:text-blue-600">{p.title}</h2>
                  {p.excerpt && <p className="mt-2 text-neutral-600 line-clamp-3">{p.excerpt}</p>}
                  {p.publishedAt && <p className="mt-3 text-xs text-neutral-400">{new Date(p.publishedAt).toLocaleDateString()}</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
