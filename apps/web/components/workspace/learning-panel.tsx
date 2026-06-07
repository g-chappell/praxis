'use client';

import { useEffect, useState } from 'react';

// Workspace learning panel (STORY-17): a collapsible section under the chat that
// surfaces the curated learning_links grouped by topic. Cards show title + source
// and open the external resource in a new tab. Links are fetched lazily the first
// time the panel is opened (mirrors the Git panel's on-demand fetch).

export interface LearningLink {
  id: string;
  title: string;
  url: string;
  topic: string;
  source: string | null;
}

/** Group links by topic, preserving first-seen topic order (the API already
 *  orders by topic, so groups come out alphabetical). */
export function groupByTopic(links: LearningLink[]): [string, LearningLink[]][] {
  const groups = new Map<string, LearningLink[]>();
  for (const link of links) {
    const list = groups.get(link.topic);
    if (list) list.push(link);
    else groups.set(link.topic, [link]);
  }
  return [...groups.entries()];
}

/** Presentational topic-grouped list. Each card links out in a new tab. */
export function LearningLinksList({ links }: { links: LearningLink[] }) {
  if (links.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">No learning links yet.</p>;
  }
  return (
    <div className="flex flex-col gap-3 p-3">
      {groupByTopic(links).map(([topic, items]) => (
        <section key={topic}>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {topic}
          </h3>
          <ul className="flex flex-col gap-1">
            {items.map((link) => (
              <li key={link.id}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded px-2 py-1 text-sm text-foreground hover:bg-accent"
                >
                  {link.title}
                  {link.source && (
                    <span className="ml-1 text-xs text-muted-foreground">· {link.source}</span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function LearningPanel() {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<LearningLink[] | null>(null);
  const [error, setError] = useState(false);

  // Fetch once, the first time the panel is opened.
  useEffect(() => {
    if (!open || links !== null) return;
    let active = true;
    fetch('/api/learning-links')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { links: LearningLink[] }) => {
        if (active) setLinks(data.links);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [open, links]);

  return (
    <div className="border-t">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-accent"
      >
        Learn
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="max-h-64 overflow-y-auto">
          {error ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Couldn’t load learning links.</p>
          ) : links === null ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
          ) : (
            <LearningLinksList links={links} />
          )}
        </div>
      )}
    </div>
  );
}
