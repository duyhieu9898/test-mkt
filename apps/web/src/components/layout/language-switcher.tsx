'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Languages, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api/client';
import { useCompany } from '@/lib/api/hooks';
import {
  APP_LANGUAGES,
  APP_LANGUAGE_LABELS,
  appT,
  normalizeAppLanguage,
  type AppLanguage,
} from '@/lib/app-language';
import { useAuthStore } from '@/stores/auth-store';

export function LanguageSwitcher({ companyId }: { companyId?: string }) {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const { data: company } = useCompany(companyId ?? '');
  const language = useMemo(
    () => normalizeAppLanguage(company?.settings?.language),
    [company?.settings?.language],
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  if (!companyId) return null;

  const updateLanguage = async (next: string) => {
    if (!token) return;
    const nextLanguage = normalizeAppLanguage(next);
    if (nextLanguage === language) return;
    setSaving(true);
    try {
      await api.patch(`/companies/${companyId}`, {
        settings: { language: nextLanguage },
      }, { token });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['company', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['companies'] }),
      ]);
      toast.success(appT(nextLanguage, 'languageSaved'));
    } catch {
      toast.error(appT(language, 'languageSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {saving ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <Languages className="hidden h-4 w-4 text-muted-foreground sm:block" />
      )}
      <Select value={language} onValueChange={updateLanguage} disabled={saving}>
        <SelectTrigger
          className="h-9 w-[116px] border-slate-200 bg-white/80 px-2 text-xs"
          title={appT(language, 'companyLanguage')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {APP_LANGUAGES.map((item: AppLanguage) => (
            <SelectItem key={item} value={item}>
              {APP_LANGUAGE_LABELS[item]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
