'use strict';
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const OUT = process.argv[2] || '.';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  await page.goto('http://localhost:8123/#/log/1/lower', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.set-row');
  // log a few sets so colors show
  await page.$eval('.set-row[data-key="1|lower|back-squat|0"] .f-done', el => el.click());
  await page.$eval('.set-row[data-key="1|lower|db-jumps|0"] .f-done', el => el.click());
  await page.$eval('.set-row[data-key="1|lower|back-squat|1"] .f-wt', el => { el.scrollIntoView({ block: 'center' }); });
  await page.type('.set-row[data-key="1|lower|back-squat|1"] .f-wt', '100');
  await new Promise(r => setTimeout(r, 400));
  await page.$eval('.block:nth-of-type(2)', el => el.scrollIntoView({ block: 'start' })).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 360));
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: OUT + '/shot-log.png' });

  await page.goto('http://localhost:8123/#/', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.week-card');
  await page.screenshot({ path: OUT + '/shot-home.png' });

  await page.goto('http://localhost:8123/#/maxes', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.max-card');
  await page.$eval('.f-onerm[data-lift="back-squat"]', el => { el.scrollIntoView({ block: 'center' }); });
  await page.type('.f-onerm[data-lift="back-squat"]', '140');
  await page.$eval('.max-card[data-lift="back-squat"] .pct-details', el => { el.open = true; });
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => window.scrollTo(0, 200));
  await page.screenshot({ path: OUT + '/shot-maxes.png' });

  console.log('shots done');
  await browser.close();
})().catch(e => { console.error('CRASH', e.message); process.exit(1); });
