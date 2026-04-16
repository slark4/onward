// Onward — Background Service Worker
// Handles time tracking, alarm ticks, interrupt triggering, and budget resets.
// Site configuration is read from chrome.storage.local (set via the options page).

importScripts("../shared/messages.js", "../shared/storage.js");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Maps secondary hostnames to their canonical storage key.
// twitter.com redirects to x.com but both hostnames still appear in the wild.
const HOSTNAME_ALIASES = {
  "twitter.com": "x.com",
};

const ALARM_NAME = "onward-tick";
const TICK_INTERVAL_MINUTES = 0.5; // every 30 seconds

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Returns "YYYY-MM-DD" in local time. Used for lazy midnight resets.
function todayString() {
  return new Date().toLocaleDateString("en-CA");
}

// Returns the monitored site key (e.g. "youtube.com") for a given hostname,
// or null if the hostname is not in the user's configured site list.
// Resolves hostname aliases before checking storage.
async function monitoredSiteKey(hostname) {
  if (!hostname) return null;
  const resolved = HOSTNAME_ALIASES[hostname] ?? hostname;
  const state = await Storage.getState();
  for (const key of Object.keys(state.sites)) {
    if (resolved === key || resolved.endsWith("." + key)) return key;
  }
  return null;
}

// Increments a field in todayStats, resetting the whole object if the
// calendar date has rolled over since the last write.
async function incrementTodayStat(field) {
  const today = todayString();
  const state = await Storage.getState();
  const current = (state.todayStats?.date === today)
    ? state.todayStats
    : { date: today, sessionsCompleted: 0, sessionsSkipped: 0 };
  await Storage.updateState({
    todayStats: { ...current, [field]: (current[field] ?? 0) + 1 },
  });
}

// Calculate elapsed time since sessionStart, add it to accumulatedSeconds,
// then clear sessionStart. Called whenever the user leaves a monitored site.
async function flushSession(siteKey) {
  const state = await Storage.getState();
  const site = state.sites[siteKey];
  if (!site?.sessionStart) return;

  const elapsed = (Date.now() - site.sessionStart) / 1000;
  const newAccumulated = (site.accumulatedSeconds ?? 0) + elapsed;

  console.log(
    `[Onward] Flush ${siteKey}: +${elapsed.toFixed(1)}s → ${newAccumulated.toFixed(1)}s accumulated`
  );

  await Storage.updateSiteState(siteKey, {
    accumulatedSeconds: newAccumulated,
    sessionStart: null,
  });
}

async function startTracking(siteKey, tabId) {
  await Storage.updateSiteState(siteKey, { sessionStart: Date.now() });
  await Storage.updateState({ activeSiteKey: siteKey, activeTabId: tabId });
  console.log(`[Onward] Tracking started: ${siteKey} (tab ${tabId})`);
}

// Flush elapsed time and clear the active tracking state.
async function stopTracking() {
  const state = await Storage.getState();
  if (state.activeSiteKey) {
    await flushSession(state.activeSiteKey);
    console.log(`[Onward] Tracking stopped: ${state.activeSiteKey}`);
  }
  await Storage.updateState({ activeSiteKey: null, activeTabId: null });
}

