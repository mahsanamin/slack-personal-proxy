const { formatSuccessResponse, formatErrorResponse, maskToken, parseBoolean } = require('../../../src/utils/helpers');

describe('formatSuccessResponse', () => {
  test('wraps data in standard format', () => {
    const result = formatSuccessResponse({ foo: 'bar' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ foo: 'bar' });
    expect(result.meta.timestamp).toBeDefined();
  });

  test('merges meta fields', () => {
    const result = formatSuccessResponse({ x: 1 }, { cached: true });
    expect(result.meta.cached).toBe(true);
    expect(result.meta.timestamp).toBeDefined();
  });
});

describe('formatErrorResponse', () => {
  test('wraps error in standard format', () => {
    const err = { code: 'TEST_ERR', status: 400, message: 'Test error' };
    const result = formatErrorResponse(err);
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('TEST_ERR');
    expect(result.error.message).toBe('Test error');
  });

  test('includes details when provided', () => {
    const err = { code: 'ERR', status: 400, message: 'fail' };
    const result = formatErrorResponse(err, { field: 'name' });
    expect(result.error.details).toEqual({ field: 'name' });
  });

  test('omits details when not provided', () => {
    const err = { code: 'ERR', status: 400, message: 'fail' };
    const result = formatErrorResponse(err);
    expect(result.error.details).toBeUndefined();
  });
});

describe('maskToken', () => {
  test('masks middle of token', () => {
    expect(maskToken('xoxc-12345678')).toBe('xoxc...5678');
  });

  test('returns *** for short or empty tokens', () => {
    expect(maskToken('')).toBe('***');
    expect(maskToken(null)).toBe('***');
    expect(maskToken(undefined)).toBe('***');
    expect(maskToken('short')).toBe('***');
  });
});

describe('parseBoolean', () => {
  test('parses true values', () => {
    expect(parseBoolean('true')).toBe(true);
    expect(parseBoolean('1')).toBe(true);
    expect(parseBoolean('yes')).toBe(true);
    expect(parseBoolean(true)).toBe(true);
  });

  test('parses false values', () => {
    expect(parseBoolean('false')).toBe(false);
    expect(parseBoolean('0')).toBe(false);
    expect(parseBoolean('no')).toBe(false);
    expect(parseBoolean(false)).toBe(false);
  });

  test('returns default for empty/null/undefined', () => {
    expect(parseBoolean(null, true)).toBe(true);
    expect(parseBoolean(undefined, false)).toBe(false);
    expect(parseBoolean('', true)).toBe(true);
  });

  test('returns default for unrecognized values', () => {
    expect(parseBoolean('maybe', false)).toBe(false);
    expect(parseBoolean('maybe', true)).toBe(true);
  });
});
