import { register, init, getLocaleFromNavigator, locale } from 'svelte-i18n';

register('en', () => import('../locales/en.json'));
register('ko', () => import('../locales/ko.json'));

const initialLocale = typeof window !== 'undefined'
  ? (localStorage.getItem('locale') || getLocaleFromNavigator())
  : 'en';

init({
  fallbackLocale: 'en',
  initialLocale
});

export function setLanguage(lang: string) {
  locale.set(lang);
  localStorage.setItem('locale', lang);
}
