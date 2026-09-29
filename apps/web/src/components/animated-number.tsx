'use client';

import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 600;

/**
 * Counts to a new value rather than snapping to it, so a score that moves after a scan is
 * noticed. It only animates a *change* — the first render shows the real number immediately, and
 * polling that returns the same value does nothing at all.
 */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;

    if (from === value) {
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();

    const step = (now: number) => {
      const progress = Math.min((now - startedAt) / DURATION_MS, 1);
      // Ease out cubic: fast first, settles gently on the real number.
      const eased = 1 - (1 - progress) ** 3;
      setShown(Math.round(from + (value - from) * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className={className}>{shown}</span>;
}
