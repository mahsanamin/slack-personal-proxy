'use strict';

// ---- tiny DOM helpers ----
function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
  }
  for (const c of [].concat(children || [])) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}
const app = () => document.getElementById('app');
function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
function safeUrl(u) { return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null; }
function timeAgo(iso) {
  if (!iso) return '';
  const d = typeof iso === 'string' ? Date.parse(iso) : (iso * 1000);
  if (!d) return '';
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
function timeUntil(iso) {
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'now';
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return 'in ' + minutes + ' min';
  const hours = Math.ceil(minutes / 60);
  return hours < 24 ? 'in ' + hours + ' hr' : 'in ' + Math.ceil(hours / 24) + ' days';
}

function copyCommandBox(command, rows) {
  const field = el('textarea', {
    class: 'mono', readonly: 'readonly', rows: String(rows || 8), spellcheck: 'false',
  });
  field.value = command;
  const button = el('button', {
    class: 'small', text: 'Copy command',
    onclick: async () => {
      let copied = false;
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(command);
          copied = true;
        }
      } catch { /* use selection fallback */ }
      if (!copied) {
        field.focus();
        field.select();
        try { copied = document.execCommand('copy'); } catch { copied = false; }
      }
      button.textContent = copied ? 'Command copied ✓' : 'Select text and copy';
      setTimeout(() => { button.textContent = 'Copy command'; }, 3000);
    },
  });
  return el('div', { class: 'keybox' }, [
    field,
    el('div', { class: 'actions' }, [button]),
  ]);
}

// ---- API ----
async function api(path, opts) {
  const res = await fetch('/dashboard' + path, Object.assign({
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  }, opts || {}));
  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const err = new Error((body && body.error && body.error.message) || res.statusText);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body && body.data !== undefined ? body.data : body;
}

// ---- boot ----
const VALID_TABS = ['overview', 'keys', 'dm', 'approvals', 'setup', 'security'];
let STATE = { tab: 'overview', status: null };

