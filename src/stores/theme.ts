import { Dark } from 'quasar';
import { defineStore } from 'pinia';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'go-fetch-theme-preference';
const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

let stopSystemListener: (() => void) | null = null;

function isThemePreference(value: string | null): value is ThemePreference {
  return Boolean(value && THEME_OPTIONS.includes(value as ThemePreference));
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    preference: 'system' as ThemePreference,
    systemIsDark: false
  }),
  getters: {
    isDark: (state) => state.preference === 'dark' || (state.preference === 'system' && state.systemIsDark),
    label: (state) => {
      if (state.preference === 'dark') {
        return 'Dark';
      }

      if (state.preference === 'light') {
        return 'Light';
      }

      return 'System';
    },
    icon(): string {
      if (this.preference === 'dark') {
        return 'dark_mode';
      }

      if (this.preference === 'light') {
        return 'light_mode';
      }

      return 'contrast';
    }
  },
  actions: {
    init() {
      if (typeof window === 'undefined') {
        return;
      }

      const storedPreference = window.localStorage.getItem(STORAGE_KEY);
      if (isThemePreference(storedPreference)) {
        this.preference = storedPreference;
      }

      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.systemIsDark = mediaQuery.matches;

      if (!stopSystemListener) {
        const handleSystemThemeChange = (event: MediaQueryListEvent) => {
          this.systemIsDark = event.matches;
          this.applyTheme();
        };

        mediaQuery.addEventListener('change', handleSystemThemeChange);
        stopSystemListener = () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
      }

      this.applyTheme();
    },
    setPreference(preference: ThemePreference) {
      this.preference = preference;

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, preference);
      }

      this.applyTheme();
    },
    applyTheme() {
      const activeTheme = this.isDark ? 'dark' : 'light';

      if (typeof document !== 'undefined') {
        document.documentElement.dataset.theme = activeTheme;
        document.documentElement.style.colorScheme = activeTheme;
      }

      Dark.set(this.isDark);
    }
  }
});
