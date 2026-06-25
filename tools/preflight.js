/* tools/preflight.js -- the "test before apply" gate for the Training Logger PWA.
   Run this after EVERY change and before every commit/deploy:

       node tools/preflight.js

   It runs, in order:
     1. SYNTAX   node --check on every shipped .js
     2. JSON     parse program.json / manifest.json / package.json
     3. STATIC   deploy-consequence invariants:
                   - sw.js VERSION bumped when any cached asset changed (vs git HEAD)
                   - every asset in sw.js ASSETS exists on disk
                   - every local script/style in index.html is in the SW cache list
                   - no absolute http(s)/github.io asset URLs in app code (Capacitor rule)
                   - db.js DB_VERSION + object stores are self-consistent
                   - program.json has the fields the app reads (incl. maxLifts/progressLifts)
     4. BOOT     headless render smoke (tools/smoke-boot.js) -- Home/Log/Maxes/Progress/Data

   Exit 0 = safe to commit. Exit 1 = do NOT deploy. No real browser required. */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const REPO = path.resolve(__dirname, '..');
const r = f => fs.readFileSync(path.join(REPO, f), 'utf8');
const exists = f => fs.existsSync(path.join(REPO, f));
let hardFail = 0, warn = 0;
const PASS = m => console.log(`  PASS  ${m}`);
const FAIL = m => { hardFail++; console.log(`  FAIL  ${m}`); };
const WARN = m => { warn++; console.log(`  WARN  ${m}`); };
const head = m => console.log(`\n${m}`);

const SHIPPED_JS = ['db.js', 'xlsx.js', 'app.js', 'sw.js'];

/* 1. SYNTAX */
head('1. Syntax (node --check)');
for (const f of SHIPPED_JS.concat(['tools/preflight.js', 'tools/smoke-boot.js'])) {
  if (!exists(f)) { WARN(`${f} missing -- skipped`); continue; }
  try { cp.execSync(`node --check "${path.join(REPO, f)}"`, { stdio: 'pipe' }); PASS(`${f} parses`); }
  catch (e) { FAIL(`${f} -- ${String(e.stderr || e.message).split('\n')[0]}`); }
}

/* 2. JSON */
head('2. JSON validity');
for (const f of ['program.json', 'manifest.json', 'package.json']) {
  if (!exists(f)) { WARN(`${f} missing -- skipped`); continue; }
  try { JSON.parse(r(f)); PASS(`${f} parses`); }
  catch (e) { FAIL(`${f} -- ${e.message}`); }
}

/* 3. STATIC INVARIANTS */
head('3. Static invariants (deploy consequences)');

