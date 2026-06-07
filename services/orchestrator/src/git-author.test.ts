import { describe, expect, it } from 'vitest';

import { DEFAULT_GIT_IDENTITY, gitIdentity } from './git-author';

describe('gitIdentity', () => {
  const prompter = { displayName: 'Ada Lovelace', email: 'ada@example.com' };
  const owner = { displayName: 'Graham Chappell', email: 'graham@example.com' };

  it('attributes to the prompting user when resolvable', () => {
    expect(gitIdentity(prompter, owner)).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
  });

  it('falls back to the project owner when the prompter is unknown', () => {
    expect(gitIdentity(undefined, owner)).toEqual({
      name: 'Graham Chappell',
      email: 'graham@example.com',
    });
  });

  it('falls back to the owner when the prompter row has no email', () => {
    expect(gitIdentity({ displayName: 'Nameless', email: null }, owner)).toEqual({
      name: 'Graham Chappell',
      email: 'graham@example.com',
    });
  });

  it('falls back to the Praxis default when neither resolves', () => {
    expect(gitIdentity(undefined, undefined)).toEqual(DEFAULT_GIT_IDENTITY);
  });

  it('uses the email as the name when displayName is empty', () => {
    expect(gitIdentity({ displayName: '  ', email: 'solo@example.com' })).toEqual({
      name: 'solo@example.com',
      email: 'solo@example.com',
    });
  });
});
