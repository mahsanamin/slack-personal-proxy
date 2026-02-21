const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

class PersistentCacheService {
  constructor() {
    this.dataDir = path.resolve(config.persistentCache.dataDir);
    this.channelsDir = path.join(this.dataDir, 'channels');
    this.threadsDir = path.join(this.dataDir, 'threads');
  }

  async initialize() {
    fs.mkdirSync(this.channelsDir, { recursive: true });
    fs.mkdirSync(this.threadsDir, { recursive: true });
    logger.info(`Persistent cache initialized at ${this.dataDir}`);
  }

  // --- Channel messages ---

  _channelPath(channelId) {
    return path.join(this.channelsDir, `${channelId}.jsonl`);
  }

  _channelMetaPath(channelId) {
    return path.join(this.channelsDir, `${channelId}.meta.json`);
  }

  readMeta(channelId) {
    const metaPath = this._channelMetaPath(channelId);
    try {
      const raw = fs.readFileSync(metaPath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  writeMeta(channelId, meta) {
    const metaPath = this._channelMetaPath(channelId);
    const tmp = metaPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(meta), 'utf8');
    fs.renameSync(tmp, metaPath);
  }

  appendMessages(channelId, slimMessages) {
    if (!slimMessages.length) return;

    const filePath = this._channelPath(channelId);
    const lines = slimMessages.map(m => JSON.stringify(m)).join('\n') + '\n';
    fs.appendFileSync(filePath, lines, 'utf8');

    // Update meta
    const lastMsg = slimMessages[slimMessages.length - 1];
    const meta = this.readMeta(channelId) || { lastTs: null, messageCount: 0, updatedAt: null };
    meta.lastTs = lastMsg.ts;
    meta.messageCount += slimMessages.length;
    meta.updatedAt = new Date().toISOString();
    this.writeMeta(channelId, meta);
  }

  readLastMessages(channelId, count) {
    const filePath = this._channelPath(channelId);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      const last = lines.slice(-count);
      return last.map(line => JSON.parse(line));
    } catch {
      return [];
    }
  }

  // --- Thread replies ---

  _threadDir(channelId) {
    return path.join(this.threadsDir, channelId);
  }

  _threadPath(channelId, threadTs) {
    return path.join(this._threadDir(channelId), `${threadTs}.jsonl`);
  }

  _threadMetaPath(channelId, threadTs) {
    return path.join(this._threadDir(channelId), `${threadTs}.meta.json`);
  }

  readThreadMeta(channelId, threadTs) {
    const metaPath = this._threadMetaPath(channelId, threadTs);
    try {
      const raw = fs.readFileSync(metaPath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  writeThreadMeta(channelId, threadTs, meta) {
    const metaPath = this._threadMetaPath(channelId, threadTs);
    const tmp = metaPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(meta), 'utf8');
    fs.renameSync(tmp, metaPath);
  }

  appendThreadReplies(channelId, threadTs, slimReplies) {
    if (!slimReplies.length) return;

    const dir = this._threadDir(channelId);
    fs.mkdirSync(dir, { recursive: true });

    const filePath = this._threadPath(channelId, threadTs);
    const lines = slimReplies.map(m => JSON.stringify(m)).join('\n') + '\n';
    fs.appendFileSync(filePath, lines, 'utf8');

    const lastReply = slimReplies[slimReplies.length - 1];
    const meta = this.readThreadMeta(channelId, threadTs) || { lastTs: null, replyCount: 0, updatedAt: null };
    meta.lastTs = lastReply.ts;
    meta.replyCount += slimReplies.length;
    meta.updatedAt = new Date().toISOString();
    this.writeThreadMeta(channelId, threadTs, meta);
  }

  readThreadReplies(channelId, threadTs, count) {
    const filePath = this._threadPath(channelId, threadTs);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      const last = count ? lines.slice(-count) : lines;
      return last.map(line => JSON.parse(line));
    } catch {
      return [];
    }
  }

  // --- Stats ---

  getStats() {
    const stats = { channels: {}, totalChannels: 0, totalThreadDirs: 0 };

    try {
      const channelFiles = fs.readdirSync(this.channelsDir).filter(f => f.endsWith('.meta.json'));
      stats.totalChannels = channelFiles.length;

      for (const file of channelFiles) {
        const channelId = file.replace('.meta.json', '');
        const meta = this.readMeta(channelId);
        if (meta) {
          stats.channels[channelId] = {
            messageCount: meta.messageCount,
            lastTs: meta.lastTs,
            updatedAt: meta.updatedAt,
          };
        }
      }
    } catch {
      // channels dir may not exist yet
    }

    try {
      const threadDirs = fs.readdirSync(this.threadsDir).filter(f => {
        return fs.statSync(path.join(this.threadsDir, f)).isDirectory();
      });
      stats.totalThreadDirs = threadDirs.length;
    } catch {
      // threads dir may not exist yet
    }

    return stats;
  }
}

module.exports = PersistentCacheService;
