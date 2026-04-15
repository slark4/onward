// Message type constants used across all extension scripts.
// Always use these instead of raw strings to avoid typo bugs.

const MESSAGES = {
  // Popup -> Background
  POPUP_OPENED: "POPUP_OPENED",

  // Background -> Content
  INTERRUPT_TRIGGERED: "INTERRUPT_TRIGGERED",

  // Content -> Background
  SESSION_COMPLETE: "SESSION_COMPLETE",
  SESSION_SKIPPED: "SESSION_SKIPPED",

  // Generic ping for Phase 1 wiring verification
  PING: "PING",
  PONG: "PONG",
};
