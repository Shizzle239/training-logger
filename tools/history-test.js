/* Regression: progress + history must show data from PREVIOUS training blocks
   after a program swap (old-block day/exercise ids not in the active program). */
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

  // inject old-block data (ids from the previous 6-week program, NOT in comp program)
  await page.evaluate(async () => {
    await dbBulkPut('sets', [
      { id: '1|lower|back-squat|0', week: 1, day: 'lower', ex: 'back-squat', set: 0, reps: 3, wt: 100, rpe: 8, done: true, ts: 1 },
      { id: '1|lower|back-squat|1', week: 1, day: 'lower', ex: 'back-squat', set: 1, reps: 4, wt: 90, rpe: null, done: true, ts: 2 },
      { id: '2|lower|back-squat|0', week: 2, day: 'lower', ex: 'back-squat', set: 0, reps: 3, wt: 102.5, rpe: 8, done: true, ts: 3 },
      { id: '1|upper|tricep-dips|0', week: 1, day: 'upper', ex: 'tricep-dips', set: 0, reps: 15, wt: 10, rpe: 6, done: true, ts: 4 },
    ]);
    await dbBulkPut('sessions', [
      { id: '1|lower', week: 1, day: 'lower', date: '2026-06-02', notes: 'felt strong' },
      { id: '2|lower', week: 2, day: 'lower', date: '2026-06-09', notes: '' },
      { id: '1|upper', week: 1, day: 'upper', date: '2026-06-04', notes: '' },
    ]);
    await dbPut('bodyweight', { week: 1, kg: 75.5 });
    await dbPut('bodyweight', { week: 2, kg: 75.1 });
  });

  await page.goto('http://localhost:8123/#/progress', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.chart-card');

  const cards = await page.$$eval('.chart-card h2', e => e.map(h => h.textContent));
  check('old-block lifts get charts (Back Squat, Tricep Dips)',
    cards.some(c => c.includes('Back Squat')) && cards.some(c => c.includes('Tricep Dips')), cards.join(' | '));

  const squat = await page.evaluate(() => {
    const c = Array.from(document.querySelectorAll('.chart-card')).find(x => x.querySelector('h2').textContent.includes('Back Squat'));
    return {
      vals: Array.from(c.querySelectorAll('.bar-val')).map(t => t.textContent),
      labs: Array.from(c.querySelectorAll('.bar-lab')).map(t => t.textContent),
    };
  });
  check('squat chart: max per session (100, 102.5), date labels',
    squat.vals.join(',') === '100,102.5' && squat.labs.join(',') === '02.06.,09.06.', JSON.stringify(squat));

  const bwLabs = await page.$$eval('#bw-chart .bar-lab', e => e.map(t => t.textContent)).catch(() => []);
  check('bodyweight chart shows all stored weeks', bwLabs.join(',') === 'W1,W2', bwLabs.join(','));

  const hist = await page.$$eval('.hist-item summary', e => e.map(s => s.textContent.trim()));
  check('history lists 3 sessions, newest first',
    hist.length === 3 && hist[0].includes('2026-06-09') && hist[2].includes('2026-06-02'), hist.join(' | '));

  const firstDetail = await page.evaluate(() => {
    const d = document.querySelectorAll('.hist-item')[2];
    d.open = true;
    return d.textContent;
  });
  check('history detail shows sets + notes',
    firstDetail.includes('100 kg') && firstDetail.includes('felt strong'), firstDetail.slice(0, 120));

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failed ? 'HISTORY TEST FAILED' : 'HISTORY TEST OK');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message); process.exit(2); });
