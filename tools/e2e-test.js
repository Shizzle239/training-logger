/* End-to-end smoke test against a running local server.
   Usage:  npm i puppeteer-core   then:
           node tools/e2e-test.js [url] [chromePath]
   Defaults: http://localhost:8123 and standard Chrome locations. */
'use strict';

const puppeteer = require('puppeteer-core');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:8123';
const CHROME = process.argv[3] || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
].find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
}

/* click via element.click() — avoids coordinate clicks landing on the fixed bottom nav */
async function click(page, sel) {
  await page.$eval(sel, el => el.click());
}
async function typeIn(page, sel, text) {
  await page.$eval(sel, el => el.scrollIntoView({ block: 'center' }));
  await page.type(sel, text);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-first-run', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  /* ---- home ---- */
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.week-card', { timeout: 8000 });
  const weekCards = await page.$$eval('.week-card', els => els.length);
  check('home renders 6 week cards', weekCards === 6, `got ${weekCards}`);

  /* ---- log view: superset interleaving ---- */
  await page.goto(BASE + '/#/log/1/lower', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.set-row');
  const order = await page.$$eval('.block', blocks =>
    Array.from(blocks[1].querySelectorAll('.set-row')).map(r => r.dataset.ex + '#' + r.dataset.set));
  check('superset rounds interleave (2a→2b per round)',
    JSON.stringify(order) === JSON.stringify([
      'back-squat#0', 'db-jumps#0', 'back-squat#1', 'db-jumps#1', 'back-squat#2', 'db-jumps#2']),
    order.join(','));
  const dividers = await page.$$eval('.block', blocks => blocks[1].querySelectorAll('.round-divider').length);
  check('round dividers between rounds', dividers === 2, `got ${dividers}`);

  /* ---- done toggle: smart defaults + status color ---- */
  const bsRow = '.set-row[data-key="1|lower|back-squat|0"]';
  await click(page, `${bsRow} .f-done`);
  await new Promise(r => setTimeout(r, 300));
  let vals = await page.$eval(bsRow, r => ({
    reps: r.querySelector('.f-reps').value,
    wt: r.querySelector('.f-wt').value,
    rpe: r.querySelector('.f-rpe').value,
    done: r.classList.contains('st-done'),
  }));
  check('done-tap fills target 3 reps @100 kg RPE8 + green status',
    vals.reps === '3' && vals.wt === '100' && vals.rpe === '8' && vals.done, JSON.stringify(vals));

  /* ---- manual input + amber status + persistence across reload ---- */
  const hpsRow = '.set-row[data-key="1|lower|hang-power-shrug|0"]';
  await typeIn(page, `${hpsRow} .f-wt`, '60');
  await new Promise(r => setTimeout(r, 300));
  const amber = await page.$eval(hpsRow, r => r.classList.contains('st-partial'));
  check('weight-only set shows amber status', amber);

  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.set-row');
  vals = await page.$eval(hpsRow, r => r.querySelector('.f-wt').value);
  check('autosaved value survives reload (IndexedDB)', vals === '60', `got "${vals}"`);

  /* ---- week 2 prefill chip ---- */
  await page.goto(BASE + '/#/log/2/lower', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.set-row');
  const chipSel = '.set-row[data-key="2|lower|back-squat|0"] .prefill-chip';
  const chipTxt = await page.$eval(chipSel, c => c.textContent).catch(() => null);
  check('prev-week prefill chip appears', !!chipTxt && chipTxt.includes('3 × 100'), String(chipTxt));
  await click(page, chipSel);
  await new Promise(r => setTimeout(r, 300));
  vals = await page.$eval('.set-row[data-key="2|lower|back-squat|0"]', r => ({
    reps: r.querySelector('.f-reps').value, wt: r.querySelector('.f-wt').value,
  }));
  check('chip tap copies last week values', vals.reps === '3' && vals.wt === '100', JSON.stringify(vals));

  /* log a heavier week-2 squat set for the progress chart */
  await typeIn(page, '.set-row[data-key="2|lower|back-squat|1"] .f-wt', '102.5');
  await new Promise(r => setTimeout(r, 300));

  /* ---- maxes ---- */
  await page.goto(BASE + '/#/maxes', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.max-card');
  await typeIn(page, '.f-onerm[data-lift="back-squat"]', '140');
  await new Promise(r => setTimeout(r, 300));
  const tm = await page.$eval('.max-card[data-lift="back-squat"] .tm-val', el => el.textContent);
  check('1RM 140 → Training Max 126', tm.includes('126'), tm);
  const row60 = await page.$eval('.max-card[data-lift="back-squat"] .pct-table tbody tr', tr =>
    Array.from(tr.querySelectorAll('td')).map(td => td.textContent));
  check('60% row: 84 (1RM) / 75.5 (TM)', row60[1] === '84' && row60[2] === '75.5', row60.join('|'));

  await typeIn(page, '#calc-w', '100');
  await typeIn(page, '#calc-r', '5');
  await new Promise(r => setTimeout(r, 200));
  const calc = await page.$eval('#calc-out', el => el.textContent);
  check('e1RM: Epley 116.5 / Brzycki 112.5', calc.includes('116.5') && calc.includes('112.5'), calc);

  /* heaviest set with reps is 100 kg × 3 → Epley e1RM 110 (102.5 kg set has no reps) */
  const sugg = await page.$eval('.max-card[data-lift="back-squat"] .suggestion', el => el.textContent).catch(() => '');
  check('e1RM auto-suggest from heaviest logged set', sugg.includes('100 kg × 3') && sugg.includes('110'), sugg);

  /* ---- progress ---- */
  await page.goto(BASE + '/#/progress', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.chart-card');
  const chartVals = await page.$$eval('.chart-card', cards => {
    const c = cards.find(x => x.querySelector('h2').textContent.includes('Back Squats'));
    return c ? Array.from(c.querySelectorAll('.bar-val')).map(t => t.textContent) : [];
  });
  check('progress chart: W1=100, W2=102.5', chartVals.includes('100') && chartVals.includes('102.5'), chartVals.join(','));

  /* ---- export / wipe / import roundtrip (logic level) ---- */
  const roundtrip = await page.evaluate(async () => {
    const payload = {
      app: 'workout-logger', version: 1,
      program: (await dbGet('kv', 'program')).value,
      sessions: await dbGetAll('sessions'),
      sets: await dbGetAll('sets'),
      maxes: await dbGetAll('maxes'),
      bodyweight: await dbGetAll('bodyweight'),
    };
    const before = payload.sets.length + '|' + payload.maxes.length;
    await dbClearAll();
    const wiped = (await dbGetAll('sets')).length;
    window.confirm = () => true;
    const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
    await importJSONFile(file);
    const after = (await dbGetAll('sets')).length + '|' + (await dbGetAll('maxes')).length;
    return { before, wiped, after };
  });
  check('export → wipe → import restores everything',
    roundtrip.wiped === 0 && roundtrip.before === roundtrip.after, JSON.stringify(roundtrip));

  /* ---- rest timer ---- */
  await click(page, '#topbar-timer');
  await click(page, '#timer-presets button[data-s="30"]');
  await new Promise(r => setTimeout(r, 1500));
  const tdisp = await page.$eval('#timer-display', el => el.textContent);
  check('rest timer counts down', /0:2[0-9]/.test(tdisp), tdisp);

  /* ---- service worker + offline ---- */
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle0' });
  const swState = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    const reg = await navigator.serviceWorker.ready;
    return reg && reg.active ? 'active' : 'none';
  });
  check('service worker active', swState === 'active', swState);

  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'networkidle0' }).catch(() => {});
  const offlineOk = await page.waitForSelector('.week-card', { timeout: 8000 }).then(() => true).catch(() => false);
  check('app loads fully offline', offlineOk);
  await page.setOfflineMode(false);

  /* ---- runtime errors ---- */
  check('no page errors during run', errors.length === 0, errors.slice(0, 3).join(' || '));

  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
