'use client';

import { useEffect, useState } from 'react';

import { THEME_STORAGE_KEY, THEMES, type Theme, applyTheme, isTheme } from '@/lib/theme';

const LABELS: Record<Theme, string> = { light: 'Light', dark: 'Dark', system: 'System' };

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
          className={
            theme === option
              ? 'h-7 rounded-sm bg-card text-xs font-medium text-foreground shadow-sm'
              : 'h-7 rounded-sm text-xs font-medium text-muted-foreground transition-colors ease-out hover:text-foreground'
          }
        >
          {LABELS[option]}
        </button>
      ))}
    </div>
  );
}
