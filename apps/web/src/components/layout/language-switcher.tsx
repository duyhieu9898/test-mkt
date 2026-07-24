'use client';

import { Languages } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  APP_LANGUAGES,
  APP_LANGUAGE_LABELS,
  appT,
  normalizeAppLanguage,
  type AppLanguage,
} from '@/lib/app-language';
import { usePreferredAppLanguage } from '@/lib/use-preferred-app-language';

export function LanguageSwitcher({ companyId: _companyId }: { companyId?: string }) {
  const [language, setLanguage] = usePreferredAppLanguage('en');

  const updateLanguage = async (next: string) => {
    const nextLanguage = normalizeAppLanguage(next);
    if (nextLanguage === language) return;
    setLanguage(nextLanguage);
    toast.success(appT(nextLanguage, 'languageSaved'));
  };

  return (
    <div className="flex items-center gap-1.5">
      <Languages className="hidden h-4 w-4 text-muted-foreground sm:block" />
      <Select value={language} onValueChange={updateLanguage}>
        <SelectTrigger
          className="h-9 w-[116px] border-slate-200 bg-white/80 px-2 text-xs"
          title={appT(language, 'language')}
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
