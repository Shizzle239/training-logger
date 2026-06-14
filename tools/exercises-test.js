/* Data > Exercises library: collects exercises from imported programs, persists
   across program swaps, dedupes, renders as own page. */
'use strict';
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
let failed = 0;
const check = (n, c, x) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${!c && x ? ' — ' + x : ''}`); if (!c) failed++; };

const PROG_A = {
  id: 'a', name: 'Block A', weeks: 1, days: [{ id: 'd', name: 'D', title: 'D',
    blocks: [{ id: 'X', type: 'superset', rounds: 2, exercises: [
      { id: 'squat', label: '1a', name: 'Squat', target: { reps: '5', rpe: 8, weight: 100 } },
      { id: 'row', label: '1b', name: 'Row', target: { reps: '10', rpe: 7, weight: 60 } } ] }] }],
  maxLifts: [], progressLifts: [] };
const PROG_B = {
  id: 'b', name: 'Block B', weeks: 1, days: [{ id: 'd', name: 'D', title: 'D',
    blocks: [{ id: 'X', type: 'superset', rounds: 2, exercises: [
      { id: 'squat', label: '1a', name: 'Squat', target: { reps: '8', rpe: 7, weight: 90 } },  // dup id, new target
      { id: 'bench', label: '1b', name: 'Bench', target: { reps: '6', rpe: 8, weight: 80 } } ] }] }],
  maxLifts: [], progressLifts: [] };

async function importProg(page, prog) {
  page.once('dialog', d => d.accept());
  await page.goto('http://localhost:8123/#/data', { waitUntil: 'networkidle0' });
  await page.waitForSelector('#import-program-file');
  await page.evaluate((p) => {
    const input = document.getElementById('import-program-file');
    const dt = new DataTransfer();
    dt.items.add(new File([JSON.stringify(p)], 'p.json', { type: 'application/json' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, prog);
  await new Promise(r => setTimeout(r, 600));
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));

  await page.goto('http://localhost:8123/#/', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.week-card');
  await page.evaluate(async () => { await dbClear('exercises'); });

  await importProg(page, PROG_A);
  let lib = await page.evaluate(async () => (await dbGetAll('exercises')));
  check('Block A harvested 2 exercises', lib.length === 2 && lib.some(e => e.id === 'squat') && lib.some(e => e.id === 'row'), JSON.stringify(lib.map(e => e.id)));

  await importProg(page, PROG_B);
  lib = await page.evaluate(async () => (await dbGetAll('exercises')));
  const ids = lib.map(e => e.id).sort();
  check('after swapping to B: library keeps old + adds new (3 total)', ids.join(',') === 'bench,row,squat', ids.join(','));

  const squat = lib.find(e => e.id === 'squat');
  check('dup exercise updated target + records both programs',
    squat.lastWeight === 90 && squat.programs.includes('Block A') && squat.programs.includes('Block B'),
    JSON.stringify(squat));

  // Data tab shows the Exercises row with count
  await page.goto('http://localhost:8123/#/data', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.nav-row[href="#/exercises"]');
  const rowTxt = await page.$eval('.nav-row[href="#/exercises"]', a => a.textContent.replace(/\s+/g, ' ').trim());
  check('Data tab: Exercises row with count', rowTxt.includes('Exercises') && rowTxt.includes('3 Übungen'), rowTxt);

  // dedicated page
  await page.click('.nav-row[href="#/exercises"]');
  await page.waitForSelector('.exlib-item');
  const names = await page.$$eval('.exlib-name', e => e.map(x => x.textContent));
  check('exercises page lists all 3, alphabetical', names.join(',') === 'Bench,Row,Squat', names.join(','));
  const title = await page.$eval('#topbar-title', e => e.textContent);
  check('own page: title Exercises + Data tab active', title === 'Exercises' && (await page.$eval('#bottomnav a[data-view="data"]', a => a.classList.contains('active'))));

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failed ? 'EXERCISES TEST FAILED' : 'EXERCISES TEST OK');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message); process.exit(2); });
