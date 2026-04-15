// Onward — Storage helpers
// Thin wrapper around chrome.storage.local.
// Loaded via importScripts in the service worker; via <script> tag in popup/options.

const DEFAULT_STATE = {
  // Time tracking
  sites: {},           // keyed by hostname, e.g. "youtube.com"
  activeSiteKey: null, // hostname of the site currently being tracked
  activeTabId: null,   // tab ID we'd send an interrupt to

  // Onboarding
  onboarded: false,

  // Emergency skips — lazy midnight reset via skipDay date comparison
  skipsUsed: 0,
  skipDay: null,   // "YYYY-MM-DD" in local time

  // Daily stats — lazy day reset via todayStats.date comparison
  todayStats: {
    date: null,
    sessionsCompleted: 0,
    sessionsSkipped: 0,
  },
};

const Storage = {
  async getState() {
    return new Promise((resolve) => {
      chrome.storage.local.get("onwardState", (result) => {
        // Merge with DEFAULT_STATE so new fields have correct defaults on
        // existing installs that pre-date those fields being added.
        resolve({ ...DEFAULT_STATE, ...(result.onwardState ?? {}) });
      });
    });
  },

  async saveState(state) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ onwardState: state }, resolve);
    });
  },

  // Merge top-level keys into state (does not deep-merge).
  async updateState(updates) {
    const current = await this.getState();
    const next = { ...current, ...updates };
    await this.saveState(next);
    return next;
  },

  // Merge keys into a specific site's state object.
  async updateSiteState(siteKey, updates) {
    const current = await this.getState();
    const next = {
      ...current,
      sites: {
        ...current.sites,
        [siteKey]: {
          ...(current.sites[siteKey] ?? {}),
          ...updates,
        },
      },
    };
    await this.saveState(next);
    return next;
  },

  async clearAll() {
    return new Promise((resolve) => {
      chrome.storage.local.clear(resolve);
    });
  },
};
