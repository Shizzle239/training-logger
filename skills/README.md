# Training Logger — Claude skills

Persistent "app master" capability for maintaining this PWA. Install a `.skill`
from `packages/` via the chat's **Save skill** button (or Settings -> Capabilities).

- **training-logger-master** — the core: code+workflow knowledge, the
  consequence-aware change loop, the preflight test gate, full-release deploy.
  Includes `reference/` (architecture, change-consequences, testing, deploy, gotchas).
- **training-logger-code-review** — review a change before it ships.
- **training-logger-frontend-qa** — UI quality + edge-case/QA hunting.
- **training-logger-changelog** — release notes + version-bump decisions.
- **training-logger-onboarding** — fast code map for a fresh session.

Adapted (code-review / frontend-qa / changelog / onboarding) from
alirezarezvani/claude-skills (MIT), tuned to this vanilla-JS PWA.

## The test gate (used by the master skill)
```
npm install            # once: jsdom + fake-indexeddb (devDeps)
node tools/preflight.js # syntax + JSON + deploy-consequence checks + headless boot smoke
```