function tabFromHash() {
  const h = (location.hash || '').replace(/^#/, '');
  return VALID_TABS.includes(h) ? h : 'overview';
}

// Keep the active tab in sync with the URL hash (refresh, back/forward, deep links).
window.addEventListener('hashchange', () => {
  const t = tabFromHash();
  if (t !== STATE.tab && STATE.status) {
    STATE.tab = t;
    renderMain();
  }
});

async function boot() {
  try {
    STATE.status = await api('/api/status');
    STATE.tab = tabFromHash();
    // On a fresh install there is nothing useful on Overview yet. Take the owner
    // straight to the credential wizard instead of showing a dead-end notice.
    if (STATE.status.firstRun && STATE.tab === 'overview') {
      STATE.tab = 'setup';
      history.replaceState(null, '', '#setup');
    }
    renderMain();
  } catch (err) {
    if (err.status === 401) {
      const bs = await api('/api/bootstrap').catch(() => ({ dashboardConfigured: false }));
      bs.dashboardConfigured ? renderLogin() : renderNotConfigured();
    } else {
      renderError(err.message);
    }
  }
}

function renderError(msg) {
  clear(app());
  app().appendChild(el('div', { class: 'content' }, [el('div', { class: 'notice err', text: msg })]));
}

function renderNotConfigured() {
  clear(app());
  app().appendChild(el('div', { class: 'login-wrap' }, [
    el('div', { class: 'login-card' }, [
      el('h1', { text: 'Dashboard not configured' }),
      el('p', { class: 'sub', text: 'Set these in your .env, then restart the proxy:' }),
      el('div', { class: 'keybox mono' }, [
        'DASHBOARD_USER=you', el('br'),
        'DASHBOARD_PASSWORD_HASH=<run: npm run set-dashboard-password>', el('br'),
        'DASHBOARD_MASTER_KEY=<32+ char passphrase>',
      ]),
    ]),
  ]));
}

// ---- login ----
function renderLogin() {
  clear(app());
  const msg = el('div');
  const u = el('input', { type: 'text', id: 'lu', autocomplete: 'username' });
  const p = el('input', { type: 'password', id: 'lp', autocomplete: 'current-password' });
  const submit = async () => {
    clear(msg);
    try {
      await api('/login', { method: 'POST', body: JSON.stringify({ user: u.value, password: p.value }) });
      boot();
    } catch (err) {
      msg.appendChild(el('div', { class: 'notice err', text: err.message }));
    }
  };
  p.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  app().appendChild(el('div', { class: 'login-wrap' }, [
    el('div', { class: 'login-card' }, [
      el('h1', { text: '🛰️ Slack Proxy' }),
      el('p', { class: 'sub', text: 'Sign in to the management console' }),
      msg,
      el('label', { text: 'Username' }), u,
      el('label', { text: 'Password' }), p,
      el('div', { class: 'actions' }, [el('button', { text: 'Sign in', onclick: submit })]),
    ]),
  ]));
}

// ---- main shell ----
const TABS = [
  ['overview', 'Overview'],
  ['keys', 'API Keys'],
  ['dm', 'DM Allowlist'],
  ['approvals', 'Approvals'],
  ['setup', 'Slack Setup'],
  ['security', 'Security'],
];

function renderMain() {
  clear(app());
  const s = STATE.status || {};
  const healthy = s.slack && s.slack.auth === 'valid';
  const slack = (s && s.slack) || {};
  const displayName = slack.realName || slack.currentUser || null;
  const swaggerOn = s.security && s.security.swaggerEnabled;

  // Connected user, shown next to Log out: avatar + name + team.
  const userChip = displayName
    ? el('div', { class: 'userchip' }, [
        slack.avatar ? el('img', { class: 'avatar', src: slack.avatar, alt: '', width: '26', height: '26' }) : null,
        el('div', { class: 'userchip-text' }, [
          el('div', { class: 'uc-name', text: displayName }),
          slack.team ? el('div', { class: 'uc-team', text: slack.team }) : null,
        ]),
      ])
    : null;

  const topbar = el('div', { class: 'topbar' }, [
    el('div', { class: 'brand' }, [
      el('span', { class: 'dot' + (healthy ? '' : ' bad'), title: 'Slack auth: ' + (slack.auth || 'unknown') }),
      el('span', { text: '🛰️ Slack Proxy Dashboard' }),
    ]),
    el('div', { class: 'row', style: 'gap:14px;align-items:center' }, [
      swaggerOn ? el('a', { class: 'muted', href: '/docs', target: '_blank', rel: 'noopener', text: 'API Docs ↗' }) : null,
      userChip,
      el('button', {
        class: 'secondary small', text: 'Log out',
        onclick: async () => { await api('/logout', { method: 'POST' }).catch(() => {}); renderLogin(); },
      }),
    ]),
  ]);
  const tabs = el('div', { class: 'tabs' }, TABS.map(([id, label]) =>
    el('button', {
      class: 'tab' + (STATE.tab === id ? ' active' : ''), text: label,
      // Drive tab changes through the URL hash so refresh / back / forward keep the tab.
      onclick: () => { if (STATE.tab !== id) location.hash = id; else renderMain(); },
    })
  ));
  const content = el('div', { class: 'content' }, [el('div', { class: 'spinner', text: 'Loading…' })]);
  app().appendChild(topbar);
  app().appendChild(tabs);
  app().appendChild(content);

  const view = { overview: viewOverview, keys: viewKeys, dm: viewDm, approvals: viewApprovals, setup: viewSetup, security: viewSecurity }[STATE.tab];
  view(content);
}

// ---- Overview ----
// Each panel is fetched independently (?part=) so the fast ones (mentions) render
// immediately instead of everything waiting on the slowest aggregation.
const OVERVIEW_PANELS = [
  ['mentions', 'Recent mentions', mentionItem],
  ['mentionThreads', 'Mention threads', threadItem],
  ['threadsImIn', "Threads I'm in", threadItem],
  ['myThreads', 'Threads I started', threadItem],
];

async function viewOverview(root, fresh) {
  if (STATE.status && STATE.status.firstRun) {
    clear(root);
    root.appendChild(el('div', { class: 'notice warn' }, [
      el('div', { text: 'Slack is not connected yet.' }),
      el('div', { class: 'actions' }, [
        el('button', {
          text: 'Open Slack Setup',
          onclick: () => { location.hash = 'setup'; },
        }),
      ]),
    ]));
    return;
  }
  clear(root);
  root.appendChild(el('div', { class: 'row', style: 'justify-content:space-between;align-items:center;margin-bottom:12px' }, [
    el('span', { class: 'muted', text: fresh ? 'Refreshing…' : 'Cached up to 60s. Use Refresh for the latest.' }),
    el('button', { class: 'secondary small', text: 'Refresh', onclick: () => viewOverview(document.querySelector('.content'), true) }),
  ]));
  const grid = el('div', { class: 'grid cols-2' });
  const cards = {};
  for (const [key, title] of OVERVIEW_PANELS) {
    const body = el('div', {}, [el('div', { class: 'spinner', text: 'Loading…' })]);
    const count = el('span', { class: 'count', text: '' });
    grid.appendChild(el('div', { class: 'card' }, [el('h2', {}, [title, count]), body]));
    cards[key] = { body, count };
  }
  root.appendChild(grid);

  for (const [key, , renderItem] of OVERVIEW_PANELS) {
    api('/api/summary?count=8&part=' + key + (fresh ? '&fresh=1' : ''))
      .then((d) => {
        const items = d[key];
        clear(cards[key].body);
        if (Array.isArray(items) && items.length) {
          cards[key].count.textContent = String(items.length);
          items.forEach((it) => cards[key].body.appendChild(renderItem(it)));
        } else {
          cards[key].body.appendChild(el('div', {
            class: 'empty',
            text: (items && items.error) ? ('Error: ' + items.error) : 'Nothing here.',
          }));
        }
      })
      .catch((e) => {
        clear(cards[key].body);
        cards[key].body.appendChild(el('div', { class: 'notice err', text: e.message }));
      });
  }
}

function mentionItem(m) {
  const link = safeUrl(m.permalink);
  return el('div', { class: 'item' }, [
    el('div', { class: 'meta' }, [
      el('span', { text: '#' + (m.channel_name || m.channel_id || '?') }),
      el('span', { text: m.user_name ? '@' + m.user_name : '' }),
      el('span', { text: timeAgo(m.created_at) }),
      link ? el('a', { href: link, target: '_blank', rel: 'noopener', text: 'open ↗' }) : null,
    ]),
    el('div', { class: 'text', text: m.text || '' }),
  ]);
}
function threadItem(t) {
  const parent = t.parent_message || {};
  const stats = t.thread_stats || {};
  return el('div', { class: 'item' }, [
    el('div', { class: 'meta' }, [
      el('span', { text: '#' + (t.channel_name || t.channel_id || '?') }),
      parent.user_name ? el('span', { text: '@' + parent.user_name }) : null,
      (stats.reply_count != null) ? el('span', { text: stats.reply_count + ' replies' }) : null,
    ]),
    el('div', { class: 'text', text: (parent.text || '').slice(0, 280) }),
  ]);
}

// ---- API Keys ----
async function viewKeys(root) {
  clear(root);
  const created = el('div');          // holds the freshly created key; persists until you dismiss it
  const listBody = el('div');         // only this refreshes after create/revoke
  const label = el('input', { type: 'text', id: 'kl', placeholder: 'e.g. my-laptop, cron-job' });
  const listCount = el('span', { class: 'count', text: '' });
  const installCommand = 'sudo mkdir -p /usr/local/bin && sudo curl -fsSL ' + location.origin +
    '/dashboard/slackp -o /usr/local/bin/slackp && sudo chmod 755 /usr/local/bin/slackp && slackp --help';
  const connectCommand = 'slackp connect ' + location.origin;
  const verifyCommands = 'slackp status\nslackp --help';

  async function refreshList() {
    try {
      const d = await api('/api/keys');
      listCount.textContent = String(d.keys.length);
      clear(listBody);
      if (d.keys.length) d.keys.forEach((k) => listBody.appendChild(keyRow(k, refreshList)));
      else listBody.appendChild(el('div', { class: 'empty', text: 'No keys yet.' }));
    } catch (err) { clear(listBody); listBody.appendChild(el('div', { class: 'notice err', text: err.message })); }
  }

  const create = async () => {
    try {
      const r = await api('/api/keys', { method: 'POST', body: JSON.stringify({ label: label.value || 'unnamed' }) });
      showCreatedKey(created, r.key);   // stays on screen with Copy; NOT wiped by a re-render
      label.value = '';
      refreshList();                    // update the list only, leaving the key visible
    } catch (err) { clear(created); created.appendChild(el('div', { class: 'notice err', text: err.message + reason(err) })); }
  };

  root.appendChild(el('div', { class: 'grid' }, [
    el('div', { class: 'card' }, [
      el('h2', { text: 'Set up the slackp CLI' }),
      el('h3', { class: 'step-title first', text: '1. Install slackp on the other machine' }),
      el('p', { class: 'muted', text: 'Copy and run this command in its terminal. It asks for the machine password because it installs slackp system-wide. Python 3.9+ is required.' }),
      copyCommandBox(installCommand, 4),
      el('h3', { class: 'step-title', text: '2. Generate its secure key' }),
      el('p', { class: 'muted', text: 'Give the machine a recognizable label. Generate the key, copy it immediately, and do not share or screenshot it.' }),
      el('label', { text: 'Label' }), label,
      el('div', { class: 'actions' }, [el('button', { text: 'Generate key', onclick: create })]),
      created,
      el('h3', { class: 'step-title', text: '3. Connect the machine' }),
      el('p', { class: 'muted', text: 'Run this command there, then paste the secure key at the hidden prompt:' }),
      copyCommandBox(connectCommand, 2),
      el('p', { class: 'muted', text: 'Finally, verify the connection and view every available command:' }),
      copyCommandBox(verifyCommands, 2),
    ]),
    el('div', { class: 'card' }, [
      el('h2', {}, ['Existing keys', listCount]),
      listBody,
    ]),
  ]));
  refreshList();
}

// Show a just-created key with a selectable field + Copy button, so it can be copied
// before it is gone (it is never retrievable again). Stays until manually dismissed.
function showCreatedKey(container, key) {
  clear(container);
  const field = el('input', { type: 'text', class: 'mono', style: 'flex:1', value: key, readonly: 'readonly', onclick: (e) => e.target.select() });
  const copyBtn = el('button', {
    class: 'small', text: 'Copy',
    onclick: async () => {
      let ok = false;
      try { if (navigator.clipboard) { await navigator.clipboard.writeText(key); ok = true; } } catch { /* fall through */ }
      if (!ok) { field.focus(); field.select(); try { ok = document.execCommand('copy'); } catch { ok = false; } }
      copyBtn.textContent = ok ? 'Copied ✓' : 'Select + ⌘/Ctrl-C';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2500);
    },
  });
  container.appendChild(el('div', { class: 'notice ok' }, [
    el('div', { text: 'Copy this key now — it is shown only once and cannot be retrieved again.' }),
    el('div', { class: 'row', style: 'gap:8px;margin-top:8px' }, [field, copyBtn]),
    el('div', { class: 'actions' }, [el('button', { class: 'secondary small', text: 'Dismiss', onclick: () => clear(container) })]),
  ]));
}
function keyRow(k, refreshList) {
  return el('div', { class: 'item' }, [
    el('div', { class: 'row', style: 'justify-content:space-between' }, [
      el('div', {}, [
        el('div', {}, [el('strong', { text: k.label }), ' ', el('span', { class: 'mono muted', text: k.prefix })]),
        el('div', { class: 'meta' }, [
          el('span', { text: 'created ' + timeAgo(k.createdAt) }),
          el('span', { text: k.lastUsedAt ? 'used ' + timeAgo(k.lastUsedAt) : 'never used' }),
        ]),
      ]),
      el('button', {
        class: 'danger small', text: 'Delete',
        onclick: async () => {
          if (!confirm('Delete key "' + k.label + '"? It is removed and any client using it stops working immediately.')) return;
          await api('/api/keys/' + k.id, { method: 'DELETE' });
          refreshList();
        },
      }),
    ]),
  ]);
}

