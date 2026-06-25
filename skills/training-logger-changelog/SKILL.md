---
name: training-logger-changelog
description: >
  Turn the Training Logger commit history into clean release notes and pick the
  right version bump, matched to this app's scheme (vX.Y.Z that doubles as the
  sw.js cache VERSION). Use when cutting a release, summarizing what changed since
  the last version, writing release notes for a GitHub Release, or deciding
  patch/minor/major. Triggers: "changelog", "release notes", "what changed since
  v1.7.5", "what version is this", "write the release".
license: MIT
metadata:
  version: 1.0.0
  category: app-maintenance
  adapted_from: "alirezarezvani/claude-skills :: engineering/changelog-generator (MIT)"
  updated: 2026-06-25
---

# Training Logger — Changelog & Versioning

This app's version is also its service-worker cache key, so versioning and
release notes are the same act.

## Read the history

```bash
git log --oneline $(git describe --tags --abbrev=0 2>/dev/null)..HEAD   # since last tag
git log --oneline -20                                                   # recent
git tag --list 'v*' | sort -V | tail -5                                 # known versions
```
The commit style here is already descriptive (`vX.Y.Z: summary; validated via ...`).

## Pick the bump (semantic-ish, solo app)

- **patch** `v1.7.5 -> v1.7.6` — fix, copy tweak, styling, refactor.
- **minor** `v1.7.x -> v1.8.0` — a new user-facing feature/screen (e.g. a new tab).
- **major** `v1.x -> v2.0.0` — a data-model break or a redesign that changes how
  users interact or migrate (rare; needs a migration plan).
Whatever you pick, it must become the new `sw.js` VERSION on deploy.

## Render the notes (Keep a Changelog style)

```
## v1.7.6 — 2026-06-25
### Added      - new things users can do
### Changed    - behaviour/UX changes
### Fixed       - bugs fixed
### Internal   - tooling/tests/refactors (no user impact)
```
Keep it user-facing and plain. Group the dull internal items at the bottom. For a
**GitHub Release**, add a one-line headline and note whether a new APK is attached
(routine web changes auto-update via the TWA — usually no new APK needed; see
`training-logger-master/reference/deploy-runbook.md`).

## Optional: a CHANGELOG.md

If Dylan wants a running file, prepend each release block to `CHANGELOG.md` at the
repo root (newest first). It's a normal repo file — not a cached asset — so it
does NOT require a `sw.js` VERSION bump.
