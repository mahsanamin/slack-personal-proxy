const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Keeps the workspace channel list on disk so a restart does not throw it away.
 * Rebuilding it means paging through every channel in Slack, which Slack rate limits.
 * The file holds { fetched_at, data }. Reads never throw: a missing or damaged file
 * just means there is no saved list.
 */
class ChannelListStore {
  constructor(dataDir, fileName = 'channel-list.json') {
    this.file = path.join(path.resolve(process.cwd(), dataDir || 'data'), fileName);
  }

  read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (parsed && typeof parsed.fetched_at === 'number' && parsed.data && Array.isArray(parsed.data.channels)) {
        return parsed;
      }
    } catch {
      // No saved list yet, or the file is unreadable.
    }
    return null;
  }

  write(entry) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(entry), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      // Losing the disk copy only costs a rebuild after the next restart.
      logger.warn(`Could not save channel list to disk: ${err.message}`);
    }
  }
}

module.exports = ChannelListStore;
