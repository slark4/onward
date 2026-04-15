// Onward — Panel
// Owns the full interrupt experience: blur, Shadow DOM panel, 3-tab session,
// 45-second Next button rule, and session completion.
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
  // Timing constants
  // ---------------------------------------------------------------------------

  const BLUR_DURATION_MS  = 1_500;
  const PANEL_FADE_MS     = 500;
  const NEXT_BTN_DELAY_MS = 45_000; // 45 seconds before Next becomes visible

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
      /* Explicit font stack prevents host-page inheritance bleeding through */
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
      animation: onward-breathe 14s ease-in-out infinite;
    }

    @keyframes onward-breathe {
      0%    { transform: scale(0.55); }
      28.5% { transform: scale(1);    }
      57%   { transform: scale(1);    }
      100%  { transform: scale(0.55); }
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
      max-width: 420px;
      font-style: italic;
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

  let host         = null;
  let blurStyleEl  = null;
  let breathTimer  = null;
  let nextBtnTimer = null;
  let breathStart  = null;
  let currentTab   = 0;

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
    const ring = document.createElement("div");
    ring.className = "breath-ring";
    const breathLabelEl = document.createElement("p");
    breathLabelEl.className = "breath-label";
    breathLabelEl.id = "onward-breath-label";
    breathLabelEl.textContent = "Breathe in";
    const t1title = document.createElement("h2");
    t1title.className = "tab-title";
    t1title.textContent = CONTENT.breathing.label;
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
    tab2.appendChild(t2title);
    tab2.appendChild(prompt);
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
    tab3.appendChild(t3title);
    tab3.appendChild(list);
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
      if (i + 1 < tabIndex)      dot.classList.add("done");
      else if (i + 1 === tabIndex) dot.classList.add("active");
    });
  }

  function startBreathLabel(shadow) {
    const label = shadow.getElementById("onward-breath-label");
    if (!label) return;
    breathStart = Date.now();

    function tick() {
      const elapsed = (Date.now() - breathStart) % CONTENT.breathing.cycleMs;
      if (elapsed < 4_000)       label.textContent = "Breathe in";
      else if (elapsed < 8_000)  label.textContent = "Hold";
      else                       label.textContent = "Breathe out";
    }

    tick();
    breathTimer = setInterval(tick, 100);
  }

  function stopBreathLabel() {
    clearInterval(breathTimer);
    breathTimer = null;
    breathStart = null;
  }

  function armNextButton(nextBtn, isLastTab) {
    nextBtn.classList.remove("visible");
    clearTimeout(nextBtnTimer);
    nextBtnTimer = setTimeout(() => {
      nextBtn.textContent = isLastTab ? "I'm ready to continue" : "Continue";
      nextBtn.classList.add("visible");
    }, NEXT_BTN_DELAY_MS);
  }

  function showTab(shadow, tabIndex, nextBtn) {
    // Swap visible tab
    shadow.querySelectorAll(".tab").forEach(t => t.classList.add("hidden"));
    const target = shadow.getElementById(`onward-tab-${tabIndex}`);
    if (target) target.classList.remove("hidden");

    updateProgress(shadow, tabIndex);

    if (tabIndex === 1) startBreathLabel(shadow);
    else stopBreathLabel();

    armNextButton(nextBtn, tabIndex === 3);
  }

  // ---------------------------------------------------------------------------
  // Session completion
  // ---------------------------------------------------------------------------

  function complete() {
    // Reverse the blur
    document.body.classList.remove("onward-blurred");

    // Fade the panel out
    const panel = host && host.shadowRoot && host.shadowRoot.querySelector(".panel");
    if (panel) panel.classList.remove("visible");

    // Remove DOM elements after fade
    setTimeout(() => {
      host && host.remove();
      blurStyleEl && blurStyleEl.remove();
      host = null;
      blurStyleEl = null;
      stopBreathLabel();
      clearTimeout(nextBtnTimer);
      nextBtnTimer = null;
      currentTab = 0;
      OnwardPanel._active = false;
    }, PANEL_FADE_MS);

    // Tell the background to reset the budget
    chrome.runtime.sendMessage({ type: MESSAGES.SESSION_COMPLETE }, () => {
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
      currentTab = 1;

      console.log("[Onward] Showing focus panel.");

      // --- Blur the page ---
      // Host lives outside <body> (appended to <html>) so it's unaffected by
      // the blur filter applied here. The overflow:hidden prevents scroll during
      // the session; pointer-events:none blocks interaction with the page.
      blurStyleEl = document.createElement("style");
      blurStyleEl.textContent = `
        .onward-blurred {
          filter: blur(8px) !important;
          transition: filter ${BLUR_DURATION_MS}ms ease !important;
          overflow: hidden !important;
          pointer-events: none !important;
        }
      `;
      document.head.appendChild(blurStyleEl);
      document.body.classList.add("onward-blurred");

      // --- Build Shadow DOM (outside <body> to avoid inheriting the blur) ---
      host = document.createElement("div");
      host.id = "onward-panel-host";
      const shadow = host.attachShadow({ mode: "open" });
      const { panel, nextBtn } = buildPanel(shadow);
      document.documentElement.appendChild(host);

      // --- Fade panel in after blur completes ---
      setTimeout(() => {
        panel.classList.add("visible");
        showTab(shadow, 1, nextBtn);
      }, BLUR_DURATION_MS);

      // --- Wire up Next / Done button ---
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
