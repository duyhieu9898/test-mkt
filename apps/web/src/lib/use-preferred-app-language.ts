'use client';

import { useEffect, useState } from 'react';
import {
  APP_LANGUAGE_STORAGE_KEY,
  normalizeAppLanguage,
  type AppLanguage,
} from '@/lib/app-language';

export function usePreferredAppLanguage(defaultLanguage: AppLanguage = 'en') {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    if (typeof window === 'undefined') return defaultLanguage;
    try {
      return normalizeAppLanguage(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY) ?? defaultLanguage);
    } catch {
      return defaultLanguage;
    }
  });

  useEffect(() => {
    const readStoredLanguage = () => {
      try {
        setLanguageState(normalizeAppLanguage(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)));
      } catch {
        setLanguageState(defaultLanguage);
      }
    };

    readStoredLanguage();
    const handleLanguageChange = (event: Event) => {
      const nextLanguage = (event as CustomEvent<AppLanguage>).detail;
      setLanguageState(normalizeAppLanguage(nextLanguage));
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== APP_LANGUAGE_STORAGE_KEY) return;
      setLanguageState(normalizeAppLanguage(event.newValue ?? defaultLanguage));
    };
    window.addEventListener('app-language:changed', handleLanguageChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('app-language:changed', handleLanguageChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [defaultLanguage]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    try {
      window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, nextLanguage);
      window.dispatchEvent(new CustomEvent('app-language:changed', { detail: nextLanguage }));
    } catch {
      // Ignore storage errors in private browsing modes.
    }
  };

  return [language, setLanguage] as const;
}
