# Deploy Runbook — shipping a change to the phone

Deploy mode (agreed with Dylan): **full release** — Claude edits, tests,
versions, commits, and pushes. The TWA APK then auto-updates from GitHub Pages.

## Standard release (the routine)

1. **Green gate**: `node tools/preflight.js` ends `OK preflight passed`.
2. **Bump the version** (only if a cached asset changed — preflight tells you):
   edit `sw.js`, `const VERSION = 'v1.7.5'` -> next patch `'v1.7.6'` (minor for a
   feature: `v1.8.0`). Re-run preflight so the version-bump check goes green.
3. **Stage only what changed** — NEVER `git add -A` (the working tree is CRLF vs
   committed LF; a blanket add commits the whole repo as line-ending noise):
   ```bash
   git add sw.js app.js styles.css         # the files you actually edited
   git status                               # confirm ONLY those are staged
   ```
4. **Commit** in Dylan's style:
   ```bash
   git commit -m "v1.7.6: <short summary>; validated via preflight (syntax+JSON+static+boot)"
   ```
5. **Push**:
   ```bash
   git push
   ```
   If push needs auth and it isn't configured, do everything up to the commit and
   give Dylan the one line to run (`git push`) or use the GitHub connector if set
   up. Don't leave a committed-but-unpushed change without telling him.
6. **Tell Dylan**: new version, what changed, and "open the app twice — first
   launch downloads the update, second runs it."

## What happens after push

`git push` -> GitHub Pages rebuilds (~1 min) -> the TWA shell (and any browser
install) fetches the new `sw.js`; because VERSION changed, the SW installs a fresh
cache and drops the old one on next activate. **The app updates on the second
launch** (first launch caches, second serves it). This is why forgetting the
VERSION bump silently strands users on the old build.

## Releases / the APK

The repo has GitHub Releases with signed APK artifacts (e.g. v1.5.0, v1.7.x). The
**TWA auto-updates from Pages**, so a routine web change does NOT need a new APK.
A new signed APK is only for: first install / distributing to other people / the
Capacitor standalone build. Keystore lives in `OneDrive\WorkoutTracker-keys`
(same key must sign every APK). The Capacitor build steps are in `CAPACITOR.md` —
that path is for later, not routine deploys.

## Rollback

A bad deploy is fixed forward, never by reusing an old VERSION string:
```bash
git revert <bad-commit>     # or restore the previous file contents
# bump VERSION again, e.g. v1.7.6 -> v1.7.7 (reverting to v1.7.5's behaviour)
node tools/preflight.js
git add sw.js <files> && git commit -m "v1.7.7: revert <thing>; back to known-good" && git push
```
Reusing a prior VERSION leaves phones that already cached it unable to update.

## One-time hygiene (optional, ask first)

The CRLF/LF churn can be killed permanently by committing a `.gitattributes` with
`* text=auto eol=lf`, but it creates a one-off repo-wide renormalization commit.
Propose it to Dylan; don't do it silently mid-feature.
