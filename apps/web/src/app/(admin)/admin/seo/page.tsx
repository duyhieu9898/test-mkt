'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LanguageTabs } from '@/components/admin/language-tabs';
import { type Locale } from '@/lib/i18n';
import { useAdminSiteConfig, useAdminUpdateSiteConfig } from '@/lib/api/admin-hooks';
import { Save, Loader2 } from 'lucide-react';

export default function SeoPage() {
  const [activeLocale, setActiveLocale] = useState<Locale>('en');
  const [form, setForm] = useState({
    pageTitle: '',
    metaDescription: '',
    keywords: '',
    ogImageUrl: '',
  });

  const { data, isLoading } = useAdminSiteConfig('seo', activeLocale);
  const mutation = useAdminUpdateSiteConfig();

  useEffect(() => {
    const content = data?.data?.content || data?.content;
    if (content) {
      setForm({
        pageTitle: content.pageTitle ?? '',
        metaDescription: content.metaDescription ?? '',
        keywords: content.keywords ?? '',
        ogImageUrl: content.ogImageUrl ?? '',
      });
    }
  }, [data]);

  const handleSave = async () => {
    try {
      await mutation.mutateAsync({
        section: 'seo',
        locale: activeLocale,
        content: form,
      });
      toast.success('SEO settings saved successfully');
    } catch {
      toast.error('Failed to save SEO settings');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SEO & Metadata</h1>
          <p className="text-gray-500 mt-1">Manage search engine optimization settings</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={mutation.isPending}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      <LanguageTabs activeLocale={activeLocale} onChange={setActiveLocale} />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Core SEO */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">Core SEO</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700">Page Title</label>
                  <span className={`text-xs ${form.pageTitle.length > 60 ? 'text-red-500' : 'text-gray-400'}`}>
                    {form.pageTitle.length}/60
                  </span>
                </div>
                <Input
                  value={form.pageTitle}
                  onChange={(e) => setForm({ ...form, pageTitle: e.target.value })}
                  placeholder="Enter page title"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700">Meta Description</label>
                  <span className={`text-xs ${form.metaDescription.length > 160 ? 'text-red-500' : 'text-gray-400'}`}>
                    {form.metaDescription.length}/160
                  </span>
                </div>
                <Textarea
                  value={form.metaDescription}
                  onChange={(e) => setForm({ ...form, metaDescription: e.target.value })}
                  placeholder="Enter meta description"
                  rows={3}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Keywords</label>
                <Textarea
                  value={form.keywords}
                  onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                  placeholder="keyword1, keyword2, keyword3"
                  rows={2}
                />
                <p className="text-xs text-gray-400 mt-1">Separate keywords with commas</p>
              </div>
            </CardContent>
          </Card>

          {/* Google Search Preview */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">Google Search Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border border-gray-200 rounded-lg p-4 bg-white">
                <p className="text-sm text-green-700 truncate">https://1person.bap-software.net</p>
                <p className="text-lg text-blue-700 hover:underline truncate mt-0.5">
                  {form.pageTitle || 'Page Title'}
                </p>
                <p className="text-sm text-gray-600 line-clamp-2 mt-0.5">
                  {form.metaDescription || 'Meta description will appear here...'}
                </p>
              </div>
              <div className="flex gap-4 mt-3 text-xs text-gray-400">
                <span>Title: {form.pageTitle.length}/60</span>
                <span>Description: {form.metaDescription.length}/160</span>
              </div>
            </CardContent>
          </Card>

          {/* Open Graph */}
          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">Open Graph</CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">OG Image URL</label>
                <Input
                  value={form.ogImageUrl}
                  onChange={(e) => setForm({ ...form, ogImageUrl: e.target.value })}
                  placeholder="https://example.com/og-image.png"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
