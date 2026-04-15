// Onward — Popup

const PRESET_LABELS = {
  "youtube.com":   "YouTube",
  "tiktok.com":    "TikTok",
  "reddit.com":    "Reddit",
  "x.com":         "X / Twitter",
  "instagram.com": "Instagram",
};

// Returns "YYYY-MM-DD" in local time — must match service worker's todayString().
function todayString() {
  return new Date().toLocaleDateString("en-CA");
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("btn-settings").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  const state = await Storage.getState();
  renderStats(state);
  renderSites(state);
});

function renderStats(state) {
  const today  = todayString();
  const stats  = (state.todayStats?.date === today)
    ? state.todayStats
    : { sessionsCompleted: 0, sessionsSkipped: 0 };
  const skipsRemaining = (state.skipDay === today)
    ? Math.max(0, 3 - (state.skipsUsed ?? 0))
    : 3;

  const container = document.getElementById("popup-stats");

  const sessions = document.createElement("div");
  sessions.className = "stat-cell";
  sessions.innerHTML =
    `<span class="stat-value">${stats.sessionsCompleted}</span>` +
    `<span class="stat-label">Sessions today</span>`;

  const skips = document.createElement("div");
  skips.className = "stat-cell";
  skips.innerHTML =
    `<span class="stat-value">${skipsRemaining}</span>` +
    `<span class="stat-label">Skips left</span>`;

  container.append(sessions, skips);
}

function renderSites(state) {
  const container = document.getElementById("popup-sites");
  const sites     = state.sites ?? {};

  if (Object.keys(sites).length === 0) {
    const p    = document.createElement("p");
    p.className   = "no-sites";
    p.textContent = "No sites configured. Open Settings to get started.";
    container.appendChild(p);
    return;
  }

  Object.entries(sites).forEach(([key, site]) => {
    const row    = document.createElement("div");
    row.className = "site-row";

    const name    = document.createElement("span");
    name.className   = "site-name";
    name.textContent = PRESET_LABELS[key] ?? key;

    const status    = document.createElement("span");
    status.className = "site-status";

    if (site.interrupted) {
      status.textContent = "session needed";
      status.classList.add("interrupted");
    } else {
      // Include live elapsed time if this is the currently active site.
      const liveElapsed = (key === state.activeSiteKey && site.sessionStart)
        ? (Date.now() - site.sessionStart) / 1000
        : 0;
      const used      = (site.accumulatedSeconds ?? 0) + liveElapsed;
      const remaining = Math.max(0, (site.budgetSeconds ?? 0) - used);
      const mins      = Math.ceil(remaining / 60);
      status.textContent = mins <= 0 ? "0 min left" : `${mins} min left`;
    }

    row.append(name, status);
    container.appendChild(row);
  });
}
