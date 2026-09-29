'use client';

import { useEffect, useRef } from 'react';
import type * as React from 'react';

import { cn } from '../lib/utils';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * A modal built on the native `<dialog>` element, so focus trapping, inertness of the page behind
 * it, Escape-to-close and the top layer all come from the browser rather than from a dependency.
 *
 * `showModal()` is missing in jsdom, so the open path falls back to the `open` attribute when it
 * is not a function — enough for tests to render and assert against the content.
 */
export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }

    if (open) {
      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) {
          dialog.showModal();
        }
      } else {
        dialog.setAttribute('open', '');
      }
      return;
    }

    if (typeof dialog.close === 'function') {
      if (dialog.open) {
        dialog.close();
      }
    } else {
      dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      aria-describedby={description ? 'dialog-description' : undefined}
      // Escape closes natively; this keeps React's state in step with it.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      // A click that lands on the dialog element itself is a click on the backdrop: the content
      // sits in an inner element, so anything inside never reaches here.
      onClick={(event) => {
        if (event.target === ref.current) {
          onClose();
        }
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-foreground/35 open:animate-rise',
        className,
      )}
    >
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="dialog-title" className="text-[17px] font-semibold tracking-[-0.01em]">
              {title}
            </h2>
            {description ? (
              <p id="dialog-description" className="text-[13px] text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 flex-none place-items-center rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent hover:text-foreground"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              aria-hidden="true"
            >
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
