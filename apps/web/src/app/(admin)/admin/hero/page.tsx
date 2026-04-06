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

export default function HeroPage() {
  const [activeLocale, setActiveLocale] = useState<Locale>('en');
  const [form, setForm] = useState({
    badgeText: '',
    titleLine1: '',
    titleLine2: '',
    description: '',
    ctaPrimaryText: '',
    ctaSecondaryText: '',
  });

  const { data, isLoading } = useAdminSiteConfig('hero', activeLocale);
  const mutation = useAdminUpdateSiteConfig();

  useEffect(() => {
    const content = data?.data?.content || data?.content;
    if (content) {
      setForm({
        badgeText: content.badge ?? content.badgeText ?? '',
        titleLine1: content.titleLine1 ?? '',
        titleLine2: content.titleLine2 ?? '',
        description: content.description ?? '',
        ctaPrimaryText: content.ctaPrimary ?? content.ctaPrimaryText ?? '',
        ctaSecondaryText: content.ctaSecondary ?? content.ctaSecondaryText ?? '',
      });
    }
  }, [data]);

  const handleSave = async () => {
    try {
      await mutation.mutateAsync({
        section: 'hero',
        locale: activeLocale,
        content: form,
      });
      toast.success('Hero section saved successfully');
    } catch {
      toast.error('Failed to save hero section');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hero Section</h1>
          <p className="text-gray-500 mt-1">Edit the hero banner content</p>
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
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg">Hero Content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Badge Text</label>
              <Input
                value={form.badgeText}
                onChange={(e) => setForm({ ...form, badgeText: e.target.value })}
                placeholder="e.g. New Release"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Title Line 1</label>
              <Input
                value={form.titleLine1}
                onChange={(e) => setForm({ ...form, titleLine1: e.target.value })}
                placeholder="First line of the heading"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Title Line 2</label>
              <Input
                value={form.titleLine2}
                onChange={(e) => setForm({ ...form, titleLine2: e.target.value })}
                placeholder="Second line of the heading"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Hero description text"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">CTA Primary Text</label>
                <Input
                  value={form.ctaPrimaryText}
                  onChange={(e) => setForm({ ...form, ctaPrimaryText: e.target.value })}
                  placeholder="e.g. Get Started"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">CTA Secondary Text</label>
                <Input
                  value={form.ctaSecondaryText}
                  onChange={(e) => setForm({ ...form, ctaSecondaryText: e.target.value })}
                  placeholder="e.g. Learn More"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
