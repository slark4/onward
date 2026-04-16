# Onward — Product Specification & Build Plan

**A reset, not a block.**

Version 1.0 — MVP Scope
Slark Ventures LLC
April 2026

---

## 1. Executive Summary

Onward is a browser extension that interrupts time spent on unproductive websites with a guided three-minute grounding session. Rather than hard-blocking access (which breeds resentment and uninstalls), Onward acts as a mindful speed bump: when a user exceeds their allotted time on a monitored site, the page gradually blurs, a focus panel appears, and the user moves through three short wellness exercises before choosing whether to continue.

The product differentiates from existing tools (Opal, One Sec, ScreenZen, Cold Turkey) in two key ways: (1) it treats the interruption as a structured reset experience rather than a single modal or hard block, and (2) its content system is architected for expansion into learning, reflection, and spiritual-practice packs in future versions.

V1 ships as a Chrome extension on desktop, with local-only data storage, a single wellness-themed content pack, and no user accounts. The goal of V1 is to validate that the three-tab interruption mechanic produces the intended behavior change in real users, before investing in cross-device sync, additional content packs, or mobile expansion.

### Tagline Options

- Three minutes. Then decide.
- A reset, not a block.
- Pause. Reflect. Continue with intention.

---

## 2. Problem & Positioning

### 2.1 The Problem

People lose hours each day to unconscious scrolling on YouTube, TikTok, Reddit, X, Instagram, and similar platforms. The dominant feeling afterward is regret and dysregulation, not enjoyment. Existing solutions fall into two broken categories:

- **Hard blockers** (Cold Turkey, Freedom) — punitive, users resent them and disable them when the urge gets strong. Adversarial relationship with the tool.
- **Single-moment interrupts** (One Sec, Opal) — effective for a moment, but easy to click through once the pattern becomes familiar. The interrupt becomes background noise.

### 2.2 Onward's Wedge

Onward's interrupt is a structured 3-minute guided session, not a single modal. This structural change creates several product advantages:

- Active participation (breathing, reflection, checklist) rather than passive waiting
- Cannot be mentally checked-out-of the way a single countdown can
- Reframes the interruption from punishment to genuine self-care
- Content-modular architecture allows expansion without rebuilding the core loop

### 2.3 Target User

Adults (18+) who self-identify as wanting to reduce unproductive screen time but dislike the punitive feel of hard blockers. Secondary market: parents wanting softer controls for teens. V1 is consumer-focused; parental controls are a post-V1 consideration.

---

## 3. Product Specification — V1

### 3.1 Core User Flow

1. User installs the Onward extension from the Chrome Web Store.
2. Onboarding: user selects up to 5 sites to monitor from a preset list (YouTube, TikTok web, Instagram, Reddit, X, plus custom URL option).
3. User sets a time budget per site (presets: 5 / 15 / 30 min; default 15).
4. User browses normally. Extension tracks time per monitored site in the background.
5. When budget expires: the active tab's content blurs over ~1.5 seconds, and a centered focus panel fades in.
6. User is guided through a 3-tab grounding session (detailed below).
7. Upon completion, user receives a fresh time budget for that specific site.
8. If the user must bypass the session, they may use one of 3 daily emergency skips.

### 3.2 The 3-Tab Grounding Session

This is the core differentiator of the product. The session is composed of three sequential tabs. The user clicks through each tab manually — there is no auto-advance.

| Tab | Activity | Purpose & Mechanic |
|-----|----------|---------------------|
| 1 | Breathing exercise | A visual circle expands and contracts to a calming cadence (4s in, 4s hold, 6s out). Interrupts the scroll trance through somatic regulation. |
| 2 | Reflection prompt | A rotating question such as "What have you done in the last hour?" or "Is this where you want to be right now?" Prompts conscious awareness. |
| 3 | Grounding checklist | A body/task check: hydrated? eaten? moved? is there something you're avoiding? User can tick items (purely for self-awareness, not tracked). |

#### 3.2.1 Tab Timing Rules

- Each tab has a suggested duration of 1 minute (3 minutes total).
- The Next button is HIDDEN for the first 45 seconds of each tab.
- At 45 seconds, the Next button fades in and becomes clickable.
- There is NO auto-advance — if a user is genuinely reflecting, they can stay on a tab indefinitely.
- This hybrid model respects user agency while enforcing a minimum engagement window.

#### 3.2.2 Content Rotation

Each tab draws from a small content pool to prevent fatigue:

