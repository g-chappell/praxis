import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  caddyAsk,
  getPreview,
  previewUrlFor,
  previewWsSlug,
  registerPreview,
  removePreview,
  slugForHost,
  upstreamWsUrl,
} from '../src/preview';

const OLD_DOMAIN = process.env.PREVIEW_DOMAIN;
beforeEach(() => {
  process.env.PREVIEW_DOMAIN = 'preview.example.dev';
});
afterEach(() => {
  process.env.PREVIEW_DOMAIN = OLD_DOMAIN;
  removePreview('p1');
});

describe('slugForHost', () => {
  it('extracts the single subdomain label (ignoring any port)', () => {
    expect(slugForHost('abc123.preview.example.dev')).toBe('abc123');
    expect(slugForHost('abc123.preview.example.dev:443')).toBe('abc123');
    expect(slugForHost('ABC123.PREVIEW.EXAMPLE.DEV')).toBe('abc123');
  });

  it('rejects non-preview, multi-label, bare-domain and empty hosts', () => {
    expect(slugForHost('api.praxis.example.dev')).toBeNull();
    expect(slugForHost('a.b.preview.example.dev')).toBeNull(); // more than one label
    expect(slugForHost('preview.example.dev')).toBeNull(); // no slug
    expect(slugForHost('')).toBeNull();
    expect(slugForHost(undefined)).toBeNull();
  });
});

describe('registry + caddyAsk', () => {
  it('register/get/remove drives the on-demand-TLS verdict', () => {
    expect(caddyAsk('p1.preview.example.dev')).toBe(false); // not live → no cert
    registerPreview('p1', { ip: '172.20.0.5', port: 5173 });
    expect(getPreview('p1')).toEqual({ ip: '172.20.0.5', port: 5173 });
    expect(caddyAsk('p1.preview.example.dev')).toBe(true);
    expect(previewUrlFor('p1')).toBe('https://p1.preview.example.dev');
    removePreview('p1');
    expect(caddyAsk('p1.preview.example.dev')).toBe(false); // revoked
  });

  it('ask is false for a non-preview host even with a live registry', () => {
    registerPreview('p1', { ip: '172.20.0.5', port: 5173 });
    expect(caddyAsk('api.praxis.example.dev')).toBe(false);
  });
});

describe('preview HMR WebSocket tunnel (STORY-30)', () => {
  it('previewWsSlug returns the slug only for a preview-host WS upgrade', () => {
    expect(previewWsSlug('p1.preview.example.dev', 'websocket')).toBe('p1');
    expect(previewWsSlug('p1.preview.example.dev', 'WebSocket')).toBe('p1'); // case-insensitive
    expect(previewWsSlug('p1.preview.example.dev', null)).toBeNull(); // not an upgrade
    expect(previewWsSlug('p1.preview.example.dev', 'h2c')).toBeNull(); // other upgrade
    expect(previewWsSlug('api.praxis.example.dev', 'websocket')).toBeNull(); // not a preview host
  });

  it('upstreamWsUrl targets the sandbox dev server, preserving path + query', () => {
    const target = { ip: '172.20.0.5', port: 5173 };
    expect(upstreamWsUrl(target, new Request('https://p1.preview.example.dev/'))).toBe(
      'ws://172.20.0.5:5173/',
    );
    expect(
      upstreamWsUrl(target, new Request('https://p1.preview.example.dev/@vite/client?token=x')),
    ).toBe('ws://172.20.0.5:5173/@vite/client?token=x');
  });
});
