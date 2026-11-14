const { ERROR_CODES } = require('../utils/constants');

/**
 * Per-key channel access.
 *
 * A key record may carry:
 *   access:       'read' | 'read_write'
 *   readChannels: null (every channel the Slack account can see) | [channel IDs]
 *
 * Keys created before scopes existed have neither field. They keep full access
 * (read everything, write where the global whitelist allows), so nothing changes
 * for existing clients. The .env API_KEY is treated the same way.
 *
 * Only Slack channel IDs are compared here. Direct messages are IDs starting with
 * D (and group DMs with G), so a selected-channel key never reads them unless the
 * owner lists that exact ID.
 */

const CHANNEL_ID_RE = /^[CDGW][A-Z0-9]+$/;

function resolveAccess(apiKey) {
  // No key means no access at all. The auth middleware should always set one.
  if (!apiKey) {
    return { unrestricted: false, canWrite: false, readable: new Set() };
  }
  const unrestricted = apiKey.readChannels === undefined || apiKey.readChannels === null;
  return {
    unrestricted,
    canWrite: apiKey.access === undefined || apiKey.access === 'read_write',
    readable: unrestricted ? null : new Set(apiKey.readChannels),
  };
}

// Full access. Only code that acts for the owner (the dashboard) passes this on purpose.
// A missing access value is never treated as full access: it denies everything.
const FULL_ACCESS = Object.freeze({ unrestricted: true, canWrite: true, readable: null });

// A missing access counts as scoped, so filters keep nothing.
function isScoped(access) {
  return !access || !access.unrestricted;
}

function canRead(access, channelId) {
  if (!access) return false;
  if (access.unrestricted) return true;
  return access.readable.has(channelId);
}

function canWrite(access, channelId) {
  if (!access) return false;
  if (!access.canWrite) return false;
  return canRead(access, channelId);
}

function assertRead(access, channelId) {
  if (!canRead(access, channelId)) {
    throw { ...ERROR_CODES.CHANNEL_NOT_IN_KEY_SCOPE, details: { channel: channelId } };
  }
}

function assertWrite(access, channelId) {
  if (!access || access.canWrite === false) {
    throw { ...ERROR_CODES.KEY_READ_ONLY, details: { channel: channelId } };
  }
  if (!canRead(access, channelId)) {
    throw { ...ERROR_CODES.CHANNEL_NOT_IN_KEY_SCOPE, details: { channel: channelId } };
  }
}

// Sending a DM to a user is not tied to a channel the key was given, so a
// selected-channel key cannot do it at all.
function assertDmSend(access) {
  if (!access || access.canWrite === false) {
    throw { ...ERROR_CODES.KEY_READ_ONLY };
  }
  if (isScoped(access)) {
    throw { ...ERROR_CODES.DM_NOT_IN_KEY_SCOPE };
  }
}

// Keep only items whose channel the key may read. getChannelId pulls the ID off an item.
function filterReadable(access, items, getChannelId = (item) => item.channel_id) {
  if (!isScoped(access)) return items;
  return items.filter((item) => canRead(access, getChannelId(item)));
}

// Search matches from Slack carry channel.id on each match.
function filterMatches(access, matches) {
  return filterReadable(access, matches, (m) => m.channel?.id);
}

// Stable text for what a key may read, so saved results are never shared between keys
// that can see different channels.
function scopeSignature(access) {
  if (!access) return 'none';
  if (access.unrestricted) return 'all';
  return 'ch:' + [...access.readable].sort().join(',');
}

function isValidChannelId(value) {
  return typeof value === 'string' && CHANNEL_ID_RE.test(value);
}

module.exports = {
  resolveAccess,
  FULL_ACCESS,
  isScoped,
  canRead,
  canWrite,
  assertRead,
  assertWrite,
  assertDmSend,
  filterReadable,
  filterMatches,
  scopeSignature,
  isValidChannelId,
};
