export const THEMES = ['light', 'dark', 'system'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = 'wintel-theme';

export function isTheme(value: string | null): value is Theme {
  return value !== null && (THEMES as readonly string[]).includes(value);
}

/** `.dark` on `<html>` for the theme the viewer asked for, falling back to the OS preference. */
export function applyTheme(theme: Theme): void {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

/**
 * Runs before hydration so a dark viewer never sees a light flash. Kept to one statement and
 * inlined by the root layout; it must not depend on anything the bundle exports.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;
