import { useEffect, useState } from "react";

export type DisplaySize = "mobile" | "web";

const STORAGE_KEY = "display-size";

function readStored(): DisplaySize {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "web" ? "web" : "mobile";
  } catch {
    return "mobile";
  }
}

// A user-facing "how big should everything be" preference, independent of
// device — someone on a wide desktop monitor might still want the larger,
// touch-friendly sizing ("Mobile"), and someone on a tablet might prefer
// the denser "Web" sizing. Scales the whole app's font size (and, since
// almost every spacing/radius value in the design system is set in rem,
// nearly all padding/gaps/icon sizes along with it) via a single
// data-display-size attribute on <html> — see the CSS rule in index.css.
// Defaults to "mobile" (today's sizing) so nothing changes until a user
// opts in.
export function useDisplaySize() {
  const [size, setSizeState] = useState<DisplaySize>(readStored);

  useEffect(() => {
    document.documentElement.dataset.displaySize = size;
  }, [size]);

  function setSize(next: DisplaySize) {
    setSizeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best-effort — private browsing / storage disabled just means the
      // choice won't persist across visits.
    }
  }

  return { size, setSize };
}
