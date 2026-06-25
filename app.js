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

/* ---------------------------------------------------------------- state */

const App = {
  program: null,
  setsCache: new Map(),      // id -> set record (for current log view: this + prev week)
  sessionCache: null,        // session record for current log view
};

const setKey = (week, dayId, exId, setIdx) => `${week}|${dayId}|${exId}|${setIdx}`;
const sessionKey = (week, dayId) => `${week}|${dayId}`;

function getDay(dayId) { return App.program.days.find(d => d.id === dayId); }

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

/* iterate every loggable set of a day: cb(block, ex, setIdx, target) */
function forEachSet(day, cb) {
  for (const block of day.blocks) {
    for (const ex of block.exercises) {
      const sets = exerciseSets(ex, block);
      sets.forEach((t, i) => cb(block, ex, i, t));
    }
  }
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
  return { view: 'home' };
}

async function render() {
  const r = route();
  // 'archive' and 'exercises' live under the Data tab — keep that tab highlighted
  const navView = (r.view === 'archive' || r.view === 'exercises') ? 'data' : r.view;
  $$('#bottomnav a').forEach(a => a.classList.toggle('active', a.dataset.view === navView));
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
  const totals = {};
  for (const day of App.program.days) {
    let n = 0;
    forEachSet(day, () => n++);
    totals[day.id] = n;
  }

  let weeksHtml = '';
  for (let w = 1; w <= App.program.weeks; w++) {
    let dayBtns = '';
    for (const day of App.program.days) {
      const k = `${w}|${day.id}`;
      const done = doneCount[k] || 0;
      const any = anyCount[k] || 0;
      const total = totals[day.id];
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

  $('#topbar-title').textContent = `Week ${week} · ${day.name}`;
  $('#topbar-back').hidden = false;

  // load sets for this week + previous week (for prefill)
  const allSets = await dbGetAll('sets');
  App.setsCache = new Map();
  for (const s of allSets) {
    if (s.day === dayId && (s.week === week || s.week === week - 1)) App.setsCache.set(s.id, s);
  }
  App.sessionCache = await dbGet('sessions', sessionKey(week, dayId)) || null;

  const warmup = day.warmup ? `
    <details class="card info-block">
      <summary>${esc(day.warmup.title || 'Warm-up')}</summary>
      <ul>${day.warmup.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
    </details>` : '';

  const plyo = day.plyo ? `
    <details class="card info-block">
      <summary>${esc(day.plyo.title || 'Plyo / Core')}</summary>
      <ul>${day.plyo.items.map(i => `<li><strong>${esc(i.name)}</strong> — ${esc(i.scheme)}</li>`).join('')}</ul>
    </details>` : '';

  let blocksHtml = '';
  day.blocks.forEach((block, bi) => {
    const names = block.exercises.map(e => `<span class="bh-ex"><b>${esc(e.label)}</b> ${esc(e.name)}</span>`).join('<span class="bh-plus">+</span>');
    let rowsHtml = '';

    if (block.type === 'superset') {
      const rounds = block.rounds || 3;
      for (let r = 0; r < rounds; r++) {
        let groupRows = '';
        for (const ex of block.exercises) {
          const t = exerciseSets(ex, block)[r];
          groupRows += setRowHtml(week, dayId, ex, r, t);
        }
        rowsHtml += `<div class="round-group"><div class="round-label">Round ${r + 1} / ${rounds}</div>${groupRows}</div>`;
      }
    } else {
      const ex = block.exercises[0];
      const sets = exerciseSets(ex, block);
      sets.forEach((t, i) => { rowsHtml += setRowHtml(week, dayId, ex, i, t); });
    }

    blocksHtml += `
      <section class="block band-${bi % 2}">
        <header class="block-head">${names}</header>
        ${rowsHtml}
      </section>`;
  });

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
}

function rpeOptionsHtml(selected) {
  let html = '<option value="">RPE</option>';
  for (let v = 6; v <= 10; v += 0.5) {
    html += `<option value="${v}" ${selected === v ? 'selected' : ''}>${v}</option>`;
  }
  return html;
}

function setRowHtml(week, dayId, ex, setIdx, target) {
  const key = setKey(week, dayId, ex.id, setIdx);
  return `
  <div class="set-row" data-key="${key}" data-week="${week}" data-day="${esc(dayId)}"
       data-ex="${esc(ex.id)}" data-set="${setIdx}"
       data-treps="${esc(target.reps)}" data-trpe="${target.rpe != null ? target.rpe : ''}"
       data-twt="${target.weight != null ? target.weight : ''}">
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
  const reps = row.querySelector('.f-reps').value;
  const wt = row.querySelector('.f-wt').value;
  if (reps !== '' || wt !== '') return;
  const prevKey = setKey(week - 1, dayId, row.dataset.ex, Number(row.dataset.set));
  const prev = App.setsCache.get(prevKey);
  if (!prev || (prev.reps == null && prev.wt == null)) return;
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
    if (day) { expected = 0; forEachSet(day, () => expected++); }
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
];

const EQUIPMENT_GROUPS = [
  { key: 'Barbell', icon: '🏋️' },
  { key: 'Dumbbell', icon: '💪' },
  { key: 'Kettlebell', icon: '🔔' },
  { key: 'Trap-bar', icon: '🔷' },
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
    <p class="muted hint">Übungsbibliothek — ${EXERCISE_CATALOG.length} Standardübungen nach Gerät${harvested.length ? ` + ${harvested.length} aus deinen Programmen` : ''}.</p>
    ${catHtml}
    ${progHtml}`;
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
  for (const day of App.program.days) {
    forEachSet(day, (block, ex, i, t) => { targets[`${day.id}|${ex.id}|${i}`] = { ex, t }; });
  }

  const header = ['week', 'day', 'exercise_id', 'exercise', 'set', 'target_reps', 'target_rpe', 'target_weight_kg', 'reps', 'weight_kg', 'rpe', 'done', 'session_date'];
  const rows = [header.join(',')];
  const sorted = sets.slice().sort((a, b) => a.week - b.week || a.day.localeCompare(b.day) || a.ex.localeCompare(b.ex) || a.set - b.set);
  for (const s of sorted) {
    const meta = targets[`${s.day}|${s.ex}|${s.set}`];
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
      await saveSetRow(row);
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
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* file:// or unsupported */ });
  }
  try {
    await loadProgram();
  } catch (e) {
    $('#app').innerHTML = `<div class="card error">Could not load the program (program.json).
      Serve the app over http(s) — see README.</div>`;
    return;
  }
  wireEvents();
  render();
}

init();