// ---- DM allowlist ----
async function viewDm(root) {
  try {
    const d = await api('/api/dm-allowlist');
    clear(root);
    const msg = el('div');
    const entry = el('input', { type: 'text', placeholder: '@username, email, U0123ABC, or D0123ABC' });
    const add = async () => {
      clear(msg);
      try {
        await api('/api/dm-allowlist', { method: 'POST', body: JSON.stringify({ entry: entry.value }) });
        entry.value = '';
        viewDm(document.querySelector('.content'));
      } catch (err) { msg.appendChild(el('div', { class: 'notice err', text: err.message })); }
    };
    root.appendChild(el('div', { class: 'grid' }, [
      el('div', { class: 'card' }, [
        el('h2', { text: 'Add person allowed to receive DMs' }),
        el('p', { class: 'muted', text: 'Add a username, email, user ID (U…), or DM conversation ID (D…). Changes apply live with no restart.' }),
        msg,
        el('label', { text: 'User' }), entry,
        el('div', { class: 'actions' }, [el('button', { text: 'Add', onclick: add })]),
      ]),
      el('div', { class: 'card' }, [
        el('h2', {}, ['Allowed users', el('span', { class: 'count', text: String(d.users.length) })]),
        el('p', { class: 'muted', text: 'Entries from .env are shown but managed in .env (read-only here). Entries added from the dashboard can be removed.' }),
        d.users.length ? el('div', {}, d.users.map((u) => dmRow(u))) : el('div', { class: 'empty', text: 'Nobody is allowed for DMs yet.' }),
      ]),
    ]));
  } catch (err) { clear(root); root.appendChild(el('div', { class: 'notice err', text: err.message })); }
}
function dmRow(u) {
  const badge = u.source === 'env'
    ? el('span', { class: 'badge muted', text: '.env' })
    : el('span', { class: 'badge green', text: 'dashboard' });
  return el('div', { class: 'item row', style: 'justify-content:space-between' }, [
    el('div', {}, [
      el('strong', { text: u.name || u.entry }), ' ', badge,
      u.userId ? el('span', { class: 'mono muted', text: '  ' + u.userId }) : null,
      el('div', { class: 'meta' }, [el('span', { text: u.addedAt ? 'added ' + timeAgo(u.addedAt) : 'from .env config' })]),
    ]),
    u.removable
      ? el('button', {
          class: 'danger small', text: 'Remove',
          onclick: async () => { await api('/api/dm-allowlist/' + u.id, { method: 'DELETE' }); viewDm(document.querySelector('.content')); },
        })
      : el('span', { class: 'muted', text: 'in .env' }),
  ]);
}

