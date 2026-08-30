import { Monitor, Smartphone } from "lucide-react";
import { useDisplaySize } from "@/hooks/useDisplaySize";
import { Button } from "@/components/ui/button";

// Lets someone switch the whole app's sizing between the default,
// larger "Mobile" density and a smaller, denser "Web" density — a
// personal preference, independent of what device they're actually on
// (see useDisplaySize.ts for how it's applied).
export function DisplaySizeToggle() {
  const { size, setSize } = useDisplaySize();
  const isWeb = size === "web";

  return (
    <Button
      variant="ghost"
      size="icon"
      title={isWeb ? "Switch to Mobile sizing" : "Switch to Web (compact) sizing"}
      onClick={() => setSize(isWeb ? "mobile" : "web")}
    >
      {isWeb ? <Smartphone className="size-4" /> : <Monitor className="size-4" />}
    </Button>
  );
}
