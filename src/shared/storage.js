// Onward — Storage helpers
// Thin wrapper around chrome.storage.local.
// Loaded via importScripts in the service worker; via <script> tag in popup/options.

const DEFAULT_STATE = {
  sites: {},        // keyed by site hostname, e.g. "youtube.com"
  activeSiteKey: null,  // hostname of the site currently being tracked
  activeTabId: null,    // tab ID we'd send an interrupt to
};

const Storage = {
  async getState() {
    return new Promise((resolve) => {
      chrome.storage.local.get("onwardState", (result) => {
        resolve(result.onwardState ?? { ...DEFAULT_STATE });
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
