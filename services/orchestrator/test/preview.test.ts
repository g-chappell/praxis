import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  caddyAsk,
  getPreview,
  previewUrlFor,
  registerPreview,
  removePreview,
  slugForHost,
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
