// Unit tests for the PATCH /api/projects/[id] boundary validator (STORY-39).
// Pure — no DB, runs in CI. Ownership + persistence are covered by
// projects.integration.test.ts (RUN_DB_TESTS=1).

import { describe, expect, it } from 'vitest';

import { DESCRIPTION_MAX, NAME_MAX, parseProjectPatch } from './projects';

describe('parseProjectPatch', () => {
  it('accepts a valid name + description and forwards them untrimmed', () => {
    const r = parseProjectPatch({ name: '  New name ', description: ' hi ' });
    expect(r).toEqual({ fields: { name: '  New name ', description: ' hi ' } });
  });

  it('accepts a name-only patch', () => {
    expect(parseProjectPatch({ name: 'Just a name' })).toEqual({
      fields: { name: 'Just a name' },
    });
  });

  it('accepts an empty-string description (clears it downstream)', () => {
    expect(parseProjectPatch({ description: '' })).toEqual({ fields: { description: '' } });
  });

  it('rejects an empty / whitespace-only name', () => {
    expect(parseProjectPatch({ name: '   ' })).toEqual({ error: 'invalid_name' });
  });

  it('rejects a non-string name', () => {
    expect(parseProjectPatch({ name: 42 })).toEqual({ error: 'invalid_name' });
  });

  it('rejects a name over NAME_MAX chars', () => {
    expect(parseProjectPatch({ name: 'x'.repeat(NAME_MAX + 1) })).toEqual({
      error: 'invalid_name',
    });
  });

  it('rejects a description over DESCRIPTION_MAX chars', () => {
    expect(parseProjectPatch({ description: 'x'.repeat(DESCRIPTION_MAX + 1) })).toEqual({
      error: 'invalid_description',
    });
  });

  it('rejects an empty patch (no fields)', () => {
    expect(parseProjectPatch({})).toEqual({ error: 'no_fields' });
    expect(parseProjectPatch(null)).toEqual({ error: 'no_fields' });
  });
});
