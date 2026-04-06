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

interface FooterLink {
  label: string;
  url: string;
}

export default function FooterPage() {
  const [activeLocale, setActiveLocale] = useState<Locale>('en');
  const [copyrightText, setCopyrightText] = useState('');
  const [developerName, setDeveloperName] = useState('');
  const [developerUrl, setDeveloperUrl] = useState('');
  const [links, setLinks] = useState<FooterLink[]>([]);

  const { data, isLoading } = useAdminSiteConfig('footer', activeLocale);
  const mutation = useAdminUpdateSiteConfig();

  useEffect(() => {
    const content = data?.data?.content || data?.content;
    if (content) {
      setCopyrightText(content.copyright ?? content.copyrightText ?? '');
      setDeveloperName(content.developerName ?? '');
      setDeveloperUrl(content.developerUrl ?? '');
      setLinks(content.links ?? []);
    }
  }, [data]);

  const addLink = () => {
    setLinks([...links, { label: '', url: '' }]);
  };

  const removeLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const updateLink = (index: number, field: keyof FooterLink, value: string) => {
    const updated = [...links];
    updated[index] = { ...updated[index], [field]: value };
    setLinks(updated);
  };

  const handleSave = async () => {
    try {
      await mutation.mutateAsync({
        section: 'footer',
        locale: activeLocale,
        content: { copyrightText, developerName, developerUrl, links },
      });
      toast.success('Footer saved successfully');
    } catch {
      toast.error('Failed to save footer');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Footer</h1>
          <p className="text-gray-500 mt-1">Manage footer links and contact info</p>
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
            <CardHeader>
              <CardTitle className="text-lg">Footer Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Copyright Text</label>
                <Input
                  value={copyrightText}
                  onChange={(e) => setCopyrightText(e.target.value)}
                  placeholder="e.g. 2025 1Person. All rights reserved."
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">Developer Name</label>
                  <Input
                    value={developerName}
                    onChange={(e) => setDeveloperName(e.target.value)}
                    placeholder="e.g. BAP Software"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">Developer URL</label>
                  <Input
                    value={developerUrl}
                    onChange={(e) => setDeveloperUrl(e.target.value)}
                    placeholder="https://bap-software.net"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Footer Links</CardTitle>
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
                        placeholder="/page or https://..."
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
        </div>
      )}
    </div>
  );
}
