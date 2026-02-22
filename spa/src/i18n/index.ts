import { enUS, ja } from 'date-fns/locale';
import { I18nLocale, messages } from './messages';

type DateFnsLocale = typeof ja;
type I18nParams = Record<string, string | number> & { defaultValue?: string };

const rootElement = () => document.getElementById('schedule-report-root') as HTMLElement | null;

const normalizeLocale = (value?: string | null): I18nLocale => {
  const locale = (value || '').toLowerCase();
  if (locale.startsWith('ja')) return 'ja';
  if (locale.startsWith('en')) return 'en';
  return 'ja';
};

const detectLocale = (): I18nLocale => {
  const dataLocale = rootElement()?.dataset.locale;
  if (dataLocale) return normalizeLocale(dataLocale);
  return 'ja';
};

let currentLocale: I18nLocale = detectLocale();

export const setLocale = (locale?: string | null) => {
  currentLocale = normalizeLocale(locale);
};

export const getLocale = (): I18nLocale => currentLocale;

export const getDateFnsLocale = (): DateFnsLocale => (currentLocale === 'ja' ? ja : enUS);

const lookup = (locale: I18nLocale, key: string): unknown => {
  return key.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object' && segment in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, messages[locale]);
};

const formatValue = (value: string, params?: I18nParams) => {
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ''));
};

export const t = (key: string, params?: I18nParams): string => {
  const localized = lookup(currentLocale, key);
  if (typeof localized === 'string') return formatValue(localized, params);

  const fallback = lookup('en', key);
  if (typeof fallback === 'string') return formatValue(fallback, params);
  if (typeof params?.defaultValue === 'string') return params.defaultValue;
  return key;
};

export const tList = (key: string): string[] => {
  const localized = lookup(currentLocale, key);
  if (Array.isArray(localized)) return localized.map(String);
  const fallback = lookup('en', key);
  if (Array.isArray(fallback)) return fallback.map(String);
  return [];
};
