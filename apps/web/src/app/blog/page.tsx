'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sparkles, ArrowLeft, Calendar, Tag, Globe, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { type Locale, locales, localeNames, localeFlags } from '@/lib/i18n';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  metaDescription: string | null;
  keyword: string | null;
  tags: string[];
  language: string;
  createdAt: string;
}

export default function BlogListPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [langFilter, setLangFilter] = useState<string>('');
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const url = langFilter
          ? `${API_URL}/blog/posts?lang=${langFilter}`
          : `${API_URL}/blog/posts`;
        const res = await fetch(url);
        const data = await res.json();
        setPosts(data.posts || []);
      } catch {
        setPosts([]);
      } finally {
        setLoading(false);
      }
    };
    fetchPosts();
  }, [langFilter]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass border-b">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">1Person</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link href="/#features" className="text-muted-foreground hover:text-foreground transition">
              Features
            </Link>
            <Link href="/#security" className="text-muted-foreground hover:text-foreground transition">
              Security
            </Link>
            <Link href="/blog" className="text-foreground font-medium">
              Blog
            </Link>
            <a href="https://bap-software.net/contact/" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition">
              Contact
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button variant="gradient" size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="pt-24 pb-20 px-6">
        <div className="container mx-auto max-w-4xl">
          <div className="mb-8">
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4">
              <ArrowLeft className="w-4 h-4" />
              Back to home
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold mb-2">Blog</h1>
                <p className="text-muted-foreground text-lg">
                  Insights on AI automation, multi-agent systems, and building companies with AI.
                </p>
              </div>

              {/* Language filter */}
              <div className="relative">
                <button
                  onClick={() => setLangOpen(!langOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm hover:bg-muted transition"
                >
                  <Globe className="w-4 h-4" />
                  <span>{langFilter ? localeFlags[langFilter as Locale] : 'All'}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                {langOpen && (
                  <div className="absolute right-0 mt-1 bg-card border rounded-lg shadow-lg py-1 min-w-[140px] z-50">
                    <button
                      onClick={() => { setLangFilter(''); setLangOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition ${!langFilter ? 'bg-primary/5 text-primary font-medium' : ''}`}
                    >
                      All Languages
                    </button>
                    {locales.map((l) => (
                      <button
                        key={l}
                        onClick={() => { setLangFilter(l); setLangOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition flex items-center gap-2 ${
                          langFilter === l ? 'bg-primary/5 text-primary font-medium' : ''
                        }`}
                      >
                        <span>{localeFlags[l]}</span>
                        <span>{localeNames[l]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <p className="text-lg font-medium">No posts yet</p>
              <p className="text-sm">Check back soon for new content!</p>
            </div>
          ) : (
            <div className="space-y-6">
              {posts.map((post) => (
                <Link key={post.id} href={`/blog/${post.slug}`}>
                  <article className="bg-card rounded-2xl p-6 border hover:shadow-lg transition-shadow cursor-pointer">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="outline" className="text-xs">
                        {localeFlags[post.language as Locale] || post.language}
                      </Badge>
                      {post.keyword && (
                        <Badge variant="outline" className="text-xs">
                          {post.keyword}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(post.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <h2 className="text-xl font-semibold mb-2 hover:text-primary transition">
                      {post.title}
                    </h2>
                    {(post.excerpt || post.metaDescription) && (
                      <p className="text-muted-foreground line-clamp-2">
                        {post.excerpt || post.metaDescription}
                      </p>
                    )}
                    {Array.isArray(post.tags) && post.tags.length > 0 && (
                      <div className="flex gap-1.5 mt-3">
                        {post.tags.slice(0, 5).map((tag: string) => (
                          <span key={tag} className="text-xs text-muted-foreground flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t py-12 px-6">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold">1Person</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/blog" className="hover:text-foreground transition">Blog</Link>
              <a href="https://bap-software.net/contact/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition">Contact</a>
            </div>
            <p className="text-muted-foreground text-sm">
              1Person. AI Company OS is developed by{' '}
              <a href="https://bap.jp" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">BAP</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
