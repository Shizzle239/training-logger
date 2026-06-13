/* Data > Programm importieren: load a bare program.json, keep logged data. */
'use strict';
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
let failed = 0;
const check = (n, c, x) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${!c && x ? ' — ' + x : ''}`); if (!c) failed++; };

const SHARED = {
  id: 'shared-block', name: 'Geteiltes Programm', weeks: 4,
  days: [{ id: 'd1', name: 'Push', title: 'Day 1 — Push',
    blocks: [{ id: 'A', type: 'superset', rounds: 3, exercises: [
      { id: 'bench', label: '1a', name: 'Bench', target: { reps: '5', rpe: 8, weight: 80 } },
      { id: 'row', label: '1b', name: 'Row', target: { reps: '8', rpe: 7, weight: 60 } } ] }] }],
  maxLifts: [{ id: 'bench', name: 'Bench' }], progressLifts: ['bench'],
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());  // auto-confirm

  await page.goto('http://localhost:8123/#/', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.week-card');

  // seed some logged data that must survive the program swap
  await page.evaluate(async () => {
    await dbBulkPut('sets', [{ id: '9|x|y|0', week: 9, day: 'x', ex: 'y', set: 0, reps: 5, wt: 99, rpe: 8, done: true, ts: 1 }]);
    await dbBulkPut('sessions', [{ id: '9|x', week: 9, day: 'x', date: '2026-06-01', notes: 'keep me' }]);
  });

  await page.goto('http://localhost:8123/#/data', { waitUntil: 'networkidle0' });
  await page.waitForSelector('#import-program-btn');
  check('Programm-Import button present', true);

  // inject a bare program file into the hidden input and dispatch change
  await page.evaluate(async (prog) => {
    const input = document.getElementById('import-program-file');
    const dt = new DataTransfer();
    dt.items.add(new File([JSON.stringify(prog)], 'program.json', { type: 'application/json' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, SHARED);
  await new Promise(r => setTimeout(r, 600));

  const prog = await page.evaluate(async () => (await dbGet('kv', 'program')).value);
  check('program swapped to shared one', prog.name === 'Geteiltes Programm' && prog.weeks === 4, prog.name);

  const keptSets = await page.evaluate(async () => (await dbGetAll('sets')).length);
  const keptSess = await page.evaluate(async () => (await dbGetAll('sessions')).length);
  check('logged data preserved across program import', keptSets === 1 && keptSess === 1, `${keptSets}/${keptSess}`);

  // app renders the new program on home
  await page.goto('http://localhost:8123/#/', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.week-card');
  const title = await page.$eval('.home-head h1', e => e.textContent);
  const weeks = await page.$$eval('.week-card', e => e.length);
  check('home shows imported program (4 weeks)', title === 'Geteiltes Programm' && weeks === 4, `${title}/${weeks}`);

  // reject garbage
  await page.goto('http://localhost:8123/#/data', { waitUntil: 'networkidle0' });
  await page.waitForSelector('#import-program-file');
  await page.evaluate(() => {
    const input = document.getElementById('import-program-file');
    const dt = new DataTransfer();
    dt.items.add(new File(['{"foo":1}'], 'bad.json', { type: 'application/json' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 400));
  const stillShared = await page.evaluate(async () => (await dbGet('kv', 'program')).value.name);
  check('invalid program rejected (active program unchanged)', stillShared === 'Geteiltes Programm', stillShared);

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failed ? 'PROGRAM IMPORT TEST FAILED' : 'PROGRAM IMPORT TEST OK');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message); process.exit(2); });
