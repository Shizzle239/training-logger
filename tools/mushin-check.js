'use strict';
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
let failed = 0;
const check = (n, c, x) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${!c && x ? ' — ' + x : ''}`); if (!c) failed++; };

(async () => {
  const prog = JSON.parse(fs.readFileSync('C:\\Users\\nalyd\\OneDrive\\WorkoutTracker\\mushin-phase2.json', 'utf8'));
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run'] });
  const page = await b.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));

  await page.goto('http://localhost:8123/#/', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.week-card');
  await page.evaluate(async (p) => { await dbPut('kv', { key: 'program', value: p }); }, prog);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.week-card');

  check('home: name + 3 weeks', (await page.$eval('.home-head h1', e => e.textContent)) === prog.name && (await page.$$eval('.week-card', e => e.length)) === 3);

  // Tag 1: superset A interleave over 2 rounds, with correct labels
  await page.goto('http://localhost:8123/#/log/1/tag1', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.set-row');
  const a = await page.evaluate(() => {
    const blk = Array.from(document.querySelectorAll('.block')).find(x => x.querySelector('.block-head').textContent.includes('Back Squats'));
    return Array.from(blk.querySelectorAll('.set-row')).map(r => r.dataset.ex + '#' + r.dataset.set);
  });
  check('Tag1 A interleaved 2 rounds', a.join(',') === 'back-squats#0,box-jumps#0,back-squats#1,box-jumps#1', a.join(','));
  const labels = await page.$$eval('.block:nth-of-type(2) .ex-label', e => e.map(x => x.textContent));
  check('Tag1 B labels distinct 2a/2b', labels.includes('2a') && labels.includes('2b') && !(labels[0] === labels[1]), labels.join(','));
  check('Tag1 has warmup + plyo blocks', (await page.$$eval('.info-block', e => e.length)) >= 2);

  // Tag 3: block A is straight (single exercise)
  await page.goto('http://localhost:8123/#/log/1/tag3', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.set-row');
  const bulg = await page.evaluate(() => {
    const blk = Array.from(document.querySelectorAll('.block')).find(x => x.querySelector('.block-head').textContent.includes('Bulgarian'));
    return blk.querySelectorAll('.set-row').length;
  });
  check('Tag3 Bulgarian = straight, 2 sets', bulg === 2, String(bulg));

  // no ghost days: exactly 3 day tiles per week on home
  await page.goto('http://localhost:8123/#/', { waitUntil: 'networkidle0' });
  const tilesW1 = await page.$$eval('.week-card:first-child .day-btn', e => e.length);
  check('no ghost days (3 day tiles in week 1)', tilesW1 === 3, String(tilesW1));

  check('no page errors', errors.length === 0, errors.join(' | '));
  await b.close();
  console.log(failed ? 'MUSHIN CHECK FAILED' : 'MUSHIN CHECK OK');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message); process.exit(2); });
