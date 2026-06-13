/* Data > Archiv: only fully-completed sessions (all sets done), list name+date, expandable. */
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

  await page.evaluate(async () => {
    await dbClearAll();
    await dbPut('kv', { key: 'program', value: App.program });
    // comp-lower has 10 prescribed sets. Complete one, leave one partial.
    const mk = (week, day, ex, set, done) => ({ id: `${week}|${day}|${ex}|${set}`, week, day, ex, set, reps: 3, wt: 80, rpe: 6, done, ts: set });
    const lower = [];
    const exs = [['comp-hang-power-shrug',2],['comp-back-squat',2],['comp-db-jumps',2],['comp-rdl',2],['comp-kb-swings',2]];
    // week 1 comp-lower: ALL 10 done -> completed
    let added = 0;
    for (const [ex, cnt] of exs) for (let s=0;s<cnt;s++){ lower.push(mk(1,'comp-lower',ex,s,true)); added++; }
    // week 1 (faked week 2 id) partial: only 3 of 10 done -> NOT completed
    const partial = [];
    let p=0; for (const [ex, cnt] of exs) for (let s=0;s<cnt;s++){ partial.push(mk(2,'comp-lower',ex,s, p<3)); p++; }
    // an OLD-block session (day not in active program), all logged done -> completed via fallback
    const old = [
      { id:'1|lower|back-squat|0', week:1, day:'lower', ex:'back-squat', set:0, reps:3, wt:100, rpe:8, done:true, ts:1 },
      { id:'1|lower|back-squat|1', week:1, day:'lower', ex:'back-squat', set:1, reps:3, wt:100, rpe:8, done:true, ts:2 },
    ];
    await dbBulkPut('sets', [...lower, ...partial, ...old]);
    await dbBulkPut('sessions', [
      { id:'1|comp-lower', week:1, day:'comp-lower', date:'2026-06-16', notes:'sharp' },
      { id:'2|comp-lower', week:2, day:'comp-lower', date:'2026-06-17', notes:'' },
      { id:'1|lower', week:1, day:'lower', date:'2026-06-09', notes:'old block' },
    ]);
  });

  await page.goto('http://localhost:8123/#/data', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.archive-item, .card');

  const archiveFirst = await page.$eval('#app .card h2', h => h.textContent);
  check('Archiv is the top section', archiveFirst === 'Archiv', archiveFirst);

  const items = await page.$$eval('.archive-item summary', els => els.map(s => ({
    name: s.querySelector('.arc-name').textContent.trim(),
    date: s.querySelector('.arc-date').textContent.trim(),
    count: s.querySelector('.arc-count').textContent.trim(),
  })));
  check('exactly 2 completed sessions (partial excluded)', items.length === 2, JSON.stringify(items));
  check('newest first, name+date+count', items[0] && items[0].date === '2026-06-16' && items[0].name.includes('Lower') && items[0].count === '10 Sätze', JSON.stringify(items[0]));
  check('old-block completed session present (fallback rule)', items.some(i => i.date === '2026-06-09'), JSON.stringify(items));
  check('partial session (2026-06-17) NOT in archive', !items.some(i => i.date === '2026-06-17'), JSON.stringify(items));

  const detail = await page.evaluate(() => { const d = document.querySelector('.archive-item'); d.open = true; return d.textContent; });
  check('expandable detail shows sets + notes', detail.includes('80 kg') && detail.includes('sharp'), detail.slice(0, 100));

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failed ? 'ARCHIVE TEST FAILED' : 'ARCHIVE TEST OK');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message); process.exit(2); });
