const { parsePermalink } = require('../../../src/controllers/conversationController');

describe('parsePermalink', () => {
  test('parses standard permalink', () => {
    const result = parsePermalink('https://wego.slack.com/archives/C0899FT59L5/p1772450867520709');
    expect(result).toEqual({ channelId: 'C0899FT59L5', threadTs: '1772450867.520709' });
  });

  test('parses permalink with different workspace', () => {
    const result = parsePermalink('https://myteam.slack.com/archives/C12345/p1708340000123456');
    expect(result).toEqual({ channelId: 'C12345', threadTs: '1708340000.123456' });
  });

  test('returns null for invalid URL', () => {
    expect(parsePermalink('https://example.com')).toBeNull();
    expect(parsePermalink('not-a-url')).toBeNull();
    expect(parsePermalink('')).toBeNull();
  });

  test('returns null for URL missing timestamp', () => {
    expect(parsePermalink('https://wego.slack.com/archives/C123')).toBeNull();
  });
});