- 3 breathing cadence variations (e.g., box breathing, 4-7-8, simple inhale/exhale)
- 8–10 reflection prompts
- 4–5 grounding checklist variations

This yields 120+ possible session combinations at launch, keeping the experience feeling fresh for at least several weeks of daily use.

### 3.3 Emergency Skip

Users have 3 emergency skips per calendar day. To use a skip:

1. User clicks the "I really need to be here right now" link (small, intentionally de-emphasized in the UI).
2. A text field appears requiring the user to type a reason (minimum 10 characters).
3. Upon submission, the user is granted a REDUCED time budget (5 minutes, regardless of their normal budget) rather than the full budget.
4. Skip counter decrements. Counter resets at local midnight.

This design acknowledges legitimate need (adult user, might need site for work) while creating enough friction to prevent lazy abuse.

### 3.4 Anti-Exploit Rules

- Closing the tab mid-session counts as a full interrupt; no bonus time is granted. User must complete the session on next visit.
- Refreshing the page mid-session does NOT reset the session — the session state persists.
- Opening the same site in a new tab after an interrupt does NOT bypass it — tracking is per-site, not per-tab.
- Disabling the extension is possible (Chrome gives users this power), but is logged locally and visible in the stats view as an honesty signal for the user to self-audit.

### 3.5 Settings & Customization

- Add/remove/edit monitored sites (max 5 in V1)
- Adjust per-site time budget (5/15/30 min presets)
- Toggle which tab types appear (e.g., disable breathing if user dislikes it)
- View session history and skip usage
- Reset all data (for privacy)

### 3.6 Out of Scope for V1

Explicitly deferred to later versions to protect shipping velocity:

- User accounts and cross-device sync
- Mobile (iOS or Android)
- Additional content packs (religious, learning, SAT prep, etc.)
- Parental controls / child profiles
- Social features (streaks shared with friends, etc.)
- Firefox / Safari / Edge support (Chrome-only at launch)
- Custom user-written prompts
- Analytics dashboard beyond basic local stats

---

## 4. Visual & UX Design

### 4.1 The Interrupt Moment

The moment of interrupt is the product. Its execution determines whether users love or uninstall Onward.

- **Trigger:** Time budget on monitored site expires.
- **Phase 1 (0.0s–1.5s):** The active page content blurs gradually via CSS filter transition (from 0px to 8px blur). Background color shifts subtly toward a calming off-white overlay.
- **Phase 2 (1.5s–2.0s):** The focus panel fades in from 0 to 100% opacity, centered on screen, with a soft drop shadow. ~600px wide, ~500px tall, rounded corners.
- **Phase 3 (2.0s onward):** User is on Tab 1 of the grounding session. The Next button is invisible; only the activity content is visible.

The slow blur is critical. An instant blur or black screen feels jarring and punitive. A 1.5-second gradual blur gives the nervous system time to settle before the prompt arrives — the difference between "ugh, this app again" and "oh, right, thank you."

### 4.2 Visual Tone

