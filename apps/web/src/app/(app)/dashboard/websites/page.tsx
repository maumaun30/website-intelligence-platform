import { AddWebsiteDialog } from '@/components/add-website-dialog';
import { WebsitesList } from '@/components/websites-list';

export default function WebsitesPage() {
  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">Websites</h1>
          <p className="text-sm text-muted-foreground">Register and monitor your sites.</p>
        </div>
        <AddWebsiteDialog />
      </header>

      <WebsitesList />
    </div>
  );
}
