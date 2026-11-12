const {
  resolveAccess,
  FULL_ACCESS,
  isScoped,
  canRead,
  canWrite,
  assertRead,
  assertWrite,
  assertDmSend,
  filterMatches,
  isValidChannelId,
} = require('../../../src/services/keyAccess');

// Returns the value a function throws, or fails the test if it does not throw.
function thrown(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected a throw');
}

const READ_ONLY_SCOPED = { id: 'k1', access: 'read', readChannels: ['C0AAAAAAA1'] };
const READ_WRITE_SCOPED = { id: 'k2', access: 'read_write', readChannels: ['C0AAAAAAA1'] };
const READ_ALL = { id: 'k3', access: 'read', readChannels: null };
const LEGACY_ENV = { id: 'legacy-env', legacy: true };
const LEGACY_STORE = { id: 'k4', label: 'old key', hash: 'x' }; // created before scopes existed

describe('resolveAccess', () => {
  test('no key means no access at all', () => {
    const a = resolveAccess(undefined);
    expect(canRead(a, 'C0AAAAAAA1')).toBe(false);
    expect(canWrite(a, 'C0AAAAAAA1')).toBe(false);
  });

  test('legacy .env key and legacy stored keys keep full read and write', () => {
    for (const key of [LEGACY_ENV, LEGACY_STORE]) {
      const a = resolveAccess(key);
      expect(isScoped(a)).toBe(false);
      expect(canRead(a, 'D0AAAAAAA1')).toBe(true);
      expect(canWrite(a, 'C0AAAAAAA1')).toBe(true);
    }
  });

  test('a read-only key with selected channels reads only those channels and cannot write', () => {
    const a = resolveAccess(READ_ONLY_SCOPED);
    expect(isScoped(a)).toBe(true);
    expect(canRead(a, 'C0AAAAAAA1')).toBe(true);
    expect(canRead(a, 'C0BBBBBBB2')).toBe(false);
    expect(canRead(a, 'D0AAAAAAA1')).toBe(false);
    expect(canWrite(a, 'C0AAAAAAA1')).toBe(false);
  });

  test('a read-write key can write only to its selected channels', () => {
    const a = resolveAccess(READ_WRITE_SCOPED);
    expect(canWrite(a, 'C0AAAAAAA1')).toBe(true);
    expect(canWrite(a, 'C0BBBBBBB2')).toBe(false);
  });

  test('a read-only key with all channels can read everything but write nothing', () => {
    const a = resolveAccess(READ_ALL);
    expect(isScoped(a)).toBe(false);
    expect(canRead(a, 'D0AAAAAAA1')).toBe(true);
    expect(canWrite(a, 'C0AAAAAAA1')).toBe(false);
  });

  test('FULL_ACCESS is the internal default and passes everything', () => {
    expect(canRead(FULL_ACCESS, 'D0AAAAAAA1')).toBe(true);
    expect(canWrite(FULL_ACCESS, 'C0AAAAAAA1')).toBe(true);
  });
});

describe('assert helpers', () => {
  test('assertRead allows the key channel and throws CHANNEL_NOT_IN_KEY_SCOPE for others', () => {
    const a = resolveAccess(READ_ONLY_SCOPED);
    expect(() => assertRead(a, 'C0AAAAAAA1')).not.toThrow();
    expect(thrown(() => assertRead(a, 'D0AAAAAAA1'))).toMatchObject({
      code: 'CHANNEL_NOT_IN_KEY_SCOPE',
      status: 403,
      details: { channel: 'D0AAAAAAA1' },
    });
  });

  test('assertWrite reports read-only before channel scope', () => {
    const a = resolveAccess(READ_ONLY_SCOPED);
    expect(thrown(() => assertWrite(a, 'C0BBBBBBB2'))).toMatchObject({ code: 'KEY_READ_ONLY' });
  });

  test('assertWrite reports channel scope for a read-write key on another channel', () => {
    const a = resolveAccess(READ_WRITE_SCOPED);
    expect(thrown(() => assertWrite(a, 'C0BBBBBBB2'))).toMatchObject({ code: 'CHANNEL_NOT_IN_KEY_SCOPE' });
    expect(() => assertWrite(a, 'C0AAAAAAA1')).not.toThrow();
  });

  test('assertDmSend blocks every selected-channel key, even read-write', () => {
    expect(thrown(() => assertDmSend(resolveAccess(READ_ONLY_SCOPED)))).toMatchObject({ code: 'KEY_READ_ONLY' });
    expect(thrown(() => assertDmSend(resolveAccess(READ_WRITE_SCOPED)))).toMatchObject({ code: 'DM_NOT_IN_KEY_SCOPE' });
    expect(thrown(() => assertDmSend(resolveAccess(READ_ALL)))).toMatchObject({ code: 'KEY_READ_ONLY' });
    expect(() => assertDmSend(resolveAccess(LEGACY_STORE))).not.toThrow();
  });
});

describe('filterMatches', () => {
  const matches = [
    { ts: '1', channel: { id: 'C0AAAAAAA1' } },
    { ts: '2', channel: { id: 'D0AAAAAAA1' } },
    { ts: '3', channel: { id: 'C0BBBBBBB2' } },
  ];

  test('keeps only matches in the key channels', () => {
    expect(filterMatches(resolveAccess(READ_ONLY_SCOPED), matches).map((m) => m.ts)).toEqual(['1']);
  });

  test('returns everything for unrestricted keys', () => {
    expect(filterMatches(resolveAccess(LEGACY_STORE), matches)).toHaveLength(3);
  });
});

describe('isValidChannelId', () => {
  test('accepts Slack channel-style IDs and rejects others', () => {
    expect(isValidChannelId('C0AAAAAAA1')).toBe(true);
    expect(isValidChannelId('D0AAAAAAA1')).toBe(true);
    expect(isValidChannelId('general')).toBe(false);
    expect(isValidChannelId('')).toBe(false);
    expect(isValidChannelId(undefined)).toBe(false);
  });
});

describe('missing access fails closed', () => {
  const matches = [
    { ts: '1', channel: { id: 'C0AAAAAAA1' } },
    { ts: '2', channel: { id: 'D0AAAAAAA1' } },
  ];

  test('undefined access reads and writes nothing', () => {
    expect(canRead(undefined, 'C0AAAAAAA1')).toBe(false);
    expect(canWrite(undefined, 'C0AAAAAAA1')).toBe(false);
    expect(isScoped(undefined)).toBe(true);
    expect(thrown(() => assertRead(undefined, 'C0AAAAAAA1'))).toMatchObject({ code: 'CHANNEL_NOT_IN_KEY_SCOPE' });
  });

  test('undefined access keeps no matches', () => {
    expect(filterMatches(undefined, matches)).toEqual([]);
  });

  test('FULL_ACCESS is still unrestricted when passed explicitly', () => {
    expect(filterMatches(FULL_ACCESS, matches)).toHaveLength(2);
  });
});
