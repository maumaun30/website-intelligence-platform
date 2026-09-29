'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';

function initials(name: string, email: string): string {
  const source = name.trim().length > 0 ? name.trim() : email;
  const parts = source.split(/[\s@._-]+/).filter((part) => part.length > 0);
  return parts
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

const MENU_LINKS = [
  { href: '/dashboard/settings', label: 'Account settings' },
  { href: '/dashboard/billing', label: 'Billing and plan' },
] as const;

/**
 * The sidebar's account control: everything that belongs to the person rather than to the
 * organization's data — settings, billing, theme, signing out.
 *
 * Closes on Escape and on a click outside, and moves focus back to the trigger on Escape so
 * keyboard users are not dropped at the top of the page.
 */
export function UserMenu({
  user,
  collapsed,
}: {
  user: { name: string; email: string };
  collapsed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full items-center gap-2.5 rounded-md border-t border-border pt-3 text-left transition-colors ease-out hover:text-foreground ${
          collapsed ? 'justify-center' : ''
        }`}
      >
        <span
          aria-hidden="true"
          className="grid size-8 flex-none place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground"
        >
          {initials(user.name, user.email)}
        </span>
        {collapsed ? (
          <span className="sr-only">{user.name} — account menu</span>
        ) : (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
              className="flex-none text-muted-foreground"
            >
              <path d="M5 6l3-3 3 3M5 10l3 3 3-3" />
            </svg>
          </>
        )}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="animate-rise absolute bottom-full left-0 z-20 mb-2 flex w-60 flex-col gap-1 rounded-lg border border-border bg-card p-1.5 shadow-xl"
        >
          <div className="flex flex-col px-2.5 py-2">
            <span className="truncate text-[13px] font-semibold">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>

          <div className="h-px bg-border" />

          {MENU_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors ease-out hover:bg-accent"
            >
              {link.label}
            </Link>
          ))}

          <div className="h-px bg-border" />

          <div className="flex flex-col gap-1.5 px-2.5 py-2">
            <span className="text-xs font-medium text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>

          <div className="h-px bg-border" />

          <div className="px-1 pb-1">
            <SignOutButton />
          </div>
        </div>
      ) : null}
    </div>
  );
}
