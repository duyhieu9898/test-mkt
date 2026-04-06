'use client';

import { type Locale, locales, localeNames, localeFlags } from '@/lib/i18n';

interface LanguageTabsProps {
  activeLocale: Locale;
  onChange: (locale: Locale) => void;
}

export function LanguageTabs({ activeLocale, onChange }: LanguageTabsProps) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
      {locales.map((locale) => (
        <button
          key={locale}
          onClick={() => onChange(locale)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
            activeLocale === locale
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <span>{localeFlags[locale]}</span>
          <span>{localeNames[locale]}</span>
        </button>
      ))}
    </div>
  );
}
