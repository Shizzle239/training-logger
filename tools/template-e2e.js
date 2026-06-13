/* End-to-end: load a converter-produced program.json into the real app and
   confirm it renders (home, log view with superset interleaving, no errors). */
'use strict';
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const PROG = process.argv[2];
let failed = 0;
const check = (n, c, x) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${!c && x ? ' — ' + x : ''}`); if (!c) failed++; };

(async () => {
  const prog = JSON.parse(fs.readFileSync(PROG, 'utf8'));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('http://localhost:8123/#/', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.week-card');
  // store the converted program; init() reads kv.program before fetching program.json
  await page.evaluate(async (p) => { await dbPut('kv', { key: 'program', value: p }); }, prog);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.week-card');

  const title = await page.$eval('.home-head h1', e => e.textContent);
  const weeks = await page.$$eval('.week-card', e => e.length);
  check('home: converted name + week count', title === prog.name && weeks === prog.weeks, `${title} / ${weeks}`);

  const firstDay = prog.days[0].id;
  await page.goto(`http://localhost:8123/#/log/1/${firstDay}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.set-row');
  const blocks = await page.$$eval('.block', e => e.length);
  check('log view renders all blocks of day 1', blocks === prog.days[0].blocks.length, `${blocks}/${prog.days[0].blocks.length}`);

  // superset interleaving on block B (back-squats / db-jumps)
  const order = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.block')).find(x => x.querySelector('.block-head').textContent.includes('Back Squats'));
    return Array.from(b.querySelectorAll('.set-row')).map(r => r.dataset.ex + '#' + r.dataset.set);
  });
  check('superset interleaved (2a,2b per round)',
    order.join(',') === 'back-squats#0,db-jumps#0,back-squats#1,db-jumps#1,back-squats#2,db-jumps#2', order.join(','));

  // straight block with per-set targets 6/5/4
  const shrug = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.block')).find(x => x.querySelector('.block-head').textContent.includes('Hang Power Shrug'));
    return Array.from(b.querySelectorAll('.target')).map(t => t.textContent.trim());
  });
  check('straight block per-set reps 6/5/4', shrug.length === 3 && shrug[0].startsWith('6') && shrug[2].startsWith('4'), shrug.join(' | '));

  // maxes screen renders the converted lifts
  await page.goto('http://localhost:8123/#/maxes', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.max-card');
  const maxNames = await page.$$eval('.max-name', e => e.map(x => x.textContent));
  check('maxes screen lists converted lifts', maxNames.some(n => n.includes('Back Squat')), maxNames.join(', '));

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failed ? 'TEMPLATE E2E FAILED' : 'TEMPLATE E2E OK');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message); process.exit(2); });
