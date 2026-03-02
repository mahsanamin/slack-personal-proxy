function inferSource(attachment) {
  if (attachment.app_name) return attachment.app_name.toLowerCase().replace(/\s+/g, '_');
  if (attachment.app_id) return attachment.app_id;

  const url = attachment.app_unfurl_url || attachment.from_url || attachment.title_link || '';
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname;
  } catch {
    return 'unknown';
  }
}

function extractLinks(attachments) {
  if (!attachments || !attachments.length) return [];

  const seen = new Set();
  const links = [];

  for (const att of attachments) {
    if (att.is_msg_unfurl) {
      const url = att.app_unfurl_url || att.from_url || att.title_link;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      links.push({
        url,
        preview: att.fallback || att.text || '',
        source: 'slack_message',
      });
      continue;
    }

    const url = att.app_unfurl_url || att.from_url || att.title_link;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    links.push({
      url,
      title: att.fallback || att.title || '',
      source: inferSource(att),
    });
  }

  return links;
}

function collapseFiles(files) {
  if (!files || !files.length) return [];
  return files.map(f => ({
    name: f.name,
    mimetype: f.mimetype,
    url_private: f.url_private,
    size: f.size,
  }));
}

function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/<@[A-Z0-9]+\|([^>]+)>/g, '@$1')
    .replace(/<(https?:\/\/[^|>]+)\|[^>]+>/g, '$1')
    .replace(/<(https?:\/\/[^>]+)>/g, '$1');
}

function compactMessage(msg) {
  if (!msg) return null;

  const compact = {
    ts: msg.ts,
    user_id: msg.user,
    user_name: msg.user_name || msg.user_profile?.display_name || '',
    text: cleanText(msg.text),
  };

  const links = extractLinks(msg.attachments);
  if (links.length) compact.links = links;

  const files = collapseFiles(msg.files);
  if (files.length) compact.files = files;

  return compact;
}

function compactThread(thread) {
  if (!thread) return null;

  const parent = thread.complete_thread?.parent || null;
  const replies = thread.complete_thread?.replies || [];

  return {
    thread_ts: thread.thread_ts,
    channel_id: thread.channel_id,
    channel_name: thread.channel_name,
    thread_stats: thread.thread_stats,
    parent_message: parent ? compactMessage(parent) : thread.parent_message || null,
    replies: replies.map(compactMessage).filter(Boolean),
  };
}

function compactRecentMessage(msg) {
  const compact = compactMessage(msg);
  if (!compact) return null;
  if (msg.is_thread_parent && msg.thread_replies) {
    compact.is_thread_parent = true;
    compact.thread_replies = msg.thread_replies.map(compactMessage).filter(Boolean);
    if (msg.thread_truncated !== undefined) compact.thread_truncated = msg.thread_truncated;
  }
  return compact;
}

function compactSearchResult(result) {
  if (!result) return null;
  const compact = {
    message: compactMessage(result.message),
    is_in_thread: result.is_in_thread,
    match_score: result.match_score,
  };
  if (result.thread_context) compact.thread_context = result.thread_context;
  if (result.complete_thread) {
    compact.complete_thread = {
      parent: compactMessage(result.complete_thread.parent),
      replies: (result.complete_thread.replies || []).map(compactMessage).filter(Boolean),
    };
  }
  return compact;
}

function compactMention(mention) {
  if (!mention) return null;
  const compact = {
    message_ts: mention.message_ts,
    channel_id: mention.channel_id,
    channel_name: mention.channel_name,
    text: cleanText(mention.text),
    user_id: mention.user_id,
    user_name: mention.user_name,
    is_thread_reply: mention.is_thread_reply,
    thread_ts: mention.thread_ts,
    permalink: mention.permalink,
    created_at: mention.created_at,
  };
  if (mention.thread_context) compact.thread_context = mention.thread_context;
  if (mention.complete_thread) {
    compact.complete_thread = {
      parent: compactMessage(mention.complete_thread.parent),
      replies: (mention.complete_thread.replies || []).map(compactMessage).filter(Boolean),
    };
  }
  return compact;
}

function compactContextResult(result) {
  if (!result) return null;
  const compact = {
    target_message: result.target_message,
    context_type: result.context_type,
    messages: {
      before: (result.messages?.before || []).map(compactMessage).filter(Boolean),
      after: (result.messages?.after || []).map(compactMessage).filter(Boolean),
    },
  };
  if (result.thread_context) {
    compact.thread_context = {
      parent: compactMessage(result.thread_context.parent),
      all_replies: (result.thread_context.all_replies || []).map(compactMessage).filter(Boolean),
      target_position: result.thread_context.target_position,
    };
  }
  return compact;
}

module.exports = {
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
};
