# Gotchas — the traps that bite

**Service-worker cache staleness.** The #1 trap. Change an asset without bumping
`sw.js` VERSION and installed phones keep the old app indefinitely. Always bump.
After deploy, the app updates on the SECOND launch (first caches, second runs).

**CRLF / OneDrive line-ending churn.** The repo lives in OneDrive on Windows;
the working tree is CRLF while committed files are LF, so `git status` shows
files "modified" that have zero real changes. NEVER `git add -A` — stage only the
files you actually edited, or you'll commit thousands of fake line-ending diffs.
The preflight version-check normalizes line endings so this churn never trips it.
(Optional permanent fix: a `.gitattributes` with `* text=auto eol=lf` — but that's
a one-time renormalization commit; ask first.)

**Editing files via tools then reading via the sandbox.** When a file is written
on the Windows/OneDrive side, the Linux sandbox mount can briefly serve a stale or
torn copy. If a freshly-written file looks truncated in bash, it's a sync lag, not
a real corruption — re-read, or write it from the side that will run it.

**The cached program.** A device prefers its IndexedDB `kv.program` over
`program.json`. Editing `program.json` does nothing on existing installs until
the user does **Data -> "Gehostetes neu laden"** or imports a program. New
installs get the new file. Always mention this when changing `program.json`.

**IndexedDB migrations.** Adding a store needs `DB_VERSION`++ and an
`onupgradeneeded` branch. The `onupgradeneeded` only runs when the version number
rises. Never drop/rename a store or change a `keyPath` without copying data first
— it wipes users' logs. The `sets` id `week|dayId|exId|setIdx` and session id
`week|dayId` are referenced everywhere; treat them as a contract.

**Bilingual UI.** Strings are mixed German and English (program content is mostly
German; some chrome is English). Keep the language of whatever you're editing.

**Audio/vibration.** The rest-timer beep uses WebAudio and `navigator.vibrate`,
both wrapped in try/guards. Some browsers need a user gesture before audio; don't
assume it always sounds. Keep the guards.

**Charts are inline SVG.** No chart library (Capacitor rule). If you add a chart,
build the SVG string like `barChartSvg`/`lineChartSvg` — don't reach for a CDN.

**`render()` swallows errors into a card.** A throwing renderer shows "Something
went wrong" instead of crashing. Handy, but it means a regression can hide as a
card — the boot smoke asserts the real content renders, so trust the gate over a
glance.

**No build step.** What's in the repo is what ships. There's nothing to compile;
edit the source files directly and they go live on push.

**iOS/Safari.** PWA install + storage on iOS is flakier than Android (the target
platform is Android/Chrome via the TWA). If asked about iPhone, set expectations:
storage can be evicted; JSON export/import is the safety net.
