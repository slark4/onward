// Onward — Background Service Worker
// Handles time tracking, alarm ticks, and interrupt triggering.
// Phase 2: tracks youtube.com with a 2-minute test budget.

importScripts("../shared/messages.js", "../shared/storage.js");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Hard-coded for Phase 2 testing. Phase 5 will read this from user settings.
const MONITORED_SITES = {
  "youtube.com": { budgetSeconds: 120 }, // 2 minutes
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

// Returns the monitored site key (e.g. "youtube.com") for a given hostname,
// or null if the hostname isn't monitored.
function monitoredSiteKey(hostname) {
  if (!hostname) return null;
  for (const key of Object.keys(MONITORED_SITES)) {
    if (hostname === key || hostname.endsWith("." + key)) return key;
  }
  return null;
}

// Seed storage with default values for a site the first time we see it.
async function ensureSiteDefaults(siteKey) {
  const state = await Storage.getState();
  if (!state.sites[siteKey]) {
    await Storage.updateSiteState(siteKey, {
      budgetSeconds: MONITORED_SITES[siteKey].budgetSeconds,
      accumulatedSeconds: 0,
      sessionStart: null,
      interrupted: false,
    });
  }
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

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[Onward] Installed/updated. Registering tick alarm.");
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: TICK_INTERVAL_MINUTES });

  // Inject the content script into any monitored tabs that were already open
  // before the extension was installed or updated. Without this, those tabs
  // won't have a content script and the interrupt message will fail to deliver.
  const allTabs = await chrome.tabs.query({});
  for (const tab of allTabs) {
    if (!monitoredSiteKey(hostnameFromUrl(tab.url))) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/shared/messages.js", "src/content/content_script.js"],
      });
      console.log(`[Onward] Injected content script into pre-existing tab ${tab.id} (${tab.url})`);
    } catch (err) {
      // Expected on privileged pages (chrome://, new tab, etc.) — safe to ignore.
      console.warn(`[Onward] Could not inject into tab ${tab.id}:`, err.message);
    }
  }
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("[Onward] Browser started. Clearing stale session state.");

  // Any sessionStart left in storage is from a previous browser session.
  // We can't know how long ago the user actually left the site, so we
  // discard those timestamps rather than crediting potentially hours of time.
  const state = await Storage.getState();
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

  const siteKey = monitoredSiteKey(hostnameFromUrl(tab.url));
  const state = await Storage.getState();

  // Always flush any in-progress session on a tab switch — this captures the
  // partial elapsed time between the last alarm tick and now.
  if (state.activeSiteKey) {
    await stopTracking();
  }

  if (siteKey) {
    await ensureSiteDefaults(siteKey);
    const fresh = await Storage.getState();
    if (fresh.sites[siteKey].interrupted) {
      // Budget already exceeded — re-trigger the interrupt immediately.
      // Covers: user opened a second tab to bypass the panel (spec §3.4),
      // or switched back to an interrupted tab from another tab.
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

    const newSiteKey = monitoredSiteKey(hostnameFromUrl(changeInfo.url));
    const state = await Storage.getState();

    if (state.activeSiteKey && state.activeSiteKey !== newSiteKey) {
      await stopTracking();
    }

    if (newSiteKey && newSiteKey !== state.activeSiteKey) {
      await ensureSiteDefaults(newSiteKey);
      const fresh = await Storage.getState();
      if (!fresh.sites[newSiteKey].interrupted) {
        await startTracking(newSiteKey, tabId);
      }
      // If interrupted, Branch 2 (status: 'complete') will re-trigger the panel
      // once the page finishes loading.
    }
  }

  // --- Branch 2: Page finished loading — catches refreshes ---
  // When a user refreshes mid-session, the content script reinitializes and the
  // panel disappears. We detect the completed load here and re-send the interrupt
  // so the panel reappears immediately. Only fires for the active tab.
  if (changeInfo.status === "complete" && tab.url) {
    const siteKey = monitoredSiteKey(hostnameFromUrl(tab.url));
    if (!siteKey) return;

    const state = await Storage.getState();
    if (!state.sites[siteKey]?.interrupted) return;

    // Confirm this is the tab the user is currently looking at.
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

// Closing a tab mid-session counts as a full interrupt — no bonus time.
// We preserve interrupted:true so the panel reappears on the next visit.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await Storage.getState();
  if (tabId !== state.activeTabId) return;

  if (state.activeSiteKey && state.sites[state.activeSiteKey]?.interrupted) {
    // Mid-session close: clear active tracking but leave interrupted:true.
    // Do NOT flush elapsed time — the budget is already exceeded.
    await Storage.updateState({ activeSiteKey: null, activeTabId: null });
    console.log(`[Onward] Tab closed mid-session — interrupt preserved for ${state.activeSiteKey}.`);
  } else {
    // Normal close: flush elapsed time and clear tracking.
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
      // Phase 3 will call this after the grounding session finishes.
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
        sendResponse({ status: "ok" });
      })();
      return true; // keep channel open for async response

    default:
      console.warn("[Onward] Unknown message type:", message.type);
  }

  return true;
});
