const {
  encrypt, decrypt, sha256, generateApiKey, timingSafeEqualStr,
  hashPassword, verifyPassword, signSession, verifySession,
} = require('../../../src/utils/secureCrypto');

describe('secureCrypto', () => {
  describe('AES-256-GCM encrypt/decrypt', () => {
    test('round-trips a secret with the right key', () => {
      const plain = JSON.stringify({ cookie: 'xoxd-abc', token: 'xoxc-def' });
      const enc = encrypt(plain, 'master-passphrase-123');
      expect(enc).not.toContain('xoxd-');
      expect(decrypt(enc, 'master-passphrase-123')).toBe(plain);
    });

    test('fails to decrypt with the wrong key', () => {
      const enc = encrypt('secret', 'key-one');
      expect(() => decrypt(enc, 'key-two')).toThrow();
    });

    test('rejects tampered ciphertext (GCM auth tag)', () => {
      const enc = encrypt('secret', 'key');
      const buf = Buffer.from(enc, 'base64');
      buf[buf.length - 1] ^= 0xff;
      expect(() => decrypt(buf.toString('base64'), 'key')).toThrow();
    });

    test('requires a master key', () => {
      expect(() => encrypt('x', '')).toThrow();
    });
  });

  describe('API keys', () => {
    test('generates prefixed, unique keys', () => {
      const a = generateApiKey();
      const b = generateApiKey();
      expect(a.startsWith('spk_')).toBe(true);
      expect(a).not.toBe(b);
    });

    test('sha256 is stable and hex', () => {
      expect(sha256('abc')).toBe(sha256('abc'));
      expect(sha256('abc')).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('timingSafeEqualStr', () => {
    test('true for equal, false for different (incl. length)', () => {
      expect(timingSafeEqualStr('same', 'same')).toBe(true);
      expect(timingSafeEqualStr('a', 'b')).toBe(false);
      expect(timingSafeEqualStr('short', 'much-longer')).toBe(false);
    });
  });

  describe('password hashing (scrypt)', () => {
    test('verifies the correct password and rejects wrong ones', () => {
      const h = hashPassword('correct horse battery');
      expect(h.startsWith('scrypt$')).toBe(true);
      expect(verifyPassword('correct horse battery', h)).toBe(true);
      expect(verifyPassword('wrong', h)).toBe(false);
    });

    test('rejects malformed stored hashes without throwing', () => {
      expect(verifyPassword('x', '')).toBe(false);
      expect(verifyPassword('x', 'not-a-hash')).toBe(false);
    });
  });

  describe('session tokens (HMAC)', () => {
    test('round-trips a payload', () => {
      const tok = signSession({ u: 'me', exp: 123 }, 'secret');
      expect(verifySession(tok, 'secret')).toEqual({ u: 'me', exp: 123 });
    });

    test('rejects a tampered token or wrong secret', () => {
      const tok = signSession({ u: 'me', exp: 123 }, 'secret');
      expect(verifySession(tok, 'other')).toBeNull();
      expect(verifySession(tok + 'x', 'secret')).toBeNull();
      expect(verifySession('garbage', 'secret')).toBeNull();
    });
  });
});
