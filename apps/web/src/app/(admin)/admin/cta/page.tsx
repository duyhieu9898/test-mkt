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

export default function CtaPage() {
  const [activeLocale, setActiveLocale] = useState<Locale>('en');
  const [form, setForm] = useState({
    title: '',
    description: '',
    buttonText: '',
  });

  const { data, isLoading } = useAdminSiteConfig('cta', activeLocale);
  const mutation = useAdminUpdateSiteConfig();

  useEffect(() => {
    const content = data?.data?.content || data?.content;
    if (content) {
      setForm({
        title: content.title ?? '',
        description: content.description ?? '',
        buttonText: content.buttonText ?? '',
      });
    }
  }, [data]);

  const handleSave = async () => {
    try {
      await mutation.mutateAsync({
        section: 'cta',
        locale: activeLocale,
        content: form,
      });
      toast.success('Call to Action saved successfully');
    } catch {
      toast.error('Failed to save Call to Action');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Call to Action</h1>
          <p className="text-gray-500 mt-1">Edit the CTA section content</p>
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
            <CardTitle className="text-lg">CTA Content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Title</label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Ready to get started?"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="CTA description text"
                rows={3}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Button Text</label>
              <Input
                value={form.buttonText}
                onChange={(e) => setForm({ ...form, buttonText: e.target.value })}
                placeholder="e.g. Start Free Trial"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
