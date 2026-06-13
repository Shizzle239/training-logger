/* Verify in-browser .xlsx import yields the SAME program object as the Python
   converter, and that the app renders it. Uses the corrected Mushin template. */
'use strict';
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const REPO = 'C:\\Users\\nalyd\\OneDrive\\WorkoutTracker';
let failed = 0;
const check = (n, c, x) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${!c && x ? ' — ' + x : ''}`); if (!c) failed++; };

(async () => {
  const xlsxBytes = fs.readFileSync(path.join(REPO, 'Training_mushin-phase2_corrected.xlsx'));
  const pyJson = JSON.parse(fs.readFileSync(path.join(REPO, 'mushin-phase2.json'), 'utf8'));

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  await page.goto('http://localhost:8123/#/', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.week-card');

  // confirm DecompressionStream is available (the only platform requirement)
  const hasDS = await page.evaluate(() => typeof DecompressionStream !== 'undefined');
  check('DecompressionStream available in browser', hasDS);

  // parse the xlsx in-page via the app's own programFromXlsx
  const jsProg = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'mushin.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    return await window.programFromXlsx(file);
  }, xlsxBytes.toString('base64'));

  // deep compare against the Python output
  const norm = o => JSON.stringify(o);
  check('JS xlsx parser == Python converter output', norm(jsProg) === norm(pyJson),
    norm(jsProg) === norm(pyJson) ? '' : 'JSON differs');
  if (norm(jsProg) !== norm(pyJson)) {
    // show first divergence for debugging
    const a = JSON.stringify(jsProg, null, 1).split('\n');
    const c = JSON.stringify(pyJson, null, 1).split('\n');
    for (let i = 0; i < Math.max(a.length, c.length); i++) {
      if (a[i] !== c[i]) { console.log(`    JS : ${a[i]}`); console.log(`    PY : ${c[i]}`); break; }
    }
  }

  // end-to-end: drive the real import-program flow with the xlsx file, check it activates
  await page.goto('http://localhost:8123/#/data', { waitUntil: 'networkidle0' });
  await page.waitForSelector('#import-program-file');
  await page.evaluate((b64) => {
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const input = document.getElementById('import-program-file');
    const dt = new DataTransfer();
    dt.items.add(new File([arr], 'mushin.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, xlsxBytes.toString('base64'));
  await new Promise(r => setTimeout(r, 800));
  const active = await page.evaluate(async () => (await dbGet('kv', 'program')).value);
  check('xlsx import activates program', active.name === pyJson.name && active.days.length === 3, active.name);

  await page.goto('http://localhost:8123/#/', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.week-card');
  const tiles = await page.$$eval('.week-card:first-child .day-btn', e => e.length);
  check('rendered home: 3 day tiles, no ghosts', tiles === 3, String(tiles));

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failed ? 'XLSX IMPORT TEST FAILED' : 'XLSX IMPORT TEST OK');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message); process.exit(2); });
