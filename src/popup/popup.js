// Onward — Popup Script
// Runs when the toolbar popup opens.
// Phase 1: notify background that popup opened + verify message-passing.

console.log("[Onward] Popup script loaded.");

chrome.runtime.sendMessage({ type: "POPUP_OPENED" }, (response) => {
  if (chrome.runtime.lastError) {
    console.warn("[Onward] Popup could not reach background script:", chrome.runtime.lastError.message);
    return;
  }
  console.log("[Onward] Background acknowledged popup open:", response);
});
