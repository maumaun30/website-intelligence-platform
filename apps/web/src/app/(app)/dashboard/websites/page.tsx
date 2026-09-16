import { AddWebsiteForm } from '@/components/add-website-form';
import { WebsitesList } from '@/components/websites-list';

export default function WebsitesPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Websites</h1>
        <p className="text-sm text-muted-foreground">Register and monitor your sites.</p>
      </header>

      <section className="flex flex-col gap-4">
        <WebsitesList />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium">Add a website</h2>
        <AddWebsiteForm />
      </section>
    </div>
  );
}
