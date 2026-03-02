const {
  compactThread,
  compactMessage,
  compactRecentMessage,
  compactSearchResult,
  compactMention,
  compactContextResult,
  extractLinks,
  collapseFiles,
  cleanText,
  inferSource,
} = require('../../../src/utils/compactThread');

describe('cleanText', () => {
  test('replaces user mentions with display name', () => {
    expect(cleanText('<@U123|alice>')).toBe('@alice');
  });

  test('replaces labeled URLs with bare URL', () => {
    expect(cleanText('<https://example.com|Example>')).toBe('https://example.com');
  });

  test('replaces bare URLs by stripping angle brackets', () => {
    expect(cleanText('<https://example.com>')).toBe('https://example.com');
  });

  test('leaves subteam mentions as-is', () => {
    expect(cleanText('<!subteam^S123>')).toBe('<!subteam^S123>');
  });

  test('handles mixed markup', () => {
    expect(cleanText('Hey <@U1|bob>, check <https://x.com|this>'))
      .toBe('Hey @bob, check https://x.com');
  });

  test('returns empty string for null/undefined', () => {
    expect(cleanText(null)).toBe('');
    expect(cleanText(undefined)).toBe('');
  });

  test('returns empty string for empty input', () => {
    expect(cleanText('')).toBe('');
  });
});

describe('inferSource', () => {
  test('uses app_name when present', () => {
    expect(inferSource({ app_name: 'GitHub' })).toBe('github');
  });

  test('normalizes spaces in app_name', () => {
    expect(inferSource({ app_name: 'Google Drive' })).toBe('google_drive');
  });

  test('falls back to app_id', () => {
    expect(inferSource({ app_id: 'A12345' })).toBe('A12345');
  });

  test('falls back to URL domain', () => {
    expect(inferSource({ from_url: 'https://www.notion.so/page' })).toBe('notion.so');
  });

  test('returns unknown for no useful data', () => {
    expect(inferSource({})).toBe('unknown');
  });

  test('strips www from domain', () => {
    expect(inferSource({ title_link: 'https://www.example.com/page' })).toBe('example.com');
  });
});

