/* tools/smoke-boot.js — headless boot smoke for the Training Logger PWA.
   Boots the REAL db.js / xlsx.js / app.js inside jsdom + fake-IndexedDB,
   stubs fetch(program.json), and asserts the core views render with zero
   console/runtime errors. No real browser required — runs anywhere Node runs.

   Usage:  node tools/smoke-boot.js [repoDir]
   Deps:   npm install   (jsdom + fake-indexeddb are devDependencies)
   Exit:   0 = all checks passed, 1 = a check failed or deps missing. */
'use strict';
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
  require('fake-indexeddb/auto');           // puts indexedDB + IDBKeyRange on the Node global
} catch (e) {
  console.log('  SKIP  boot smoke — dev deps missing. Run:  npm install');
  process.exit(2);                          // 2 = skipped (preflight treats as soft-skip)
}

const programRaw = read('program.json');
const fetchStub = async () => ({
  ok: true,
  json: async () => JSON.parse(programRaw),
  text: async () => programRaw,
});

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + e.message));
vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ')));

// index.html with its <script src> tags stripped — we inject the real files in order
const html = read('index.html').replace(/<script\s+src=["'][^"']+["']>\s*<\/script>/gi, '');

const dom = new JSDOM(html, {
  url: 'https://example.test/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.fetch = fetchStub;
    window.indexedDB = global.indexedDB;
    window.IDBKeyRange = global.IDBKeyRange;
    window.confirm = () => true;
    window.alert = () => {};
    window.scrollTo = () => {};                                   // jsdom no-op (real browsers implement)
    if (window.HTMLElement) window.HTMLElement.prototype.scrollIntoView = () => {};
  },
});
const { window } = dom;
window.addEventListener('error', e =>
  errors.push('window.error: ' + (e.error && e.error.message || e.message)));

for (const f of ['db.js', 'xlsx.js', 'app.js']) {
  const s = window.document.createElement('script');
  s.textContent = read(f);
  window.document.body.appendChild(s);
}

async function waitFor(sel, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (window.document.querySelector(sel)) return true;
    await sleep(50);
  }
  return false;
}
let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? ' -- ' + extra : ''}`); }
};

(async () => {
  const prog = JSON.parse(programRaw);
  const day1 = prog.days[0].id;

  const homeOk = await waitFor('.week-card');
  const weeks = window.document.querySelectorAll('.week-card').length;
  check('Home renders one week-card per program week', homeOk && weeks === prog.weeks,
    `expected ${prog.weeks}, got ${weeks}`);

  window.location.hash = `#/log/1/${day1}`;
  window.dispatchEvent(new window.Event('hashchange'));
  const logOk = await waitFor('.set-row');
  const rows = window.document.querySelectorAll('.set-row').length;
  check('Log view renders set rows', logOk && rows > 0, `got ${rows} rows for day "${day1}"`);

  window.location.hash = '#/maxes';
  window.dispatchEvent(new window.Event('hashchange'));
  check('Maxes view renders (program.maxLifts present & valid)', await waitFor('.calc-card'));

  window.location.hash = '#/progress';
  window.dispatchEvent(new window.Event('hashchange'));
  check('Progress view renders', await waitFor('.chart-card, .card'));

  window.location.hash = '#/data';
  window.dispatchEvent(new window.Event('hashchange'));
  check('Data view renders', await waitFor('#export-json'));

  window.location.hash = '#/exercises';
  window.dispatchEvent(new window.Event('hashchange'));
  check('Exercises view renders (catalog groups)', await waitFor('.exlib-group'));

  window.location.hash = '#/settings';
  window.dispatchEvent(new window.Event('hashchange'));
  check('Settings view renders (theme swatches)', await waitFor('.theme-swatch'));

  window.location.hash = '#/plans';
  window.dispatchEvent(new window.Event('hashchange'));
  check('Plans view renders', await waitFor('a[href="#/plans/new"]'));

  await sleep(200);
  check('zero console/runtime errors during boot + navigation', errors.length === 0,
    errors.slice(0, 5).join(' | '));

  console.log(`\n  boot smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
