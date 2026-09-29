'use client';

import { useEffect, useState } from 'react';

import { THEME_STORAGE_KEY, THEMES, type Theme, applyTheme, isTheme } from '@/lib/theme';

const LABELS: Record<Theme, string> = { light: 'Light', dark: 'Dark', system: 'System' };

const ICONS: Record<Theme, React.ReactNode> = {
  light: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="3" />
      <path
        d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06"
        strokeLinecap="round"
      />
    </svg>
  ),
  dark: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z" strokeLinejoin="round" />
    </svg>
  ),
  system: (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" />
      <path d="M5.5 14h5" strokeLinecap="round" />
    </svg>
  ),
};

/**
 * Light / Dark / System. The stored choice is read after mount because the pre-hydration script
 * in the root layout owns the first paint; until then every option renders unchecked.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    setTheme(isTheme(stored) ? stored : 'system');
  }, []);

  useEffect(() => {
    if (theme === null) {
      return;
    }
    applyTheme(theme);
    if (theme !== 'system') {
      return;
    }
    // Following the OS means reacting when it changes while the tab is open.
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const choose = (next: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setTheme(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="grid grid-cols-3 gap-0.5 rounded-md bg-muted p-0.5"
    >
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={theme === option}
          onClick={() => choose(option)}
          title={LABELS[option]}
          className={
            theme === option
              ? 'grid h-7 place-items-center rounded-sm bg-card text-foreground shadow-sm'
              : 'grid h-7 place-items-center rounded-sm text-muted-foreground transition-colors ease-out hover:text-foreground'
          }
        >
          {ICONS[option]}
          <span className="sr-only">{LABELS[option]}</span>
        </button>
      ))}
    </div>
  );
}
