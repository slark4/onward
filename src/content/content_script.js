// Onward — Content Script
// Injected into monitored pages. Triggers OnwardPanel on interrupt.
// Depends on messages.js and panel.js being loaded first (see manifest).

console.log("[Onward] Content script loaded on:", window.location.hostname);

// Listen for messages from the background service worker.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case MESSAGES.INTERRUPT_TRIGGERED:
      console.log("[Onward] Interrupt received — showing focus panel.");
      OnwardPanel.show();
      sendResponse({ status: "received" });
      break;

    default:
      console.warn("[Onward] Content script received unknown message type:", message.type);
  }

  return true;
});