// ---- Owner-approved DMs ----
async function viewApprovals(root) {
  try {
    const d = await api('/api/dm-approvals');
    clear(root);
    const pending = d.requests.filter((r) => r.status === 'pending');
    const recent = d.requests.filter((r) => r.status !== 'pending').slice(0, 20);
    root.appendChild(el('div', { class: 'grid' }, [
      !d.enabled ? el('div', { class: 'notice warn', text: 'Approvals are not operational. Enable write operations and DM approvals, and configure DASHBOARD_MASTER_KEY.' }) : null,
      el('div', { class: 'notice' }, [
        el('strong', { text: 'You stay in control. ' }),
        'An agent can request a specific message, but only this dashboard can send or approve it. ',
        'The CLI cannot approve itself or edit the permanent allowlist.',
      ]),
      el('div', { class: 'card' }, [
        el('h2', {}, ['Waiting for you', el('span', { class: 'count', text: String(pending.length) })]),
        el('p', { class: 'muted', text: 'Review the exact recipient and message. “Send once” is the safest choice.' }),
        pending.length
          ? el('div', {}, pending.map((r) => approvalRow(r, d.temporaryGrantMinutes)))
          : el('div', { class: 'empty', text: 'No messages are waiting for approval.' }),
      ]),
      el('div', { class: 'card' }, [
        el('h2', {}, ['Temporary access', el('span', { class: 'count', text: String(d.grants.length) })]),
        d.grants.length
          ? el('div', {}, d.grants.map((g) => el('div', { class: 'item' }, [
              el('strong', { text: g.name || g.userId }),
              el('div', { class: 'meta' }, [
                el('span', { text: 'machine: ' + (g.apiKeyLabel || '?') }),
                el('span', { text: 'expires ' + timeUntil(g.expiresAt) }),
              ]),
            ])))
          : el('div', { class: 'empty', text: 'No machine has temporary DM access.' }),
      ]),
      recent.length ? el('div', { class: 'card' }, [
        el('h2', { text: 'Recent decisions' }),
        el('div', {}, recent.map((r) => el('div', { class: 'item' }, [
          el('div', {}, [el('strong', { text: r.name || r.target }), ' ', el('span', { class: 'badge muted', text: r.decision || r.status })]),
          el('div', { class: 'meta' }, [el('span', { text: r.apiKeyLabel || '?' }), el('span', { text: timeAgo(r.resolvedAt || r.expiresAt) })]),
        ]))),
      ]) : null,
    ]));
  } catch (err) {
    clear(root);
    root.appendChild(el('div', { class: 'notice err', text: err.message }));
  }
}

