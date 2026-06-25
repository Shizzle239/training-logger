---
name: training-logger-code-review
description: >
  Review a change to Dylan's Training Logger app (vanilla-JS PWA) before it ships
  — blast-radius, the deploy-consequence matrix, web security (XSS/escaping,
  IndexedDB, data loss), and regression risk. Use when asked to "review this
  change", "is this safe to deploy", "check before I push", "code review", or
  after implementing an app change and before committing. Pairs with the preflight
  gate and the training-logger-master skill.
license: MIT
metadata:
  version: 1.0.0
  category: app-maintenance
  adapted_from: "alirezarezvani/claude-skills :: engineering/pr-review-expert (MIT)"
  updated: 2026-06-25
---

# Training Logger — Code Review

Structured review for a change to the Training Logger PWA. Go beyond style nits:
trace the blast radius, catch the consequence-matrix violations, scan for web
security issues, and judge regression risk. Output a short, prioritized verdict —
**Block / Fix / Ship** — not a wall of text.

## Get the change

```bash
git diff                      # unstaged
git diff --staged             # staged
git diff HEAD~1               # last commit
```
On the OneDrive working tree, ignore pure CRLF diffs (`git diff --ignore-cr-at-eol`)
— focus on real content.

## Review checklist (this app)

**Blast radius**
- Which cached assets changed? -> is `sw.js` VERSION bumped? (the #1 miss)
- New file -> is it in `index.html` AND `sw.js` ASSETS?
- Does it touch `program.json` shape, the `sets` id format, or a renderer many
  views share (`forEachSet`, `exerciseSets`, `prettyName`)?

**IndexedDB / data safety**
- Schema change -> `DB_VERSION` bumped + `onupgradeneeded` + `STORES` updated?
- Any store rename/keyPath change without a migration? (BLOCK — destroys data.)
- Destructive flow still behind `confirm()` + backup nudge?

**Web security**
- Is every value inserted into `innerHTML` passed through `esc()`? (XSS) — the
  app builds HTML via template strings, so unescaped user/program text is a real
  risk.
- No `eval`, no remote `<script>`, no CDN, no absolute asset URL (Capacitor rule).

**Correctness / regression**
- Will Home/Log/Maxes/Progress/Data still render? (preflight boot smoke proves it.)
- Offline still works (no new network dependency)?
- Bilingual strings preserved (German/English)?

**Process**
- Did `node tools/preflight.js` pass green? If not run, run it.

## Verdict format

```
VERDICT: Block | Fix-then-ship | Ship
- [BLOCK]  <issue> -> <why it breaks> -> <fix>
- [FIX]    <issue> -> <suggestion>
- [NIT]    <minor>
Preflight: <pass/fail>   Version bump: <needed? done?>
```
Reference `training-logger-master/reference/change-consequences.md` for the full
matrix.
