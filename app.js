/* app.js — Training Logger PWA. Vanilla JS, no dependencies. */
'use strict';

/* ---------------------------------------------------------------- utils */

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtNum(v) {
  if (v == null || v === '' || isNaN(v)) return '';
  return String(Math.round(v * 100) / 100);
}

function roundHalf(v) { return Math.round(v * 2) / 2; }

function todayISO() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function parseNum(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/* first number in a target reps string: "10–12" -> 10, "8/side" -> 8 */
function firstNumber(s) {
  const m = String(s == null ? '' : s).match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* e1RM formulas */
function epley(w, r) { return r === 1 ? w : w * (1 + r / 30); }
function brzycki(w, r) { return r === 1 ? w : w * 36 / (37 - r); }

/* haptic tap (Android; silently ignored elsewhere) */
function buzz(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* not available */ }
}

/* plate math: total kg -> "bar 20 + per side: 25 + 15" (20 kg bar, kg plates) */
function plateText(total) {
  const BAR = 20, SIZES = [25, 20, 15, 10, 5, 2.5, 1.25];
  if (!(total > 0)) return null;
  if (total < BAR) return `${fmtNum(total)} kg is below the empty bar (20 kg)`;
  let side = (total - BAR) / 2;
  const out = [];
  for (const p of SIZES) { while (side >= p - 1e-9) { out.push(fmtNum(p)); side -= p; } }
  const rest = Math.round(side * 2 * 100) / 100;
  let txt = `${fmtNum(total)} kg = bar 20` + (out.length ? ` + per side: ${out.join(' + ')}` : ' (empty bar)');
  if (rest > 0) txt += ` · ${fmtNum(rest)} kg not plate-loadable`;
  return txt;
}

/* ---------------------------------------------------------------- theme */

const THEMES = [
  { id: 'green', name: 'Green', accent: '#34d27b' },
  { id: 'teal', name: 'Teal', accent: '#2dd4bf' },
  { id: 'blue', name: 'Blue', accent: '#5b9cf6' },
  { id: 'indigo', name: 'Indigo', accent: '#7f88f7' },
  { id: 'purple', name: 'Purple', accent: '#a679f2' },
  { id: 'pink', name: 'Pink', accent: '#ec5e9c' },
  { id: 'amber', name: 'Amber', accent: '#e8b53e' },
  { id: 'orange', name: 'Orange', accent: '#f5833f' },
];

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function currentTheme() { return localStorage.getItem('wl.theme') || 'green'; }

/* apply a theme by swapping the accent CSS variables on :root (instant, app-wide) */
function applyTheme(id) {
  const t = THEMES.find(x => x.id === id) || THEMES[0];
  const s = document.documentElement.style;
  s.setProperty('--accent', t.accent);
  s.setProperty('--accent-dim', hexToRgba(t.accent, 0.16));
  s.setProperty('--accent-border', hexToRgba(t.accent, 0.55));
  return t.id;
}

function setTheme(id) { localStorage.setItem('wl.theme', applyTheme(id)); }

/* ---------------------------------------------------------------- state */

const App = {
  program: null,
  setsCache: new Map(),      // id -> set record (for current log view: this + prev week)
  sessionCache: null,        // session record for current log view
};

const setKey = (week, dayId, exId, setIdx) => `${week}|${dayId}|${exId}|${setIdx}`;
const sessionKey = (week, dayId) => `${week}|${dayId}`;

function getDay(dayId) { return App.program.days.find(d => d.id === dayId); }
function dayForWeek(day, week) { return (day && day.weekOverride && day.weekOverride[week]) || day; }
function bakeBlocks(blocks, wt) {
  const out = JSON.parse(JSON.stringify(blocks || []));
  if (wt) for (const b of out) for (const ex of b.exercises) {
    const o = wt[ex.id]; if (!o) continue;
    if (Array.isArray(ex.sets)) ex.sets = ex.sets.map(s => Object.assign({}, s, o));
    if (ex.target) ex.target = Object.assign({}, ex.target, o);
  }
  return out;
}

/* normalized list of (exercise, sets[]) for a day — superset targets expanded */
function exerciseSets(ex, block) {
  if (ex.sets) return ex.sets;
  const rounds = block.rounds || 3;
  return Array.from({ length: rounds }, () => Object.assign({}, ex.target));
}

function targetText(t) {
  let s = `${t.reps}`;
  if (t.rpe != null) s += ` @RPE${t.rpe}`;
  if (t.weight != null) s += ` · ${fmtNum(t.weight)} kg`;
  return s;
}

/* iterate every loggable set of a day (plyo blocks + main blocks): cb(block, ex, setIdx, target) */
function forEachSet(day, cb) {
  const blocks = ((day.plyo && day.plyo.blocks) || []).concat(day.blocks || []);
  for (const block of blocks) {
    for (const ex of block.exercises) {
      const sets = exerciseSets(ex, block);
      sets.forEach((t, i) => cb(block, ex, i, t));
    }
  }
}

/* render a list of straight/superset blocks into loggable set-row HTML */
function blocksToHtml(week, dayId, blocks, wt) {
  let html = '';
  (blocks || []).forEach((block, bi) => {
    const names = block.exercises.map(e => `<span class="bh-ex"><b>${esc(e.label)}</b> ${esc(e.name)}</span>`).join('<span class="bh-plus">+</span>');
    let rowsHtml = '';
    if (block.type === 'superset') {
      const rounds = block.rounds || 3;
      for (let r = 0; r < rounds; r++) {
        let groupRows = '';
        for (const ex of block.exercises) {
          const t0 = exerciseSets(ex, block)[r];
          const t = (wt && wt[ex.id]) ? Object.assign({}, t0, wt[ex.id]) : t0;
          groupRows += setRowHtml(week, dayId, ex, r, t, block.rest);
        }
        rowsHtml += `<div class="round-group"><div class="round-label">Round ${r + 1} / ${rounds}</div>${groupRows}</div>`;
      }
    } else {
      const ex = block.exercises[0];
      exerciseSets(ex, block).forEach((t0, i) => { const t = (wt && wt[ex.id]) ? Object.assign({}, t0, wt[ex.id]) : t0; rowsHtml += setRowHtml(week, dayId, ex, i, t, block.rest); });
    }
    html += `
      <section class="block band-${bi % 2}">
        <header class="block-head">${names}</header>
        ${rowsHtml}
      </section>`;
  });
  return html;
}

/* exercise lookup by id across program */
function findExercise(exId) {
  for (const day of App.program.days) {
    for (const block of day.blocks) {
      for (const ex of block.exercises) {
        if (ex.id === exId) return ex;
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------- program */

async function loadProgram() {
  const stored = await dbGet('kv', 'program');
  if (stored && stored.value && stored.value.days) {
    App.program = stored.value;
    harvestExercises(App.program);
    return;
  }
  const res = await fetch('program.json');
  if (!res.ok) throw new Error('program.json not found');
  App.program = await res.json();
  await dbPut('kv', { key: 'program', value: App.program });
  harvestExercises(App.program);
}

/* Collect every exercise from a program into the persistent library store.
   Merges by id; keeps a list of programs that use it + latest target values.
   Fire-and-forget (doesn't block rendering). */
async function harvestExercises(program) {
  if (!program || !Array.isArray(program.days)) return;
  try {
    const existing = new Map((await dbGetAll('exercises')).map(e => [e.id, e]));
    const now = Date.now();
    const progLabel = program.name || program.id || 'Programm';
    const seen = new Set();
    const records = [];
    for (const day of program.days) {
      for (const block of (day.blocks || [])) {
        for (const ex of (block.exercises || [])) {
          if (!ex.id || seen.has(ex.id)) continue;
          seen.add(ex.id);
          const t = ex.target || (ex.sets && ex.sets[0]) || {};
          const prev = existing.get(ex.id);
          const programs = new Set(prev && prev.programs || []);
          programs.add(progLabel);
          records.push({
            id: ex.id,
            name: ex.name || ex.id,
            lastReps: t.reps != null ? t.reps : (prev && prev.lastReps) || null,
            lastRpe: t.rpe != null ? t.rpe : (prev && prev.lastRpe) || null,
            lastWeight: t.weight != null ? t.weight : (prev && prev.lastWeight) || null,
            programs: Array.from(programs),
            firstSeen: prev && prev.firstSeen || now,
            lastSeen: now,
          });
        }
      }
    }
    if (records.length) await dbBulkPut('exercises', records);
  } catch (e) { console.warn('harvestExercises failed', e); }
}

async function reloadProgramFromFile() {
  const res = await fetch('program.json?ts=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('fetch failed');
  App.program = await res.json();
  await dbPut('kv', { key: 'program', value: App.program });
  harvestExercises(App.program);
}

/* ------------------------------------------------------------- routing */

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'log' && parts[1] && parts[2]) {
    return { view: 'log', week: Math.max(1, Math.min(App.program.weeks, parseInt(parts[1], 10) || 1)), day: parts[2] };
  }
  if (parts[0] === 'maxes') return { view: 'maxes' };
  if (parts[0] === 'progress') return { view: 'progress' };
  if (parts[0] === 'data') return { view: 'data' };
  if (parts[0] === 'archive') return { view: 'archive' };
  if (parts[0] === 'exercises') return { view: 'exercises' };
  if (parts[0] === 'settings') return { view: 'settings' };
  if (parts[0] === 'plans' && parts[1] === 'new') return { view: 'planSetup', id: null };
  if (parts[0] === 'plans' && parts[1] === 'edit' && parts[2]) return { view: 'planSetup', id: parts[2] };
  if (parts[0] === 'plans' && parts[1] === 'day' && parts[2] && parts[3] != null) return { view: 'dayEdit', id: parts[2], day: parseInt(parts[3], 10) || 0 };
  if (parts[0] === 'plans' && parts[1] === 'pick') return { view: 'exPick' };
  if (parts[0] === 'plans') return { view: 'plans' };
  return { view: 'home' };
}

async function render() {
  const r = route();
  // 'archive', 'exercises' and 'settings' live under the Data tab — keep that tab highlighted
  const navView = (r.view === 'archive' || r.view === 'exercises' || r.view === 'settings') ? 'data'
    : (['planSetup', 'dayEdit', 'exPick'].includes(r.view) ? 'plans' : r.view);
  $$('#bottomnav a').forEach(a => a.classList.toggle('active', a.dataset.view === navView));
  if (r.view === 'log') WakeLock.acquire(); else WakeLock.release();
  const app = $('#app');
  app.scrollTop = 0;
  window.scrollTo(0, 0);
  try {
    if (r.view === 'log') await renderLog(app, r.week, r.day);
    else if (r.view === 'maxes') await renderMaxes(app);
    else if (r.view === 'progress') await renderProgress(app);
    else if (r.view === 'data') await renderData(app);
    else if (r.view === 'archive') await renderArchive(app);
    else if (r.view === 'exercises') await renderExercises(app);
    else if (r.view === 'settings') await renderSettings(app);
    else if (r.view === 'plans') await renderPlans(app);
    else if (r.view === 'planSetup') await renderPlanSetup(app, r.id);
    else if (r.view === 'dayEdit') await renderDayEditor(app, r.id, r.day);
    else if (r.view === 'exPick') await renderExercisePicker(app);
    else await renderHome(app);
  } catch (e) {
    app.innerHTML = `<div class="card error">Something went wrong: ${esc(e.message)}</div>`;
    console.error(e);
  }
}

/* ---------------------------------------------------------------- home */

async function renderHome(app) {
  $('#topbar-title').textContent = 'Training Logger';
  $('#topbar-back').hidden = true;

  const allSets = await dbGetAll('sets');
  const doneCount = {};   // `${week}|${day}` -> done
  const anyCount = {};
  for (const s of allSets) {
    const k = `${s.week}|${s.day}`;
    anyCount[k] = (anyCount[k] || 0) + 1;
    if (s.done) doneCount[k] = (doneCount[k] || 0) + 1;
  }
  const countSets = d => { let n = 0; forEachSet(d, () => n++); return n; };

  let weeksHtml = '';
  for (let w = 1; w <= App.program.weeks; w++) {
    let dayBtns = '';
    for (const day of App.program.days) {
      const k = `${w}|${day.id}`;
      const done = doneCount[k] || 0;
      const any = anyCount[k] || 0;
      const total = countSets(dayForWeek(day, w));
      const cls = done >= total ? 'complete' : (any > 0 ? 'started' : '');
      const sub = any > 0 ? `${done}/${total} done` : '—';
      dayBtns += `<a class="day-btn ${cls}" href="#/log/${w}/${day.id}">
          <span class="day-name">${esc(day.name)}</span>
          <span class="day-sub">${sub}</span>
        </a>`;
    }
    weeksHtml += `<div class="week-card card">
        <div class="week-label">Week ${w}</div>
        <div class="day-btns">${dayBtns}</div>
      </div>`;
  }

  const nudge = backupNudgeHtml(allSets.length > 0);

  app.innerHTML = `
    ${nudge}
    <div class="home-head">
      <h1>${esc(App.program.name)}</h1>
      <p class="muted">${App.program.weeks} weeks · ${App.program.days.map(d => esc(d.name)).join(' / ')}</p>
    </div>
    <div class="weeks">${weeksHtml}</div>`;
}

function backupNudgeHtml(hasData) {
  if (!hasData) return '';
  const last = parseInt(localStorage.getItem('wl.lastExport') || '0', 10);
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  if (last && days < 7) return '';
  const msg = last ? `Last backup ${days} days ago.` : 'No backup yet.';
  return `<a class="nudge" href="#/data">⚠️ ${msg} Tap to export your data.</a>`;
}

/* ---------------------------------------------------------------- log */

async function renderLog(app, week, dayId) {
  const day = getDay(dayId);
  if (!day) { location.hash = '#/'; return; }
  const src = dayForWeek(day, week);

  $('#topbar-title').textContent = `Week ${week} · ${day.name}`;
  $('#topbar-back').hidden = false;

  // load sets for this week + previous week (for prefill)
  const allSets = await dbGetAll('sets');
  App.setsCache = new Map();
  for (const s of allSets) {
    if (s.day === dayId && (s.week === week || s.week === week - 1)) App.setsCache.set(s.id, s);
  }

  // PR baseline: best e1RM per exercise across ALL logged sets (for PR toasts)
  App.prBest = new Map();
  for (const s of allSets) {
    if (!(s.wt > 0 && s.reps > 0)) continue;
    const e1 = epley(s.wt, s.reps);
    const b = App.prBest.get(s.ex);
    if (!b || e1 > b.e1) App.prBest.set(s.ex, { e1 });
  }
  App.sessionCache = await dbGet('sessions', sessionKey(week, dayId)) || null;

  const wDone = (App.sessionCache && App.sessionCache.warmupDone) || {};
  const wItems = (src.warmup && src.warmup.items) || [];
  const warmup = wItems.length ? `
    <section class="card warmup-block">
      <header class="wu-head">${esc((src.warmup && src.warmup.title) || 'Warm-up')}</header>
      ${wItems.map((it, i) => {
        const txt = typeof it === 'string' ? it : `${(it && it.name) || ''}${it && it.scheme ? ' — ' + it.scheme : ''}`;
        return `<label class="wu-item${wDone[i] ? ' on' : ''}"><input type="checkbox" class="wu-check" data-i="${i}" ${wDone[i] ? 'checked' : ''}><span>${esc(txt)}</span></label>`;
      }).join('')}
    </section>` : '';

  const wt = (day.weekOverride && day.weekOverride[week]) ? null : ((day.weekTargets && day.weekTargets[week]) || null);
  const pBlocks = (src.plyo && src.plyo.blocks) || [];
  const pItems = (src.plyo && src.plyo.items) || [];
  const plyo = pBlocks.length
    ? `<div class="section-label">${esc((src.plyo && src.plyo.title) || 'Plyometrics & Priming')}</div>` + blocksToHtml(week, dayId, pBlocks, wt)
    : (pItems.length ? `
    <details class="card info-block">
      <summary>${esc((src.plyo && src.plyo.title) || 'Plyo / Core')}</summary>
      <ul>${pItems.map(i => `<li><strong>${esc(i.name)}</strong> — ${esc(i.scheme)}</li>`).join('')}</ul>
    </details>` : '');

  const blocksHtml = blocksToHtml(week, dayId, src.blocks, wt);

  const sess = App.sessionCache;
  app.innerHTML = `
    <div class="session-head card">
      <div class="sh-title">${esc(day.title || day.name)}</div>
      <label class="sh-date">Date
        <input type="date" id="session-date" value="${esc(sess && sess.date || '')}">
      </label>
    </div>
    ${warmup}
    ${plyo}
    ${blocksHtml}
    <div class="card notes-card">
      <label for="session-notes">Notes</label>
      <textarea id="session-notes" rows="3" placeholder="How did it go?">${esc(sess && sess.notes || '')}</textarea>
    </div>
    <div class="log-footer muted">Autosaves on every input.</div>`;

  // restore saved values + status
  $$('.set-row').forEach(row => {
    const rec = App.setsCache.get(row.dataset.key);
    if (rec) {
      row.querySelector('.f-reps').value = rec.reps != null ? rec.reps : '';
      row.querySelector('.f-wt').value = rec.wt != null ? rec.wt : '';
      row.querySelector('.f-rpe').value = rec.rpe != null ? rec.rpe : '';
      row.querySelector('.f-done').classList.toggle('on', !!rec.done);
    }
    updatePrefillChip(row, week, dayId);
    updateRowStatus(row);
  });

  $$('.wu-check').forEach(cb => cb.addEventListener('change', async () => {
    if (cb.checked) buzz(15);
    const s = await ensureSession(week, dayId);
    s.warmupDone = s.warmupDone || {};
    if (cb.checked) s.warmupDone[cb.dataset.i] = true; else delete s.warmupDone[cb.dataset.i];
    await dbPut('sessions', s);
    cb.closest('.wu-item').classList.toggle('on', cb.checked);
  }));
}

function rpeOptionsHtml(selected) {
  let html = '<option value="">RPE</option>';
  for (let v = 6; v <= 10; v += 0.5) {
    html += `<option value="${v}" ${selected === v ? 'selected' : ''}>${v}</option>`;
  }
  return html;
}

function setRowHtml(week, dayId, ex, setIdx, target, rest) {
  const key = setKey(week, dayId, ex.id, setIdx);
  return `
  <div class="set-row" data-key="${key}" data-week="${week}" data-day="${esc(dayId)}"
       data-ex="${esc(ex.id)}" data-set="${setIdx}"
       data-treps="${esc(target.reps)}" data-trpe="${target.rpe != null ? target.rpe : ''}"
       data-twt="${target.weight != null ? target.weight : ''}"
       data-rest-auto="${rest && rest.auto ? '1' : '0'}" data-rest-sec="${rest && rest.sec ? rest.sec : 90}">
    <div class="set-line1">
      <span class="ex-label">${esc(ex.label)}</span>
      <span class="ex-name">${esc(ex.name)}</span>
      <span class="set-no">S${setIdx + 1}</span>
      <span class="target">${esc(targetText(target))}</span>
    </div>
    <div class="set-line2">
      <div class="stepper">
        <button type="button" class="step" data-field="reps" data-d="-1" aria-label="minus 1 rep">−</button>
        <input type="number" class="f-reps" inputmode="numeric" min="0" placeholder="reps">
        <button type="button" class="step" data-field="reps" data-d="1" aria-label="plus 1 rep">+</button>
      </div>
      <div class="stepper">
        <button type="button" class="step" data-field="wt" data-d="-2.5" aria-label="minus 2.5 kg">−</button>
        <input type="number" class="f-wt" inputmode="decimal" min="0" step="2.5" placeholder="kg">
        <button type="button" class="step" data-field="wt" data-d="2.5" aria-label="plus 2.5 kg">+</button>
      </div>
      <select class="f-rpe" aria-label="RPE">${rpeOptionsHtml(null)}</select>
      <button type="button" class="f-done" aria-label="set done">✓</button>
      <button type="button" class="f-timer" aria-label="rest timer">⏱</button>
    </div>
    <div class="prefill-slot"></div>
  </div>`;
}

function updatePrefillChip(row, week, dayId) {
  const slot = row.querySelector('.prefill-slot');
  slot.innerHTML = '';
  if (week <= 1) return;
  const prevKey = setKey(week - 1, dayId, row.dataset.ex, Number(row.dataset.set));
  const prev = App.setsCache.get(prevKey);
  if (!prev || (prev.reps == null && prev.wt == null)) return;
  // ghost last week's values directly in the (empty) inputs
  if (prev.reps != null) row.querySelector('.f-reps').placeholder = prev.reps;
  if (prev.wt != null) row.querySelector('.f-wt').placeholder = fmtNum(prev.wt);
  const reps = row.querySelector('.f-reps').value;
  const wt = row.querySelector('.f-wt').value;
  if (reps !== '' || wt !== '') return;
  const txt = `${prev.reps != null ? prev.reps : '?'} × ${prev.wt != null ? fmtNum(prev.wt) + ' kg' : '–'}`;
  slot.innerHTML = `<button type="button" class="prefill-chip" data-reps="${prev.reps != null ? prev.reps : ''}"
      data-wt="${prev.wt != null ? prev.wt : ''}" data-rpe="${prev.rpe != null ? prev.rpe : ''}">
      ↙ last week: ${esc(txt)} — tap to use</button>`;
}

function updateRowStatus(row) {
  const done = row.querySelector('.f-done').classList.contains('on');
  const reps = row.querySelector('.f-reps').value;
  const wt = row.querySelector('.f-wt').value;
  const rpe = row.querySelector('.f-rpe').value;
  row.classList.toggle('st-done', done);
  row.classList.toggle('st-partial', !done && (reps !== '' || wt !== '' || rpe !== ''));
}

async function ensureSession(week, dayId) {
  const id = sessionKey(week, dayId);
  if (App.sessionCache && App.sessionCache.id === id) return App.sessionCache;
  let sess = await dbGet('sessions', id);
  if (!sess) {
    sess = { id, week, day: dayId, date: todayISO(), notes: '' };
    await dbPut('sessions', sess);
    const el = $('#session-date');
    if (el && !el.value) el.value = sess.date;
  }
  App.sessionCache = sess;
  return sess;
}

async function saveSetRow(row) {
  const week = Number(row.dataset.week);
  const dayId = row.dataset.day;
  const reps = parseNum(row.querySelector('.f-reps').value);
  const wt = parseNum(row.querySelector('.f-wt').value);
  const rpe = parseNum(row.querySelector('.f-rpe').value);
  const done = row.querySelector('.f-done').classList.contains('on');
  const id = row.dataset.key;

  if (reps == null && wt == null && rpe == null && !done) {
    App.setsCache.delete(id);
    await dbDelete('sets', id);
  } else {
    const rec = { id, week, day: dayId, ex: row.dataset.ex, set: Number(row.dataset.set), reps, wt, rpe, done, ts: Date.now() };
    App.setsCache.set(id, rec);
    await ensureSession(week, dayId);
    await dbPut('sets', rec);
  }
  updateRowStatus(row);
}

/* PR toast: fires when a just-ticked set beats the best e1RM ever logged for
   that exercise. First-ever data for an exercise sets the baseline silently
   (no toast-spam on day 1 of a new plan). */
function checkPR(row) {
  if (!App.prBest) return;
  const reps = parseNum(row.querySelector('.f-reps').value);
  const wt = parseNum(row.querySelector('.f-wt').value);
  if (!(reps > 0 && wt > 0)) return;
  const e1 = epley(wt, reps);
  const best = App.prBest.get(row.dataset.ex);
  if (!best) { App.prBest.set(row.dataset.ex, { e1 }); return; }
  if (e1 > best.e1 + 0.01) {
    best.e1 = e1;
    const name = row.querySelector('.ex-name').textContent;
    toast(`🎉 PR! ${name}: ${fmtNum(wt)} kg × ${fmtNum(reps)} → e1RM ≈ ${fmtNum(roundHalf(e1))} kg`, 4200);
    buzz([40, 60, 40]);
  }
}

/* --------------------------------------------------------------- maxes */

async function renderMaxes(app) {
  $('#topbar-title').textContent = 'Maxes';
  $('#topbar-back').hidden = false;

  const maxes = await dbGetAll('maxes');
  const maxMap = new Map(maxes.map(m => [m.id, m]));
  const allSets = await dbGetAll('sets');

  let cards = '';
  for (const lift of App.program.maxLifts) {
    const rec = maxMap.get(lift.id);
    const oneRM = rec ? rec.oneRM : null;
    const tm = oneRM != null ? roundHalf(oneRM * 0.9) : null;

    // best logged set suggestion
    let suggestion = '';
    const logged = allSets.filter(s => s.ex === lift.id && s.wt > 0 && s.reps >= 1 && s.reps <= 12);
    if (logged.length) {
      let best = null, bestE = 0;
      for (const s of logged) {
        const e = epley(s.wt, s.reps);
        if (e > bestE) { bestE = e; best = s; }
      }
      suggestion = `<div class="suggestion">
          Best logged: ${fmtNum(best.wt)} kg × ${best.reps} (W${best.week}) → e1RM ≈ <b>${fmtNum(roundHalf(bestE))} kg</b>
          <button type="button" class="btn small use-e1rm" data-lift="${esc(lift.id)}" data-v="${roundHalf(bestE)}">Use as 1RM</button>
        </div>`;
    }

    let tableRows = '';
    for (let p = 60; p <= 95; p += 5) {
      tableRows += `<tr><td>${p}%</td>
        <td>${oneRM != null ? fmtNum(roundHalf(oneRM * p / 100)) : '–'}</td>
        <td>${tm != null ? fmtNum(roundHalf(tm * p / 100)) : '–'}</td></tr>`;
    }

    cards += `<div class="card max-card" data-lift="${esc(lift.id)}">
      <div class="max-head">
        <span class="max-name">${esc(lift.name)}</span>
        <span class="tm">TM <b class="tm-val">${tm != null ? fmtNum(tm) + ' kg' : '—'}</b></span>
      </div>
      <label class="max-input-label">1RM (kg)
        <input type="number" class="f-onerm" inputmode="decimal" step="2.5" min="0"
               value="${oneRM != null ? oneRM : ''}" data-lift="${esc(lift.id)}" placeholder="kg">
      </label>
      ${suggestion}
      <details class="pct-details">
        <summary>Percentage table (60–95%)</summary>
        <table class="pct-table">
          <thead><tr><th>%</th><th>of 1RM</th><th>of TM</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </details>
    </div>`;
  }

  app.innerHTML = `
    <div class="card calc-card">
      <h2>Estimated 1RM calculator</h2>
      <div class="calc-inputs">
        <label>Weight (kg)<input type="number" id="calc-w" inputmode="decimal" step="2.5" min="0" placeholder="kg"></label>
        <label>Reps<input type="number" id="calc-r" inputmode="numeric" min="1" max="15" placeholder="reps"></label>
      </div>
      <div class="calc-results muted" id="calc-out">Enter weight × reps</div>
    </div>
    <p class="muted hint">Training Max = 90% of 1RM. Tables update as you type.</p>
    ${cards}`;
}

function recalcE1RM() {
  const w = parseNum($('#calc-w').value);
  const r = parseNum($('#calc-r').value);
  const out = $('#calc-out');
  if (w == null || r == null || r < 1 || r > 36) { out.textContent = 'Enter weight × reps'; return; }
  out.innerHTML = `Epley: <b>${fmtNum(roundHalf(epley(w, r)))} kg</b> &nbsp;·&nbsp; Brzycki: <b>${fmtNum(roundHalf(brzycki(w, r)))} kg</b>`;
}

async function saveMax(liftId, oneRM) {
  if (oneRM == null) {
    await dbDelete('maxes', liftId);
  } else {
    await dbPut('maxes', { id: liftId, oneRM });
  }
  // update TM + table in place
  const card = document.querySelector(`.max-card[data-lift="${liftId}"]`);
  if (!card) return;
  const tm = oneRM != null ? roundHalf(oneRM * 0.9) : null;
  card.querySelector('.tm-val').textContent = tm != null ? fmtNum(tm) + ' kg' : '—';
  const rows = card.querySelectorAll('.pct-table tbody tr');
  let p = 60;
  rows.forEach(tr => {
    const tds = tr.querySelectorAll('td');
    tds[1].textContent = oneRM != null ? fmtNum(roundHalf(oneRM * p / 100)) : '–';
    tds[2].textContent = tm != null ? fmtNum(roundHalf(tm * p / 100)) : '–';
    p += 5;
  });
}

/* ------------------------------------------------------------ progress */

/* display name for an exercise id, even if it's from a previous program */
function prettyName(exId) {
  const ex = findExercise(exId);
  if (ex) return ex.name;
  const lift = (App.program.maxLifts || []).find(l => l.id === exId);
  if (lift) return lift.name;
  return String(exId).replace(/^comp-/, '').split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function shortDate(iso) {
  if (!iso) return '';
  const p = String(iso).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.` : iso;
}

/* Progress is built from ALL logged data, independent of the active program,
   so history survives program swaps. */
async function renderProgress(app) {
  $('#topbar-title').textContent = 'Progress';
  $('#topbar-back').hidden = false;

  const [allSets, sessions, bw] = await Promise.all([
    dbGetAll('sets'), dbGetAll('sessions'), dbGetAll('bodyweight'),
  ]);
  const sessMap = new Map(sessions.map(s => [s.id, s]));
  const ordered = sessions.slice().sort((a, b) =>
    (a.date || '').localeCompare(b.date || '') || a.week - b.week || a.day.localeCompare(b.day));
  const sessIndex = new Map(ordered.map((s, i) => [s.id, i]));

  // per exercise: heaviest weight per session
  const byEx = new Map();
  for (const s of allSets) {
    if (!(s.wt > 0)) continue;
    const sid = `${s.week}|${s.day}`;
    if (!byEx.has(s.ex)) byEx.set(s.ex, new Map());
    const m = byEx.get(s.ex);
    m.set(sid, Math.max(m.get(sid) || 0, s.wt));
  }

  const orderedEx = [];
  for (const id of (App.program.progressLifts || [])) if (byEx.has(id)) orderedEx.push(id);
  for (const id of byEx.keys()) if (!orderedEx.includes(id)) orderedEx.push(id);

  let liftCards = '';
  for (const exId of orderedEx) {
    const entries = Array.from(byEx.get(exId).entries())
      .sort((a, b) => (sessIndex.has(a[0]) ? sessIndex.get(a[0]) : 999) - (sessIndex.has(b[0]) ? sessIndex.get(b[0]) : 999));
    const values = entries.map(e => e[1]);
    const labels = entries.map(e => {
      const sess = sessMap.get(e[0]);
      return sess && sess.date ? shortDate(sess.date) : 'W' + e[0].split('|')[0];
    });
    liftCards += `<div class="card chart-card">
        <h2>${esc(prettyName(exId))}</h2>
        ${barChartSvg(values, labels)}
      </div>`;
  }
  if (!liftCards) liftCards = '<div class="card"><p class="muted">No logged weights yet.</p></div>';

  // bodyweight: inputs for the active program's weeks, chart across all entries
  const bwMap = new Map(bw.map(b => [b.week, b.kg]));
  let bwInputs = '';
  for (let w = 1; w <= App.program.weeks; w++) {
    const v = bwMap.get(w);
    bwInputs += `<label class="bw-cell">W${w}
        <input type="number" class="f-bw" inputmode="decimal" step="0.1" min="0" data-week="${w}"
               value="${v != null ? v : ''}" placeholder="kg"></label>`;
  }
  const bwSorted = bw.slice().sort((a, b) => a.week - b.week);
  const bwChart = bwSorted.length
    ? lineChartSvg(bwSorted.map(b => b.kg), bwSorted.map(b => 'W' + b.week)) : '';

  // history: every session ever logged, newest first
  let hist = '';
  for (const sess of ordered.slice().reverse()) {
    const sets = allSets
      .filter(x => `${x.week}|${x.day}` === sess.id && (x.done || x.reps != null || x.wt != null))
      .sort((a, b) => a.ex.localeCompare(b.ex) || a.set - b.set);
    if (!sets.length && !sess.notes) continue;
    const day = getDay(sess.day);
    const dayName = day ? day.name : prettyName(sess.day);
    const lines = sets.map(x =>
      `<li>${esc(prettyName(x.ex))} S${x.set + 1}: ${x.reps != null ? x.reps : '–'} × ${x.wt != null ? fmtNum(x.wt) + ' kg' : '–'}${x.rpe != null ? ' @' + x.rpe : ''}${x.done ? ' ✓' : ''}</li>`).join('');
    hist += `<details class="hist-item">
        <summary>${esc(sess.date || 'W' + sess.week)} · ${esc(dayName)} (W${sess.week}) — ${sets.length} sets</summary>
        <ul>${lines}</ul>
        ${sess.notes ? `<p class="hist-notes">${esc(sess.notes)}</p>` : ''}
      </details>`;
  }

  app.innerHTML = `
    <p class="muted hint">Heaviest logged weight per session — across all training blocks.</p>
    ${liftCards}
    <div class="card chart-card">
      <h2>Bodyweight (kg)</h2>
      <div class="bw-grid">${bwInputs}</div>
      <div id="bw-chart">${bwChart}</div>
    </div>
    <div class="card">
      <h2>History</h2>
      ${hist || '<p class="muted">No sessions logged yet.</p>'}
    </div>`;
}

function barChartSvg(values, labels) {
  const W = 320, H = 150, pad = 6, bottom = 18;
  const max = Math.max(...values.filter(v => v != null)) || 1;
  const n = values.length;
  const bw = (W - pad * 2) / n;
  let bars = '';
  values.forEach((v, i) => {
    const x = pad + i * bw;
    if (v != null) {
      const h = Math.max(3, (H - bottom - 24) * v / max);
      const y = H - bottom - h;
      bars += `<rect x="${(x + bw * 0.15).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" rx="4" class="bar"/>
        <text x="${(x + bw / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" class="bar-val" text-anchor="middle">${fmtNum(v)}</text>`;
    }
    const lab = labels ? labels[i] : 'W' + (i + 1);
    bars += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 4}" class="bar-lab" text-anchor="middle">${esc(lab)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="progress chart">${bars}</svg>`;
}

function lineChartSvg(values, labels) {
  const W = 320, H = 130, pad = 14, bottom = 18;
  const present = values.filter(v => v != null);
  if (!present.length) return '';
  const min = Math.min(...present), max = Math.max(...present);
  const span = (max - min) || 1;
  const n = values.length;
  const xs = i => n === 1 ? W / 2 : pad + i * (W - pad * 2) / (n - 1);
  const ys = v => 14 + (H - bottom - 28) * (1 - (v - min) / span);
  let pts = [], dots = '', labs = '';
  values.forEach((v, i) => {
    const lab = labels ? labels[i] : 'W' + (i + 1);
    labs += `<text x="${xs(i).toFixed(1)}" y="${H - 4}" class="bar-lab" text-anchor="middle">${esc(lab)}</text>`;
    if (v == null) return;
    pts.push(`${xs(i).toFixed(1)},${ys(v).toFixed(1)}`);
    dots += `<circle cx="${xs(i).toFixed(1)}" cy="${ys(v).toFixed(1)}" r="4" class="dot"/>
      <text x="${xs(i).toFixed(1)}" y="${(ys(v) - 8).toFixed(1)}" class="bar-val" text-anchor="middle">${fmtNum(v)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="bodyweight chart">
    <polyline points="${pts.join(' ')}" class="line"/>${dots}${labs}</svg>`;
}

/* ---------------------------------------------------------------- data */

/* completed = every set of the session is checked done.
   Expected set count comes from the active program's day; if the session is from
   an old/other block not in the active program, fall back to "all logged sets done". */
function completedSessions(sets, sessions) {
  const byId = new Map();   // sessId -> {total, done}
  for (const s of sets) {
    const id = `${s.week}|${s.day}`;
    if (!byId.has(id)) byId.set(id, { total: 0, done: 0 });
    const c = byId.get(id);
    c.total++;
    if (s.done) c.done++;
  }
  const out = [];
  for (const sess of sessions) {
    const c = byId.get(sess.id);
    if (!c || c.total === 0) continue;
    const day = getDay(sess.day);
    let expected = null;
    if (day) { expected = 0; forEachSet(dayForWeek(day, sess.week), () => expected++); }
    const complete = expected != null
      ? (c.done >= expected && c.done === c.total)   // active block: all prescribed + all logged done
      : (c.done === c.total);                        // foreign block: all logged sets done
    if (complete) out.push({ sess, doneCount: c.done });
  }
  out.sort((a, b) => (b.sess.date || '').localeCompare(a.sess.date || '')
    || b.sess.week - a.sess.week || a.sess.day.localeCompare(b.sess.day));
  return out;
}

function archiveItemsHtml(sets, sessions) {
  const done = completedSessions(sets, sessions);
  let items = '';
  for (const { sess, doneCount } of done) {
    const day = getDay(sess.day);
    const dayName = day ? day.name : prettyName(sess.day);
    const rows = sets
      .filter(x => `${x.week}|${x.day}` === sess.id)
      .sort((a, b) => a.ex.localeCompare(b.ex) || a.set - b.set)
      .map(x => `<li>${esc(prettyName(x.ex))} S${x.set + 1}: ${x.reps != null ? x.reps : '–'} × ${x.wt != null ? fmtNum(x.wt) + ' kg' : '–'}${x.rpe != null ? ' @' + x.rpe : ''} ✓</li>`)
      .join('');
    items += `<details class="archive-item">
        <summary>
          <span class="arc-name">🏆 ${esc(dayName)}</span>
          <span class="arc-date">${esc(sess.date || 'W' + sess.week)}</span>
          <span class="arc-count">${doneCount} Sätze</span>
        </summary>
        <ul>${rows}</ul>
        ${sess.notes ? `<p class="hist-notes">${esc(sess.notes)}</p>` : ''}
      </details>`;
  }
  return { items, count: done.length };
}

/* Full-page archive (own route #/archive, reached from the Data tab). */
async function renderArchive(app) {
  $('#topbar-title').textContent = 'Archiv';
  $('#topbar-back').hidden = false;

  const [sets, sessions] = await Promise.all([dbGetAll('sets'), dbGetAll('sessions')]);
  const { items, count } = archiveItemsHtml(sets, sessions);

  app.innerHTML = `
    <p class="muted hint">${count} vollständig abgeschlossene Trainings (alle Sätze ✓), neueste zuerst. Antippen für Details.</p>
    <div class="card">
      ${items || '<p class="muted">Noch keine abgeschlossenen Trainings.</p>'}
    </div>`;
}

/* Built-in exercise catalog — common lifts grouped by equipment. Static reference
   shown in the Exercises tab; sits alongside exercises harvested from imported programs.
   Ids are namespaced "cat-*" so they never collide with program exercise ids. */
const EXERCISE_CATALOG = [
  // Barbell
  { id: 'cat-bb-back-squat', name: 'Back Squat', equipment: 'Barbell' },
  { id: 'cat-bb-front-squat', name: 'Front Squat', equipment: 'Barbell' },
  { id: 'cat-bb-bench-press', name: 'Bench Press', equipment: 'Barbell' },
  { id: 'cat-bb-incline-bench', name: 'Incline Bench Press', equipment: 'Barbell' },
  { id: 'cat-bb-ohp', name: 'Overhead Press', equipment: 'Barbell' },
  { id: 'cat-bb-push-press', name: 'Push Press', equipment: 'Barbell' },
  { id: 'cat-bb-deadlift', name: 'Deadlift', equipment: 'Barbell' },
  { id: 'cat-bb-rdl', name: 'Romanian Deadlift', equipment: 'Barbell' },
  { id: 'cat-bb-row', name: 'Bent-Over Row', equipment: 'Barbell' },
  { id: 'cat-bb-pendlay-row', name: 'Pendlay Row', equipment: 'Barbell' },
  { id: 'cat-bb-hip-thrust', name: 'Hip Thrust', equipment: 'Barbell' },
  { id: 'cat-bb-good-morning', name: 'Good Morning', equipment: 'Barbell' },
  { id: 'cat-bb-lunge', name: 'Barbell Lunge', equipment: 'Barbell' },
  { id: 'cat-bb-power-clean', name: 'Power Clean', equipment: 'Barbell' },
  { id: 'cat-bb-curl', name: 'Barbell Curl', equipment: 'Barbell' },
  // Dumbbell
  { id: 'cat-db-bench', name: 'DB Bench Press', equipment: 'Dumbbell' },
  { id: 'cat-db-incline', name: 'DB Incline Press', equipment: 'Dumbbell' },
  { id: 'cat-db-shoulder-press', name: 'DB Shoulder Press', equipment: 'Dumbbell' },
  { id: 'cat-db-row', name: 'One-Arm DB Row', equipment: 'Dumbbell' },
  { id: 'cat-db-rdl', name: 'DB Romanian Deadlift', equipment: 'Dumbbell' },
  { id: 'cat-db-bulgarian', name: 'DB Bulgarian Split Squat', equipment: 'Dumbbell' },
  { id: 'cat-db-walking-lunge', name: 'DB Walking Lunge', equipment: 'Dumbbell' },
  { id: 'cat-db-step-up', name: 'DB Step-Up', equipment: 'Dumbbell' },
  { id: 'cat-db-lateral-raise', name: 'DB Lateral Raise', equipment: 'Dumbbell' },
  { id: 'cat-db-rear-fly', name: 'DB Rear-Delt Fly', equipment: 'Dumbbell' },
  { id: 'cat-db-curl', name: 'DB Curl', equipment: 'Dumbbell' },
  { id: 'cat-db-hammer-curl', name: 'DB Hammer Curl', equipment: 'Dumbbell' },
  { id: 'cat-db-triceps-ext', name: 'DB Triceps Extension', equipment: 'Dumbbell' },
  { id: 'cat-db-floor-press', name: 'DB Floor Press', equipment: 'Dumbbell' },
  { id: 'cat-db-pullover', name: 'DB Pullover', equipment: 'Dumbbell' },
  // Kettlebell
  { id: 'cat-kb-swing', name: 'KB Swing', equipment: 'Kettlebell' },
  { id: 'cat-kb-goblet-squat', name: 'Goblet Squat', equipment: 'Kettlebell' },
  { id: 'cat-kb-clean', name: 'KB Clean', equipment: 'Kettlebell' },
  { id: 'cat-kb-clean-press', name: 'KB Clean & Press', equipment: 'Kettlebell' },
  { id: 'cat-kb-press', name: 'KB Strict Press', equipment: 'Kettlebell' },
  { id: 'cat-kb-snatch', name: 'KB Snatch', equipment: 'Kettlebell' },
  { id: 'cat-kb-tgu', name: 'Turkish Get-Up', equipment: 'Kettlebell' },
  { id: 'cat-kb-rdl', name: 'KB Romanian Deadlift', equipment: 'Kettlebell' },
  { id: 'cat-kb-row', name: 'KB Row', equipment: 'Kettlebell' },
  { id: 'cat-kb-front-rack-carry', name: 'KB Front-Rack Carry', equipment: 'Kettlebell' },
  { id: 'cat-kb-suitcase-carry', name: 'KB Suitcase Carry', equipment: 'Kettlebell' },
  { id: 'cat-kb-reverse-lunge', name: 'KB Reverse Lunge', equipment: 'Kettlebell' },
  { id: 'cat-kb-halo', name: 'KB Halo', equipment: 'Kettlebell' },
  { id: 'cat-kb-windmill', name: 'KB Windmill', equipment: 'Kettlebell' },
  // Trap-bar
  { id: 'cat-tb-deadlift', name: 'Trap-Bar Deadlift', equipment: 'Trap-bar' },
  { id: 'cat-tb-rdl', name: 'Trap-Bar Romanian Deadlift', equipment: 'Trap-bar' },
  { id: 'cat-tb-shrug', name: 'Trap-Bar Shrug', equipment: 'Trap-bar' },
  { id: 'cat-tb-farmers-carry', name: "Trap-Bar Farmer's Carry", equipment: 'Trap-bar' },
  { id: 'cat-tb-jump', name: 'Trap-Bar Jump', equipment: 'Trap-bar' },
  { id: 'cat-tb-row', name: 'Trap-Bar Bent-Over Row', equipment: 'Trap-bar' },
  { id: 'cat-tb-lunge', name: 'Trap-Bar Lunge', equipment: 'Trap-bar' },
  { id: 'cat-tb-calf-raise', name: 'Trap-Bar Calf Raise', equipment: 'Trap-bar' },
  { id: 'cat-tb-ohp', name: 'Trap-Bar Overhead Press', equipment: 'Trap-bar' },
  // Plyometric — Jumps
  { id: 'cat-jump-box', name: 'Box Jump', equipment: 'Jumps' },
  { id: 'cat-jump-broad', name: 'Broad Jump', equipment: 'Jumps' },
  { id: 'cat-jump-depth', name: 'Depth Jump', equipment: 'Jumps' },
  { id: 'cat-jump-squat', name: 'Squat Jump', equipment: 'Jumps' },
  { id: 'cat-jump-tuck', name: 'Tuck Jump', equipment: 'Jumps' },
  { id: 'cat-jump-vertical', name: 'Vertical Jump', equipment: 'Jumps' },
  { id: 'cat-jump-split-squat', name: 'Split-Squat Jump', equipment: 'Jumps' },
  { id: 'cat-jump-lateral-bound', name: 'Lateral Bound', equipment: 'Jumps' },
  { id: 'cat-jump-single-leg-bound', name: 'Single-Leg Bound', equipment: 'Jumps' },
  { id: 'cat-jump-pogo', name: 'Pogo Hops', equipment: 'Jumps' },
  { id: 'cat-jump-hurdle', name: 'Hurdle Hops', equipment: 'Jumps' },
  // Plyometric — Throws (med ball)
  { id: 'cat-throw-chest-pass', name: 'Med Ball Chest Pass', equipment: 'Throws' },
  { id: 'cat-throw-overhead', name: 'Med Ball Overhead Throw', equipment: 'Throws' },
  { id: 'cat-throw-rotational', name: 'Med Ball Rotational Throw', equipment: 'Throws' },
  { id: 'cat-throw-scoop', name: 'Med Ball Scoop Toss', equipment: 'Throws' },
  { id: 'cat-throw-shot-put', name: 'Med Ball Shot Put', equipment: 'Throws' },
  { id: 'cat-throw-backward-overhead', name: 'Med Ball Backward Overhead Throw', equipment: 'Throws' },
  { id: 'cat-throw-side', name: 'Med Ball Side Throw', equipment: 'Throws' },
  { id: 'cat-throw-push-press', name: 'Med Ball Push-Press Throw', equipment: 'Throws' },
  { id: 'cat-throw-kneeling-overhead', name: 'Kneeling Overhead Throw', equipment: 'Throws' },
  // Plyometric — Slams
  { id: 'cat-slam-overhead', name: 'Overhead Med Ball Slam', equipment: 'Slams' },
  { id: 'cat-slam-rotational', name: 'Rotational Slam', equipment: 'Slams' },
  { id: 'cat-slam-side', name: 'Side-to-Side Slam', equipment: 'Slams' },
  { id: 'cat-slam-half-kneeling', name: 'Half-Kneeling Slam', equipment: 'Slams' },
  { id: 'cat-slam-wall-ball', name: 'Wall Ball Slam', equipment: 'Slams' },
  { id: 'cat-slam-squat', name: 'Squat-to-Slam', equipment: 'Slams' },
];

const EQUIPMENT_GROUPS = [
  { key: 'Barbell', icon: '🏋️' },
  { key: 'Dumbbell', icon: '💪' },
  { key: 'Kettlebell', icon: '🔔' },
  { key: 'Trap-bar', icon: '🔷' },
  { key: 'Jumps', icon: '🦘' },
  { key: 'Throws', icon: '🤾' },
  { key: 'Slams', icon: '💥' },
];

/* Exercise library — built-in catalog grouped by equipment, plus every exercise
   harvested from imported programs. Read-only; future basis for a session builder. */
async function renderExercises(app) {
  $('#topbar-title').textContent = 'Exercises';
  $('#topbar-back').hidden = false;

  const harvested = (await dbGetAll('exercises'))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  let catHtml = '';
  for (const g of EQUIPMENT_GROUPS) {
    const ex = EXERCISE_CATALOG.filter(e => e.equipment === g.key);
    if (!ex.length) continue;
    const rows = ex.map(e =>
      `<div class="exlib-row"><span class="exlib-name">${esc(e.name)}</span></div>`).join('');
    catHtml += `<div class="card exlib-group">
        <h2>${g.icon} ${esc(g.key)} <span class="exlib-count">${ex.length}</span></h2>
        ${rows}
      </div>`;
  }

  let progHtml = '';
  if (harvested.length) {
    let items = '';
    for (const ex of harvested) {
      const bits = [];
      if (ex.lastReps != null) bits.push(`${esc(ex.lastReps)} reps`);
      if (ex.lastRpe != null) bits.push(`RPE ${esc(ex.lastRpe)}`);
      if (ex.lastWeight != null) bits.push(`${fmtNum(ex.lastWeight)} kg`);
      const target = bits.length ? bits.join(' · ') : 'kein Zielwert';
      const progs = (ex.programs || []).map(esc).join(', ');
      items += `<details class="exlib-item">
          <summary>
            <span class="exlib-name">${esc(ex.name)}</span>
            <span class="exlib-target">${target}</span>
          </summary>
          <div class="exlib-detail">
            <div>Zuletzt: ${target}</div>
            <div class="muted">Aus Programm: ${progs || '—'}</div>
          </div>
        </details>`;
    }
    progHtml = `<div class="card exlib-group">
        <h2>📋 Aus deinen Programmen <span class="exlib-count">${harvested.length}</span></h2>
        ${items}
      </div>`;
  }

  app.innerHTML = `
    <p class="muted hint">Übungsbibliothek — ${EXERCISE_CATALOG.length} Standardübungen nach Kategorie${harvested.length ? ` + ${harvested.length} aus deinen Programmen` : ''}.</p>
    ${catHtml}
    ${progHtml}`;
}

/* -------------------------------------------------------------- plans */

function genId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function planSlug(name) {
  return String(name || 'plan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'plan';
}

function blankDay(n) {
  return {
    id: `day-${n}`, name: `Tag ${n}`, title: `Tag ${n}`,
    warmup: { title: 'Warmup & Mobility', items: [] },
    plyo: { title: 'Plyometrics & Priming', items: [] },
    blocks: [],
  };
}

function blankPlan(name) {
  const now = Date.now();
  const nm = name || 'Neuer Plan';
  return {
    id: genId('plan'), name: nm, createdAt: now, updatedAt: now,
    program: { id: genId('prog'), name: nm, weeks: 1, maxLifts: [], progressLifts: [], days: [blankDay(1)] },
  };
}

async function getPlans() {
  return (await dbGetAll('plans')).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

async function activePlanId() {
  const rec = await dbGet('kv', 'activePlanId');
  return rec ? rec.value : null;
}

/* seed the library with the active program the first time the feature runs */
async function seedPlansIfEmpty() {
  if ((await dbGetAll('plans')).length || !App.program) return;
  const now = Date.now();
  const plan = { id: genId('plan'), name: App.program.name || 'Programm', createdAt: now, updatedAt: now, program: App.program };
  await dbPut('plans', plan);
  await dbPut('kv', { key: 'activePlanId', value: plan.id });
}

async function activatePlan(plan) {
  await dbPut('kv', { key: 'program', value: plan.program });
  await dbPut('kv', { key: 'activePlanId', value: plan.id });
  App.program = plan.program;
  await harvestExercises(plan.program);
  toast(`„${plan.name}" aktiviert ✓`);
  location.hash = '#/';
}

async function duplicatePlan(plan) {
  const now = Date.now();
  const copy = {
    id: genId('plan'), name: plan.name + ' (Kopie)', createdAt: now, updatedAt: now,
    program: JSON.parse(JSON.stringify(plan.program)),
  };
  copy.program.id = genId('prog');
  await dbPut('plans', copy);
}

function exportPlan(plan) {
  download(`${planSlug(plan.name)}.json`, JSON.stringify(plan.program, null, 2), 'application/json');
  toast('Plan als .json exportiert ✓');
}

async function renderPlans(app) {
  $('#topbar-title').textContent = 'Plans';
  $('#topbar-back').hidden = true;
  App.editPlan = null;
  const [plans, activeId] = await Promise.all([getPlans(), activePlanId()]);

  let cards = '';
  for (const plan of plans) {
    const p = plan.program || {};
    const dc = (p.days || []).length;
    const active = plan.id === activeId;
    cards += `<div class="card plan-card" data-id="${esc(plan.id)}">
        <div class="plan-head">
          <span class="plan-name">${esc(plan.name)}</span>
          ${active ? '<span class="plan-active">Aktiv</span>' : ''}
        </div>
        <div class="plan-meta">${p.weeks || 1} Wochen · ${dc} ${dc === 1 ? 'Tag' : 'Tage'}</div>
        <div class="plan-actions">
          ${active ? '' : '<button type="button" class="btn small plan-activate">Aktivieren</button>'}
          <button type="button" class="btn small plan-edit">Bearbeiten</button>
          <button type="button" class="btn small plan-dup">Duplizieren</button>
          <button type="button" class="btn small plan-export">.json</button>
          <button type="button" class="btn small danger plan-del">Löschen</button>
        </div>
      </div>`;
  }

  app.innerHTML = `
    <p class="muted hint">Baue, benenne und aktiviere deine Trainingspläne — genau ein Plan ist aktiv.</p>
    <a class="btn accent block" href="#/plans/new">+ Neuer Plan</a>
    ${cards || '<div class="card"><p class="muted">Noch keine Pläne. Erstelle einen oder importiere (Data → importieren).</p></div>'}`;

  const byId = new Map(plans.map(p => [p.id, p]));
  $$('.plan-card').forEach(card => {
    const plan = byId.get(card.dataset.id);
    const q = s => card.querySelector(s);
    const a = q('.plan-activate'); if (a) a.addEventListener('click', () => activatePlan(plan));
    q('.plan-edit').addEventListener('click', () => { location.hash = `#/plans/edit/${plan.id}`; });
    q('.plan-dup').addEventListener('click', async () => { await duplicatePlan(plan); toast('Dupliziert ✓'); render(); });
    q('.plan-export').addEventListener('click', () => exportPlan(plan));
    q('.plan-del').addEventListener('click', async () => {
      if (!confirm(`Plan „${plan.name}" löschen?`)) return;
      await dbDelete('plans', plan.id); toast('Gelöscht'); render();
    });
  });
}

async function renderPlanSetup(app, id) {
  const key = id || '__new__';
  if (!App.editPlan || App.editPlan._key !== key) {
    const loaded = id ? await dbGet('plans', id) : blankPlan('');
    if (id && !loaded) { location.hash = '#/plans'; return; }
    loaded._key = key;
    App.editPlan = loaded;
  }
  const plan = App.editPlan;
  const p = plan.program;
  $('#topbar-title').textContent = id ? 'Plan bearbeiten' : 'Neuer Plan';
  $('#topbar-back').hidden = false;

  const dayRows = (p.days || []).map((d, i) =>
    `<div class="setup-day-row">
       <input type="text" class="f-dayname" data-i="${i}" value="${esc(d.name || '')}" placeholder="Tag ${i + 1} — z.B. Lower">
       <button type="button" class="btn small day-edit-btn" data-i="${i}">Übungen ›</button>
     </div>`).join('');

  app.innerHTML = `
    <div class="card">
      <label class="setup-label">Name
        <input type="text" id="plan-name" value="${esc(plan.name || '')}" placeholder="z.B. Hypertrophy Block">
      </label>
      <div class="setup-row">
        <span>Wochen</span>
        <div class="setup-stepper">
          <button type="button" class="step2" data-f="weeks" data-d="-1" aria-label="minus">−</button>
          <span id="plan-weeks">${p.weeks || 1}</span>
          <button type="button" class="step2" data-f="weeks" data-d="1" aria-label="plus">+</button>
        </div>
      </div>
      <div class="setup-row">
        <span>Trainingstage</span>
        <div class="setup-stepper">
          <button type="button" class="step2" data-f="days" data-d="-1" aria-label="minus">−</button>
          <span id="plan-days">${(p.days || []).length}</span>
          <button type="button" class="step2" data-f="days" data-d="1" aria-label="plus">+</button>
        </div>
      </div>
      <div class="setup-days">${dayRows}</div>
      <p class="muted hint">Tippe „Übungen" je Tag, um den Hauptteil zu füllen.</p>
      <div class="btn-row">
        <button type="button" class="btn accent" id="plan-save">Speichern</button>
        <a class="btn" href="#/plans">Abbrechen</a>
      </div>
    </div>`;

  const nameI = $('#plan-name');
  nameI.addEventListener('input', () => { plan.name = nameI.value; p.name = nameI.value; });
  $$('.f-dayname').forEach(inp => inp.addEventListener('input', () => {
    const d = p.days[Number(inp.dataset.i)];
    if (d) { d.name = inp.value; d.title = inp.value; }
  }));
  $$('.step2').forEach(b => b.addEventListener('click', () => {
    const f = b.dataset.f, d = Number(b.dataset.d);
    if (f === 'weeks') p.weeks = Math.max(1, Math.min(20, (p.weeks || 1) + d));
    else {
      const cur = p.days.length, next = Math.max(1, Math.min(7, cur + d));
      if (next > cur) for (let n = cur + 1; n <= next; n++) p.days.push(blankDay(n));
      else if (next < cur) p.days.length = next;
    }
    renderPlanSetup(app, id);
  }));
  $$('.day-edit-btn').forEach(btn => btn.addEventListener('click', async () => {
    plan.updatedAt = Date.now();
    await dbPut('plans', { id: plan.id, name: plan.name, createdAt: plan.createdAt, updatedAt: plan.updatedAt, program: p });
    if (await activePlanId() === plan.id) { await dbPut('kv', { key: 'program', value: p }); App.program = p; }
    App.dayCtx = null;
    location.hash = `#/plans/day/${plan.id}/${btn.dataset.i}`;
  }));
  $('#plan-save').addEventListener('click', async () => {
    if (!plan.name || !plan.name.trim()) { toast('Bitte Name eingeben'); return; }
    plan.updatedAt = Date.now();
    const out = { id: plan.id, name: plan.name, createdAt: plan.createdAt, updatedAt: plan.updatedAt, program: p };
    await dbPut('plans', out);
    if (await activePlanId() === plan.id) { await dbPut('kv', { key: 'program', value: p }); App.program = p; }
    App.editPlan = null;
    toast('Gespeichert ✓');
    location.hash = '#/plans';
  });
}

/* --------------------------------------------------------- day editor */

function makeSets(n, t) {
  return Array.from({ length: Math.max(1, n || 1) }, () => ({
    reps: t.reps || '', rpe: t.rpe != null ? t.rpe : null, weight: t.weight != null ? t.weight : null,
  }));
}

/* Epley/RIR estimate: target weight for `reps` at `rpe`, given a 1RM (reps-to-failure = reps + RIR) */
function rpeWeight(oneRM, reps, rpe) {
  if (!(oneRM > 0) || !(reps > 0) || rpe == null) return null;
  const total = reps + (10 - rpe);
  return total <= 1 ? oneRM : oneRM / (1 + total / 30);
}

/* flatten a blocks array into a flat, editable item list */
function itemsFromDay(day) { return itemsFromBlocks(day.blocks || []); }
function itemsFromBlocks(blocks) {
  const items = [];
  for (const block of (blocks || [])) {
    const rest = { auto: !!(block.rest && block.rest.auto), sec: (block.rest && block.rest.sec) || 90 };
    (block.exercises || []).forEach((ex, idx) => {
      if (block.type === 'superset') {
        const t = ex.target || {};
        items.push({ exId: ex.id, name: ex.name, sets: block.rounds || 3,
          reps: t.reps != null ? String(t.reps) : '', rpe: t.rpe != null ? t.rpe : null,
          weight: t.weight != null ? t.weight : null, ss: idx > 0, rest: { auto: rest.auto, sec: rest.sec } });
      } else {
        const sets = ex.sets || [];
        const t = sets[0] || {};
        items.push({ exId: ex.id, name: ex.name, sets: sets.length || 3,
          reps: t.reps != null ? String(t.reps) : '', rpe: t.rpe != null ? t.rpe : null,
          weight: t.weight != null ? t.weight : null, ss: false, rest: { auto: rest.auto, sec: rest.sec } });
      }
    });
  }
  return items;
}

/* rebuild straight/superset blocks from the flat item list (ss = grouped with previous) */
function buildBlocksFromItems(items) {
  const blocks = [];
  let cur = null;
  items.forEach((it, i) => {
    const target = { reps: it.reps || '', rpe: it.rpe != null ? it.rpe : null, weight: it.weight != null ? it.weight : null };
    if (it.ss && cur && i > 0) {
      if (cur.type === 'straight') {
        const first = cur.exercises[0];
        cur = { id: cur.id, type: 'superset', rounds: (first.sets && first.sets.length) || it.sets || 3, rest: cur.rest,
          exercises: [{ id: first.id, label: '', name: first.name, target: first._t },
                      { id: it.exId, label: '', name: it.name, target }] };
      } else {
        cur.exercises.push({ id: it.exId, label: '', name: it.name, target });
      }
    } else {
      if (cur) blocks.push(cur);
      cur = { id: genId('blk'), type: 'straight', rest: { auto: !!(it.rest && it.rest.auto), sec: (it.rest && it.rest.sec) || 90 },
        exercises: [{ id: it.exId, label: '', name: it.name, sets: makeSets(it.sets, target), _t: target }] };
    }
  });
  if (cur) blocks.push(cur);
  const letters = 'abcdefgh';
  blocks.forEach((b, bi) => b.exercises.forEach((ex, ei) => {
    ex.label = b.type === 'superset' ? `${bi + 1}${letters[ei] || ''}` : `${bi + 1}`;
    delete ex._t;
  }));
  return blocks;
}

async function renderDayEditor(app, planId, dayIdx) {
  const plan = (App.editPlan && App.editPlan.id === planId) ? App.editPlan : await dbGet('plans', planId);
  if (!plan) { location.hash = '#/plans'; return; }
  App.editPlan = plan;
  const day = (plan.program.days || [])[dayIdx];
  if (!day) { location.hash = `#/plans/edit/${planId}`; return; }
  const ctxKey = `${planId}|${dayIdx}`;
  const indepW = w => !!(day.weekOverride && day.weekOverride[w]);
  const loadSections = w => {
    const sd = indepW(w) ? day.weekOverride[w] : day;
    App.daySections = {
      warmup: ((sd.warmup && sd.warmup.items) || []).map(it => typeof it === 'string' ? it : (it.name || '')),
      plyo: itemsFromBlocks((sd.plyo && sd.plyo.blocks) || []),
      main: itemsFromBlocks(sd.blocks || []),
    };
    const overlay = indepW(w) ? null : (day.weekTargets || {});
    for (const sk of ['plyo', 'main']) for (const it of App.daySections[sk]) {
      it.wk = {};
      if (overlay) for (const k of Object.keys(overlay)) { if (overlay[k] && overlay[k][it.exId]) it.wk[Number(k)] = Object.assign({}, overlay[k][it.exId]); }
    }
  };
  const flushSections = w => {
    const Sx = App.daySections;
    const prev = indepW(w) ? day.weekOverride[w] : day;
    const warm = { title: (prev.warmup && prev.warmup.title) || 'Aufwärmen & Mobility', items: Sx.warmup.filter(s => s && s.trim()) };
    if (indepW(w)) {
      day.weekOverride[w] = {
        warmup: warm,
        plyo: { title: (prev.plyo && prev.plyo.title) || 'Plyometrie & Priming', blocks: buildBlocksFromItems(Sx.plyo) },
        blocks: buildBlocksFromItems(Sx.main),
      };
    } else {
      day.warmup = warm;
      if (Sx.plyo.length) day.plyo = { title: (day.plyo && day.plyo.title) || 'Plyometrie & Priming', blocks: buildBlocksFromItems(Sx.plyo) };
      else if (!(day.plyo && day.plyo.items && day.plyo.items.length)) day.plyo = { title: (day.plyo && day.plyo.title) || 'Plyometrie & Priming', blocks: [] };
      day.blocks = buildBlocksFromItems(Sx.main);
      const weekTargets = {};
      for (const it of [...Sx.plyo, ...Sx.main]) { if (it.wk) for (const k of Object.keys(it.wk)) { const tt = it.wk[k]; weekTargets[k] = weekTargets[k] || {}; weekTargets[k][it.exId] = { reps: tt.reps, rpe: tt.rpe, weight: tt.weight }; } }
      day.weekTargets = weekTargets;
    }
  };
  if (!App.dayCtx || App.dayCtx.key !== ctxKey) {
    App.dayCtx = { key: ctxKey, planId, dayIdx };
    App.dayWeek = 1;
    loadSections(1);
    const maxMap = new Map((await dbGetAll('maxes')).map(m => [m.id, m.oneRM]));
    const nm = new Map();
    for (const l of [...(App.program.maxLifts || []), ...((plan.program && plan.program.maxLifts) || [])]) {
      const v = maxMap.get(l.id);
      if (v != null && l.name) nm.set(l.name.toLowerCase(), v);
    }
    App.dayMaxes = nm;
  }
  const S = App.daySections;
  $('#topbar-title').textContent = day.name || `Tag ${dayIdx + 1}`;
  $('#topbar-back').hidden = false;

  const rpeOpts = sel => { let h = '<option value="">RPE</option>'; for (let v = 6; v <= 10; v += 0.5) h += `<option value="${v}" ${sel === v ? 'selected' : ''}>${v}</option>`; return h; };
  const lookup1RM = name => {
    const n = (name || '').toLowerCase(); const m = App.dayMaxes || new Map();
    if (m.has(n)) return m.get(n);
    for (const [k, v] of m) { if (k && (k.includes(n) || n.includes(k))) return v; }
    return null;
  };
  const W = App.dayWeek || 1;
  const indep = indepW(W);
  const baseMode = W === 1 || indep;
  const tw = it => baseMode ? { reps: it.reps, rpe: it.rpe, weight: it.weight } : Object.assign({ reps: it.reps, rpe: it.rpe, weight: it.weight }, (it.wk && it.wk[W]) || {});
  const setT = (it, key, val) => {
    if (baseMode) { it[key] = val; }
    else { it.wk = it.wk || {}; it.wk[W] = it.wk[W] || { reps: it.reps, rpe: it.rpe, weight: it.weight }; it.wk[W][key] = val; }
  };
  const exRows = (arr, sec) => arr.map((it, i) => {
    const t = tw(it);
    const auto1 = lookup1RM(it.name);
    const eff1 = it.oneRM != null ? it.oneRM : auto1;
    const repsN = firstNumber(t.reps);
    const sugg = (eff1 > 0 && repsN > 0 && t.rpe != null) ? roundHalf(rpeWeight(eff1, repsN, t.rpe)) : null;
    return `
    <div class="ex-item">
      <div class="ex-item-top">
        <span class="ex-item-name">${esc(it.name)}</span>
        <span class="ex-item-tools">
          <button type="button" class="ic up" data-sec="${sec}" data-i="${i}" aria-label="hoch">↑</button>
          <button type="button" class="ic down" data-sec="${sec}" data-i="${i}" aria-label="runter">↓</button>
          <button type="button" class="ic rm" data-sec="${sec}" data-i="${i}" aria-label="entfernen">✕</button>
        </span>
      </div>
      ${i > 0 ? `<label class="ss-toggle"><input type="checkbox" class="f-ss" data-sec="${sec}" data-i="${i}" ${it.ss ? 'checked' : ''}> Superset mit vorheriger</label>` : ''}
      <div class="ex-item-fields">
        <label>Sätze<span class="mini-step"><button type="button" class="ic sdec" data-sec="${sec}" data-i="${i}">−</button><b>${it.sets}</b><button type="button" class="ic sinc" data-sec="${sec}" data-i="${i}">+</button></span></label>
        <label>Reps<input type="text" class="f-er" data-sec="${sec}" data-i="${i}" value="${esc(t.reps)}" placeholder="8"></label>
        <label>RPE<select class="f-erpe" data-sec="${sec}" data-i="${i}">${rpeOpts(t.rpe)}</select></label>
        <label>kg<input type="number" class="f-ewt" data-sec="${sec}" data-i="${i}" step="2.5" value="${t.weight != null ? t.weight : ''}" placeholder="opt"></label>
        <label>1RM<input type="number" class="f-e1rm" data-sec="${sec}" data-i="${i}" step="2.5" value="${it.oneRM != null ? it.oneRM : ''}" placeholder="${auto1 != null ? fmtNum(auto1) : 'opt'}"></label>
      </div>
      ${sugg != null ? `<div class="rpe-sugg"><span>RPE ${t.rpe} × ${esc(t.reps)} ≈ <b>${fmtNum(sugg)} kg</b></span><button type="button" class="kg-apply" data-sec="${sec}" data-i="${i}" data-v="${sugg}">Übernehmen</button></div>` : ''}
      <div class="ex-rest${it.rest && it.rest.auto ? ' on' : ''}">
        <label class="rest-toggle"><input type="checkbox" class="f-rest-auto" data-sec="${sec}" data-i="${i}" ${it.rest && it.rest.auto ? 'checked' : ''}> Auto-Pause</label>
        <span class="rest-presets">
          ${[30, 45, 60, 90, 120, 240].map(s => `<button type="button" class="rest-pre${it.rest && it.rest.sec === s ? ' on' : ''}" data-sec="${sec}" data-i="${i}" data-s="${s}">${s}</button>`).join('')}
          <input type="number" class="f-rest-sec" data-sec="${sec}" data-i="${i}" value="${it.rest ? it.rest.sec : 90}" min="5" step="5" aria-label="Sekunden">
        </span>
      </div>
    </div>`;
  }).join('');
  const exSection = (title, sec, arr) => `
    <div class="card section-card">
      <h2>${title}</h2>
      <div class="day-ex-list">${exRows(arr, sec) || '<p class="muted hint">Noch keine Übungen.</p>'}</div>
      <button type="button" class="btn block add-ex" data-sec="${sec}">+ Übung hinzufügen</button>
    </div>`;
  const wuRows = S.warmup.map((it, i) =>
    `<div class="wu-edit-row"><input type="text" class="f-wu" data-i="${i}" value="${esc(it)}" placeholder="z.B. Rudern 5 min"><button type="button" class="ic wu-rm" data-i="${i}" aria-label="entfernen">✕</button></div>`).join('');
  app.innerHTML = `
    ${plan.program.weeks > 1 ? `<div class="card week-bar">
      <div class="week-tabs">${Array.from({ length: plan.program.weeks }, (_, k) => `<button type="button" class="week-tab${(k + 1) === W ? ' on' : ''}${indepW(k + 1) ? ' indep' : ''}" data-w="${k + 1}">W${k + 1}</button>`).join('')}</div>
      ${W > 1 ? `<label class="week-indep-row"><input type="checkbox" id="week-indep" ${indep ? 'checked' : ''}> Woche ${W} eigenständig (eigene Übungen)</label>` : ''}
      ${indep ? `<p class="muted hint">Struktur &amp; Zahlen gelten nur für Woche ${W}.</p>` : `<div class="week-ramp"><span class="muted hint">Auto-Rampe:</span><button type="button" class="btn small ramp" data-kind="rpe">RPE +0.5</button><button type="button" class="btn small ramp" data-kind="kg">kg +2.5</button><button type="button" class="btn small ramp" data-kind="deload">Deload</button></div>`}
    </div>` : ''}
    <div class="card section-card">
      <h2>Aufwärmen &amp; Mobility</h2>
      <p class="muted hint">Checkliste — im Training zum Abhaken.</p>
      <div class="wu-edit-list">${wuRows}</div>
      <div class="wu-add-row"><input type="text" id="wu-new" placeholder="Drill/Übung hinzufügen…"><button type="button" class="btn small" id="wu-add">+</button></div>
    </div>
    ${exSection('Plyometrie &amp; Priming', 'plyo', S.plyo)}
    ${exSection('Hauptteil', 'main', S.main)}
    <div class="btn-row">
      <button type="button" class="btn accent" id="day-save">Speichern</button>
      <a class="btn" href="#/plans/edit/${planId}">Zurück</a>
    </div>`;

  const reRender = () => renderDayEditor(app, planId, dayIdx);
  const arrOf = el => S[el.dataset.sec];
  $$('.week-tab').forEach(b => b.addEventListener('click', () => { flushSections(App.dayWeek); App.dayWeek = +b.dataset.w; loadSections(App.dayWeek); reRender(); }));
  const indepToggle = $('#week-indep');
  if (indepToggle) indepToggle.addEventListener('change', () => {
    if (indepToggle.checked) {
      flushSections(W);
      const wtW = (day.weekTargets && day.weekTargets[W]) || null;
      day.weekOverride = day.weekOverride || {};
      day.weekOverride[W] = {
        warmup: { title: (day.warmup && day.warmup.title) || 'Aufwärmen & Mobility', items: ((day.warmup && day.warmup.items) || []).slice() },
        plyo: { title: (day.plyo && day.plyo.title) || 'Plyometrie & Priming', blocks: bakeBlocks((day.plyo && day.plyo.blocks) || [], wtW) },
        blocks: bakeBlocks(day.blocks || [], wtW),
      };
      loadSections(W); toast(`Woche ${W} ist jetzt eigenständig`); reRender();
    } else {
      if (!confirm(`Woche ${W} wieder an die geteilte Struktur angleichen? Eigene Übungen dieser Woche gehen verloren.`)) { indepToggle.checked = true; return; }
      delete day.weekOverride[W];
      if (day.weekOverride && !Object.keys(day.weekOverride).length) delete day.weekOverride;
      loadSections(W); toast(`Woche ${W} folgt wieder der Vorlage`); reRender();
    }
  });
  $$('.ramp').forEach(b => b.addEventListener('click', () => {
    const kind = b.dataset.kind, N = plan.program.weeks;
    for (const sk of ['plyo', 'main']) for (const it of S[sk]) {
      it.wk = it.wk || {};
      for (let w = 2; w <= N; w++) {
        const base = { reps: it.reps, rpe: it.rpe, weight: it.weight };
        const cur = it.wk[w] || Object.assign({}, base);
        if (kind === 'rpe' && base.rpe != null) cur.rpe = Math.min(10, base.rpe + 0.5 * (w - 1));
        if (kind === 'kg' && base.weight != null) cur.weight = roundHalf(base.weight + 2.5 * (w - 1));
        if (kind === 'deload' && w === N) { if (base.weight != null) cur.weight = roundHalf(base.weight * 0.8); if (base.rpe != null) cur.rpe = Math.max(6, base.rpe - 2); }
        it.wk[w] = cur;
      }
    }
    toast('Rampe angewendet ✓'); reRender();
  }));
  $$('.f-wu').forEach(inp => inp.addEventListener('input', () => { S.warmup[+inp.dataset.i] = inp.value; }));
  $$('.wu-rm').forEach(b => b.addEventListener('click', () => { S.warmup.splice(+b.dataset.i, 1); reRender(); }));
  const addWu = () => { const el = $('#wu-new'); const v = el.value.trim(); if (v) { S.warmup.push(v); reRender(); } };
  $('#wu-add').addEventListener('click', addWu);
  $('#wu-new').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addWu(); } });
  $$('.add-ex').forEach(b => b.addEventListener('click', () => { App.pickSection = b.dataset.sec; location.hash = '#/plans/pick'; }));
  $$('.f-ss').forEach(c => c.addEventListener('change', () => { arrOf(c)[+c.dataset.i].ss = c.checked; }));
  $$('.f-er').forEach(inp => inp.addEventListener('input', () => { setT(arrOf(inp)[+inp.dataset.i], 'reps', inp.value); }));
  $$('.f-erpe').forEach(s => s.addEventListener('change', () => { setT(arrOf(s)[+s.dataset.i], 'rpe', s.value === '' ? null : Number(s.value)); reRender(); }));
  $$('.f-ewt').forEach(inp => inp.addEventListener('input', () => { setT(arrOf(inp)[+inp.dataset.i], 'weight', inp.value === '' ? null : Number(inp.value)); }));
  $$('.sinc').forEach(b => b.addEventListener('click', () => { const it = arrOf(b)[+b.dataset.i]; it.sets = Math.min(10, it.sets + 1); reRender(); }));
  $$('.sdec').forEach(b => b.addEventListener('click', () => { const it = arrOf(b)[+b.dataset.i]; it.sets = Math.max(1, it.sets - 1); reRender(); }));
  $$('.rm').forEach(b => b.addEventListener('click', () => { arrOf(b).splice(+b.dataset.i, 1); reRender(); }));
  $$('.up').forEach(b => b.addEventListener('click', () => { const a = arrOf(b), i = +b.dataset.i; if (i > 0) { [a[i - 1], a[i]] = [a[i], a[i - 1]]; reRender(); } }));
  $$('.down').forEach(b => b.addEventListener('click', () => { const a = arrOf(b), i = +b.dataset.i; if (i < a.length - 1) { [a[i + 1], a[i]] = [a[i], a[i + 1]]; reRender(); } }));
  $$('.f-rest-auto').forEach(c => c.addEventListener('change', () => { const it = arrOf(c)[+c.dataset.i]; it.rest = it.rest || { auto: false, sec: 90 }; it.rest.auto = c.checked; reRender(); }));
  $$('.rest-pre').forEach(b => b.addEventListener('click', () => { const it = arrOf(b)[+b.dataset.i]; it.rest = it.rest || { auto: false, sec: 90 }; it.rest.sec = Number(b.dataset.s); it.rest.auto = true; reRender(); }));
  $$('.f-rest-sec').forEach(inp => inp.addEventListener('input', () => { const it = arrOf(inp)[+inp.dataset.i]; it.rest = it.rest || { auto: false, sec: 90 }; const v = Number(inp.value); if (v > 0) it.rest.sec = v; }));
  $$('.f-e1rm').forEach(inp => inp.addEventListener('change', () => { const it = arrOf(inp)[+inp.dataset.i]; it.oneRM = inp.value === '' ? null : Number(inp.value); reRender(); }));
  $$('.kg-apply').forEach(b => b.addEventListener('click', () => { setT(arrOf(b)[+b.dataset.i], 'weight', Number(b.dataset.v)); reRender(); }));
  $('#day-save').addEventListener('click', async () => {
    flushSections(App.dayWeek);
    const p = plan.program;
    plan.updatedAt = Date.now();
    await dbPut('plans', { id: plan.id, name: plan.name, createdAt: plan.createdAt, updatedAt: plan.updatedAt, program: p });
    if (await activePlanId() === plan.id) { await dbPut('kv', { key: 'program', value: p }); App.program = p; await harvestExercises(p); }
    toast('Tag gespeichert ✓');
    App.dayCtx = null;
    location.hash = `#/plans/edit/${planId}`;
  });
}

async function renderExercisePicker(app) {
  $('#topbar-title').textContent = 'Übung wählen';
  $('#topbar-back').hidden = false;
  const ctx = App.dayCtx;
  if (!ctx || !App.daySections) { location.hash = '#/plans'; return; }
  const back = `#/plans/day/${ctx.planId}/${ctx.dayIdx}`;
  const sec = App.pickSection || 'main';
  const add = (exId, name) => { App.daySections[sec].push({ exId, name, sets: 3, reps: '', rpe: null, weight: null, ss: false }); location.hash = back; };
  const harvested = (await dbGetAll('exercises')).map(e => ({ id: e.id, name: e.name }));

  let groups = '';
  for (const g of EQUIPMENT_GROUPS) {
    const list = EXERCISE_CATALOG.filter(e => e.equipment === g.key);
    groups += `<div class="pick-group"><div class="pick-head">${g.icon} ${esc(g.key)}</div>`
      + list.map(e => `<button type="button" class="pick-ex" data-id="${esc(e.id)}" data-name="${esc(e.name)}">${esc(e.name)}</button>`).join('') + '</div>';
  }
  if (harvested.length) {
    groups += `<div class="pick-group"><div class="pick-head">📋 Aus deinen Programmen</div>`
      + harvested.map(e => `<button type="button" class="pick-ex" data-id="${esc(e.id)}" data-name="${esc(e.name)}">${esc(e.name)}</button>`).join('') + '</div>';
  }

  app.innerHTML = `
    <input type="text" id="pick-search" class="pick-search" placeholder="Suchen…">
    <div class="card pick-custom">
      <label>Eigene Übung<input type="text" id="pick-custom-name" placeholder="Name"></label>
      <button type="button" class="btn small" id="pick-custom-add">+</button>
    </div>
    <div id="pick-list">${groups}</div>
    <a class="btn block" href="${back}">Abbrechen</a>`;

  $$('.pick-ex').forEach(b => b.addEventListener('click', () => add(b.dataset.id, b.dataset.name)));
  $('#pick-custom-add').addEventListener('click', () => {
    const n = $('#pick-custom-name').value.trim();
    if (!n) { toast('Name eingeben'); return; }
    add(genId('ex'), n);
  });
  const search = $('#pick-search');
  search.addEventListener('input', () => {
    const q = search.value.toLowerCase();
    $$('.pick-ex').forEach(b => { b.style.display = b.dataset.name.toLowerCase().includes(q) ? '' : 'none'; });
    $$('.pick-group').forEach(g => {
      g.style.display = Array.from(g.querySelectorAll('.pick-ex')).some(b => b.style.display !== 'none') ? '' : 'none';
    });
  });
}

/* ------------------------------------------------------------ settings */

async function renderSettings(app) {
  $('#topbar-title').textContent = 'Settings';
  $('#topbar-back').hidden = false;
  const cur = currentTheme();
  const swatches = THEMES.map(t => `
    <button type="button" class="theme-swatch${t.id === cur ? ' on' : ''}" data-theme="${esc(t.id)}"
            style="--sw:${t.accent}" aria-label="${esc(t.name)}">
      <span class="theme-dot"></span>
      <span class="theme-name">${esc(t.name)}</span>
      ${t.id === cur ? '<span class="theme-check">✓</span>' : ''}
    </button>`).join('');
  app.innerHTML = `
    <div class="card">
      <h2>Farbschema</h2>
      <p class="muted hint">Wird sofort auf die ganze App angewendet — jederzeit änderbar.</p>
      <div class="theme-grid">${swatches}</div>
    </div>`;
  $$('.theme-swatch').forEach(b =>
    b.addEventListener('click', () => { setTheme(b.dataset.theme); render(); }));
}

async function renderData(app) {
  $('#topbar-title').textContent = 'Data';
  $('#topbar-back').hidden = false;

  const [sets, sessions, maxes, bw] = await Promise.all([
    dbGetAll('sets'), dbGetAll('sessions'), dbGetAll('maxes'), dbGetAll('bodyweight'),
  ]);
  const last = parseInt(localStorage.getItem('wl.lastExport') || '0', 10);
  const lastTxt = last ? new Date(last).toLocaleString() : 'never';
  const archiveCount = completedSessions(sets, sessions).length;
  const exCount = (await dbGetAll('exercises')).length;

  app.innerHTML = `
    <a class="card nav-row" href="#/archive">
      <span class="nav-row-main">🏆 Archiv</span>
      <span class="nav-row-meta">${archiveCount} Trainings ›</span>
    </a>
    <a class="card nav-row" href="#/exercises">
      <span class="nav-row-main">🏋️ Exercises</span>
      <span class="nav-row-meta">${exCount} Übungen ›</span>
    </a>
    <a class="card nav-row" href="#/settings">
      <span class="nav-row-main">⚙️ Einstellungen</span>
      <span class="nav-row-meta">Farbschema ›</span>
    </a>
    <div class="card">
      <h2>Backup</h2>
      <p class="muted">Logged sets: ${sets.length} · sessions: ${sessions.length} · maxes: ${maxes.length} · bodyweight entries: ${bw.length}<br>Last export: ${esc(lastTxt)}</p>
      <div class="btn-row">
        <button type="button" class="btn" id="export-json">Export JSON (full backup)</button>
        <button type="button" class="btn" id="export-csv">Export CSV (sets)</button>
      </div>
    </div>
    <div class="card">
      <h2>Restore / import</h2>
      <p class="muted">JSON restore replaces everything. CSV import adds/overwrites logged sets (use for one-time Excel migration).</p>
      <div class="btn-row">
        <button type="button" class="btn" id="import-json-btn">Import JSON…</button>
        <button type="button" class="btn" id="import-csv-btn">Import CSV…</button>
      </div>
      <input type="file" id="import-json-file" accept=".json,application/json" hidden>
      <input type="file" id="import-csv-file" accept=".csv,text/csv" hidden>
    </div>
    <div class="card">
      <h2>Program</h2>
      <p class="muted">Aktuell: <b>${esc(App.program.name)}</b> · ${App.program.weeks} Wochen.
        Importiere eine Programm-Vorlage (<code>.xlsx</code>) oder eine <code>program.json</code>, oder lade die gehostete neu. Geloggte Daten bleiben erhalten.</p>
      <div class="btn-row">
        <button type="button" class="btn" id="import-program-btn">Programm importieren (Excel / JSON)…</button>
        <button type="button" class="btn" id="reload-program">Gehostetes neu laden</button>
      </div>
      <input type="file" id="import-program-file" accept=".xlsx,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
    </div>
    <div class="card danger-card">
      <h2>Danger zone</h2>
      <div class="btn-row">
        <button type="button" class="btn danger" id="wipe-all">Wipe all data</button>
      </div>
    </div>`;
}

async function exportJSON() {
  const [sets, sessions, maxes, bw, prog] = await Promise.all([
    dbGetAll('sets'), dbGetAll('sessions'), dbGetAll('maxes'), dbGetAll('bodyweight'), dbGet('kv', 'program'),
  ]);
  const payload = {
    app: 'workout-logger', version: 1, exportedAt: new Date().toISOString(),
    program: prog ? prog.value : App.program,
    sessions, sets, maxes, bodyweight: bw,
  };
  download(`training-logger-backup-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  localStorage.setItem('wl.lastExport', String(Date.now()));
  toast('JSON backup exported ✓');
}

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function exportCSV() {
  const [sets, sessions] = await Promise.all([dbGetAll('sets'), dbGetAll('sessions')]);
  const sessMap = new Map(sessions.map(s => [s.id, s]));

  // targets lookup from program
  const targets = {};
  for (let w = 1; w <= App.program.weeks; w++) for (const day of App.program.days) {
    const owt = (day.weekOverride && day.weekOverride[w]) ? null : ((day.weekTargets && day.weekTargets[w]) || null);
    forEachSet(dayForWeek(day, w), (block, ex, i, t) => { targets[`${w}|${day.id}|${ex.id}|${i}`] = { ex, t: (owt && owt[ex.id]) ? Object.assign({}, t, owt[ex.id]) : t }; });
  }

  const header = ['week', 'day', 'exercise_id', 'exercise', 'set', 'target_reps', 'target_rpe', 'target_weight_kg', 'reps', 'weight_kg', 'rpe', 'done', 'session_date'];
  const rows = [header.join(',')];
  const sorted = sets.slice().sort((a, b) => a.week - b.week || a.day.localeCompare(b.day) || a.ex.localeCompare(b.ex) || a.set - b.set);
  for (const s of sorted) {
    const meta = targets[`${s.week}|${s.day}|${s.ex}|${s.set}`];
    const sess = sessMap.get(`${s.week}|${s.day}`);
    rows.push([
      s.week, s.day, s.ex,
      meta ? meta.ex.name : '',
      s.set + 1,
      meta ? meta.t.reps : '', meta && meta.t.rpe != null ? meta.t.rpe : '', meta && meta.t.weight != null ? meta.t.weight : '',
      s.reps != null ? s.reps : '', s.wt != null ? s.wt : '', s.rpe != null ? s.rpe : '',
      s.done ? 1 : 0,
      sess ? sess.date : '',
    ].map(csvCell).join(','));
  }
  download(`training-logger-sets-${todayISO()}.csv`, rows.join('\r\n'), 'text/csv');
  localStorage.setItem('wl.lastExport', String(Date.now()));
  toast('CSV exported ✓');
}

async function importJSONFile(file) {
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { toast('Not valid JSON'); return; }
  if (!data || data.app !== 'workout-logger' || !Array.isArray(data.sets)) {
    toast('Not a Training Logger backup'); return;
  }
  if (!confirm('Replace ALL current data with this backup?')) return;
  await dbClearAll();
  if (data.program) await dbPut('kv', { key: 'program', value: data.program });
  if (data.sessions && data.sessions.length) await dbBulkPut('sessions', data.sessions);
  if (data.sets.length) await dbBulkPut('sets', data.sets);
  if (data.maxes && data.maxes.length) await dbBulkPut('maxes', data.maxes);
  if (data.bodyweight && data.bodyweight.length) await dbBulkPut('bodyweight', data.bodyweight);
  if (data.program) App.program = data.program;
  if (data.program) await harvestExercises(data.program);
  toast('Backup restored ✓');
  render();
}

/* validate a bare program.json structure (not a full backup) */
function validateProgram(p) {
  if (!p || typeof p !== 'object') return 'kein Objekt';
  if (typeof p.name !== 'string' || !p.name) return 'name fehlt';
  if (!(p.weeks >= 1)) return 'weeks ungültig';
  if (!Array.isArray(p.days) || !p.days.length) return 'days fehlt';
  for (const d of p.days) {
    if (!d.id || !d.name) return 'Tag ohne id/name';
    if (d.blocks && !Array.isArray(d.blocks)) return `blocks bei ${d.id} ungültig`;
  }
  return null;
}

async function importProgramFile(file) {
  let p;
  const isXlsx = /\.xlsx$/i.test(file.name) || file.type.includes('spreadsheet');
  if (isXlsx) {
    if (typeof programFromXlsx !== 'function') { toast('Excel-Unterstützung nicht geladen'); return; }
    try { p = await programFromXlsx(file); }
    catch (e) { toast('Excel konnte nicht gelesen werden: ' + e.message); return; }
  } else {
    let text;
    try { text = await file.text(); } catch (e) { toast('Datei nicht lesbar'); return; }
    try { p = JSON.parse(text); } catch (e) { toast('Keine gültige JSON-Datei'); return; }
    // tolerate a full backup file: use its embedded program
    if (p && p.app === 'workout-logger' && p.program) p = p.program;
  }
  const err = validateProgram(p);
  if (err) { toast('Kein gültiges Programm: ' + err); return; }
  if (!confirm(`Programm „${p.name}" (${p.weeks} Wochen) laden? Geloggte Daten, Maxes und Archiv bleiben erhalten.`)) return;
  await dbPut('kv', { key: 'program', value: p });
  App.program = p;
  await harvestExercises(p);
  toast('Programm geladen ✓');
  location.hash = '#/';
  render();
}

/* tiny CSV parser handling quoted cells */
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}

function normalizeDayId(v) {
  const s = String(v || '').toLowerCase();
  for (const d of App.program.days) {
    if (s === d.id.toLowerCase() || s === d.name.toLowerCase()) return d.id;
  }
  for (const d of App.program.days) {
    if (s.includes(d.id.toLowerCase()) || s.includes(d.name.toLowerCase())) return d.id;
  }
  if (/(^|\D)1(\D|$)/.test(s)) return App.program.days[0].id;
  if (/(^|\D)2(\D|$)/.test(s)) return App.program.days[1] ? App.program.days[1].id : null;
  return null;
}

function exerciseIdFrom(idCell, nameCell) {
  if (idCell && findExercise(String(idCell))) return String(idCell);
  const name = String(nameCell || idCell || '').toLowerCase().trim();
  if (!name) return null;
  for (const day of App.program.days) {
    for (const block of day.blocks) {
      for (const ex of block.exercises) {
        if (ex.name.toLowerCase() === name) return ex.id;
      }
    }
  }
  for (const day of App.program.days) {
    for (const block of day.blocks) {
      for (const ex of block.exercises) {
        if (ex.name.toLowerCase().includes(name) || name.includes(ex.name.toLowerCase())) return ex.id;
      }
    }
  }
  return null;
}

async function importCSVFile(file) {
  const text = await file.text();
  const rows = parseCSV(text);
  if (rows.length < 2) { toast('CSV appears empty'); return; }
  const header = rows[0].map(h => h.toLowerCase().trim());
  const col = name => header.indexOf(name);
  const ci = {
    week: col('week'), day: col('day'), exId: col('exercise_id'), ex: col('exercise'),
    set: col('set'), reps: col('reps'), wt: col('weight_kg') !== -1 ? col('weight_kg') : col('weight'),
    rpe: col('rpe'), done: col('done'), date: col('session_date') !== -1 ? col('session_date') : col('date'),
  };
  if (ci.week === -1 || ci.day === -1 || ci.set === -1 || (ci.exId === -1 && ci.ex === -1)) {
    toast('CSV needs columns: week, day, set, exercise_id/exercise'); return;
  }
  const setRecs = [], sessRecs = new Map();
  let skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const week = parseInt(r[ci.week], 10);
    const dayId = normalizeDayId(r[ci.day]);
    const exId = exerciseIdFrom(ci.exId !== -1 ? r[ci.exId] : null, ci.ex !== -1 ? r[ci.ex] : null);
    const setNo = parseInt(r[ci.set], 10);
    if (!week || !dayId || !exId || !setNo) { skipped++; continue; }
    const doneRaw = ci.done !== -1 ? String(r[ci.done]).toLowerCase().trim() : '';
    const rec = {
      id: setKey(week, dayId, exId, setNo - 1),
      week, day: dayId, ex: exId, set: setNo - 1,
      reps: ci.reps !== -1 ? parseNum(r[ci.reps]) : null,
      wt: ci.wt !== -1 ? parseNum(r[ci.wt]) : null,
      rpe: ci.rpe !== -1 ? parseNum(r[ci.rpe]) : null,
      done: ['1', 'true', 'yes', 'x', '✓'].includes(doneRaw),
      ts: Date.now(),
    };
    if (rec.reps == null && rec.wt == null && rec.rpe == null && !rec.done) { skipped++; continue; }
    setRecs.push(rec);
    const sid = sessionKey(week, dayId);
    if (!sessRecs.has(sid)) {
      const date = ci.date !== -1 && r[ci.date] ? String(r[ci.date]).slice(0, 10) : todayISO();
      sessRecs.set(sid, { id: sid, week, day: dayId, date, notes: '' });
    }
  }
  if (!setRecs.length) { toast('No usable rows found'); return; }
  if (!confirm(`Import ${setRecs.length} set entries${skipped ? ` (${skipped} rows skipped)` : ''}?`)) return;
  // don't clobber existing sessions
  const existing = new Set((await dbGetAll('sessions')).map(s => s.id));
  await dbBulkPut('sets', setRecs);
  await dbBulkPut('sessions', Array.from(sessRecs.values()).filter(s => !existing.has(s.id)));
  toast(`Imported ${setRecs.length} sets ✓`);
  render();
}

/* ----------------------------------------------------------- wake lock */
/* Keeps the screen on while logging a session (Log view only). */

const WakeLock = {
  sentinel: null,
  async acquire() {
    if (!('wakeLock' in navigator)) return;
    if (this.sentinel && !this.sentinel.released) return;
    try { this.sentinel = await navigator.wakeLock.request('screen'); }
    catch (e) { this.sentinel = null; /* low battery / not allowed */ }
  },
  async release() {
    const s = this.sentinel;
    this.sentinel = null;
    if (s && !s.released) { try { await s.release(); } catch (e) { /* already gone */ } }
  },
};

/* --------------------------------------------------------------- timer */

const RestTimer = {
  remaining: 0, total: 0, interval: null,
  start(seconds) {
    this.stop(false);
    this.total = this.remaining = seconds;
    this.interval = setInterval(() => this.tick(), 1000);
    this.show();
    this.renderTime();
  },
  tick() {
    this.remaining--;
    this.renderTime();
    if (this.remaining <= 0) {
      this.stop(false);
      this.renderTime();
      this.alarm();
    }
  },
  add(seconds) {
    if (this.remaining > 0) { this.remaining += seconds; this.renderTime(); }
    else this.start(seconds);
  },
  stop(hide) {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    if (hide !== false) { this.remaining = 0; this.renderTime(); }
    this.updatePill();
  },
  show() { $('#timer-sheet').hidden = false; this.updatePill(); },
  hide() { $('#timer-sheet').hidden = true; this.updatePill(); },
  renderTime() {
    const m = Math.floor(Math.max(0, this.remaining) / 60);
    const s = Math.max(0, this.remaining) % 60;
    const txt = `${m}:${String(s).padStart(2, '0')}`;
    $('#timer-display').textContent = this.remaining > 0 ? txt : 'Rest';
    $('#timer-pill-time').textContent = txt;
    this.updatePill();
  },
  updatePill() {
    const running = this.interval != null;
    $('#timer-pill').hidden = !(running && $('#timer-sheet').hidden);
  },
  alarm() {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.3, 0.6].forEach(t => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 880; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
      });
    } catch (e) { /* audio not available */ }
    $('#timer-display').textContent = 'Done! 🔔';
  },
};

/* -------------------------------------------------------------- events */

function wireEvents() {
  window.addEventListener('hashchange', render);

  $('#topbar-back').addEventListener('click', () => { location.hash = '#/'; });
  $('#topbar-timer').addEventListener('click', () => {
    const sheet = $('#timer-sheet');
    if (sheet.hidden) RestTimer.show(); else RestTimer.hide();
  });
  $('#timer-pill').addEventListener('click', () => RestTimer.show());
  $('#timer-close').addEventListener('click', () => RestTimer.hide());
  $('#timer-stop').addEventListener('click', () => { RestTimer.stop(); });
  $('#timer-plus').addEventListener('click', () => RestTimer.add(15));
  $$('#timer-presets button').forEach(b =>
    b.addEventListener('click', () => RestTimer.start(Number(b.dataset.s))));

  const app = $('#app');

  app.addEventListener('click', async e => {
    const stepBtn = e.target.closest('.step');
    if (stepBtn) {
      buzz(10);
      const row = stepBtn.closest('.set-row');
      const input = row.querySelector(stepBtn.dataset.field === 'reps' ? '.f-reps' : '.f-wt');
      const cur = parseNum(input.value);
      const d = Number(stepBtn.dataset.d);
      let next;
      if (cur == null) {
        // start from target / prev-week value instead of 0 where sensible
        next = stepBtn.dataset.field === 'reps'
          ? (firstNumber(row.dataset.treps) || 0)
          : (parseNum(row.dataset.twt) != null ? parseNum(row.dataset.twt) : 0);
        if (d < 0) next = Math.max(0, next + d);
      } else {
        next = Math.max(0, Math.round((cur + d) * 100) / 100);
      }
      input.value = fmtNum(next);
      await saveSetRow(row.closest('.set-row'));
      updatePrefillChip(row, Number(row.dataset.week), row.dataset.day);
      return;
    }

    const doneBtn = e.target.closest('.f-done');
    if (doneBtn) {
      const row = doneBtn.closest('.set-row');
      const on = !doneBtn.classList.contains('on');
      doneBtn.classList.toggle('on', on);
      if (on) buzz(30);
      if (on) {
        // smart defaults: fill empties from target / previous week
        const reps = row.querySelector('.f-reps');
        const wt = row.querySelector('.f-wt');
        const rpe = row.querySelector('.f-rpe');
        const prevKey = setKey(Number(row.dataset.week) - 1, row.dataset.day, row.dataset.ex, Number(row.dataset.set));
        const prev = App.setsCache.get(prevKey);
        if (reps.value === '') {
          const v = (prev && prev.reps != null) ? prev.reps : firstNumber(row.dataset.treps);
          if (v != null) reps.value = v;
        }
        if (wt.value === '') {
          const v = (prev && prev.wt != null) ? prev.wt : parseNum(row.dataset.twt);
          if (v != null) wt.value = v;
        }
        if (rpe.value === '' && row.dataset.trpe !== '') rpe.value = row.dataset.trpe;
      }
      if (on && row.dataset.restAuto === '1') RestTimer.start(Number(row.dataset.restSec) || 90);
      await saveSetRow(row);
      if (on) checkPR(row);
      updatePrefillChip(row, Number(row.dataset.week), row.dataset.day);
      return;
    }

    const chip = e.target.closest('.prefill-chip');
    if (chip) {
      const row = chip.closest('.set-row');
      if (chip.dataset.reps !== '') row.querySelector('.f-reps').value = chip.dataset.reps;
      if (chip.dataset.wt !== '') row.querySelector('.f-wt').value = chip.dataset.wt;
      if (chip.dataset.rpe !== '') row.querySelector('.f-rpe').value = chip.dataset.rpe;
      await saveSetRow(row);
      row.querySelector('.prefill-slot').innerHTML = '';
      return;
    }

    const timerBtn = e.target.closest('.f-timer');
    if (timerBtn) { RestTimer.show(); return; }

    const useBtn = e.target.closest('.use-e1rm');
    if (useBtn) {
      const lift = useBtn.dataset.lift;
      const v = Number(useBtn.dataset.v);
      const input = document.querySelector(`.f-onerm[data-lift="${lift}"]`);
      if (input) input.value = v;
      await saveMax(lift, v);
      toast('1RM updated ✓');
      return;
    }

    // data view buttons
    if (e.target.id === 'export-json') { exportJSON(); return; }
    if (e.target.id === 'export-csv') { exportCSV(); return; }
    if (e.target.id === 'import-json-btn') { $('#import-json-file').click(); return; }
    if (e.target.id === 'import-csv-btn') { $('#import-csv-file').click(); return; }
    if (e.target.id === 'import-program-btn') { $('#import-program-file').click(); return; }
    if (e.target.id === 'reload-program') {
      if (!confirm('Reload program.json? Logged data is kept.')) return;
      try { await reloadProgramFromFile(); toast('Program reloaded ✓'); render(); }
      catch (err) { toast('Could not fetch program.json (offline?)'); }
      return;
    }
    if (e.target.id === 'wipe-all') {
      if (!confirm('Delete ALL logged data, maxes and bodyweight? This cannot be undone.')) return;
      if (!confirm('Really sure? Consider exporting a backup first.')) return;
      await dbClearAll();
      await dbPut('kv', { key: 'program', value: App.program });
      toast('All data wiped');
      render();
      return;
    }
  });

  // plate calculator: long-press (500 ms) the kg field of a set row
  let plateHold = null, plateXY = null;
  const cancelPlateHold = () => { if (plateHold) { clearTimeout(plateHold); plateHold = null; } };
  app.addEventListener('pointerdown', e => {
    const inp = e.target.closest('.f-wt');
    if (!inp || !inp.closest('.set-row')) return;
    plateXY = [e.clientX, e.clientY];
    cancelPlateHold();
    plateHold = setTimeout(() => {
      plateHold = null;
      const row = inp.closest('.set-row');
      const w = parseNum(inp.value) != null ? parseNum(inp.value)
        : (parseNum(row.dataset.twt) != null ? parseNum(row.dataset.twt) : parseNum(inp.placeholder));
      const txt = w != null ? plateText(w) : null;
      if (txt) { buzz(15); toast(txt, 5000); }
      else toast('No weight to load — enter kg first', 2400);
    }, 500);
  });
  app.addEventListener('pointerup', cancelPlateHold);
  app.addEventListener('pointercancel', cancelPlateHold);
  app.addEventListener('pointermove', e => {
    if (plateHold && plateXY && (Math.abs(e.clientX - plateXY[0]) > 12 || Math.abs(e.clientY - plateXY[1]) > 12)) cancelPlateHold();
  });
  app.addEventListener('contextmenu', e => {
    if (e.target.closest('.f-wt') && e.target.closest('.set-row')) e.preventDefault();
  });

  // wake lock is auto-released when the screen turns off / tab hides — re-grab it
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && App.program && route().view === 'log') WakeLock.acquire();
  });

  app.addEventListener('input', async e => {
    const t = e.target;
    if (t.classList.contains('f-reps') || t.classList.contains('f-wt')) {
      const row = t.closest('.set-row');
      await saveSetRow(row);
      return;
    }
    if (t.id === 'session-notes') {
      const r = route();
      const sess = await ensureSession(r.week, r.day);
      sess.notes = t.value;
      await dbPut('sessions', sess);
      return;
    }
    if (t.id === 'calc-w' || t.id === 'calc-r') { recalcE1RM(); return; }
    if (t.classList.contains('f-onerm')) {
      await saveMax(t.dataset.lift, parseNum(t.value));
      return;
    }
    if (t.classList.contains('f-bw')) {
      const week = Number(t.dataset.week);
      const kg = parseNum(t.value);
      if (kg == null) await dbDelete('bodyweight', week);
      else await dbPut('bodyweight', { week, kg });
      // refresh chart only (all entries, across blocks)
      const bw = await dbGetAll('bodyweight');
      const sorted = bw.slice().sort((a, b) => a.week - b.week);
      const el = $('#bw-chart');
      if (el) el.innerHTML = sorted.length
        ? lineChartSvg(sorted.map(b => b.kg), sorted.map(b => 'W' + b.week)) : '';
      return;
    }
  });

  app.addEventListener('change', async e => {
    const t = e.target;
    if (t.classList.contains('f-rpe')) {
      await saveSetRow(t.closest('.set-row'));
      return;
    }
    if (t.id === 'session-date') {
      const r = route();
      const sess = await ensureSession(r.week, r.day);
      sess.date = t.value;
      await dbPut('sessions', sess);
      return;
    }
    if (t.id === 'import-json-file' && t.files[0]) { importJSONFile(t.files[0]); t.value = ''; return; }
    if (t.id === 'import-program-file' && t.files[0]) { importProgramFile(t.files[0]); t.value = ''; return; }
    if (t.id === 'import-csv-file' && t.files[0]) { importCSVFile(t.files[0]); t.value = ''; return; }
  });
}

/* ---------------------------------------------------------------- init */

async function init() {
  applyTheme(currentTheme());
  if ('serviceWorker' in navigator) {
    // Auto-apply updates: when a new service worker takes control, reload once so
    // the fresh version shows on the FIRST relaunch (no more "open the app twice").
    // Guarded so it only fires on an update (an existing controller), never first install.
    if (navigator.serviceWorker.controller) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        location.reload();
      });
    }
    navigator.serviceWorker.register('sw.js').catch(() => { /* file:// or unsupported */ });
  }
  try {
    await loadProgram();
  } catch (e) {
    $('#app').innerHTML = `<div class="card error">Could not load the program (program.json).
      Serve the app over http(s) — see README.</div>`;
    return;
  }
  try { await seedPlansIfEmpty(); } catch (e) { console.warn('seed plans failed', e); }
  wireEvents();
  render();
}

init();