function approvalRow(r, temporaryMinutes) {
  const decide = async (decision, label) => {
    if (!confirm(label + ' for @' + (r.name || r.target) + '?\n\n' + r.text)) return;
    await api('/api/dm-approvals/' + r.id + '/decision', {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
    viewApprovals(document.querySelector('.content'));
  };
  return el('div', { class: 'approval item' }, [
    el('div', { class: 'row', style: 'justify-content:space-between' }, [
      el('strong', { text: '@' + (r.name || r.target) }),
      el('span', { class: 'badge amber', text: 'waiting' }),
    ]),
    el('div', { class: 'meta' }, [
      el('span', { text: 'machine: ' + (r.apiKeyLabel || '?') }),
      el('span', { text: 'requested ' + timeAgo(r.createdAt) }),
      el('span', { text: 'expires ' + timeUntil(r.expiresAt) }),
    ]),
    el('div', { class: 'approval-message', text: r.text }),
    el('div', { class: 'actions' }, [
      el('button', { text: 'Send once', onclick: () => decide('send_once', 'Send this exact message once') }),
      el('button', { class: 'secondary', text: 'Send + allow ' + temporaryMinutes + ' min', onclick: () => decide('allow_temporarily', 'Send now and allow this machine for ' + temporaryMinutes + ' minutes') }),
      el('button', { class: 'secondary', text: 'Always allow', onclick: () => decide('always_allow', 'Send now and permanently allow this person') }),
      el('button', { class: 'danger', text: 'Reject', onclick: () => decide('reject', 'Reject this request') }),
    ]),
  ]);
}

// ---- Slack Setup ----
async function viewSetup(root) {
  clear(root);
  const s = STATE.status || {};
  const msg = el('div');
  const cookie = el('input', { type: 'password', placeholder: 'xoxd-…' });
  const token = el('input', { type: 'password', placeholder: 'xoxc-…' });
  const bot = el('input', { type: 'password', placeholder: 'xoxb-… (optional, instead of cookie+token)' });
  const copyTokenCommand = `(() => {
  const config = JSON.parse(localStorage.getItem('localConfig_v2') || '{}');
  const teams = config.teams || {};
  const openWorkspaceId = location.pathname.split('/').find(part => teams[part]);
  const workspaceIds = Object.keys(teams);
  const workspaceId = openWorkspaceId || (workspaceIds.length === 1 ? workspaceIds[0] : null);
  if (!workspaceId || !teams[workspaceId] || !teams[workspaceId].token) {
    throw new Error('Open the Slack workspace you want, wait for it to load, then run this command again.');
  }
  copy(teams[workspaceId].token);
  return 'COPIED xoxc token for ' + teams[workspaceId].name + ' (' + workspaceId + '). Return to Slack Proxy and paste into SLACK_TOKEN.';
})()`;

  const getCreds = () => ({ cookie: cookie.value.trim(), token: token.value.trim(), botToken: bot.value.trim() });
  const test = async () => {
    clear(msg);
    try {
      const r = await api('/api/setup/test', { method: 'POST', body: JSON.stringify(getCreds()) });
      msg.appendChild(el('div', { class: 'notice ok', text: `Valid — ${r.user} @ ${r.team}` }));
    } catch (err) { msg.appendChild(el('div', { class: 'notice err', text: err.message + reason(err) })); }
  };
  const save = async () => {
    clear(msg);
    try {
      const r = await api('/api/setup/slack', { method: 'POST', body: JSON.stringify(getCreds()) });
      msg.appendChild(el('div', { class: 'notice ok', text: `Saved & connected — ${r.user} @ ${r.team}. Live now, no restart.` }));
      STATE.status = await api('/api/status');
    } catch (err) { msg.appendChild(el('div', { class: 'notice err', text: err.message + reason(err) })); }
  };

  const connected = s.slack && s.slack.auth === 'valid';
  root.appendChild(el('div', { class: 'grid' }, [
    connected
      ? el('div', { class: 'notice ok' }, [
          `Slack is already connected as ${s.slack.currentUser || '?'} @ ${s.slack.team || '?'} `,
          `(source: ${s.slack.credsSource === 'env' ? '.env file' : 'encrypted store'}). `,
          'Tokens are never shown for security. You only need this tab to replace them.',
        ])
      : el('div', { class: 'notice warn', text: 'Slack is not connected. Paste your tokens below and Save.' }),
    // Only nag about the master key when it actually matters: you are not connected
    // yet and would need to store tokens from here. If already connected, stay quiet.
    (!connected && (!s.security || !s.security.masterKeySet))
      ? el('div', { class: 'notice warn', text: 'DASHBOARD_MASTER_KEY is not set. Set it in .env and restart before saving tokens from here — otherwise tokens can only be set via .env / the CLI.' })
      : null,
    el('div', { class: 'card' }, [
      el('h2', { text: connected ? 'Replace Slack credentials' : 'Connect Slack' }),
      el('div', { class: 'notice warn' }, [
        el('strong', { text: 'Keep these credentials private. ' }),
        'The xoxd cookie and xoxc token provide access as your signed-in Slack user. Only collect them from your own account and never send them in chat or email.',
      ]),
      el('h3', { text: 'Personal Slack session (xoxd + xoxc)' }),
      el('ol', {}, [
        el('li', {}, [
          'On the computer where you use Slack, open ',
          el('a', { href: 'https://app.slack.com/client', target: '_blank', rel: 'noopener', text: 'Slack in your browser ↗' }),
          ', sign in, and open the workspace you want this proxy to use.',
        ]),
        el('li', {}, [
          'Open browser Developer Tools: ', el('strong', { text: 'F12' }), ' on Windows/Linux, or ',
          el('strong', { text: '⌘⌥I' }), ' on macOS.',
        ]),
        el('li', {}, [
          'Get the cookie: select ', el('strong', { text: 'Application' }), ' (Chrome/Edge) or ',
          el('strong', { text: 'Storage' }), ' (Firefox) → Cookies → ',
          el('span', { class: 'mono', text: 'https://app.slack.com' }), ' → row named ',
          el('span', { class: 'mono', text: 'd' }), '. Copy its entire Value, beginning ',
          el('span', { class: 'mono', text: 'xoxd-' }), ', into SLACK_COOKIE below.',
        ]),
        el('li', {}, [
          'Get the token without looking up any IDs: click ', el('strong', { text: 'Copy command' }),
          ' below. Return to the Slack browser tab, select the ', el('strong', { text: 'Console' }),
          ' tab, paste the command, and press Enter.',
          copyCommandBox(copyTokenCommand),
          'The Console must say “COPIED xoxc token for …”. Return here, click the SLACK_TOKEN field, and press Ctrl+V (or ⌘V on macOS).',
        ]),
        el('li', {}, [
          'Leave SLACK_BOT_TOKEN empty. Click ', el('strong', { text: 'Test connection' }),
          '; after it reports your user and workspace, click ', el('strong', { text: 'Save & connect' }), '.',
        ]),
      ]),
      el('p', { class: 'muted', text: 'If the Console reports that localConfig_v2 is missing, make sure Slack is fully loaded in that tab, refresh it, and try again. If your browser blocks pasting into DevTools, type the command manually.' }),
      el('h3', { text: 'Official Slack app alternative (xoxb)' }),
      el('p', { class: 'muted' }, [
        'If your workspace allows app installation, create and install a Slack app from ',
        el('a', { href: 'https://api.slack.com/apps', target: '_blank', rel: 'noopener', text: 'Slack App Management ↗' }),
        ', then copy its Bot User OAuth Token into SLACK_BOT_TOKEN. Leave the xoxd/xoxc fields empty. Bot permissions can be narrower and some personal-user features may not be available.',
      ]),
      msg,
      el('label', { text: 'SLACK_COOKIE (xoxd-)' }), cookie,
      el('label', { text: 'SLACK_TOKEN (xoxc-)' }), token,
      el('label', { text: 'SLACK_BOT_TOKEN (xoxb-, optional)' }), bot,
      el('div', { class: 'actions' }, [
        el('button', { class: 'secondary', text: 'Test connection', onclick: test }),
        el('button', { text: 'Save & connect', onclick: save }),
      ]),
      el('p', { class: 'muted', text: 'Current: ' + (s.slack ? `${s.slack.auth}${s.slack.currentUser ? ' (' + s.slack.currentUser + ')' : ''} · source: ${s.slack.credsSource}` : 'unknown') }),
    ]),
  ]));
}
function reason(err) {
  const r = err.body && err.body.error && err.body.error.details && err.body.error.details.reason;
  return r ? ' — ' + r : '';
}

// ---- Security ----
async function viewSecurity(root) {
  try {
    STATE.status = await api('/api/status');
    const sec = STATE.status.security || {};
    const slack = STATE.status.slack || {};
    clear(root);
    const warn = sec.exposedOnNetwork && !sec.httpsEnabled;
    root.appendChild(el('div', { class: 'grid cols-2' }, [
      el('div', { class: 'card' }, [
        el('h2', { text: 'Network exposure' }),
        warn ? el('div', { class: 'notice warn', text: 'Bound beyond localhost without HTTPS. Use a trusted tunnel + strong secrets.' }) : null,
        statRow('Bind address', sec.bindAddress, sec.exposedOnNetwork ? 'amber' : 'green'),
        statRow('Exposed on network', sec.exposedOnNetwork ? 'yes' : 'no (localhost only)', sec.exposedOnNetwork ? 'amber' : 'green'),
        statRow('HTTPS', sec.httpsEnabled ? 'on' : 'off', sec.httpsEnabled ? 'green' : 'muted'),
        statRow('IP allowlist', (sec.allowedIps && sec.allowedIps.length) ? sec.allowedIps.join(', ') : 'localhost only', 'muted'),
        statRow('Swagger /docs', sec.swaggerEnabled ? 'enabled' : 'disabled', 'muted'),
      ]),
      el('div', { class: 'card' }, [
        el('h2', { text: 'Secrets & access' }),
        statRow('Slack auth', slack.auth, slack.auth === 'valid' ? 'green' : 'red'),
        statRow('Credential source', slack.credsSource, 'muted'),
        statRow('Master key (token encryption)', sec.masterKeySet ? 'set' : 'MISSING', sec.masterKeySet ? 'green' : 'red'),
        statRow('API keys (active / total)', `${sec.apiKeys ? sec.apiKeys.active : 0} / ${sec.apiKeys ? sec.apiKeys.total : 0}`, 'muted'),
        statRow('DM allowlist size', String(sec.dmAllowlistCount || 0), 'muted'),
        statRow('Write operations', sec.writeOpsEnabled ? 'enabled' : 'disabled', sec.writeOpsEnabled ? 'green' : 'muted'),
        statRow('DM approvals', sec.dmApprovalsEnabled ? 'enabled' : 'disabled', sec.dmApprovalsEnabled ? 'green' : 'muted'),
        statRow('Pending approvals', String(sec.pendingDmApprovals || 0), sec.pendingDmApprovals ? 'amber' : 'muted'),
      ]),
    ]));
  } catch (err) { clear(root); root.appendChild(el('div', { class: 'notice err', text: err.message })); }
}
function statRow(k, v, badge) {
  return el('div', { class: 'statrow' }, [
    el('span', { class: 'k', text: k }),
    badge ? el('span', { class: 'badge ' + badge, text: String(v) }) : el('span', { text: String(v) }),
  ]);
}

boot();
