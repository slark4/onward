# Onward

A Chrome extension that interrupts time on monitored sites with a guided 3-minute grounding session instead of hard-blocking.

## Current Phase

**Phase 4 — Content Pool:** Build `src/shared/content_pool.json` with the full set of breathing cues, reflection prompts, and grounding checklist items. Update `panel.js` to load the pool and select content randomly each session. Content lives in `content_pool.json` so it can be expanded without touching logic.

## Key Constraints

- Vanilla HTML, CSS, and JavaScript — no frameworks, no React, no build tools
- Chrome Extension Manifest V3
- `chrome.storage.local` for all persistence — no backend, no user accounts
- Chrome-only for V1

## Architecture at a Glance

| Script | Role |
|--------|------|
| `src/background/service_worker.js` | Time tracking, alarm handling |
| `src/content/content_script.js` | Injects blur + focus panel into monitored pages |
| `src/popup/popup.html` | Toolbar icon popup (stats + settings shortcut) |
| `src/options/options.html` | Full settings and onboarding page |

Scripts communicate via `chrome.runtime.sendMessage` — they cannot call each other directly.

## Full Spec

`docs/onward_spec_v1.md` — product spec, UX details, content pool, all six build phases.