describe('extractLinks', () => {
  test('returns empty array for null/undefined/empty', () => {
    expect(extractLinks(null)).toEqual([]);
    expect(extractLinks(undefined)).toEqual([]);
    expect(extractLinks([])).toEqual([]);
  });

  test('extracts regular link with url priority', () => {
    const result = extractLinks([{
      app_unfurl_url: 'https://a.com',
      from_url: 'https://b.com',
      fallback: 'Title A',
      app_name: 'TestApp',
    }]);
    expect(result).toEqual([{
      url: 'https://a.com',
      title: 'Title A',
      source: 'testapp',
    }]);
  });

  test('falls back through url fields', () => {
    const result = extractLinks([{ from_url: 'https://b.com', title: 'B' }]);
    expect(result[0].url).toBe('https://b.com');
  });

  test('extracts message unfurls', () => {
    const result = extractLinks([{
      is_msg_unfurl: true,
      from_url: 'https://slack.com/archives/C1/p123',
      fallback: 'Preview text',
    }]);
    expect(result).toEqual([{
      url: 'https://slack.com/archives/C1/p123',
      preview: 'Preview text',
      source: 'slack_message',
    }]);
  });

  test('deduplicates by URL', () => {
    const result = extractLinks([
      { from_url: 'https://a.com', fallback: 'First' },
      { from_url: 'https://a.com', fallback: 'Second' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('First');
  });

  test('skips attachments without a URL', () => {
    const result = extractLinks([{ fallback: 'No URL here' }]);
    expect(result).toEqual([]);
  });
});

describe('collapseFiles', () => {
  test('returns empty array for null/undefined/empty', () => {
    expect(collapseFiles(null)).toEqual([]);
    expect(collapseFiles(undefined)).toEqual([]);
    expect(collapseFiles([])).toEqual([]);
  });

  test('keeps only name, mimetype, url_private, size', () => {
    const result = collapseFiles([{
      name: 'report.pdf',
      mimetype: 'application/pdf',
      url_private: 'https://files.slack.com/abc',
      size: 1024,
      thumb_360: 'https://thumb',
      id: 'F123',
      created: 123456,
    }]);
    expect(result).toEqual([{
      name: 'report.pdf',
      mimetype: 'application/pdf',
      url_private: 'https://files.slack.com/abc',
      size: 1024,
    }]);
  });
});

describe('compactMessage', () => {
  test('returns null for null/undefined', () => {
    expect(compactMessage(null)).toBeNull();
    expect(compactMessage(undefined)).toBeNull();
  });

  test('maps user to user_id and cleans text', () => {
    const result = compactMessage({
      ts: '1234.5678',
      user: 'U123',
      user_name: 'alice',
      text: 'Hey <@U456|bob>',
    });
    expect(result).toEqual({
      ts: '1234.5678',
      user_id: 'U123',
      user_name: 'alice',
      text: 'Hey @bob',
    });
  });

  test('falls back to user_profile.display_name for user_name', () => {
    const result = compactMessage({
      ts: '1',
      user: 'U1',
      user_profile: { display_name: 'Bob' },
      text: 'hi',
    });
    expect(result.user_name).toBe('Bob');
  });

  test('includes links only when present', () => {
    const withLinks = compactMessage({
      ts: '1', user: 'U1', text: 'x',
      attachments: [{ from_url: 'https://a.com', fallback: 'A' }],
    });
    expect(withLinks.links).toHaveLength(1);

    const withoutLinks = compactMessage({ ts: '1', user: 'U1', text: 'x' });
    expect(withoutLinks.links).toBeUndefined();
  });

  test('includes files only when present', () => {
    const withFiles = compactMessage({
      ts: '1', user: 'U1', text: 'x',
      files: [{ name: 'a.txt', mimetype: 'text/plain', url_private: 'https://f', size: 10 }],
    });
    expect(withFiles.files).toHaveLength(1);

    const withoutFiles = compactMessage({ ts: '1', user: 'U1', text: 'x' });
    expect(withoutFiles.files).toBeUndefined();
  });

  test('drops blocks, client_msg_id, team, reactions, etc.', () => {
    const result = compactMessage({
      ts: '1', user: 'U1', text: 'hi',
      blocks: [{ type: 'rich_text' }],
      client_msg_id: 'abc',
      team: 'T1',
      type: 'message',
      reactions: [{ name: '+1' }],
      reply_count: 5,
      edited: { user: 'U1' },
    });
    expect(result.blocks).toBeUndefined();
    expect(result.client_msg_id).toBeUndefined();
    expect(result.team).toBeUndefined();
    expect(result.type).toBeUndefined();
    expect(result.reactions).toBeUndefined();
    expect(result.reply_count).toBeUndefined();
    expect(result.edited).toBeUndefined();
  });
});

describe('compactThread', () => {
  test('returns null for null/undefined', () => {
    expect(compactThread(null)).toBeNull();
    expect(compactThread(undefined)).toBeNull();
  });

  test('flattens thread using complete_thread data', () => {
    const thread = {
      thread_ts: '1000.0',
      channel_id: 'C123',
      channel_name: 'general',
      thread_stats: { total_replies: 2 },
      your_messages: [{ ts: '1001.0', text: 'my reply' }],
      parent_message: { ts: '1000.0', user_id: 'U1', text: 'old parent' },
      complete_thread: {
        parent: { ts: '1000.0', user: 'U1', user_name: 'alice', text: 'parent msg' },
        replies: [
          { ts: '1001.0', user: 'U2', user_name: 'bob', text: 'reply 1' },
          { ts: '1002.0', user: 'U3', user_name: 'carol', text: 'reply 2' },
        ],
      },
    };

    const result = compactThread(thread);

    expect(result.thread_ts).toBe('1000.0');
    expect(result.channel_id).toBe('C123');
    expect(result.channel_name).toBe('general');
    expect(result.thread_stats).toEqual({ total_replies: 2 });
    expect(result.your_messages).toBeUndefined();
    expect(result.complete_thread).toBeUndefined();

    expect(result.parent_message.user_id).toBe('U1');
    expect(result.parent_message.text).toBe('parent msg');
    expect(result.replies).toHaveLength(2);
    expect(result.replies[0].user_id).toBe('U2');
  });

  test('falls back to existing parent_message when complete_thread.parent is null', () => {
    const thread = {
      thread_ts: '1000.0',
      channel_id: 'C1',
      channel_name: 'test',
      thread_stats: {},
      parent_message: { ts: '1000.0', user_id: 'U1', text: 'fallback parent' },
      complete_thread: { parent: null, replies: [] },
    };

    const result = compactThread(thread);
    expect(result.parent_message).toEqual({ ts: '1000.0', user_id: 'U1', text: 'fallback parent' });
  });

  test('handles missing complete_thread gracefully', () => {
    const thread = {
      thread_ts: '1000.0',
      channel_id: 'C1',
      channel_name: 'test',
      thread_stats: {},
      parent_message: { text: 'parent' },
    };

    const result = compactThread(thread);
    expect(result.parent_message).toEqual({ text: 'parent' });
    expect(result.replies).toEqual([]);
  });
});

describe('compactRecentMessage', () => {
  test('returns null for null/undefined', () => {
    expect(compactRecentMessage(null)).toBeNull();
    expect(compactRecentMessage(undefined)).toBeNull();
  });

  test('compacts a plain message', () => {
    const result = compactRecentMessage({
      ts: '1', user: 'U1', user_name: 'alice', text: 'hello',
      blocks: [{ type: 'rich_text' }], team: 'T1',
    });
    expect(result.ts).toBe('1');
    expect(result.user_id).toBe('U1');
    expect(result.blocks).toBeUndefined();
    expect(result.team).toBeUndefined();
  });

  test('includes compacted thread_replies for thread parents', () => {
    const result = compactRecentMessage({
      ts: '1', user: 'U1', text: 'parent',
      is_thread_parent: true,
      thread_replies: [
        { ts: '2', user: 'U2', user_name: 'bob', text: 'reply', blocks: [{}] },
      ],
      thread_truncated: false,
    });
    expect(result.is_thread_parent).toBe(true);
    expect(result.thread_replies).toHaveLength(1);
    expect(result.thread_replies[0].blocks).toBeUndefined();
    expect(result.thread_truncated).toBe(false);
  });

  test('omits thread fields for non-thread messages', () => {
    const result = compactRecentMessage({ ts: '1', user: 'U1', text: 'hi' });
    expect(result.is_thread_parent).toBeUndefined();
    expect(result.thread_replies).toBeUndefined();
  });
});

describe('compactSearchResult', () => {
  test('returns null for null/undefined', () => {
    expect(compactSearchResult(null)).toBeNull();
    expect(compactSearchResult(undefined)).toBeNull();
  });

  test('compacts message and preserves metadata', () => {
    const result = compactSearchResult({
      message: { ts: '1', user: 'U1', text: 'found', blocks: [{}] },
      is_in_thread: false,
      match_score: 0.9,
    });
    expect(result.message.blocks).toBeUndefined();
    expect(result.is_in_thread).toBe(false);
    expect(result.match_score).toBe(0.9);
    expect(result.complete_thread).toBeUndefined();
  });

  test('compacts complete_thread when present', () => {
    const result = compactSearchResult({
      message: { ts: '2', user: 'U1', text: 'reply' },
      is_in_thread: true,
      match_score: 0.8,
      thread_context: { parent_ts: '1', reply_number: 3 },
      complete_thread: {
        parent: { ts: '1', user: 'U2', text: 'parent', blocks: [{}] },
        replies: [{ ts: '2', user: 'U1', text: 'reply', blocks: [{}] }],
      },
    });
    expect(result.thread_context).toEqual({ parent_ts: '1', reply_number: 3 });
    expect(result.complete_thread.parent.blocks).toBeUndefined();
    expect(result.complete_thread.replies[0].blocks).toBeUndefined();
  });
});

describe('compactMention', () => {
  test('returns null for null/undefined', () => {
    expect(compactMention(null)).toBeNull();
    expect(compactMention(undefined)).toBeNull();
  });

  test('keeps mention metadata and cleans text', () => {
    const result = compactMention({
      message_ts: '1',
      channel_id: 'C1',
      channel_name: 'general',
      text: 'Hey <@U1|alice>',
      user_id: 'U2',
      user_name: 'bob',
      is_thread_reply: false,
      thread_ts: null,
      permalink: 'https://slack.com/archives/C1/p1',
      created_at: '2024-01-01',
    });
    expect(result.text).toBe('Hey @alice');
    expect(result.channel_id).toBe('C1');
    expect(result.complete_thread).toBeUndefined();
  });

  test('compacts complete_thread when present', () => {
    const result = compactMention({
      message_ts: '2',
      channel_id: 'C1',
      channel_name: 'general',
      text: 'mention',
      user_id: 'U1',
      user_name: 'alice',
      is_thread_reply: true,
      thread_ts: '1',
      permalink: 'https://slack.com/p',
      created_at: '2024-01-01',
      thread_context: { parent_message: 'original', reply_count: 5 },
      complete_thread: {
        parent: { ts: '1', user: 'U2', text: 'original', blocks: [{}] },
        replies: [{ ts: '2', user: 'U1', text: 'mention', blocks: [{}] }],
      },
    });
    expect(result.thread_context).toEqual({ parent_message: 'original', reply_count: 5 });
    expect(result.complete_thread.parent.blocks).toBeUndefined();
    expect(result.complete_thread.replies[0].blocks).toBeUndefined();
  });
});

describe('compactContextResult', () => {
  test('returns null for null/undefined', () => {
    expect(compactContextResult(null)).toBeNull();
    expect(compactContextResult(undefined)).toBeNull();
  });

  test('compacts before/after messages', () => {
    const result = compactContextResult({
      target_message: { ts: '5', user: 'U1', text: 'target' },
      context_type: 'channel',
      messages: {
        before: [{ ts: '4', user: 'U2', text: 'before', blocks: [{}] }],
        after: [{ ts: '6', user: 'U3', text: 'after', blocks: [{}] }],
      },
    });
    expect(result.target_message.ts).toBe('5');
    expect(result.messages.before[0].blocks).toBeUndefined();
    expect(result.messages.after[0].blocks).toBeUndefined();
    expect(result.thread_context).toBeUndefined();
  });

  test('compacts thread_context when present', () => {
    const result = compactContextResult({
      target_message: { ts: '5', user: 'U1', text: 'target' },
      context_type: 'thread',
      messages: { before: [], after: [] },
      thread_context: {
        parent: { ts: '1', user: 'U2', text: 'parent', blocks: [{}] },
        all_replies: [{ ts: '5', user: 'U1', text: 'target', blocks: [{}] }],
        target_position: 1,
      },
    });
    expect(result.thread_context.parent.blocks).toBeUndefined();
    expect(result.thread_context.all_replies[0].blocks).toBeUndefined();
    expect(result.thread_context.target_position).toBe(1);
  });
});