// Check whether a site has exceeded its budget; send interrupt if so.
async function checkBudget(siteKey, tabId) {
  const state = await Storage.getState();
  const site = state.sites[siteKey];
  if (!site || site.interrupted) return;

  if (site.accumulatedSeconds >= site.budgetSeconds) {
    console.log(
      `[Onward] Budget exceeded for ${siteKey} ` +
      `(${site.accumulatedSeconds.toFixed(1)}s / ${site.budgetSeconds}s) — triggering interrupt.`
    );
    await Storage.updateSiteState(siteKey, { interrupted: true });
    chrome.tabs.sendMessage(tabId, { type: MESSAGES.INTERRUPT_TRIGGERED }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[Onward] Could not reach content script:", chrome.runtime.lastError.message);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[Onward] Installed/updated. Registering tick alarm.");
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: TICK_INTERVAL_MINUTES });

  // Open the options page whenever the extension loads and onboarding hasn't
  // been completed. Checking state.onboarded rather than details.reason handles
  // both genuine first installs and developer reloads after storage.clear().
  const installState = await Storage.getState();
  if (!installState.onboarded) {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/options/options.html") });
  }

  // Inject the content script into any monitored tabs that were already open
  // before the extension was installed or updated. Reuse installState — no
  // second storage read needed.
  const state = installState;
  const allTabs = await chrome.tabs.query({});
  for (const tab of allTabs) {
    const hostname = hostnameFromUrl(tab.url);
    if (!hostname) continue;
    const resolved = HOSTNAME_ALIASES[hostname] ?? hostname;
    const siteKey = Object.keys(state.sites)
      .find(k => resolved === k || resolved.endsWith("." + k));
    if (!siteKey) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/shared/messages.js", "src/content/panel.js", "src/content/content_script.js"],
      });
      console.log(`[Onward] Injected content script into pre-existing tab ${tab.id} (${tab.url})`);
    } catch (err) {
      // Expected on privileged pages (chrome://, new tab, etc.) — safe to ignore.
      console.warn(`[Onward] Could not inject into tab ${tab.id}:`, err.message);
    }
  }
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("[Onward] Browser started.");

  const state = await Storage.getState();
  const today = todayString();

  // Proactively reset daily counters if the day has changed. This ensures the
  // popup shows correct values from the first moment of the day, without
  // waiting for the first user action to trigger a lazy reset.
  const updates = {};
  if (state.skipDay !== today) {
    updates.skipsUsed = 0;
    updates.skipDay   = today;
  }
  if (state.todayStats?.date !== today) {
    updates.todayStats = { date: today, sessionsCompleted: 0, sessionsSkipped: 0 };
  }
  if (Object.keys(updates).length > 0) {
    await Storage.updateState(updates);
  }

  // Any sessionStart left in storage is from a previous browser session.
  // Discard rather than crediting potentially hours of elapsed time.
  for (const siteKey of Object.keys(state.sites)) {
    if (state.sites[siteKey].sessionStart) {
      await Storage.updateSiteState(siteKey, { sessionStart: null });
    }
  }
  await Storage.updateState({ activeSiteKey: null, activeTabId: null });

  // Alarms survive restarts, but ensure one exists in case it was cleared.
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: TICK_INTERVAL_MINUTES });
  }
});

// ---------------------------------------------------------------------------
// Tab tracking
// ---------------------------------------------------------------------------

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return; // Tab closed before we could read it
  }

  const siteKey = await monitoredSiteKey(hostnameFromUrl(tab.url));
  const state = await Storage.getState();

  // Always flush any in-progress session on a tab switch.
  if (state.activeSiteKey) {
    await stopTracking();
  }

  if (siteKey) {
    const fresh = await Storage.getState();
    if (fresh.sites[siteKey]?.interrupted) {
      // Budget already exceeded — re-trigger the interrupt immediately.
      await Storage.updateState({ activeSiteKey: siteKey, activeTabId: tabId });
      console.log(`[Onward] Activated interrupted tab — re-triggering interrupt for ${siteKey}.`);
      chrome.tabs.sendMessage(tabId, { type: MESSAGES.INTERRUPT_TRIGGERED }, () => {
        if (chrome.runtime.lastError) {
          console.warn("[Onward] Could not re-trigger interrupt on activation:", chrome.runtime.lastError.message);
        }
      });
    } else {
      await startTracking(siteKey, tabId);
    }
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // --- Branch 1: URL changed — SPA navigation on the active tab ---
  if (changeInfo.url) {
    let activeTabs;
    try {
      activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch {
      return;
    }
    if (!activeTabs.length || activeTabs[0].id !== tabId) return;

    const newSiteKey = await monitoredSiteKey(hostnameFromUrl(changeInfo.url));
    const state = await Storage.getState();

    if (state.activeSiteKey && state.activeSiteKey !== newSiteKey) {
      await stopTracking();
    }

    if (newSiteKey && newSiteKey !== state.activeSiteKey) {
      const fresh = await Storage.getState();
      if (!fresh.sites[newSiteKey]?.interrupted) {
        await startTracking(newSiteKey, tabId);
      }
      // If interrupted, Branch 2 (status: 'complete') will re-trigger the panel
      // once the page finishes loading.
    }
  }

  // --- Branch 2: Page finished loading — catches refreshes ---
  // When a user refreshes mid-session, the content script reinitializes and the
  // panel disappears. We detect the completed load here and re-send the interrupt.
  if (changeInfo.status === "complete" && tab.url) {
    const siteKey = await monitoredSiteKey(hostnameFromUrl(tab.url));
    if (!siteKey) return;

    const state = await Storage.getState();
    if (!state.sites[siteKey]?.interrupted) return;

    let activeTabs;
    try {
      activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch {
      return;
    }
    if (!activeTabs.length || activeTabs[0].id !== tabId) return;

    console.log(`[Onward] Page loaded with pending interrupt for ${siteKey} — re-triggering.`);
    await Storage.updateState({ activeSiteKey: siteKey, activeTabId: tabId });
    chrome.tabs.sendMessage(tabId, { type: MESSAGES.INTERRUPT_TRIGGERED }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[Onward] Could not re-trigger interrupt on page load:", chrome.runtime.lastError.message);
      }
    });
  }
});

