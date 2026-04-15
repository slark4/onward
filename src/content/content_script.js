// Onward — Content Script
// Injected into monitored pages. Applies blur and focus panel on interrupt.
// Phase 1: console log + message-passing verification only.

console.log("[Onward] Content script loaded on:", window.location.hostname);

// Send a PING to the background service worker to verify message-passing.
chrome.runtime.sendMessage({ type: "PING" }, (response) => {
  if (chrome.runtime.lastError) {
    console.warn("[Onward] Could not reach background script:", chrome.runtime.lastError.message);
    return;
  }
  console.log("[Onward] Background responded:", response.type);
});

// Listen for messages from the background service worker.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log("[Onward] Content script received message:", message.type);

  switch (message.type) {
    case "INTERRUPT_TRIGGERED":
      // Phase 3: apply blur and inject focus panel.
      console.log("[Onward] Interrupt triggered — focus panel coming in Phase 3.");
      sendResponse({ status: "received" });
      break;

    default:
      console.warn("[Onward] Content script received unknown message type:", message.type);
  }

  return true;
});
