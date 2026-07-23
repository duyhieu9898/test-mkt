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
  APP_LANGUAGE_STORAGE_KEY,
  appT,
  normalizeAppLanguage,
  type AppLanguage,
} from '@/lib/app-language';
import { useAuthStore } from '@/stores/auth-store';

export function LanguageSwitcher({ companyId }: { companyId?: string }) {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const { data: company } = useCompany(companyId ?? '');
  const [localLanguage, setLocalLanguage] = useState<AppLanguage>('en');
  const companyLanguage = useMemo(
    () => normalizeAppLanguage(company?.settings?.language),
    [company?.settings?.language],
  );
  const language = companyId ? companyLanguage : localLanguage;
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (companyId) return;
    try {
      setLocalLanguage(normalizeAppLanguage(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)));
    } catch {
      setLocalLanguage('en');
    }
  }, [companyId]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const updateLanguage = async (next: string) => {
    const nextLanguage = normalizeAppLanguage(next);
    if (nextLanguage === language) return;

    if (!companyId) {
      setLocalLanguage(nextLanguage);
      try {
        window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, nextLanguage);
        window.dispatchEvent(new CustomEvent('app-language:changed', { detail: nextLanguage }));
      } catch {
        // Ignore storage errors in private browsing modes.
      }
      toast.success(appT(nextLanguage, 'languageSaved'));
      return;
    }

    if (!token) return;
    setSaving(true);
    try {
      await api.patch(`/companies/${companyId}`, {
        settings: { language: nextLanguage },
      }, { token });
      try {
        window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, nextLanguage);
        window.dispatchEvent(new CustomEvent('app-language:changed', { detail: nextLanguage }));
      } catch {
        // Ignore storage errors in private browsing modes.
      }
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
