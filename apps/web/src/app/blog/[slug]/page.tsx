'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Sparkles, ArrowLeft, Calendar, Tag, Clock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { type Locale, localeFlags } from '@/lib/i18n';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  metaDescription: string | null;
  keyword: string | null;
  tags: string[];
  faq: Array<{ question: string; answer: string }>;
  language: string;
  wordCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export default function BlogPostPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchPost = async () => {
      try {
        const res = await fetch(`${API_URL}/blog/posts/${slug}`);
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setPost(data.post);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    if (slug) fetchPost();
  }, [slug]);

  const readTime = post?.wordCount ? Math.max(1, Math.ceil(post.wordCount / 200)) : null;

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
        <div className="container mx-auto max-w-3xl">
          <Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-6">
            <ArrowLeft className="w-4 h-4" />
            Back to Blog
          </Link>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : notFound || !post ? (
            <div className="text-center py-20">
              <h2 className="text-2xl font-bold mb-2">Post not found</h2>
              <p className="text-muted-foreground mb-4">This blog post doesn&apos;t exist or has been removed.</p>
              <Link href="/blog">
                <Button>Back to Blog</Button>
              </Link>
            </div>
          ) : (
            <article>
              {/* Header */}
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <Badge variant="outline">
                    {localeFlags[post.language as Locale] || post.language}
                  </Badge>
                  {post.keyword && (
                    <Badge variant="outline">{post.keyword}</Badge>
                  )}
                </div>
                <h1 className="text-4xl font-bold mb-4">{post.title}</h1>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    1Person Team
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {new Date(post.createdAt).toLocaleDateString()}
                  </span>
                  {readTime && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {readTime} min read
                    </span>
                  )}
                </div>
              </div>

              {/* Content */}
              <div
                className="prose prose-lg max-w-none dark:prose-invert prose-headings:font-bold prose-a:text-primary"
                dangerouslySetInnerHTML={{ __html: post.content }}
              />

              {/* FAQ Section */}
              {Array.isArray(post.faq) && post.faq.length > 0 && (
                <div className="mt-12 border-t pt-8">
                  <h2 className="text-2xl font-bold mb-6">FAQ</h2>
                  <div className="space-y-4">
                    {post.faq.map((item, i) => (
                      <div key={i} className="bg-muted/50 rounded-xl p-5">
                        <h3 className="font-semibold mb-2">{item.question}</h3>
                        <p className="text-muted-foreground">{item.answer}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              {Array.isArray(post.tags) && post.tags.length > 0 && (
                <div className="mt-8 flex items-center gap-2 flex-wrap">
                  {post.tags.map((tag: string) => (
                    <Badge key={tag} variant="outline" className="gap-1">
                      <Tag className="w-3 h-3" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* CTA */}
              <div className="mt-12 bg-primary/5 rounded-2xl p-8 text-center border">
                <h3 className="text-xl font-bold mb-2">Ready to automate your business?</h3>
                <p className="text-muted-foreground mb-4">
                  Start running your company with AI agents today.
                </p>
                <Link href="/register">
                  <Button variant="gradient">Get Started Free</Button>
                </Link>
              </div>
            </article>
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