const swText = exists('sw.js') ? r('sw.js') : '';
const verMatch = swText.match(/const\s+VERSION\s*=\s*['"]([^'"]+)['"]/);
const curVersion = verMatch ? verMatch[1] : null;
const assetsBlock = (swText.match(/const\s+ASSETS\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
const swAssets = Array.from(assetsBlock.matchAll(/['"]\.\/([^'"]*)['"]/g)).map(m => m[1]).filter(Boolean);

// 3a. SW assets exist on disk
let missingAsset = swAssets.filter(a => !exists(a));
if (!swText) WARN('sw.js not found -- skipping cache checks');
else if (missingAsset.length) FAIL(`sw.js lists assets that do not exist: ${missingAsset.join(', ')}`);
else PASS(`all ${swAssets.length} sw.js cache assets exist on disk`);

// 3b. index.html local scripts/styles are all in the SW cache list (offline completeness)
if (exists('index.html')) {
  const ix = r('index.html');
  const refs = Array.from(ix.matchAll(/(?:src|href)=["']([^"'#]+)["']/g)).map(m => m[1])
    .filter(u => !/^https?:|^data:|^mailto:/.test(u))
    .map(u => u.replace(/^\.\//, ''));
  const cacheCritical = refs.filter(u => /\.(js|css)$/.test(u) || u === 'manifest.json');
  const notCached = cacheCritical.filter(u => !swAssets.includes(u));
  if (notCached.length) FAIL(`referenced by index.html but missing from sw.js ASSETS (won't work offline): ${notCached.join(', ')}`);
  else PASS('every local script/style in index.html is in the SW cache list');
  const missingRef = refs.filter(u => !exists(u) && u !== '');
  if (missingRef.length) FAIL(`index.html references missing files: ${missingRef.join(', ')}`);
  else PASS('all index.html local references exist');
}

// 3c. Capacitor rule: no absolute http(s) asset URLs in shipped app code
const codeFiles = ['index.html', 'app.js', 'db.js', 'xlsx.js', 'styles.css', 'manifest.json'].filter(exists);
const badUrls = [];
for (const f of codeFiles) {
  r(f).split('\n').forEach((ln, i) => {
    const stripped = ln.replace(/https?:\/\/(www\.)?w3\.org\/[^\s'"]*/g, '');
    if (/\bsrc\s*=\s*["']https?:\/\//i.test(stripped) ||
        /\bhref\s*=\s*["']https?:\/\//i.test(stripped) ||
        /\burl\(\s*['"]?https?:\/\//i.test(stripped) ||
        /\bfetch\(\s*['"]https?:\/\//i.test(stripped) ||
        /\bimport\s+[^'"]*['"]https?:\/\//i.test(stripped)) badUrls.push(`${f}:${i + 1}`);
  });
}
if (badUrls.length) FAIL(`absolute asset URL(s) found (breaks Capacitor/offline -- use relative paths): ${badUrls.join(', ')}`);
else PASS('no absolute asset URLs in shipped code (relative-paths rule holds)');

// 3d. db.js store/version sanity
if (exists('db.js')) {
  const db = r('db.js');
  const dbVer = (db.match(/const\s+DB_VERSION\s*=\s*(\d+)/) || [])[1];
  const storesArr = (db.match(/const\s+STORES\s*=\s*\[([^\]]*)\]/) || [, ''])[1];
  const declared = Array.from(storesArr.matchAll(/['"]([^'"]+)['"]/g)).map(m => m[1]);
  const created = Array.from(db.matchAll(/createObjectStore\(\s*['"]([^'"]+)['"]/g)).map(m => m[1]);
  if (!dbVer) WARN('db.js DB_VERSION not found'); else PASS(`db.js DB_VERSION = ${dbVer}`);
  const onlyCreated = created.filter(s => !declared.includes(s));
  const onlyDeclared = declared.filter(s => !created.includes(s));
  if (onlyCreated.length || onlyDeclared.length)
    FAIL(`db.js stores mismatch -- created-not-listed: [${onlyCreated}] listed-not-created: [${onlyDeclared}]`);
  else PASS(`db.js stores consistent (${declared.length}: ${declared.join(', ')})`);
}

// 3e. program.json shape the app actually reads
if (exists('program.json')) {
  let p; try { p = JSON.parse(r('program.json')); } catch (_) { p = null; }
  if (p) {
    if (typeof p.name === 'string' && p.weeks >= 1 && Array.isArray(p.days) && p.days.length &&
        p.days.every(d => d.id && d.name)) PASS('program.json has required name/weeks/days[]');
    else FAIL('program.json missing required name / weeks>=1 / days[].{id,name}');
    if (!Array.isArray(p.maxLifts) || !p.maxLifts.length) WARN('program.json has no maxLifts[] -- the Maxes tab will be empty/error');
    if (!Array.isArray(p.progressLifts)) WARN('program.json has no progressLifts[] -- Progress order falls back to insertion order');
  }
}

// 3f. SW VERSION bumped when any cached asset changed (vs git HEAD). Compares NORMALIZED
//     content (CRLF->LF) so OneDrive/Windows line-ending churn never counts as a change.
try {
  cp.execSync('git rev-parse --is-inside-work-tree', { cwd: REPO, stdio: 'pipe' });
  const norm = s => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const headFile = f => {
    try { return cp.execSync(`git show HEAD:${f}`, { cwd: REPO, stdio: 'pipe' }).toString(); }
    catch (_) { return null; }
  };
  const headVersion = ((headFile('sw.js') || '').match(/const\s+VERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null;
  const changed = [];
  for (const a of swAssets) {
    if (!a || !exists(a)) continue;
    const h = headFile(a);
    if (h == null) { changed.push(a); continue; }
    if (norm(h) !== norm(r(a))) changed.push(a);
  }
  const nonSwChanged = changed.filter(f => f !== 'sw.js');
  if (nonSwChanged.length === 0) PASS('no cached assets changed since HEAD (no version bump required)');
  else if (curVersion && headVersion && curVersion === headVersion)
    FAIL(`assets changed (${nonSwChanged.join(', ')}) but sw.js VERSION is still ${curVersion} -- bump it or installed phones keep the old app`);
  else PASS(`assets changed and VERSION bumped ${headVersion} -> ${curVersion}`);
} catch (e) {
  WARN('git not available or no HEAD:sw.js -- version-bump check skipped');
}

/* 4. BOOT SMOKE */
head('4. Headless boot smoke');
try {
  const out = cp.execSync(`node "${path.join(REPO, 'tools/smoke-boot.js')}" "${REPO}"`, { stdio: 'pipe' });
  process.stdout.write(out.toString().split('\n').map(l => l ? '  ' + l.trim() : l).join('\n'));
} catch (e) {
  const out = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '');
  process.stdout.write(out.split('\n').map(l => l ? '  ' + l.trim() : l).join('\n'));
  if (e.status === 2) WARN('boot smoke skipped (dev deps missing -- run: npm install)');
  else FAIL('boot smoke failed (see above)');
}

/* summary */
head('='.repeat(40));
if (hardFail) {
  console.log(`  X   ${hardFail} hard failure(s)${warn ? `, ${warn} warning(s)` : ''} -- DO NOT DEPLOY`);
  process.exit(1);
}
console.log(`  OK  preflight passed${warn ? ` with ${warn} warning(s)` : ''} -- safe to commit & deploy`);
process.exit(0);
