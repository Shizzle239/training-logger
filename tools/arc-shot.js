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
    await dbClearAll(); await dbPut('kv', { key: 'program', value: App.program });
    const mk = (w,d,e,s)=>({id:`${w}|${d}|${e}|${s}`,week:w,day:d,ex:e,set:s,reps:3,wt:[85,100][s%2],rpe:6,done:true,ts:s});
    const exs=[['comp-hang-power-shrug',2],['comp-back-squat',2],['comp-db-jumps',2],['comp-rdl',2],['comp-kb-swings',2]];
    const sets=[]; for(const[e,c]of exs)for(let s=0;s<c;s++)sets.push(mk(1,'comp-lower',e,s));
    sets.push({id:'1|lower|back-squat|0',week:1,day:'lower',ex:'back-squat',set:0,reps:3,wt:100,rpe:8,done:true,ts:1});
    sets.push({id:'1|lower|back-squat|1',week:1,day:'lower',ex:'back-squat',set:1,reps:3,wt:100,rpe:8,done:true,ts:2});
    sets.push({id:'1|upper|tricep-dips|0',week:1,day:'upper',ex:'tricep-dips',set:0,reps:15,wt:12,rpe:6,done:true,ts:3});
    await dbBulkPut('sets', sets);
    await dbBulkPut('sessions',[
      {id:'1|comp-lower',week:1,day:'comp-lower',date:'2026-06-16',notes:'scharf, locker'},
      {id:'1|lower',week:1,day:'lower',date:'2026-06-09',notes:''},
      {id:'1|upper',week:1,day:'upper',date:'2026-06-04',notes:''},
    ]);
  });
  await page.goto('http://localhost:8123/#/data', { waitUntil: 'networkidle0' });
  await page.waitForSelector('.archive-item');
  await page.evaluate(() => { document.querySelector('.archive-item').open = true; });
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: process.argv[2] + '/shot-archive.png' });
  await b.close(); console.log('shot done');
})().catch(e => { console.error(e.message); process.exit(1); });
