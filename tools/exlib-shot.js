'use strict';
const puppeteer = require('puppeteer-core');
const CHROME = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run'] });
  const page = await b.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto('http://localhost:8123/#/', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.week-card');
  await page.evaluate(async () => {
    await dbClear('exercises');
    const prog = (await dbGet('kv', 'program')).value;
    await harvestExercises(prog);
  });
  await page.goto('http://localhost:8123/#/exercises', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.exlib-item');
  await page.evaluate(() => { document.querySelector('.exlib-item').open = true; });
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: process.argv[2] + '/shot-exlib.png' });
  await b.close(); console.log('shot done');
})().catch(e => { console.error(e.message); process.exit(1); });
