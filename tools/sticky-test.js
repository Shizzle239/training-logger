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
  await page.goto('http://localhost:8123/#/log/1/upper', { waitUntil: 'networkidle0' });
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
