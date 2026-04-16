// Onward — Panel
// Owns the full interrupt experience: blur, Shadow DOM panel, 3-tab session,
// engagement requirements per tab, and session completion.
//
// Exposes window.OnwardPanel.show() for content_script.js to call.
// Depends on MESSAGES (messages.js) being loaded first.

window.OnwardPanel = (() => {

  // ---------------------------------------------------------------------------
  // Content pool — loaded async from content_pool.json; fallback if unavailable
  // ---------------------------------------------------------------------------

  const FALLBACK_CONTENT = {
    breathing: {
      label: "Take a breath",
      phases: [
        { cue: "Breathe in",  ms: 4000 },
        { cue: "Hold",        ms: 4000 },
        { cue: "Breathe out", ms: 6000 },
      ],
    },
    reflection: "What have you done in the last hour? Are you okay with that?",
    checklist: {
      label: "Check in with yourself",
      items: [
        "Had some water recently",
        "Eaten something today",
        "Moved or stretched in the last hour",
        "Is there something you're avoiding?",
      ],
    },
  };

  let pool = null;

  (async () => {
    try {
      const resp = await fetch(chrome.runtime.getURL("src/shared/content_pool.json"));
      pool = await resp.json();
      console.log("[Onward] Content pool loaded.");
    } catch (e) {
      console.warn("[Onward] Could not load content pool, using fallback:", e);
    }
  })();

  // ---------------------------------------------------------------------------
  // Pool selection — shuffle queues per category, no repeats until all seen
  // ---------------------------------------------------------------------------

  const queues = {};

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Returns the next item from a shuffled queue for the given pool category.
  // When the queue empties it reshuffles the full category — guarantees every
  // item is seen before any repeats.
  function nextFromPool(category) {
    if (!queues[category] || queues[category].length === 0) {
      queues[category] = shuffle(pool[category]);
    }
    return queues[category].pop();
  }

  // Assembles one session's content: one breathing entry, one reflection
  // prompt, and a random sample of checklist items from the larger pool.
  function pickSession() {
    if (!pool) return FALLBACK_CONTENT;
    return {
      breathing: nextFromPool("breathing"),
      reflection: nextFromPool("reflection"),
      checklist: {
        label: pool.checklist.label,
        items: shuffle(pool.checklist.items).slice(0, pool.checklist.pick),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Timing & engagement constants
  // ---------------------------------------------------------------------------

  const BLUR_DURATION_MS     = 2_000;  // fade-in; compositor-driven, reliable at full 2s
  const BLUR_OUT_DURATION_MS = 1_000;  // fade-out on completion — faster exit feels right
  const PANEL_FADE_MS        = 500;
  const NEXT_BTN_DELAY_MS    = 45_000; // Tab 1: 45s before Next appears
  const REFLECTION_MIN_CHARS = 80;     // Tab 2: minimum characters to unlock Next
  const SKIP_MIN_CHARS       = 30;     // Skip confirmation: minimum reason length

  // ---------------------------------------------------------------------------
  // Styles (injected into Shadow DOM — fully isolated from the host page)
  // ---------------------------------------------------------------------------

  const CSS = `
    :host {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: center;
      /* Explicit stack prevents host-page font/color inheritance bleeding in */
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 16px;
      line-height: 1.5;
      color: #2E3A59;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* ---- Panel shell ---- */

    .panel {
      background: #FAF9F6;
      border-radius: 16px;
      box-shadow: 0 8px 48px rgba(46, 58, 89, 0.2);
      width: 600px;
      min-height: 500px;
      padding: 40px;
      pointer-events: auto;
      opacity: 0;
      transition: opacity ${PANEL_FADE_MS}ms ease;
      display: flex;
      flex-direction: column;
    }

    .panel.visible { opacity: 1; }

    /* ---- Progress dots ---- */

    .progress {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-bottom: 40px;
    }

    .progress-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #D0D5E0;
      transition: background 300ms ease;
    }

    .progress-dot.active { background: #2E3A59; }
    .progress-dot.done   { background: #87A96B; }

    /* ---- Tabs ---- */

    .tab {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }

    .tab.hidden { display: none; }

    .tab-title {
      font-family: 'Lora', Georgia, serif;
      font-size: 22px;
      font-weight: 600;
      color: #2E3A59;
      margin-bottom: 36px;
    }

    /* ---- Tab 1: Breathing ---- */

    .breath-ring {
      width: 140px;
      height: 140px;
      border-radius: 50%;
      background: radial-gradient(circle, #87A96B 0%, #5E8A4A 100%);
      opacity: 0.88;
      margin-bottom: 28px;
      transform: scale(0.55);
      /* transform is driven by JS — see startBreathing() */
    }

    .breath-label {
      font-size: 13px;
      color: #87A96B;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      min-height: 20px;
    }

    /* ---- Tab 2: Reflection ---- */

    .prompt {
      font-family: 'Lora', Georgia, serif;
      font-size: 20px;
      line-height: 1.7;
      color: #2E3A59;
      max-width: 460px;
      font-style: italic;
      margin-bottom: 0;
    }

    .reflection-input {
      width: 100%;
      max-width: 460px;
      min-height: 110px;
      margin-top: 20px;
      padding: 14px 16px;
      border: 1.5px solid #D0D5E0;
      border-radius: 8px;
      font-family: inherit;
      font-size: 15px;
      line-height: 1.6;
      color: #2E3A59;
      background: #FFFFFF;
      resize: vertical;
      outline: none;
      transition: border-color 200ms ease;
    }

    .reflection-input::placeholder {
      /* Meaningfully lighter than typed text so the user sees it's empty */
      color: #B8C0CC;
    }

    .reflection-input:focus {
      border-color: #87A96B;
    }

    .char-counter {
      width: 100%;
      max-width: 460px;
      margin-top: 6px;
      font-size: 12px;
      color: #C0C8D4;
      text-align: right;
      transition: color 300ms ease;
    }

    .char-counter.met {
      color: #87A96B;
    }

    /* ---- Tab 3: Checklist ---- */

    .checklist {
      list-style: none;
      width: 100%;
      max-width: 360px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      text-align: left;
    }

    .checklist label {
      display: flex;
      align-items: center;
      gap: 14px;
      font-size: 16px;
      color: #2E3A59;
      cursor: pointer;
      user-select: none;
    }

    .checklist input[type="checkbox"] {
      appearance: none;
      -webkit-appearance: none;
      width: 20px;
      height: 20px;
      min-width: 20px;
      border: 2px solid #C0C8D8;
      border-radius: 4px;
      cursor: pointer;
      transition: background 200ms ease, border-color 200ms ease;
      background-repeat: no-repeat;
      background-position: center;
    }

    .checklist input[type="checkbox"]:checked {
      background-color: #87A96B;
      border-color: #87A96B;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='10' viewBox='0 0 12 10'%3E%3Cpath d='M1 5l3 3 7-7' stroke='white' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    }

    .checklist-hint {
      margin-top: 18px;
      font-size: 13px;
      color: #C0C8D4;
    }

    /* ---- Footer & Next button ---- */

    .footer {
      margin-top: 40px;
      display: flex;
      justify-content: flex-end;
    }

    .next-btn {
      background: #2E3A59;
      color: #FAF9F6;
      border: none;
      border-radius: 8px;
      padding: 12px 28px;
      font-family: inherit;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      transition: opacity 500ms ease, background 150ms ease;
    }

    .next-btn.visible {
      opacity: 1;
      pointer-events: auto;
    }

    .next-btn:hover { background: #1E2A45; }
  `;

  // Styles for the skip affordance (separate Shadow DOM, fixed bottom-right)
  const SKIP_CSS = `
    :host {
      position: fixed;
      bottom: 20px;
      right: 24px;
      z-index: 2147483647;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .skip-link {
      font-size: 11px;
      color: #B0B8C8;
      cursor: pointer;
      background: none;
      border: 1px solid #D8DCE6;
      border-radius: 6px;
      padding: 6px 12px;
      font-family: inherit;
      letter-spacing: 0.03em;
      transition: color 150ms ease, border-color 150ms ease;
      display: block;
      text-align: right;
    }

    .skip-link:hover {
      color: #C96F4A;
      border-color: #C96F4A;
    }

    .skip-link.disabled {
      cursor: default;
      pointer-events: none;
      color: #C0C8D4;
      border-color: #E8EAF0;
    }

    .skip-card {
      background: #FAF9F6;
      border: 1.5px solid #E0DDD8;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(46, 58, 89, 0.14);
      padding: 20px 22px;
      width: 280px;
    }

    .skip-card-title {
      font-family: 'Lora', Georgia, serif;
      font-size: 16px;
      font-weight: 600;
      color: #2E3A59;
      margin-bottom: 4px;
    }

    .skip-card-sub {
      font-size: 12px;
      color: #8A95A8;
      margin-bottom: 14px;
    }

    .skip-reason-input {
      width: 100%;
      min-height: 72px;
      padding: 10px 12px;
      border: 1.5px solid #D0D5E0;
      border-radius: 8px;
      font-family: inherit;
      font-size: 13px;
      line-height: 1.5;
      color: #2E3A59;
      background: #FFFFFF;
      resize: none;
      outline: none;
      transition: border-color 200ms ease;
    }

    .skip-reason-input::placeholder { color: #B8C0CC; }
    .skip-reason-input:focus { border-color: #87A96B; }

    .skip-char-counter {
      font-size: 11px;
      color: #C0C8D4;
      text-align: right;
      margin-top: 4px;
      margin-bottom: 14px;
      transition: color 300ms ease;
    }

    .skip-char-counter.met { color: #87A96B; }

    .skip-card-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .btn-cancel {
      background: none;
      border: 1.5px solid #D0D5E0;
      border-radius: 6px;
      padding: 7px 14px;
      font-family: inherit;
      font-size: 13px;
      color: #2E3A59;
      cursor: pointer;
      transition: background 150ms ease;
    }

    .btn-cancel:hover { background: #F0EDE8; }

    .btn-use-skip {
      background: #C96F4A;
      border: none;
      border-radius: 6px;
      padding: 7px 14px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      color: #FAF9F6;
      cursor: pointer;
      opacity: 0.38;
      pointer-events: none;
      transition: opacity 200ms ease, background 150ms ease;
    }

    .btn-use-skip.enabled {
      opacity: 1;
      pointer-events: auto;
    }

    .btn-use-skip.enabled:hover { background: #B05A38; }
  `;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let host           = null;
  let blurOverlay    = null;
  let skipHost       = null; // skip affordance Shadow DOM host
  let breathRing     = null; // ref to the ring element for JS-driven animation
  let breathTimer    = null;
  let nextBtnTimer   = null;
  let currentTab     = 0;
  let sessionContent = null; // selected by pickSession() at the start of each show()
  let reflectionText = "";   // captured from Tab 2 textarea, sent on completion

  // ---------------------------------------------------------------------------
  // DOM construction
  // ---------------------------------------------------------------------------

  function buildPanel(shadow, session) {
    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.appendChild(style);

    const panel = document.createElement("div");
    panel.className = "panel";

    // Progress dots
    const progress = document.createElement("div");
    progress.className = "progress";
    for (let i = 1; i <= 3; i++) {
      const dot = document.createElement("div");
      dot.className = "progress-dot" + (i === 1 ? " active" : "");
      dot.dataset.step = i;
      progress.appendChild(dot);
    }
    panel.appendChild(progress);

    // Tab 1 — Breathing
    const tab1 = document.createElement("div");
    tab1.className = "tab";
    tab1.id = "onward-tab-1";
    const t1title = document.createElement("h2");
    t1title.className = "tab-title";
    t1title.textContent = session.breathing.label;
    const ring = document.createElement("div");
    ring.className = "breath-ring";
    const breathLabelEl = document.createElement("p");
    breathLabelEl.className = "breath-label";
    breathLabelEl.id = "onward-breath-label";
    breathLabelEl.textContent = session.breathing.phases[0].cue;
    tab1.appendChild(t1title);
    tab1.appendChild(ring);
    tab1.appendChild(breathLabelEl);
    panel.appendChild(tab1);

    // Tab 2 — Reflection
    const tab2 = document.createElement("div");
    tab2.className = "tab hidden";
    tab2.id = "onward-tab-2";
    const t2title = document.createElement("h2");
    t2title.className = "tab-title";
    t2title.textContent = "A moment to reflect";
    const prompt = document.createElement("p");
    prompt.className = "prompt";
    prompt.textContent = session.reflection;
    const textarea = document.createElement("textarea");
    textarea.className = "reflection-input";
    textarea.id = "onward-reflection-input";
    textarea.placeholder = "No one will read this but you.";
    textarea.setAttribute("rows", "5");
    const counter = document.createElement("p");
    counter.className = "char-counter";
    counter.id = "onward-char-counter";
    counter.textContent = `0 / ${REFLECTION_MIN_CHARS}`;
    tab2.appendChild(t2title);
    tab2.appendChild(prompt);
    tab2.appendChild(textarea);
    tab2.appendChild(counter);
    panel.appendChild(tab2);

    // Tab 3 — Checklist
    const tab3 = document.createElement("div");
    tab3.className = "tab hidden";
    tab3.id = "onward-tab-3";
    const t3title = document.createElement("h2");
    t3title.className = "tab-title";
    t3title.textContent = session.checklist.label;
    const list = document.createElement("ul");
    list.className = "checklist";
    session.checklist.items.forEach(item => {
      const li = document.createElement("li");
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(item));
      li.appendChild(label);
      list.appendChild(li);
    });
    const hint = document.createElement("p");
    hint.className = "checklist-hint";
    hint.textContent = "Check at least one to continue.";
    tab3.appendChild(t3title);
    tab3.appendChild(list);
    tab3.appendChild(hint);
    panel.appendChild(tab3);

    // Footer
    const footer = document.createElement("div");
    footer.className = "footer";
    const nextBtn = document.createElement("button");
    nextBtn.className = "next-btn";
    nextBtn.id = "onward-next-btn";
    nextBtn.textContent = "Continue";
    footer.appendChild(nextBtn);
    panel.appendChild(footer);

    shadow.appendChild(panel);
    return { panel, nextBtn };
  }

  // ---------------------------------------------------------------------------
  // Breathing animation — JS-driven CSS transitions
  // ---------------------------------------------------------------------------

  // Maps phase count to a semantic type for each slot. The type controls
  // whether the ring should animate (inhale/exhale) or hold its position.
  function phaseTypes(count) {
    if (count === 2) return ["inhale", "exhale"];
    if (count === 3) return ["inhale", "hold-top", "exhale"];
    return ["inhale", "hold-top", "exhale", "hold-bottom"];
  }

  // Drives the breathing ring via CSS transitions on a setTimeout chain.
  // Each phase updates the cue label and either transitions the ring to its
  // target scale or holds it steady. Guards against the panel being removed
  // mid-cycle via null checks on breathRing.
  function startBreathing(phases) {
    if (!breathRing) return;

    const labelEl = breathRing.parentElement?.querySelector(".breath-label");
    const types   = phaseTypes(phases.length);
    let phaseIdx  = 0;

    // Start at rest with no transition so the first phase fires cleanly.
    breathRing.style.transition = "none";
    breathRing.style.transform  = "scale(0.55)";

    function runPhase() {
      if (!breathRing) return; // panel removed mid-cycle

      const { cue, ms } = phases[phaseIdx % phases.length];
      const type        = types[phaseIdx % types.length];

      if (labelEl) labelEl.textContent = cue;

      if (type === "inhale" || type === "exhale") {
        const target = type === "inhale" ? 1.0 : 0.55;
        breathRing.style.transition = `transform ${ms}ms ease-in-out`;
        // rAF ensures the new transition property is committed before the
        // transform change triggers it.
        requestAnimationFrame(() => {
          if (breathRing) breathRing.style.transform = `scale(${target})`;
        });
      }
      // Hold phases: label already updated above; ring stays at current scale.

      phaseIdx++;
      breathTimer = setTimeout(runPhase, ms);
    }

    // Double-rAF so the initial 'none' transition is painted before the first
    // phase reintroduces a transition, preventing a spurious first-frame jump.
    requestAnimationFrame(() => requestAnimationFrame(runPhase));
  }

  function stopBreathing() {
    clearTimeout(breathTimer);
    breathTimer = null;
    if (breathRing) {
      breathRing.style.transition = "none";
      breathRing.style.transform  = "scale(0.55)";
    }
  }

  // ---------------------------------------------------------------------------
  // Tab logic
  // ---------------------------------------------------------------------------

  function updateProgress(shadow, tabIndex) {
    shadow.querySelectorAll(".progress-dot").forEach((dot, i) => {
      dot.classList.remove("active", "done");
      if (i + 1 < tabIndex)        dot.classList.add("done");
      else if (i + 1 === tabIndex) dot.classList.add("active");
    });
  }

  // Tab 1: 45-second timer before Next appears.
  function armTab1(nextBtn) {
    nextBtn.classList.remove("visible");
    nextBtn.textContent = "Continue";
    clearTimeout(nextBtnTimer);
    nextBtnTimer = setTimeout(() => {
      nextBtn.classList.add("visible");
    }, NEXT_BTN_DELAY_MS);
  }

  // Tab 2: Next unlocks once the user has typed >= REFLECTION_MIN_CHARS.
  function armTab2(shadow, nextBtn) {
    nextBtn.classList.remove("visible");
    nextBtn.textContent = "Continue";
    clearTimeout(nextBtnTimer);

    const textarea = shadow.getElementById("onward-reflection-input");
    const counter  = shadow.getElementById("onward-char-counter");
    if (!textarea || !counter) return;

    // Reset to empty state each time Tab 2 is entered.
    textarea.value = "";
    reflectionText = "";
    counter.textContent = `0 / ${REFLECTION_MIN_CHARS}`;
    counter.classList.remove("met");

    textarea.addEventListener("input", () => {
      const len = textarea.value.length;
      reflectionText = textarea.value;
      counter.textContent = `${len} / ${REFLECTION_MIN_CHARS}`;
      if (len >= REFLECTION_MIN_CHARS) {
        counter.classList.add("met");
        nextBtn.classList.add("visible");
      } else {
        counter.classList.remove("met");
        nextBtn.classList.remove("visible");
      }
    });

    // Focus the textarea so the user can start typing immediately.
    // Deferred one frame to avoid focus fighting the tab transition animation.
    requestAnimationFrame(() => textarea.focus());
  }

  // Tab 3: Next unlocks once at least one checkbox is checked.
  function armTab3(shadow, nextBtn) {
    nextBtn.classList.remove("visible");
    nextBtn.textContent = "I'm ready to continue";
    clearTimeout(nextBtnTimer);

    const checkboxes = shadow.querySelectorAll("#onward-tab-3 input[type='checkbox']");

    // Ensure all boxes start unchecked (guard against re-trigger after refresh).
    checkboxes.forEach(cb => { cb.checked = false; });

    function onCheckChange() {
      const anyChecked = Array.from(checkboxes).some(c => c.checked);
      if (anyChecked) nextBtn.classList.add("visible");
      else            nextBtn.classList.remove("visible");
    }

    checkboxes.forEach(cb => cb.addEventListener("change", onCheckChange));
  }

  function showTab(shadow, tabIndex, nextBtn) {
    shadow.querySelectorAll(".tab").forEach(t => t.classList.add("hidden"));
    const target = shadow.getElementById(`onward-tab-${tabIndex}`);
    if (target) target.classList.remove("hidden");

    updateProgress(shadow, tabIndex);

    if (tabIndex === 1) {
      startBreathing(sessionContent.breathing.phases);
      armTab1(nextBtn);
    } else {
      stopBreathing();
      if (tabIndex === 2) armTab2(shadow, nextBtn);
      if (tabIndex === 3) armTab3(shadow, nextBtn);
    }
  }

  // ---------------------------------------------------------------------------
  // Skip affordance — fixed bottom-right, own Shadow DOM, outside panel
  // ---------------------------------------------------------------------------

  // Renders the resting skip link ("Skip session (N left)" or disabled label).
  function renderSkipResting(shadow, remaining) {
    const style = shadow.querySelector("style");
    shadow.innerHTML = "";
    if (style) shadow.appendChild(style);

    const btn = document.createElement("button");
    btn.className = remaining > 0 ? "skip-link" : "skip-link disabled";
    btn.textContent = remaining > 0
      ? `Skip session (${remaining} left)`
      : "No skips left today";

    if (remaining > 0) {
      btn.addEventListener("click", () => renderSkipConfirmation(shadow, remaining));
    }

    shadow.appendChild(btn);
  }

  // Renders the confirmation card in-place (replaces resting link).
  function renderSkipConfirmation(shadow, remaining) {
    const style = shadow.querySelector("style");
    shadow.innerHTML = "";
    if (style) shadow.appendChild(style);

    const card = document.createElement("div");
    card.className = "skip-card";

    const title = document.createElement("p");
    title.className = "skip-card-title";
    title.textContent = "Are you sure?";

    const sub = document.createElement("p");
    sub.className = "skip-card-sub";
    sub.textContent = `You have ${remaining} skip${remaining === 1 ? "" : "s"} remaining today.`;

    const textarea = document.createElement("textarea");
    textarea.className = "skip-reason-input";
    textarea.placeholder = "Why are you skipping? (required)";

    const counter = document.createElement("p");
    counter.className = "skip-char-counter";
    counter.textContent = `0 / ${SKIP_MIN_CHARS}`;

    const actions = document.createElement("div");
    actions.className = "skip-card-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn-cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => renderSkipResting(shadow, remaining));

    const useSkipBtn = document.createElement("button");
    useSkipBtn.className = "btn-use-skip";
    useSkipBtn.textContent = "Use a skip";

    textarea.addEventListener("input", () => {
      const len = textarea.value.length;
      counter.textContent = `${len} / ${SKIP_MIN_CHARS}`;
      if (len >= SKIP_MIN_CHARS) {
        counter.classList.add("met");
        useSkipBtn.classList.add("enabled");
      } else {
        counter.classList.remove("met");
        useSkipBtn.classList.remove("enabled");
      }
    });

    useSkipBtn.addEventListener("click", () => {
      if (textarea.value.length >= SKIP_MIN_CHARS) {
        skipSession(textarea.value);
      }
    });

    actions.append(cancelBtn, useSkipBtn);
    card.append(title, sub, textarea, counter, actions);
    shadow.appendChild(card);

    requestAnimationFrame(() => textarea.focus());
  }

  // Creates the skip affordance element, appends it to the document, and
  // renders the resting state. Returns the host element (or null if panel
  // is no longer active).
  async function createSkipAffordance() {
    if (!OnwardPanel._active) return null;

    // Read chrome.storage.local directly — Storage wrapper (storage.js) is not
    // injected into content scripts, only into the service worker and options/popup pages.
    const result = await chrome.storage.local.get("onwardState");
    const stored = result.onwardState ?? {};
    const today = new Date().toLocaleDateString("en-CA");
    const skipsUsed = (stored.skipDay === today) ? (stored.skipsUsed ?? 0) : 0;
    const remaining = Math.max(0, 3 - skipsUsed);

    skipHost = document.createElement("div");
    skipHost.id = "onward-skip-host";
    const shadow = skipHost.attachShadow({ mode: "open" });

    const styleEl = document.createElement("style");
    styleEl.textContent = SKIP_CSS;
    shadow.appendChild(styleEl);

    document.documentElement.appendChild(skipHost);
    renderSkipResting(shadow, remaining);
    return skipHost;
  }

  // ---------------------------------------------------------------------------
  // Session completion
  // ---------------------------------------------------------------------------

  // Shared teardown: fades out blur + panel, removes skip affordance, resets state.
  function dismiss() {
    if (blurOverlay) {
      blurOverlay.style.transition = `opacity ${BLUR_OUT_DURATION_MS}ms ease`;
      blurOverlay.style.opacity = "0";
    }
    const panel = host?.shadowRoot?.querySelector(".panel");
    if (panel) panel.classList.remove("visible");

    const cleanupDelay = Math.max(BLUR_OUT_DURATION_MS, PANEL_FADE_MS);
    setTimeout(() => {
      blurOverlay?.remove();
      host?.remove();
      skipHost?.remove();
      blurOverlay    = null;
      host           = null;
      skipHost       = null;
      breathRing     = null;
      sessionContent = null;
      reflectionText = "";
      stopBreathing();
      clearTimeout(nextBtnTimer);
      nextBtnTimer   = null;
      currentTab     = 0;
      OnwardPanel._active = false;
    }, cleanupDelay);
  }

  function complete() {
    // Notify background: reset budget and store the reflection if one was written.
    // Sent before dismiss() so sessionContent is still accessible.
    chrome.runtime.sendMessage({
      type: MESSAGES.SESSION_COMPLETE,
      reflection: reflectionText
        ? { prompt: sessionContent?.reflection, response: reflectionText, timestamp: Date.now() }
        : null,
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[Onward] Could not send SESSION_COMPLETE:", chrome.runtime.lastError.message);
      }
    });
    dismiss();
  }

  function skipSession(reason) {
    chrome.runtime.sendMessage({
      type: MESSAGES.SESSION_SKIPPED,
      reason,
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[Onward] Could not send SESSION_SKIPPED:", chrome.runtime.lastError.message);
      }
    });
    dismiss();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  const OnwardPanel = {
    _active: false,

    show() {
      if (this._active) return;
      this._active = true;
      currentTab     = 1;
      reflectionText = "";
      sessionContent = pickSession();

      console.log("[Onward] Showing focus panel.");

      // --- Blur overlay ---
      // Uses backdrop-filter on a fixed overlay element rather than filter on
      // <body>. backdrop-filter runs on the GPU compositor thread, so it's
      // unaffected by YouTube's main-thread activity and renders smoothly at
      // the full 2s duration. The opacity transition fades in the blurred view
      // over the sharp page, creating a gentle cross-dissolve effect.
      blurOverlay = document.createElement("div");
      blurOverlay.id = "onward-blur-overlay";
      Object.assign(blurOverlay.style, {
        position:             "fixed",
        inset:                "0",
        zIndex:               "2147483646",
        backdropFilter:       "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        background:           "rgba(250, 249, 246, 0.15)", // faint warm tint
        opacity:              "0",
        transition:           `opacity ${BLUR_DURATION_MS}ms ease`,
        pointerEvents:        "all", // block interaction with the page behind it
      });
      document.documentElement.appendChild(blurOverlay);

      // Double-rAF: ensures the element is painted before the transition fires.
      // A single rAF is sometimes batched with the append and the transition
      // never triggers.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          blurOverlay.style.opacity = "1";
        });
      });

      // --- Build Shadow DOM (sibling of <body>, unaffected by page styles) ---
      host = document.createElement("div");
      host.id = "onward-panel-host";
      const shadow = host.attachShadow({ mode: "open" });
      const { panel, nextBtn } = buildPanel(shadow, sessionContent);
      document.documentElement.appendChild(host);

      // Store ring ref for JS-driven breathing animation
      breathRing = shadow.querySelector(".breath-ring");

      // --- Fade panel in after blur settles, then attach skip affordance ---
      setTimeout(async () => {
        panel.classList.add("visible");
        showTab(shadow, 1, nextBtn);
        await createSkipAffordance();
      }, BLUR_DURATION_MS);

      // --- Next / Done button ---
      nextBtn.addEventListener("click", () => {
        if (currentTab < 3) {
          currentTab++;
          showTab(shadow, currentTab, nextBtn);
        } else {
          complete();
        }
      });
    },
  };

  return OnwardPanel;
})();
