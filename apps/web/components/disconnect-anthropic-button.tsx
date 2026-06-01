'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

export function DisconnectAnthropicButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await fetch('/api/oauth/anthropic/disconnect', { method: 'POST' });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button onClick={handleClick} variant="outline" disabled={pending}>
      {pending ? 'Disconnecting…' : 'Disconnect'}
    </Button>
  );
}
