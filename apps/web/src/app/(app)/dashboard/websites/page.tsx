import { AddWebsiteForm } from '@/components/add-website-form';
import { WebsitesList } from '@/components/websites-list';

export default function WebsitesPage() {
  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">Websites</h1>
        <p className="text-sm text-muted-foreground">Register and monitor your sites.</p>
      </header>

      <WebsitesList />

      <section className="flex max-w-2xl flex-col gap-4 rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold">Add a website</h2>
          <p className="text-[13px] text-muted-foreground">
            We verify that you own it before the first crawl.
          </p>
        </div>
        <AddWebsiteForm />
      </section>
    </div>
  );
}
