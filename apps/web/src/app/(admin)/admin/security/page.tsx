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
import { Save, Loader2, Plus, Trash2 } from 'lucide-react';

interface SecurityItem {
  title: string;
  description: string;
}

export default function SecurityPage() {
  const [activeLocale, setActiveLocale] = useState<Locale>('en');
  const [sectionTitle, setSectionTitle] = useState('');
  const [sectionDescription, setSectionDescription] = useState('');
  const [items, setItems] = useState<SecurityItem[]>([]);

  const { data, isLoading } = useAdminSiteConfig('security', activeLocale);
  const mutation = useAdminUpdateSiteConfig();

  useEffect(() => {
    const content = data?.data?.content || data?.content;
    if (content) {
      setSectionTitle(content.title ?? content.sectionTitle ?? '');
      setSectionDescription(content.description ?? content.sectionDescription ?? '');
      setItems(content.items ?? []);
    }
  }, [data]);

  const addItem = () => {
    setItems([...items, { title: '', description: '' }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof SecurityItem, value: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleSave = async () => {
    try {
      await mutation.mutateAsync({
        section: 'security',
        locale: activeLocale,
        content: { sectionTitle, sectionDescription, items },
      });
      toast.success('Security section saved successfully');
    } catch {
      toast.error('Failed to save security section');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Security</h1>
          <p className="text-gray-500 mt-1">Manage the trust and security section</p>
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
              <CardTitle className="text-lg">Section Header</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Section Title</label>
                <Input
                  value={sectionTitle}
                  onChange={(e) => setSectionTitle(e.target.value)}
                  placeholder="e.g. Enterprise Security"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Section Description</label>
                <Textarea
                  value={sectionDescription}
                  onChange={(e) => setSectionDescription(e.target.value)}
                  placeholder="Describe your security approach"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Security Items</CardTitle>
              <Button variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No items yet. Click "Add Item" to get started.</p>
              )}
              {items.map((item, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">Item {index + 1}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(index)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">Title</label>
                    <Input
                      value={item.title}
                      onChange={(e) => updateItem(index, 'title', e.target.value)}
                      placeholder="Security feature title"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1.5 block">Description</label>
                    <Textarea
                      value={item.description}
                      onChange={(e) => updateItem(index, 'description', e.target.value)}
                      placeholder="Security feature description"
                      rows={2}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
