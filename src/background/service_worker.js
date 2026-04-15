// Onward — Background Service Worker
// Runs persistently across all tabs. Handles time tracking and alarms.
// Phase 1: startup log + message-passing verification only.

importScripts("../shared/messages.js");

console.log("[Onward] Background service worker started.");

// Listen for messages from content scripts and popup.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Onward] Background received message:", message.type, sender.tab ? `from tab ${sender.tab.id}` : "from extension page");

  switch (message.type) {
    case MESSAGES.PING:
      console.log("[Onward] Received PING — sending PONG.");
      sendResponse({ type: MESSAGES.PONG });
      break;

    case MESSAGES.POPUP_OPENED:
      console.log("[Onward] Popup opened.");
      sendResponse({ status: "ok" });
      break;

    default:
      console.warn("[Onward] Background received unknown message type:", message.type);
  }

  // Return true to keep the message channel open for async sendResponse calls.
  return true;
});
