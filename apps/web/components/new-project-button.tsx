'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

// Creates a project then navigates to its workspace (STORY-09).
export function NewProjectButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      const res = await fetch('/api/projects', { method: 'POST' });
      if (!res.ok) {
        setPending(false);
        return;
      }
      const { id } = (await res.json()) as { id: string };
      router.push(`/projects/${id}`);
    } catch {
      setPending(false);
    }
  }

  return (
    <Button onClick={onClick} disabled={pending}>
      {pending ? 'Creating…' : 'New project'}
    </Button>
  );
}
