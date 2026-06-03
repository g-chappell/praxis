'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { Button } from '@/components/ui/button';
import { DEFAULT_TEMPLATE_ID, TEMPLATES } from '@/lib/templates';

// Create a project (STORY-27): pick a name + a template, then POST. Subsumes the
// old NewProjectButton (which sent an empty POST). Shown as a button that opens
// a small popover form.
export function CreateProjectForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState<string>(DEFAULT_TEMPLATE_ID);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), templateId }),
      });
      if (!res.ok) {
        setPending(false);
        setError('Could not create the project. Try again.');
        return;
      }
      const { id } = (await res.json()) as { id: string };
      router.push(`/projects/${id}`);
    } catch {
      setPending(false);
      setError('Could not create the project. Try again.');
    }
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>New project</Button>;
  }

  return (
    <div className="relative">
      <Button disabled>New project</Button>
      <form
        onSubmit={onSubmit}
        className="absolute right-0 top-full z-10 mt-2 w-80 space-y-3 rounded-md border bg-background p-4 text-left shadow-md"
      >
        <div className="space-y-1">
          <label htmlFor="project-name" className="text-xs font-medium text-muted-foreground">
            Name
          </label>
          <input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled project"
            className="w-full rounded-md border px-3 py-2 text-sm"
            autoFocus
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-muted-foreground">Template</legend>
          {TEMPLATES.map((t) => (
            <label key={t.id} className="flex cursor-pointer gap-2 rounded-md border p-2 text-sm">
              <input
                type="radio"
                name="template"
                value={t.id}
                checked={templateId === t.id}
                onChange={() => setTemplateId(t.id)}
                className="mt-1"
              />
              <span className="min-w-0">
                <span className="block font-medium">{t.name}</span>
                <span className="block text-xs text-muted-foreground">{t.description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </form>
    </div>
  );
}