- Palette: warm off-white background, deep navy primary (#2E3A59), soft sage accent (#87A96B), warm terracotta for skip/warning (#C96F4A)
- Typography: one serif for headers (Lora or similar), one humanist sans for body (Inter, Source Sans)
- No harsh contrast, no dark mode in V1
- Generous whitespace; content should feel unhurried
- No gamification language ("streaks", "points", "levels") — this product is about sincerity, not engagement metrics

### 4.3 Extension Popup (toolbar icon click)

Small popup (~350x500px) shown when user clicks the Onward icon in the Chrome toolbar. Contains:

- Today's summary: minutes reclaimed, sessions completed, skips remaining
- Quick-access button to full settings page
- Current status per monitored site (e.g., "YouTube: 8 min remaining")

---

## 5. Technical Stack

### 5.1 Stack Summary

| Layer | Choice | Why |
|-------|--------|-----|
| Platform | Chrome Extension (Manifest V3) | Modern Chrome standard. Firefox/Edge port is straightforward later. |
| Core language | HTML, CSS, vanilla JavaScript | Familiar from Slarks build. No framework overhead needed at V1 scale. |
| UI for panel | Plain HTML/CSS injected via content script | React is overkill for 3 screens. Vanilla keeps bundle tiny. |
| Storage | chrome.storage.local API | Built into the extension platform. No backend, no accounts needed for V1. |
| Time tracking | chrome.tabs + chrome.alarms APIs | Standard Chrome APIs for detecting active tab and scheduling checks. |
| Content pool | Static JSON file in extension bundle | No CMS needed. Updates ship with extension updates. Simple. |
| Build tooling | None (V1) — raw files | Add Vite or similar only when complexity demands it. Not yet. |
| Distribution | Chrome Web Store | $5 one-time developer fee. Review typically 1–3 days. |
| Version control | Git + GitHub (private repo) | Standard hygiene. Enables rollback and future collaborators. |

### 5.2 Chrome Extension Architecture — Mental Model

A Chrome extension is made of several cooperating scripts, each with a specific role. This is the most important concept to internalize before coding.

- **manifest.json** — The "ID card" of the extension. Declares name, version, permissions, and which scripts run where. Chrome reads this first.
- **Background script (service worker)** — Runs in the background across all tabs. This is where time tracking lives. It listens for tab changes and ticks a timer.
- **Content script** — Injected into monitored web pages. This is what applies the blur and renders the focus panel ON TOP of YouTube/Reddit/etc. Has access to the page's DOM.
- **Popup** — The small window that appears when the user clicks the toolbar icon. Its own HTML page. Used for quick stats and settings shortcut.
- **Options page** — A full-tab settings page. Used for the initial onboarding and deep settings.
- **chrome.storage.local** — The "database." Key-value store that persists across browser restarts. All user preferences and state live here.

These scripts cannot directly call each other. They communicate via message-passing (`chrome.runtime.sendMessage`). This is the primary architectural constraint to get comfortable with.

### 5.3 Required Chrome Permissions

- **storage** — for saving user settings locally
- **tabs** — for detecting which tab is active
- **alarms** — for scheduled checks without keeping scripts alive
- **host_permissions** (scoped to monitored sites only) — required to inject the content script and apply the blur

Permissions should be requested narrowly. Chrome Web Store reviewers reject extensions that request more than they need, and users are (rightly) suspicious of broad permissions.

---

## 6. File Structure

Proposed project layout for V1:

```
onward/
├── manifest.json              # Extension config & permissions
├── src/
│   ├── background/
│   │   └── service_worker.js  # Time tracking, alarm handling
│   ├── content/
│   │   ├── content_script.js  # Injects focus panel on trigger
│   │   ├── panel.html         # The 3-tab session UI
│   │   ├── panel.css          # Panel styling (blur, fade, layout)
│   │   └── panel.js           # Tab logic, timing, skip flow
│   ├── popup/
│   │   ├── popup.html         # Toolbar icon popup
│   │   ├── popup.css
│   │   └── popup.js
│   ├── options/
│   │   ├── options.html       # Full settings & onboarding page
│   │   ├── options.css
│   │   └── options.js
│   ├── shared/
│   │   ├── storage.js         # Wrapper around chrome.storage.local
│   │   └── messages.js        # Message-passing constants
│   └── data/
│       └── content_pool.json  # Breathing, prompts, checklists
├── assets/
│   ├── icon-16.png
│   ├── icon-48.png
│   ├── icon-128.png
│   └── fonts/
├── README.md
└── .gitignore
```

---

## 7. Build Phases

Shipping order is designed to de-risk the hardest pieces first and keep momentum. Each phase should end with something you can personally test.

### Phase 1 — Foundation (Week 1)

Goal: A minimum extension that loads in Chrome and can log "hello world" from each script type. No user-visible features yet.

- Set up project folder, git repo, manifest.json
- Register extension in Chrome developer mode (chrome://extensions)
- Create stub background service worker, content script, popup, and options page
- Verify message-passing works between all four
- **Milestone:** you can click the icon and see a popup; open a test page and see content script log to console

### Phase 2 — Time Tracking (Week 1–2)

Goal: The background script correctly tracks time spent on a test site and fires an "interrupt needed" event.

- Hard-code one monitored site (e.g., youtube.com) and a short 2-minute budget for testing
- Use chrome.tabs.onActivated and chrome.tabs.onUpdated to detect when the user is on the site
- Use chrome.alarms to tick every 30 seconds and accumulate time
- Persist the time tally in chrome.storage.local
- When budget is exceeded, send a message to the content script
- **Milestone:** open YouTube, wait 2 minutes, see console message "interrupt triggered"

### Phase 3 — The Interrupt UI (Week 2–3)

Goal: The full visual interrupt experience works end-to-end, with placeholder content.

- Content script receives "interrupt" message and applies CSS blur to the page
- Inject the focus panel HTML/CSS over the blurred page
- Build the 3-tab UI: breathing animation, prompt text, checklist
- Implement the 45-second rule: Next button hidden, then fades in
- On session complete: remove blur and panel, reset time budget
- **Milestone:** full interrupt experience triggers, feels right, grants new budget

### Phase 4 — Content Pool & Rotation (Week 3)

Goal: Replace placeholder content with real content pool and random selection.

- Write the full content_pool.json: breathing variations, prompts, checklists
- Implement random selection per session (no repeats within a single session)
- Polish copy — every line the user sees should feel intentional
- **Milestone:** run 5 sessions in a row; each feels different

### Phase 5 — Settings & Onboarding (Week 4)

Goal: Users can configure which sites to monitor, set budgets, and see stats.

- Build options page: site selection, budget picker, first-run onboarding flow
- Build popup: today's stats, quick access to settings
- Implement emergency skip flow: reason input, skip counter, daily reset
- **Milestone:** complete first-run flow from install through first real interrupt

### Phase 6 — Polish & Submit (Week 5)

Goal: Ship to Chrome Web Store.

- Design final icons (16/48/128)
- Write store listing: screenshots, description, privacy policy
- Test on fresh Chrome profile, fresh install
- Pay $5 developer fee, submit for review
- **Milestone:** Onward is live on the Chrome Web Store

---

## 8. Risks & Open Questions

### 8.1 Technical Risks

- **Service worker lifecycle:** Chrome aggressively suspends background scripts. Time tracking must survive suspension via chrome.alarms and persistent storage rather than in-memory state. This is a known quirk and has standard solutions, but it will require care.
- **Content script conflicts:** Some sites (YouTube especially) have aggressive single-page app routing. The content script may need to re-initialize on URL changes without full page reloads.
- **CSS injection conflicts:** The focus panel's CSS must win specificity battles with the host site. Likely solution: render inside a Shadow DOM to isolate styles.

### 8.2 Product Risks

- **Users disable the extension when the urge is strong.** Partial mitigation: the local "honesty log" of disable events. Full mitigation requires auth & server — out of scope for V1.
- **3 minutes feels too long and users rage-uninstall.** Monitor feedback; be prepared to make tab duration configurable in V1.1.
- **The reflection prompts feel corny.** Copy quality is critical. Budget real time for writing and revising prompts. Consider testing with 5–10 friendly users before submission.

### 8.3 Open Questions for Later

- Should disabling the extension during an interrupt be detected and result in a cooldown on that site? (Deferred — needs more thought.)
- Should there be a "focus mode" where the user proactively starts a work session and Onward interrupts any distraction? (Potentially V2 feature.)
- Pricing model: free forever, freemium, or one-time purchase? (Defer until V1 has users.)
- What does a "V2 content pack marketplace" look like? (Noted as strategic direction; not a V1 decision.)

---

## 9. V1 Success Metrics

Before adding features or expanding scope, V1 must prove out the core mechanic. The following local metrics (viewable to the user only, no telemetry in V1) define success:

- **Session completion rate:** >70% of triggered interrupts are completed (user does not close the tab mid-session).
- **Skip usage rate:** <30% of interrupts result in an emergency skip being used.
- **7-day retention:** The developer (you) and at least 3 friendly testers still have the extension installed and actively interrupting after 7 days.
- **Qualitative:** Testers report feeling more grounded / less regretful after sessions compared to baseline scrolling.

Telemetry and aggregate metrics are deliberately deferred to V2 — the V1 bar is qualitative and personal. If the product does not demonstrably change YOUR behavior when you use it, it will not change anyone else's.

---

## 10. Appendix: Content Pool Starter List

Draft content for the V1 content_pool.json. Polish pass required before ship.

### 10.1 Breathing Variations

- Box breathing: 4s in / 4s hold / 4s out / 4s hold
- Calming: 4s in / 0s hold / 6s out
- 4-7-8: 4s in / 7s hold / 8s out

### 10.2 Reflection Prompts (draft)

- What have you done in the last hour? Are you okay with that?
- Is this where you want to be right now?
- What were you doing before you came here?
- What were you hoping to find?
- If today ended right now, what would you wish you'd done instead?
- Name one thing you're avoiding.
- When was the last time you stood up?
- What would the version of you from this morning want you to do next?

### 10.3 Grounding Checklists (draft)

- Body check: water, food, movement, fresh air, bathroom
- Task check: is there something from your to-do list that will take under 5 minutes?
- Sensory check: 5 things you can see, 4 you can hear, 3 you can touch
- Connection check: anyone you've been meaning to message?
