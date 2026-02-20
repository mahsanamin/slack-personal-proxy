#!/usr/bin/env node

/**
 * Slack Credential Grabber
 *
 * Two modes:
 *   1. Manual: guides you to copy cookie & token from DevTools
 *   2. Auto:   launches browser, you log in, credentials extracted automatically
 *
 * Usage:
 *   npm run setup [path/to/.env]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const ENV_FILE = path.resolve(process.argv[2] || path.join(__dirname, '..', '.env'));
const ENV_EXAMPLE = path.resolve(path.join(__dirname, '..', '.env.example'));

const B = '\x1b[1m';
const G = '\x1b[32m';
const Y = '\x1b[33m';
const R = '\x1b[31m';
const C = '\x1b[36m';
const X = '\x1b[0m';

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a.trim()); }));
}

async function manualMode() {
  console.log('');
  console.log(`${B}=== Manual Setup ===${X}`);
  console.log('');
  console.log(`1. Open ${C}https://app.slack.com${X} and log in`);
  console.log(`2. Open DevTools (${B}F12${X} or ${B}Cmd+Option+I${X})`);
  console.log('');
  console.log(`${B}Cookie (xoxd-):${X}`);
  console.log(`   Application tab > Cookies > https://app.slack.com > cookie named ${B}d${X}`);
  console.log('');
  console.log(`${B}Token (xoxc-):${X}`);
  console.log(`   Console tab > paste: ${C}copy(Object.values(JSON.parse(localStorage.localConfig_v2).teams)[0].token)${X}`);
  console.log(`   (this copies token to clipboard)`);
  console.log('');

  const cookie = await ask('Paste SLACK_COOKIE (xoxd-...): ');
  const token = await ask('Paste SLACK_TOKEN  (xoxc-...): ');
  return { cookie, token };
}

async function autoMode() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    console.log(`${R}Puppeteer not installed. Run: npm install${X}`);
    process.exit(1);
  }

  console.log('');
  console.log(`${B}=== Auto Setup ===${X}`);
  console.log(`Launching browser — log into Slack. It will close automatically.`);
  console.log(`${Y}Do NOT close the browser yourself.${X}`);
  console.log('');

  const browser = await puppeteer.launch({ headless: false, defaultViewport: null, args: ['--start-maximized'] });
  const [page] = await browser.pages();
  await page.goto('https://app.slack.com', { waitUntil: 'networkidle2' });

  console.log(`Waiting for login...`);

  let cookie = '';
  let token = '';
  const deadline = Date.now() + 300000;

  while (Date.now() < deadline) {
    const client = await page.createCDPSession();
    const { cookies } = await client.send('Network.getAllCookies');
    const d = cookies.find((c) => c.name === 'd' && c.value.startsWith('xoxd-'));
    if (d) cookie = d.value;
    await client.detach();

    try {
      token = await page.evaluate(() => {
        try {
          return Object.values(JSON.parse(localStorage.getItem('localConfig_v2') || '{}').teams || {})[0]?.token || '';
        } catch { return ''; }
      });
    } catch {}

    if (cookie && token) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  await browser.close();

  if (!cookie || !token) {
    console.log(`${R}Timed out. Make sure you logged into a workspace.${X}`);
    process.exit(1);
  }

  return { cookie, token };
}

function validate(cookie, token) {
  if (!cookie.startsWith('xoxd-')) { console.log(`${R}Invalid cookie — should start with xoxd-${X}`); process.exit(1); }
  if (!token.startsWith('xoxc-')) { console.log(`${R}Invalid token — should start with xoxc-${X}`); process.exit(1); }
}

function writeEnv(cookie, token) {
  let content;
  if (fs.existsSync(ENV_FILE)) {
    content = fs.readFileSync(ENV_FILE, 'utf8');
    content = replace(content, 'SLACK_COOKIE', cookie);
    content = replace(content, 'SLACK_TOKEN', token);
  } else if (fs.existsSync(ENV_EXAMPLE)) {
    content = fs.readFileSync(ENV_EXAMPLE, 'utf8');
    content = replace(content, 'SLACK_COOKIE', cookie);
    content = replace(content, 'SLACK_TOKEN', token);
    content = replace(content, 'API_KEY', crypto.randomBytes(32).toString('hex'));
  } else {
    content = `SLACK_COOKIE=${cookie}\nSLACK_TOKEN=${token}\nAPI_KEY=${crypto.randomBytes(32).toString('hex')}\nPORT=3000\nNODE_ENV=production\nENABLE_CACHING=true\n`;
  }
  fs.writeFileSync(ENV_FILE, content);
}

function replace(content, key, val) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(content) ? content.replace(re, `${key}=${val}`) : content + `\n${key}=${val}`;
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Slack Credential Grabber                   ║');
  console.log('╚══════════════════════════════════════════════╝');

  const choice = await ask(`\n  1) Manual — copy from DevTools yourself\n  2) Auto   — browser opens, you log in, done\n\nChoice [1]: `);

  const { cookie, token } = choice === '2' ? await autoMode() : await manualMode();

  validate(cookie, token);
  console.log(`${G}✓${X} Cookie: ${cookie.substring(0, 15)}...${cookie.slice(-8)}`);
  console.log(`${G}✓${X} Token:  ${token.substring(0, 15)}...${token.slice(-8)}`);

  writeEnv(cookie, token);
  console.log(`${G}✓${X} Saved to ${ENV_FILE}`);
  console.log('');
}

main().catch((e) => { console.error(`${R}${e.message}${X}`); process.exit(1); });
