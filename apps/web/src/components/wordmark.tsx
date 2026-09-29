/** The product's mark. Orange is the brand, and it appears nowhere that carries status. */
export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className={`grid flex-none place-items-center rounded-md bg-brand font-bold text-brand-foreground ${
          size === 'lg' ? 'size-8 text-base' : 'size-7 text-sm'
        }`}
      >
        W
      </span>
      <span
        className={`font-semibold tracking-[-0.01em] ${size === 'lg' ? 'text-[17px]' : 'text-base'}`}
      >
        Wintel
      </span>
    </span>
  );
}