// Closing a tab mid-session preserves interrupted:true so the panel
// reappears on the next visit.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await Storage.getState();
  if (tabId !== state.activeTabId) return;

  if (state.activeSiteKey && state.sites[state.activeSiteKey]?.interrupted) {
    await Storage.updateState({ activeSiteKey: null, activeTabId: null });
    console.log(`[Onward] Tab closed mid-session — interrupt preserved for ${state.activeSiteKey}.`);
  } else {
    await stopTracking();
  }
});

// ---------------------------------------------------------------------------
// Alarm tick
// ---------------------------------------------------------------------------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  const state = await Storage.getState();
  if (!state.activeSiteKey || !state.activeTabId) return;

  const site = state.sites[state.activeSiteKey];
  if (!site?.sessionStart || site.interrupted) return;

  const elapsed = (Date.now() - site.sessionStart) / 1000;
  const newAccumulated = (site.accumulatedSeconds ?? 0) + elapsed;

  await Storage.updateSiteState(state.activeSiteKey, {
    accumulatedSeconds: newAccumulated,
    sessionStart: Date.now(), // reset to now so next tick only counts forward
  });

  console.log(
    `[Onward] Tick: ${state.activeSiteKey} — ` +
    `${newAccumulated.toFixed(1)}s / ${site.budgetSeconds}s`
  );

  await checkBudget(state.activeSiteKey, state.activeTabId);
});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Onward] Background received:", message.type);

  switch (message.type) {
    case MESSAGES.PING:
      sendResponse({ type: MESSAGES.PONG });
      break;

    case MESSAGES.POPUP_OPENED:
      sendResponse({ status: "ok" });
      break;

    case MESSAGES.SESSION_COMPLETE:
      // Reset accumulated time and interrupted flag, resume tracking.
      (async () => {
        const state = await Storage.getState();
        if (state.activeSiteKey) {
          await Storage.updateSiteState(state.activeSiteKey, {
            accumulatedSeconds: 0,
            sessionStart: Date.now(),
            interrupted: false,
          });
          console.log(`[Onward] Session complete — budget reset for ${state.activeSiteKey}`);
        }
        await incrementTodayStat("sessionsCompleted");
        sendResponse({ status: "ok" });
      })();
      return true; // keep channel open for async response

    case MESSAGES.SESSION_SKIPPED:
      // Grant 5 more minutes (set accumulated to budget - 300), increment skip counter.
      (async () => {
        const state = await Storage.getState();
        if (state.activeSiteKey) {
          const site = state.sites[state.activeSiteKey];
          const newAccumulated = Math.max(0, (site?.budgetSeconds ?? 0) - 300);
          await Storage.updateSiteState(state.activeSiteKey, {
            accumulatedSeconds: newAccumulated,
            sessionStart: Date.now(),
            interrupted: false,
          });
          console.log(`[Onward] Session skipped — ${state.activeSiteKey} granted 5 min.`);
        }
        // Lazy-reset skip counter if the day has rolled over.
        const today = todayString();
        const skipsUsed = (state.skipDay === today) ? (state.skipsUsed ?? 0) : 0;
        await Storage.updateState({
          skipsUsed: skipsUsed + 1,
          skipDay:   today,
        });
        await incrementTodayStat("sessionsSkipped");
        sendResponse({ status: "ok" });
      })();
      return true;

    default:
      console.warn("[Onward] Unknown message type:", message.type);
  }

  return true;
});
