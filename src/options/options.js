// Onward — Options Page

const PRESETS = [
  { key: "youtube.com",   label: "YouTube" },
  { key: "tiktok.com",    label: "TikTok" },
  { key: "reddit.com",    label: "Reddit" },
  { key: "x.com",         label: "X / Twitter" },
  { key: "instagram.com", label: "Instagram" },
];

const BUDGET_OPTIONS = [
  { label: "5 minutes",  seconds: 300  },
  { label: "15 minutes", seconds: 900  },
  { label: "30 minutes", seconds: 1800 },
];

const DEFAULT_BUDGET_SECONDS = 900; // 15 min

// Onboarding transient state — not written to storage until Step 3 completes.
let obSelected = new Set();
let obBudget   = DEFAULT_BUDGET_SECONDS;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
  const state = await Storage.getState();

  // Migration guard: if sites exist but onboarded flag is missing, this is an
  // existing install being updated. Skip onboarding and go straight to settings.
  if (!state.onboarded && Object.keys(state.sites).length > 0) {
    await Storage.updateState({ onboarded: true });
    showSettings(await Storage.getState());
    return;
  }

  if (state.onboarded) {
    showSettings(state);
  } else {
    showOnboarding();
  }
});

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

function showOnboarding() {
  document.getElementById("view-settings").classList.add("hidden");
  document.getElementById("view-onboarding").classList.remove("hidden");

  buildOBSiteToggles();
  buildBudgetOptions();

  document.getElementById("btn-ob-1").addEventListener("click", () => goToStep(2));
  document.getElementById("btn-ob-2").addEventListener("click", () => goToStep(3));
  document.getElementById("btn-ob-3").addEventListener("click", finishOnboarding);
}

function goToStep(n) {
  document.querySelectorAll(".ob-step").forEach((el, i) => {
    el.classList.toggle("hidden", i + 1 !== n);
  });
  document.querySelectorAll(".ob-dot").forEach((dot, i) => {
    dot.classList.remove("active", "done");
    if (i + 1 < n)       dot.classList.add("done");
    else if (i + 1 === n) dot.classList.add("active");
  });
}

function buildOBSiteToggles() {
  const container = document.getElementById("ob-site-toggles");
  const nextBtn   = document.getElementById("btn-ob-2");

  PRESETS.forEach(preset => {
    const btn = document.createElement("button");
    btn.className = "site-toggle";
    btn.textContent = preset.label;
    btn.dataset.key = preset.key;

    btn.addEventListener("click", () => {
      btn.classList.toggle("selected");
      if (obSelected.has(preset.key)) obSelected.delete(preset.key);
      else                            obSelected.add(preset.key);
      nextBtn.disabled = obSelected.size === 0;
    });

    container.appendChild(btn);
  });
}

function buildBudgetOptions() {
  const container = document.getElementById("ob-budget-options");

  BUDGET_OPTIONS.forEach(opt => {
    const label = document.createElement("label");
    label.className = "budget-option";

    const radio = document.createElement("input");
    radio.type    = "radio";
    radio.name    = "ob-budget";
    radio.value   = opt.seconds;
    radio.checked = opt.seconds === DEFAULT_BUDGET_SECONDS;
    radio.addEventListener("change", () => { obBudget = opt.seconds; });

    label.appendChild(radio);
    label.appendChild(document.createTextNode(opt.label));
    container.appendChild(label);
  });
}

async function finishOnboarding() {
  const state    = await Storage.getState();
  const newSites = { ...state.sites };

  obSelected.forEach(key => {
    newSites[key] = {
      budgetSeconds:     obBudget,
      accumulatedSeconds: 0,
      sessionStart:      null,
      interrupted:       false,
    };
  });

  await Storage.saveState({ ...state, sites: newSites, onboarded: true });
  showSettings(await Storage.getState());
}

// ---------------------------------------------------------------------------
// Settings view
// ---------------------------------------------------------------------------

function showSettings(state) {
  document.getElementById("view-onboarding").classList.add("hidden");
  document.getElementById("view-settings").classList.remove("hidden");

  renderConfiguredSites(state);
  renderAddSite(state);

  // Replace the reset button to avoid stacking duplicate listeners on re-render.
  const oldBtn  = document.getElementById("btn-reset-all");
  const freshBtn = oldBtn.cloneNode(true);
  oldBtn.parentNode.replaceChild(freshBtn, oldBtn);
  freshBtn.addEventListener("click", async () => {
    if (confirm("Reset all Onward data? This clears your sites, settings, and session history. It cannot be undone.")) {
      await Storage.clearAll();
      location.reload();
    }
  });
}

function renderConfiguredSites(state) {
  const list  = document.getElementById("configured-sites");
  list.innerHTML = "";
  const sites = state.sites ?? {};

  if (Object.keys(sites).length === 0) {
    const li = document.createElement("li");
    li.className   = "empty-hint";
    li.textContent = "No sites are being monitored. Add one below.";
    list.appendChild(li);
    return;
  }

  Object.entries(sites).forEach(([key, site]) => {
    const preset = PRESETS.find(p => p.key === key);
    const li     = document.createElement("li");
    li.className  = "site-row";

    const nameSpan    = document.createElement("span");
    nameSpan.className   = "site-name";
    nameSpan.textContent = preset?.label ?? key;

    const select = document.createElement("select");
    select.className = "budget-select";
    select.setAttribute("aria-label", `Budget for ${preset?.label ?? key}`);
    BUDGET_OPTIONS.forEach(opt => {
      const option    = document.createElement("option");
      option.value    = opt.seconds;
      option.textContent = opt.label;
      option.selected = site.budgetSeconds === opt.seconds;
      select.appendChild(option);
    });
    select.addEventListener("change", async () => {
      await Storage.updateSiteState(key, { budgetSeconds: Number(select.value) });
    });

    const removeBtn     = document.createElement("button");
    removeBtn.className   = "btn-remove";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => removeSite(key));

    li.append(nameSpan, select, removeBtn);
    list.appendChild(li);
  });
}

function renderAddSite(state) {
  const container  = document.getElementById("add-site-toggles");
  container.innerHTML = "";
  const configured = Object.keys(state.sites ?? {});
  const available  = PRESETS.filter(p => !configured.includes(p.key));

  if (available.length === 0) {
    const p    = document.createElement("p");
    p.className   = "empty-hint";
    p.textContent = "All preset sites are already being monitored.";
    container.appendChild(p);
    return;
  }

  available.forEach(preset => {
    const btn     = document.createElement("button");
    btn.className    = "site-toggle";
    btn.textContent  = preset.label;
    btn.addEventListener("click", () => addSite(preset.key));
    container.appendChild(btn);
  });
}

async function addSite(key) {
  await Storage.updateSiteState(key, {
    budgetSeconds:     DEFAULT_BUDGET_SECONDS,
    accumulatedSeconds: 0,
    sessionStart:      null,
    interrupted:       false,
  });
  showSettings(await Storage.getState());
}

async function removeSite(key) {
  const state    = await Storage.getState();
  const newSites = { ...state.sites };
  delete newSites[key];

  const updates = { sites: newSites };
  // Clear active tracking pointer if this was the site being tracked.
  if (state.activeSiteKey === key) {
    updates.activeSiteKey = null;
    updates.activeTabId   = null;
  }

  await Storage.saveState({ ...state, ...updates });
  showSettings(await Storage.getState());
}
