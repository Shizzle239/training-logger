/* Regression test: superset block headers must stick under the top bar,
   not float inside their block (overflow:hidden scrollport bug). */
'use strict';
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
].find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });

let failed = 0;
function check(name, cond, extra) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && extra ? ' — ' + extra : ''}`);
  if (!cond) failed++;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  // seed a known multi-superset day so the test is independent of the live program
  await page.goto('http://localhost:8123/#/', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.week-card');
  await page.evaluate(async () => {
    const prog = { id: 'sticky-test', name: 'Sticky Test', weeks: 1, days: [{
      id: 'upper', name: 'Upper', title: 'Day — Upper', blocks: [
        { id: 'A', type: 'superset', rounds: 3, exercises: [
          { id: 'a1', label: '1a', name: 'Ex A1', target: { reps: '10', rpe: 7, weight: 20 } },
          { id: 'a2', label: '1b', name: 'Ex A2', target: { reps: '10', rpe: 7, weight: 20 } } ] },
        { id: 'B', type: 'superset', rounds: 3, exercises: [
          { id: 'b1', label: '2a', name: 'Ex B1', target: { reps: '12', rpe: 6, weight: 15 } },
          { id: 'b2', label: '2b', name: 'Ex B2', target: { reps: '12', rpe: 6, weight: 15 } } ] },
        { id: 'C', type: 'superset', rounds: 3, exercises: [
          { id: 'c1', label: '3a', name: 'Ex C1', target: { reps: '15', rpe: 6, weight: 10 } },
          { id: 'c2', label: '3b', name: 'Ex C2', target: { reps: '15', rpe: 6, weight: 10 } } ] } ] }],
      maxLifts: [], progressLifts: [] };
    await dbPut('kv', { key: 'program', value: prog });
  });
  // re-render home with the seeded program, then click into the day like a user
  await page.evaluate(async () => { App.program = (await dbGet('kv', 'program')).value; await render(); });
  await page.waitForSelector('.day-btn');
  await page.$eval('.day-btn', el => el.click());
  await page.waitForSelector('.block-head');

  // at scroll 0: every header sits flush at the top of its block (no displacement)
  const atTop = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.block')).map(b => {
      const h = b.querySelector('.block-head');
      return Math.round(h.getBoundingClientRect().top - b.getBoundingClientRect().top);
    });
  });
  check('headers flush with block top before scrolling', atTop.every(d => Math.abs(d) <= 2), atTop.join(','));

  // scrolled into block 2: its header sticks just under the top bar (~58px)
  const stuck = await page.evaluate(() => {
    const blocks = document.querySelectorAll('.block');
    const b = blocks[1];
    window.scrollTo(0, window.scrollY + b.getBoundingClientRect().top - 200);
    return new Promise(res => requestAnimationFrame(() => {
      window.scrollTo(0, window.scrollY + 300); // now inside block 2
      requestAnimationFrame(() => {
        const h = b.querySelector('.block-head').getBoundingClientRect();
        const bar = document.getElementById('topbar').getBoundingClientRect();
        res({ headTop: Math.round(h.top), barBottom: Math.round(bar.bottom), inBlock: h.top >= b.getBoundingClientRect().top - 1 });
      });
    }));
  });
  check('header sticks at top bar while scrolling through block',
    Math.abs(stuck.headTop - stuck.barBottom) <= 4 && stuck.inBlock, JSON.stringify(stuck));

  await page.screenshot({ path: (process.argv[2] || '.') + '/shot-sticky.png' });
  await browser.close();
  console.log(failed ? 'STICKY TEST FAILED' : 'STICKY TEST OK');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message); process.exit(2); });
