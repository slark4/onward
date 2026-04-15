// Onward — Panel
// Owns the full interrupt experience: blur, Shadow DOM panel, 3-tab session,
// engagement requirements per tab, and session completion.
//
// Exposes window.OnwardPanel.show() for content_script.js to call.
// Depends on MESSAGES (messages.js) being loaded first.

window.OnwardPanel = (() => {

  // ---------------------------------------------------------------------------
  // Content — Phase 3 placeholders; replaced by content pool in Phase 4
  // ---------------------------------------------------------------------------

  const CONTENT = {
    breathing: {
      label: "Take a breath",
      cycleMs: 14_000, // 4s in / 4s hold / 6s out
    },
    reflection: {
      label: "A moment to reflect",
      prompt: "What have you done in the last hour? Are you okay with that?",
    },
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

  // ---------------------------------------------------------------------------
  // Timing & engagement constants
  // ---------------------------------------------------------------------------

  const BLUR_DURATION_MS     = 2_000;  // fade-in; compositor-driven, reliable at full 2s
  const BLUR_OUT_DURATION_MS = 1_000;  // fade-out on completion — faster exit feels right
  const PANEL_FADE_MS        = 500;
  const NEXT_BTN_DELAY_MS    = 45_000; // Tab 1: 45s before Next appears
  const REFLECTION_MIN_CHARS = 80;     // Tab 2: minimum characters to unlock Next

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
      animation: onward-breathe 14s linear infinite;
    }

    /*
     * Multi-stop sine approximation with linear interpolation.
     * Encodes the smooth curve manually so there are no per-interval easing
     * discontinuities at the hold→exhale boundary or at the loop point.
     * Values derived from: scale = 0.55 + 0.45 * (1 - cos(π * t/phase)) / 2
     */
    @keyframes onward-breathe {
      0%     { transform: scale(0.55); }  /* inhale start */
      7%     { transform: scale(0.62); }
      14%    { transform: scale(0.78); }
      21%    { transform: scale(0.93); }
      28.5%  { transform: scale(1.00); } /* inhale complete */
      57%    { transform: scale(1.00); } /* hold */
      64%    { transform: scale(0.97); }  /* exhale start */
      71.5%  { transform: scale(0.89); }
      78.5%  { transform: scale(0.78); }
      85.5%  { transform: scale(0.66); }
      92.5%  { transform: scale(0.58); }
      100%   { transform: scale(0.55); } /* exhale complete / loop */
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

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let host           = null;
  let blurOverlay    = null;
  let breathTimer    = null;
  let nextBtnTimer   = null;
  let breathStart    = null;
  let currentTab     = 0;
  let reflectionText = ""; // captured from Tab 2 textarea, sent on completion

  // ---------------------------------------------------------------------------
  // DOM construction
  // ---------------------------------------------------------------------------

  function buildPanel(shadow) {
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
    t1title.textContent = CONTENT.breathing.label;
    const ring = document.createElement("div");
    ring.className = "breath-ring";
    const breathLabelEl = document.createElement("p");
    breathLabelEl.className = "breath-label";
    breathLabelEl.id = "onward-breath-label";
    breathLabelEl.textContent = "Breathe in";
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
    t2title.textContent = CONTENT.reflection.label;
    const prompt = document.createElement("p");
    prompt.className = "prompt";
    prompt.textContent = CONTENT.reflection.prompt;
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
    t3title.textContent = CONTENT.checklist.label;
    const list = document.createElement("ul");
    list.className = "checklist";
    CONTENT.checklist.items.forEach(item => {
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
  // Tab logic
  // ---------------------------------------------------------------------------

  function updateProgress(shadow, tabIndex) {
    shadow.querySelectorAll(".progress-dot").forEach((dot, i) => {
      dot.classList.remove("active", "done");
      if (i + 1 < tabIndex)        dot.classList.add("done");
      else if (i + 1 === tabIndex) dot.classList.add("active");
    });
  }

  function startBreathLabel(shadow) {
    const label = shadow.getElementById("onward-breath-label");
    if (!label) return;
    breathStart = Date.now();
    function tick() {
      const elapsed = (Date.now() - breathStart) % CONTENT.breathing.cycleMs;
      if (elapsed < 4_000)      label.textContent = "Breathe in";
      else if (elapsed < 8_000) label.textContent = "Hold";
      else                      label.textContent = "Breathe out";
    }
    tick();
    breathTimer = setInterval(tick, 100);
  }

  function stopBreathLabel() {
    clearInterval(breathTimer);
    breathTimer = null;
    breathStart = null;
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
      startBreathLabel(shadow);
      armTab1(nextBtn);
    } else {
      stopBreathLabel();
      if (tabIndex === 2) armTab2(shadow, nextBtn);
      if (tabIndex === 3) armTab3(shadow, nextBtn);
    }
  }

  // ---------------------------------------------------------------------------
  // Session completion
  // ---------------------------------------------------------------------------

  function complete() {
    // Fade the blur overlay out (faster than fade-in — user wants back in)
    if (blurOverlay) {
      blurOverlay.style.transition = `opacity ${BLUR_OUT_DURATION_MS}ms ease`;
      blurOverlay.style.opacity = "0";
    }

    // Fade the panel out
    const panel = host?.shadowRoot?.querySelector(".panel");
    if (panel) panel.classList.remove("visible");

    // Clean up after the slower of the two fades
    const cleanupDelay = Math.max(BLUR_OUT_DURATION_MS, PANEL_FADE_MS);
    setTimeout(() => {
      blurOverlay?.remove();
      host?.remove();
      blurOverlay    = null;
      host           = null;
      reflectionText = "";
      stopBreathLabel();
      clearTimeout(nextBtnTimer);
      nextBtnTimer   = null;
      currentTab     = 0;
      OnwardPanel._active = false;
    }, cleanupDelay);

    // Notify background: reset budget and store the reflection if one was written
    chrome.runtime.sendMessage({
      type: MESSAGES.SESSION_COMPLETE,
      reflection: reflectionText
        ? { prompt: CONTENT.reflection.prompt, response: reflectionText, timestamp: Date.now() }
        : null,
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[Onward] Could not send SESSION_COMPLETE:", chrome.runtime.lastError.message);
      }
    });
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
        position:          "fixed",
        inset:             "0",
        zIndex:            "2147483646",
        backdropFilter:    "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        background:        "rgba(250, 249, 246, 0.15)", // faint warm tint
        opacity:           "0",
        transition:        `opacity ${BLUR_DURATION_MS}ms ease`,
        pointerEvents:     "all", // block interaction with the page behind it
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
      const { panel, nextBtn } = buildPanel(shadow);
      document.documentElement.appendChild(host);

      // --- Fade panel in after blur settles ---
      setTimeout(() => {
        panel.classList.add("visible");
        showTab(shadow, 1, nextBtn);
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
