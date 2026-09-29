'use client';

import { OrganizationSection } from '@/components/settings/organization-section';
import { PasswordForm } from '@/components/settings/password-form';
import { ProfileForm } from '@/components/settings/profile-form';
import { SessionsList } from '@/components/settings/sessions-list';
import { SectionsSkeleton } from '@/components/skeletons';
import { authClient } from '@/lib/auth-client';
import { useMe } from '@/lib/use-account';

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <p className="text-[13px] text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const me = useMe();
  const session = authClient.useSession();

  return (
    <div className="flex max-w-3xl flex-col gap-7">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em]">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Your account, how you sign in, and who else is in this organization.
        </p>
      </header>

      {me.isPending ? (
        <SectionsSkeleton sections={4} label="Loading your account" />
      ) : me.isError ? (
        <p className="text-sm text-destructive">Could not load your account.</p>
      ) : (
        <div className="stagger flex flex-col gap-7">
          <Section title="Profile" description="How you appear, and where we reach you.">
            <ProfileForm user={{ name: me.data.user.name, email: me.data.user.email }} />
          </Section>

          <Section
            title="Password"
            description="Changing your password signs out every other session."
          >
            <PasswordForm />
          </Section>

          <Section title="Sessions" description="Everywhere this account is currently signed in.">
            <SessionsList currentSessionToken={session.data?.session.token} />
          </Section>

          <Section
            title="Organization"
            description="Websites, scans and billing all belong to this organization."
          >
            <OrganizationSection canManage={me.data.role === 'owner' || me.data.role === 'admin'} />
          </Section>
        </div>
      )}
    </div>
  );
}
