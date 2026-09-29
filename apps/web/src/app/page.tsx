import Link from 'next/link';

import { Wordmark } from '@/components/wordmark';

const QUESTIONS = [
  {
    number: '01',
    question: 'Is my site healthy?',
    answer:
      'Every site gets a 0–100 score labelled Good, Fair or Poor, from 15 rules covering indexability, links, metadata and response health.',
  },
  {
    number: '02',
    question: 'What changed?',
    answer:
      'Every scan is compared with the one before it. New issues, fixed issues and the score change sit at the top of the page.',
  },
  {
    number: '03',
    question: 'What do I fix first?',
    answer:
      'Issues are ranked by severity and by how many pages they touch, and each one can be explained in plain English with a fix you can hand to a developer.',
  },
];

/** An illustration of the product, not a real audit: the numbers are an example. */
function HeroPreview() {
  return (
    <div aria-hidden="true" className="relative hidden h-110 xl:block">
      <div className="absolute inset-y-0 right-0 left-10 rounded-2xl border border-border bg-background" />

      <div className="absolute top-12 left-0 flex w-90 flex-col gap-3 rounded-xl border border-border bg-card p-6 shadow-xl">
        <span className="text-[13px] font-medium text-muted-foreground">example.com · Health</span>
        <div className="flex items-baseline gap-3">
          <span className="tnum text-6xl leading-none font-semibold tracking-[-0.04em]">86</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft py-0.5 pr-2.5 pl-2 text-xs font-semibold text-success-soft-foreground">
            <span className="size-1.75 rounded-full bg-success" />
            Good
          </span>
          <span className="text-sm font-semibold text-success">▲ +45</span>
        </div>
        <svg viewBox="0 0 300 64" className="h-16 w-full">
          <polyline
            points="1,40 34,42 67,44 100,48 133,50 166,40 199,30 232,22 265,14 299,10"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinejoin="round"
            strokeLinecap="round"
            className="text-success"
          />
        </svg>
        <span className="text-[12.5px] text-muted-foreground">
          Back from 41 after fixing canonical tags
        </span>
      </div>

      <div className="absolute top-30 right-7 flex w-80 flex-col gap-2.5 rounded-xl border border-border bg-card p-5 shadow-xl">
        <span className="font-mono text-[11px] font-semibold tracking-[0.08em] text-brand-strong uppercase">
          Fix first
        </span>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-sm bg-destructive-soft px-2 py-0.5 text-xs font-semibold text-destructive-soft-foreground">
          <svg width="11" height="11" viewBox="0 0 12 12">
            <path d="M6 1l5 9H1z" fill="currentColor" />
          </svg>
          Critical · 214 pages
        </span>
        <span className="text-base leading-snug font-semibold">
          Missing canonical on product pages
        </span>
        <span className="text-[13px] leading-relaxed text-muted-foreground">
          Filtered collection URLs are being indexed as duplicates. Add a self-referencing
          canonical…
        </span>
      </div>

      <div className="absolute bottom-7 left-30 flex items-center gap-2.5 rounded-full border border-border bg-card py-2 pr-4 pl-2.5 text-[13px] font-medium shadow-lg">
        <span className="size-2 rounded-full bg-primary ring-4 ring-primary-soft" />
        Since previous audit: <strong className="font-semibold">6 new · 2 fixed</strong>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-card">
      <header className="flex h-18 items-center justify-between gap-6 border-b border-border px-6 lg:px-16">
        <Wordmark size="lg" />
        <nav className="hidden gap-8 text-sm font-medium text-muted-foreground md:flex">
          <a href="#how-it-works" className="hover:text-foreground">
            How it works
          </a>
          <Link href="/dashboard/billing" className="hover:text-foreground">
            Pricing
          </Link>
        </nav>
        <div className="flex items-center gap-2.5">
          <Link
            href="/sign-in"
            className="inline-flex h-10 items-center rounded-md px-4 text-sm font-medium hover:bg-accent"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex h-10 items-center rounded-md bg-primary px-4.5 text-sm font-semibold text-primary-foreground transition-colors ease-out hover:bg-primary/90"
          >
            Start free
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="grid items-center gap-16 px-6 py-20 lg:px-16 lg:py-24 xl:grid-cols-2">
          <div className="flex flex-col gap-6">
            <span className="font-mono text-xs font-semibold tracking-[0.08em] text-brand-strong uppercase">
              Website health monitoring
            </span>
            <h1 className="text-5xl leading-[1.04] font-semibold tracking-[-0.035em] text-balance lg:text-6xl">
              Know if your site is healthy, and{' '}
              <span className="text-brand-strong">what to fix first.</span>
            </h1>
            <p className="max-w-130 text-lg leading-relaxed text-pretty text-muted-foreground">
              Wintel crawls your site on a schedule, checks it against 15 technical SEO rules, and
              gives it a 0–100 score. When the score drops, you see exactly why — with a
              plain-English fix for each issue.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/sign-up"
                className="inline-flex h-12 items-center rounded-xl bg-primary px-5.5 text-[15px] font-semibold text-primary-foreground transition-colors ease-out hover:bg-primary/90"
              >
                Scan your site free
              </Link>
              <span className="text-[13px] text-muted-foreground">
                1 site free, forever. No card.
              </span>
            </div>
          </div>
          <HeroPreview />
        </section>

        <section
          id="how-it-works"
          className="grid gap-px border-y border-border bg-border md:grid-cols-3"
        >
          {QUESTIONS.map((item) => (
            <div key={item.number} className="flex flex-col gap-3 bg-card px-8 py-12 lg:px-12">
              <span className="font-mono text-[13px] font-medium text-muted-foreground">
                {item.number}
              </span>
              <h2 className="text-2xl leading-tight font-semibold tracking-[-0.02em]">
                {item.question}
              </h2>
              <p className="text-[15px] leading-relaxed text-pretty text-muted-foreground">
                {item.answer}
              </p>
            </div>
          ))}
        </section>

        <section className="flex flex-wrap items-center justify-between gap-10 px-6 py-20 lg:px-16">
          <h2 className="max-w-160 text-4xl leading-tight font-semibold tracking-[-0.025em]">
            Your first score is ready in about five minutes.
          </h2>
          <Link
            href="/sign-up"
            className="inline-flex h-12 items-center rounded-xl bg-primary px-5.5 text-[15px] font-semibold text-primary-foreground transition-colors ease-out hover:bg-primary/90"
          >
            Scan your site free
          </Link>
        </section>
      </main>

      <footer className="flex flex-wrap justify-between gap-4 border-t border-border px-6 py-6 text-[13px] text-muted-foreground lg:px-16">
        <span>© 2026 Wintel</span>
        <Link href="/sign-in" className="hover:text-foreground">
          Sign in
        </Link>
      </footer>
    </div>
  );
}
