/* sync.js — coach auto-sync (v1.22.0, 26 Jul 2026). HUB-ORIGIN ONLY.
   Served under training-hub…/logger/ every logged session is pushed to the
   coach automatically: the SAME schema-1 objects the manual export builds
   (buildSessionExport) are POSTed to /api/sessions, where Cloudflare Access
   identifies the athlete server-side — no tokens, no config in the client.
   On github.io or inside Capacitor this file is DORMANT (the /api/health
   probe fails) and the manual export stays the flow.

   State-compare design: a kv ledger maps session_id -> content fingerprint;
   every flush re-serializes all sessions and pushes only new/changed ones.
   The FIRST run under the hub therefore migrates the whole logged history
   automatically. Idempotent on the server (upsert by athlete+session_id).

   Program bootstrap: a fresh install under the hub (no kv.program yet) pulls
   the athlete's own program from /api/program — so an athlete's first visit
   via the hub deep-link lands in a ready-to-log app. Never overwrites an
   already-installed program. */
'use strict';
(() => {
  const HEALTH = '/api/health', API = '/api/sessions', PROG = '/api/program';
  let _active = null;            // null = unknown · false = dormant · true = hub mode
  let _busy = false, _timer = null;

  async function probe() {
    if (_active !== null) return _active;
    try {
      const r = await fetch(HEALTH, { cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      _active = !!(j && j.ok && j.athlete);
    } catch (_) { _active = false; }
    return _active;
  }

  async function buildAll() {
    const [sets, sessions, bw] = await Promise.all([dbGetAll('sets'), dbGetAll('sessions'), dbGetAll('bodyweight')]);
    const bwMap = new Map(bw.map(b => [b.week, b.kg]));
    const seen = new Set(); const out = [];
    for (const sess of sessions) {
      if (seen.has(sess.id)) continue;
      seen.add(sess.id);
      const obj = buildSessionExport(sess.week, sess.day, sets, sessions, bwMap);
      if (obj) out.push(obj);
    }
    return out;
  }

  /* stable content fingerprint — exported_at changes every serialization, drop it */
  function fp(obj) {
    const rest = Object.assign({}, obj); delete rest.exported_at;
    const s = JSON.stringify(rest);
    return tinyHash(s) + ':' + s.length;
  }

  async function flush(_why) {
    if (_busy || !navigator.onLine) return;
    if (!(await probe())) return;
    _busy = true;
    try {
      const row = await dbGet('kv', 'sync.state');
      const state = (row && row.value) || {};
      const dirty = (await buildAll()).filter(o => state[o.session_id] !== fp(o));
      if (!dirty.length) return;
      for (let i = 0; i < dirty.length; i += 25) {
        const batch = dirty.slice(i, i + 25);
        const r = await fetch(API, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(batch),
        });
        if (!r.ok) throw new Error('sync http ' + r.status);
        batch.forEach(o => { state[o.session_id] = fp(o); });
        await dbPut('kv', { key: 'sync.state', value: state });
      }
      if (typeof toast === 'function') toast('☁ ' + dirty.length + ' Session' + (dirty.length === 1 ? '' : 's') + ' mit Coach synchronisiert ✓');
    } catch (_) { /* silent — the next trigger retries; nothing is ever lost locally */ }
    finally { _busy = false; }
  }

  const kick = why => { clearTimeout(_timer); _timer = setTimeout(() => flush(why), 2500); };

  window.addEventListener('hashchange', () => kick('nav'));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush('hide'); });
  window.addEventListener('online', () => kick('online'));
  setInterval(() => flush('tick'), 5 * 60 * 1000);
  kick('boot');

  (async function programBootstrap() {
    try {
      if (!(await probe())) return;
      const cur = await dbGet('kv', 'program');
      if (cur && cur.value && cur.value.days) return;       // never overwrite an installed program
      const r = await fetch(PROG, { cache: 'no-store' });
      if (!r.ok) return;
      const prog = await r.json();
      if (!prog || !prog.name || !Array.isArray(prog.days) || !prog.days.length) return;
      await dbPut('kv', { key: 'program', value: prog });
      if (typeof App !== 'undefined') App.program = prog;
      if (typeof harvestExercises === 'function') { try { await harvestExercises(prog); } catch (_) {} }
      if (typeof render === 'function') { try { await render(); } catch (_) {} }
      if (typeof toast === 'function') toast('Dein Programm wurde vom Coach geladen ✓');
    } catch (_) {}
  })();

  window.__coachSync = { flush, probe };                     // debug handle
})();
