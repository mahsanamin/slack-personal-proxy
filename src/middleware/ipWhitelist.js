const net = require('net');
const config = require('../config');
const logger = require('../utils/logger');
const { ERROR_CODES } = require('../utils/constants');
const { formatErrorResponse } = require('../utils/helpers');

// Loopback + Docker bridge — always pass (healthcheck, host-to-container)
const trustedLocal = new net.BlockList();
trustedLocal.addAddress('127.0.0.1', 'ipv4');
trustedLocal.addAddress('::1', 'ipv6');
trustedLocal.addSubnet('172.16.0.0', 12, 'ipv4');  // Docker bridge networks

// 0.0.0.0 = open to everyone
const allowAll = config.allowedIps.includes('0.0.0.0');

// Build a BlockList from ALLOWED_IPS entries (CIDR ranges + single IPs)
const blockList = new net.BlockList();

if (!allowAll) {
  for (const entry of config.allowedIps) {
    if (entry.includes('/')) {
      const [prefix, bits] = entry.split('/');
      blockList.addSubnet(prefix, parseInt(bits, 10));
    } else {
      blockList.addAddress(entry);
    }
  }
}

if (allowAll) {
  logger.info('IP allowlist disabled (0.0.0.0) — all IPs allowed');
} else if (config.allowedIps.length > 0) {
  logger.info(`IP allowlist active: ${config.allowedIps.join(', ')}`);
} else {
  logger.info('IP allowlist: localhost only (no ALLOWED_IPS configured)');
}

function ipWhitelist(req, res, next) {
  if (allowAll) return next();

  const raw = req.ip || req.socket?.remoteAddress || '';

  // Strip IPv4-mapped IPv6 prefix for consistent matching
  const ip = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  const family = net.isIPv6(ip) ? 'ipv6' : 'ipv4';

  if (trustedLocal.check(ip, family)) return next();

  if (config.allowedIps.length > 0 && blockList.check(ip, family)) return next();

  logger.warn(`Blocked request from ${raw}`);
  return res
    .status(ERROR_CODES.IP_NOT_ALLOWED.status)
    .json(formatErrorResponse(ERROR_CODES.IP_NOT_ALLOWED));
}

module.exports = ipWhitelist;
