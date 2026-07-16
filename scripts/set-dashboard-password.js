#!/usr/bin/env node

/**
 * Generate a DASHBOARD_PASSWORD_HASH for the management console.
 *
 * Usage:
 *   npm run set-dashboard-password
 *   npm run set-dashboard-password -- "my-password"   (non-interactive)
 *
 * Prints the scrypt hash to paste into .env as DASHBOARD_PASSWORD_HASH.
 * The plaintext password is never stored or echoed.
 */

const readline = require('readline');
const { hashPassword } = require('../src/utils/secureCrypto');

function ask(q, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    if (hidden) {
      const stdout = process.stdout;
      rl._writeToOutput = (str) => { if (str.includes(q)) stdout.write(str); };
    }
    rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

async function main() {
  let pw = process.argv[2];
  if (!pw) {
    pw = await ask('New dashboard password: ', { hidden: true });
    const confirm = await ask('Confirm password: ', { hidden: true });
    if (pw !== confirm) { console.error('Passwords do not match.'); process.exit(1); }
  }
  if (!pw || pw.length < 8) { console.error('Password must be at least 8 characters.'); process.exit(1); }

  const hash = hashPassword(pw);
  console.log('\nAdd this line to your .env:\n');
  console.log(`DASHBOARD_PASSWORD_HASH=${hash}\n`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
