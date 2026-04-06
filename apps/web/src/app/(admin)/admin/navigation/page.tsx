'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LanguageTabs } from '@/components/admin/language-tabs';
import { type Locale } from '@/lib/i18n';
import { useAdminSiteConfig, useAdminUpdateSiteConfig } from '@/lib/api/admin-hooks';
import { Save, Loader2, Plus, Trash2 } from 'lucide-react';

interface NavLink {
  label: string;
  url: string;
}

export default function NavigationPage() {
  const [activeLocale, setActiveLocale] = useState<Locale>('en');
  const [links, setLinks] = useState<NavLink[]>([]);
  const [signInText, setSignInText] = useState('');
  const [getStartedText, setGetStartedText] = useState('');

  const { data, isLoading } = useAdminSiteConfig('navigation', activeLocale);
  const mutation = useAdminUpdateSiteConfig();

  useEffect(() => {
    const content = data?.data?.content || data?.content;
    if (content) {
      setLinks(content.links ?? []);
      setSignInText(content.signIn ?? content.signInText ?? '');
      setGetStartedText(content.getStarted ?? content.getStartedText ?? '');
    }
  }, [data]);

  const addLink = () => {
    setLinks([...links, { label: '', url: '' }]);
  };

  const removeLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const updateLink = (index: number, field: keyof NavLink, value: string) => {
    const updated = [...links];
    updated[index] = { ...updated[index], [field]: value };
    setLinks(updated);
  };

  const handleSave = async () => {
    try {
      await mutation.mutateAsync({
        section: 'navigation',
        locale: activeLocale,
        content: { links, signInText, getStartedText },
      });
      toast.success('Navigation saved successfully');
    } catch {
      toast.error('Failed to save navigation');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Navigation</h1>
          <p className="text-gray-500 mt-1">Manage menu links and CTA buttons</p>
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
          <Card className="border border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Navigation Links</CardTitle>
              <Button variant="outline" size="sm" onClick={addLink}>
                <Plus className="h-4 w-4 mr-1" />
                Add Link
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {links.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No links yet. Click "Add Link" to get started.</p>
              )}
              {links.map((link, index) => (
                <div key={index} className="flex items-start gap-3 border border-gray-200 rounded-lg p-4">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">Label</label>
                      <Input
                        value={link.label}
                        onChange={(e) => updateLink(index, 'label', e.target.value)}
                        placeholder="Link label"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1.5 block">URL</label>
                      <Input
                        value={link.url}
                        onChange={(e) => updateLink(index, 'url', e.target.value)}
                        placeholder="/section or https://..."
                      />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLink(index)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 mt-6"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg">CTA Buttons</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Sign In Button Text</label>
                <Input
                  value={signInText}
                  onChange={(e) => setSignInText(e.target.value)}
                  placeholder="e.g. Sign In"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Get Started Button Text</label>
                <Input
                  value={getStartedText}
                  onChange={(e) => setGetStartedText(e.target.value)}
                  placeholder="e.g. Get Started"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
