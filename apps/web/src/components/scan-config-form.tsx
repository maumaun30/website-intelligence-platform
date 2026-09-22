'use client';

import { SCAN_FREQUENCIES, type Website, updateWebsiteInputSchema } from '@wintel/types';
import { Button, Input, Label, Select, Textarea } from '@wintel/ui';
import { type FormEvent, useState } from 'react';

import { describeNextScan } from '@/lib/schedule-text';
import { useBilling } from '@/lib/use-billing';
import { useUpdateWebsite } from '@/lib/use-websites';

const UPDATE_ERROR_TEXT: Record<string, string> = {
  PLAN_SCAN_FREQUENCY: 'That schedule is not part of your plan.',
};

function describeUpdateError(code: string | null): string {
  if (code && UPDATE_ERROR_TEXT[code]) {
    return UPDATE_ERROR_TEXT[code];
  }
  return 'Could not save the scan config.';
}

function toLines(values: string[]): string {
  return values.join('\n');
}

function fromLines(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Edits crawl limits and scheduling. Paths are edited as newline-separated text, stored as arrays. */
export function ScanConfigForm({ website }: { website: Website }) {
  const update = useUpdateWebsite(website.id);
  const [error, setError] = useState<string | null>(null);
  const billing = useBilling();
  const allowedFrequencies = billing.data?.limits.scanFrequencies ?? SCAN_FREQUENCIES;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const parsed = updateWebsiteInputSchema.safeParse({
      maxDepth: Number(form.get('maxDepth')),
      maxPages: Number(form.get('maxPages')),
      includePaths: fromLines(form.get('includePaths')),
      excludePaths: fromLines(form.get('excludePaths')),
      scanFrequency: form.get('scanFrequency'),
      respectRobotsTxt: form.get('respectRobotsTxt') === 'on',
    });

    if (!parsed.success) {
      setError('Check the crawl limits and paths.');
      return;
    }

    update.mutate(parsed.data);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex gap-4">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="maxDepth">Max depth</Label>
          <Input id="maxDepth" name="maxDepth" type="number" defaultValue={website.maxDepth} />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="maxPages">Max pages</Label>
          <Input id="maxPages" name="maxPages" type="number" defaultValue={website.maxPages} />
          {billing.data ? (
            <p className="text-xs text-muted-foreground">
              Your plan crawls at most {billing.data.limits.pagesPerScan} pages per scan.
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="includePaths">Include paths (one per line)</Label>
        <Textarea
          id="includePaths"
          name="includePaths"
          defaultValue={toLines(website.includePaths)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="excludePaths">Exclude paths (one per line)</Label>
        <Textarea
          id="excludePaths"
          name="excludePaths"
          defaultValue={toLines(website.excludePaths)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="scanFrequency">Frequency</Label>
        <Select id="scanFrequency" name="scanFrequency" defaultValue={website.scanFrequency}>
          {SCAN_FREQUENCIES.map((frequency) => (
            <option
              key={frequency}
              value={frequency}
              // Never disable the website's own current value: a grandfathered website whose
              // frequency the plan no longer allows must stay selectable, or the browser drops it
              // from the submitted FormData and the save fails with a misleading parse error.
              disabled={
                !allowedFrequencies.includes(frequency) && frequency !== website.scanFrequency
              }
            >
              {frequency}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          {describeNextScan(website.nextScanAt, new Date())}
        </p>
        {allowedFrequencies.length === 1 ? (
          <p className="text-xs text-muted-foreground">
            Scheduled scans need a paid plan.{' '}
            <a className="underline" href="/dashboard/billing">
              See plans
            </a>
          </p>
        ) : null}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="respectRobotsTxt" defaultChecked={website.respectRobotsTxt} />
        Respect robots.txt
      </label>
      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {update.error ? (
        <p role="alert" className="text-sm text-destructive">
          {describeUpdateError(update.error.code)}
          {update.error.code === 'PLAN_SCAN_FREQUENCY' ? (
            <>
              {' '}
              <a className="underline" href="/dashboard/billing">
                See plans
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      <Button type="submit" disabled={update.isPending}>
        {update.isPending ? 'Saving…' : 'Save scan config'}
      </Button>
    </form>
  );
}
