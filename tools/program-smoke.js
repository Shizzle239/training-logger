/* Smoke test for the currently deployed program.json (run after swapping programs). */
'use strict';
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
let failed = 0;
const check = (n, c, x) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${!c && x ? ' — ' + x : ''}`); if (!c) failed++; };

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('http://localhost:8123/#/', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.week-card');
  const weeks = await page.$$eval('.week-card', e => e.length);
  const title = await page.$eval('.home-head h1', e => e.textContent);
  check('home: 1 week card, taper title', weeks === 1 && title.includes('Comp Week'), `${weeks} | ${title}`);

  await page.goto('http://localhost:8123/#/log/1/comp-lower', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.set-row');
  const rows = await page.$$eval('.set-row', e => e.map(r => r.dataset.ex + '#' + r.dataset.set));
  check('comp-lower: 10 sets, interleaved', rows.length === 10 &&
    rows.join(',').includes('comp-back-squat#0,comp-db-jumps#0,comp-back-squat#1,comp-db-jumps#1'), rows.join(','));

  await page.goto('http://localhost:8123/#/log/1/comp-upper', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));
  const upper = await page.evaluate(() => ({
    rows: document.querySelectorAll('.set-row').length,
    warmup: !!Array.from(document.querySelectorAll('.info-block summary')).find(s => s.textContent.includes('T-2')),
    notes: !!document.getElementById('session-notes'),
  }));
  check('comp-upper (skipped day): no sets, T-2 note + notes field render', upper.rows === 0 && upper.warmup && upper.notes, JSON.stringify(upper));

  await page.goto('http://localhost:8123/#/progress', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 400));
  const bw = await page.$$eval('.f-bw', e => e.length);
  check('progress: bodyweight only (1 input), no crash', bw === 1, String(bw));

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failed ? 'SMOKE FAILED' : 'SMOKE OK');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message); process.exit(2); });
