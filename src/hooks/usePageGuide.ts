import { useState } from "react";

function readDismissed(key: string): boolean {
  try {
    return localStorage.getItem(`page-guide-dismissed:${key}`) === "1";
  } catch {
    return false;
  }
}

// Per-page, per-browser "have they already dismissed this guide" flag —
// intentionally not synced to the account, just a local convenience so a
// returning user isn't shown the same tip forever, but it comes right
// back if they ever want it (see PageGuide's collapsed "?" state).
export function usePageGuide(key: string) {
  const [dismissed, setDismissedState] = useState(() => readDismissed(key));

  function setDismissed(value: boolean) {
    setDismissedState(value);
    try {
      localStorage.setItem(`page-guide-dismissed:${key}`, value ? "1" : "0");
    } catch {
      // Storage disabled — the guide just won't remember being dismissed.
    }
  }

  return { dismissed, setDismissed };
}
