/* xlsx.js — read the program template .xlsx into a program object, in-browser,
   no dependencies. Mirrors tools/xlsx2program.py exactly so app-import and the
   Python converter produce identical JSON.

   ZIP reading uses DecompressionStream('deflate-raw') (Chrome/Safari/modern WebView).
   Only the small subset of .xlsx we need is parsed (sharedStrings + sheets). */
'use strict';

/* ---------------------------------------------------------------- ZIP */

async function inflateRaw(bytes) {
  if (bytes.length === 0) return new Uint8Array(0);
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/* parse a ZIP (central directory) -> Map<name, Uint8Array> for files we need */
async function unzip(arrayBuffer, wanted) {
  const data = new Uint8Array(arrayBuffer);
  const dv = new DataView(arrayBuffer);
  // find End Of Central Directory (search backwards for 0x06054b50)
  let eocd = -1;
  for (let i = data.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Keine gültige .xlsx (kein ZIP-EOCD)');
  const cdCount = dv.getUint16(eocd + 10, true);
  let cd = dv.getUint32(eocd + 16, true);
  const out = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < cdCount; n++) {
    if (dv.getUint32(cd, true) !== 0x02014b50) break;
    const method = dv.getUint16(cd + 10, true);
    const compSize = dv.getUint32(cd + 20, true);
    const nameLen = dv.getUint16(cd + 28, true);
    const extraLen = dv.getUint16(cd + 30, true);
    const commentLen = dv.getUint16(cd + 32, true);
    const lho = dv.getUint32(cd + 42, true);
    const name = dec.decode(data.subarray(cd + 46, cd + 46 + nameLen));
    if (!wanted || wanted(name)) {
      // local header: 30 + nameLen + extraLen
      const lNameLen = dv.getUint16(lho + 26, true);
      const lExtraLen = dv.getUint16(lho + 28, true);
      const start = lho + 30 + lNameLen + lExtraLen;
      const comp = data.subarray(start, start + compSize);
      out.set(name, method === 0 ? comp : await inflateRaw(comp));
    }
    cd += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/* ---------------------------------------------------------- XLSX sheets */

function xmlDoc(bytes) {
  const text = new TextDecoder().decode(bytes);
  return new DOMParser().parseFromString(text, 'application/xml');
}

function localName(el) { return el.localName || el.nodeName.replace(/^.*:/, ''); }

function colnum(ref) {
  let n = 0;
  for (const ch of ref) {
    const c = ch.toUpperCase();
    if (c >= 'A' && c <= 'Z') n = n * 26 + (c.charCodeAt(0) - 64);
    else break;
  }
  return n;
}

async function readSheets(arrayBuffer) {
  const files = await unzip(arrayBuffer, name =>
    name === 'xl/workbook.xml' || name === 'xl/_rels/workbook.xml.rels' ||
    name === 'xl/sharedStrings.xml' || name.startsWith('xl/worksheets/'));

  const wb = xmlDoc(files.get('xl/workbook.xml'));
  const relsDoc = xmlDoc(files.get('xl/_rels/workbook.xml.rels'));
  const rels = {};
  relsDoc.querySelectorAll('Relationship').forEach(r => { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });

  // shared strings
  let sst = [];
  if (files.has('xl/sharedStrings.xml')) {
    const ss = xmlDoc(files.get('xl/sharedStrings.xml'));
    sst = Array.from(ss.getElementsByTagName('*'))
      .filter(e => localName(e) === 'si')
      .map(si => Array.from(si.getElementsByTagName('*'))
        .filter(t => localName(t) === 't').map(t => t.textContent).join(''));
  }

  const sheets = {};
  const sheetEls = Array.from(wb.getElementsByTagName('*')).filter(e => localName(e) === 'sheet');
  for (const s of sheetEls) {
    const name = s.getAttribute('name');
    const rid = s.getAttribute('r:id') || (() => {
      for (const a of s.attributes) if (a.name.endsWith(':id') || a.name === 'id') return a.value;
      return null;
    })();
    let target = rels[rid];
    if (!target) continue;
    const path = 'xl/' + target.replace(/^\//, '').replace('../', '');
    const bytes = files.get(path);
    if (!bytes) continue;
    const doc = xmlDoc(bytes);
    const rows = {};
    for (const row of Array.from(doc.getElementsByTagName('*')).filter(e => localName(e) === 'row')) {
      const rn = parseInt(row.getAttribute('r'), 10);
      const cells = {};
      for (const c of Array.from(row.children).filter(e => localName(e) === 'c')) {
        const ref = c.getAttribute('r');
        const t = c.getAttribute('t');
        let val = null;
        if (t === 's') {
          const v = Array.from(c.children).find(e => localName(e) === 'v');
          if (v) val = sst[parseInt(v.textContent, 10)];
        } else if (t === 'inlineStr') {
          val = Array.from(c.getElementsByTagName('*')).filter(e => localName(e) === 't').map(e => e.textContent).join('');
        } else {
          const v = Array.from(c.children).find(e => localName(e) === 'v');
          if (v) val = v.textContent;
        }
        if (val != null && String(val).trim() !== '') cells[colnum(ref)] = String(val).trim();
      }
      if (Object.keys(cells).length) rows[rn] = cells;
    }
    sheets[name] = rows;
  }
  return sheets;
}

/* ------------------------------------------------ program build (port of py) */

function _slug(s) {
  return (String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')) || 'ex';
}
function _num(s) {
  if (s == null || String(s).trim() === '') return null;
  const f = parseFloat(String(s).replace(',', '.'));
  if (isNaN(f)) return null;
  return f === Math.trunc(f) ? Math.trunc(f) : f;
}
function _truthy(s) { return ['x', 'yes', 'y', 'true', '1', 'ja'].includes(String(s).trim().toLowerCase()); }

function _kv(rows) {
  const out = {};
  Object.keys(rows).map(Number).sort((a, b) => a - b).forEach(rn => {
    const c = rows[rn];
    if (c[1]) out[c[1].trim().toLowerCase()] = (c[2] || '').trim();
  });
  return out;
}
function _table(rows) {
  const rns = Object.keys(rows).map(Number).sort((a, b) => a - b);
  if (!rns.length) return [];
  const header = {};
  for (const col in rows[rns[0]]) header[col] = rows[rns[0]][col].trim().toLowerCase();
  const out = [];
  for (let i = 1; i < rns.length; i++) {
    const rec = {};
    for (const col in rows[rns[i]]) { const k = header[col]; if (k) rec[k] = rows[rns[i]][col]; }
    if (Object.values(rec).some(v => String(v).trim())) out.push(rec);
  }
  return out;
}
function _warmups(rows) {
  const out = {};
  const rns = Object.keys(rows).map(Number).sort((a, b) => a - b);
  for (let i = 1; i < rns.length; i++) {
    const c = rows[rns[i]];
    const day = (c[1] || '').trim();
    const kind = (c[2] || '').trim().toLowerCase();
    const title = (c[3] || '').trim();
    const items = Object.keys(c).map(Number).filter(col => col >= 4).sort((a, b) => a - b)
      .map(col => c[col].trim()).filter(Boolean);
    if (!day || (kind !== 'warmup' && kind !== 'plyo')) continue;
    const entry = out[day] || (out[day] = {});
    if (kind === 'warmup') entry.warmup = { title: title || 'Warm-up', items };
    else {
      entry.plyo = {
        title: title || 'Plyo / Core',
        items: items.map(it => {
          const ix = it.indexOf('::');
          return ix >= 0 ? { name: it.slice(0, ix).trim(), scheme: it.slice(ix + 2).trim() } : { name: it, scheme: '' };
        }),
      };
    }
  }
  return out;
}

/* group a day's exercise rows into ordered blocks of raw entries */
function _groupDayRows(rows) {
  const blockOrder = []; const blocks = {};
  for (const r of rows) {
    const blockId = (r.block || 'X').trim();
    if (!blocks[blockId]) { blockOrder.push(blockId); blocks[blockId] = []; }
    const exId = _slug(r.exercise || blockId);
    const repsRaw = (r.reps || '').trim();
    const rpeRaw = (r.rpe || '').trim();
    blocks[blockId].push({
      id: exId, label: (r.label || '').trim(), name: (r.exercise || '').trim(),
      reps: repsRaw, rpe: _num(rpeRaw), weight: _num(r.weight),
      sets: _num(r.sets) ? Math.trunc(_num(r.sets)) : null,
      perSetReps: repsRaw.includes(',') ? repsRaw.split(',').map(x => x.trim()) : null,
      perSetRpe: rpeRaw.includes(',') ? rpeRaw.split(',').map(x => x.trim()) : null,
    });
  }
  return { blockOrder, blocks };
}

/* turn grouped raw entries into straight/superset blocks (shared by base + per-week) */
function _blocksFromGroups(blockOrder, blocksMap) {
  const blocks = [];
  for (const blockId of blockOrder) {
    const exs = blocksMap[blockId];
    if (exs.length === 1 && (exs[0].perSetReps || (exs[0].sets && !exs[0].weight && exs[0].label && /^\d+$/.test(exs[0].label)))) {
      const ex = exs[0];
      const sets = [];
      if (ex.perSetReps) {
        ex.perSetReps.forEach((rp, i) => {
          const rpe = ex.perSetRpe && i < ex.perSetRpe.length ? ex.perSetRpe[i] : null;
          sets.push({ reps: rp, rpe: rpe ? _num(rpe) : ex.rpe, weight: ex.weight });
        });
      } else {
        for (let i = 0; i < (ex.sets || 1); i++) sets.push({ reps: ex.reps, rpe: ex.rpe, weight: ex.weight });
      }
      blocks.push({ id: blockId, type: 'straight', exercises: [{ id: ex.id, label: ex.label, name: ex.name, sets }] });
    } else if (exs.length === 1) {
      const ex = exs[0];
      const sets = [];
      for (let i = 0; i < (ex.sets || 1); i++) sets.push({ reps: ex.reps, rpe: ex.rpe, weight: ex.weight });
      blocks.push({ id: blockId, type: 'straight', exercises: [{ id: ex.id, label: ex.label, name: ex.name, sets }] });
    } else {
      const rounds = Math.max(...exs.map(e => e.sets || 1));
      blocks.push({
        id: blockId, type: 'superset', rounds,
        exercises: exs.map(e => ({ id: e.id, label: e.label, name: e.name, target: { reps: e.reps, rpe: e.rpe, weight: e.weight } })),
      });
    }
  }
  return blocks;
}

function buildProgram(sheets) {
  const meta = _kv(sheets['Program'] || {});
  const name = meta.name || 'Untitled Program';
  const weeks = _num(meta.weeks) || 1;
  const pid = meta.id || _slug(name);

  const exRows = _table(sheets['Exercises'] || {});
  const warmups = _warmups(sheets['Warmups'] || {});

  // split base rows (no week / week 1) from per-week override rows (week >= 2)
  const baseRows = [];
  const weekRows = {};          // dayId -> { N -> [rows] }
  const progressLifts = [];
  const maxLifts = {};
  for (const r of exRows) {
    const dayId = (r.day_id || '').trim();
    if (!dayId) continue;
    const exId = _slug(r.exercise || (r.block || 'X'));
    if (_truthy(r.progress_lift || '') && !progressLifts.includes(exId)) progressLifts.push(exId);
    const mln = (r.max_lift_name || '').trim();
    if (mln) maxLifts[_slug(mln)] = mln;
    const wk = _num(r.week);
    if (wk && wk >= 2) {
      weekRows[dayId] = weekRows[dayId] || {};
      (weekRows[dayId][wk] = weekRows[dayId][wk] || []).push(r);
    } else {
      baseRows.push(r);
    }
  }

  const dayOrder = [];
  const dayGroups = {};
  const dayMeta = {};
  for (const r of baseRows) {
    const dayId = (r.day_id || '').trim();
    if (!dayGroups[dayId]) {
      dayOrder.push(dayId); dayGroups[dayId] = [];
      dayMeta[dayId] = { name: r.day_name || dayId, title: r.day_title || r.day_name || dayId };
    }
    dayGroups[dayId].push(r);
  }

  const outDays = [];
  const seen = new Set(dayOrder);
  const allDayIds = dayOrder.concat(Object.keys(warmups).filter(d => !seen.has(d)));
  for (const dayId of allDayIds) {
    seen.add(dayId);
    const dm = dayMeta[dayId] || { name: dayId, title: dayId };
    const dayObj = { id: dayId, name: dm.name, title: dm.title };
    const wu = warmups[dayId] || {};
    if (wu.warmup) dayObj.warmup = wu.warmup;
    if (wu.plyo) dayObj.plyo = wu.plyo;
    const grp = _groupDayRows(dayGroups[dayId] || []);
    const blocks = _blocksFromGroups(grp.blockOrder, grp.blocks);
    dayObj.blocks = blocks;
    if (!blocks.length && !Object.keys(wu).length) dayObj.plyo = { title: '—', items: [] };

    // per-week overrides: target overlay if all rows match base exercises, else independent week
    const wr = weekRows[dayId];
    if (wr) {
      const baseExIds = new Set();
      for (const b of blocks) for (const ex of b.exercises) baseExIds.add(ex.id);
      for (const N of Object.keys(wr).map(Number).sort((a, b) => a - b)) {
        const rws = wr[N];
        const allExist = baseExIds.size > 0 && rws.every(r => baseExIds.has(_slug(r.exercise || (r.block || 'X'))));
        if (allExist) {
          dayObj.weekTargets = dayObj.weekTargets || {};
          const ov = dayObj.weekTargets[N] = dayObj.weekTargets[N] || {};
          for (const r of rws) {
            const exId = _slug(r.exercise || (r.block || 'X'));
            const t = {};
            const repsRaw = (r.reps || '').trim(); if (repsRaw) t.reps = repsRaw;
            const rpe = _num(r.rpe); if (rpe != null) t.rpe = rpe;
            const wgt = _num(r.weight); if (wgt != null) t.weight = wgt;
            ov[exId] = Object.assign(ov[exId] || {}, t);
          }
        } else {
          const g = _groupDayRows(rws);
          dayObj.weekOverride = dayObj.weekOverride || {};
          dayObj.weekOverride[N] = {
            warmup: dayObj.warmup || { title: 'Warm-up', items: [] },
            plyo: dayObj.plyo || { title: 'Plyo / Core', items: [] },
            blocks: _blocksFromGroups(g.blockOrder, g.blocks),
          };
        }
      }
    }
    outDays.push(dayObj);
  }

  let max = maxLifts;
  if (!Object.keys(max).length) {
    max = { 'back-squat': 'Back Squat', 'rdl': 'Romanian Deadlift', 'sa-db-bench': 'Single Arm DB Bench (per arm)', 'trap-bar-squat': 'Trap Bar Squat', 'hip-thrust': 'Hip Thrust' };
  }
  return {
    id: pid, name, weeks: Math.trunc(weeks), days: outDays,
    maxLifts: Object.keys(max).map(k => ({ id: k, name: max[k] })),
    progressLifts,
  };
}

/* public: File/Blob -> program object */
async function programFromXlsx(file) {
  const buf = await file.arrayBuffer();
  const sheets = await readSheets(buf);
  if (!sheets['Program'] && !sheets['Exercises']) {
    throw new Error('Vorlage hat keine Program-/Exercises-Tabelle');
  }
  return buildProgram(sheets);
}

window.programFromXlsx = programFromXlsx;
