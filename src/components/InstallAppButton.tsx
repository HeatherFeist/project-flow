import { useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Renders nothing once already installed, or on a browser that offers
// no install path at all (neither beforeinstallprompt nor iOS Safari).
export function InstallAppButton() {
  const { installed, canPromptInstall, canShowIosInstructions, promptInstall } = useInstallPrompt();
  const [showIosSteps, setShowIosSteps] = useState(false);

  if (installed || (!canPromptInstall && !canShowIosInstructions)) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start"
        onClick={() => (canPromptInstall ? promptInstall() : setShowIosSteps(true))}
      >
        <Download className="size-4" /> Install app
      </Button>

      <Dialog open={showIosSteps} onOpenChange={setShowIosSteps}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Install Project Flow</DialogTitle>
          </DialogHeader>
          <ol className="space-y-3 text-sm">
            <li className="flex items-center gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                1
              </span>
              Tap the <Share className="mx-1 inline size-4" /> Share button in Safari's toolbar
            </li>
            <li className="flex items-center gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                2
              </span>
              Scroll down and tap <SquarePlus className="mx-1 inline size-4" /> "Add to Home Screen"
            </li>
            <li className="flex items-center gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
                3
              </span>
              Tap "Add" — Project Flow now opens full-screen from your home screen
            </li>
          </ol>
          <Button variant="outline" onClick={() => setShowIosSteps(false)}>
            <X /> Close
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
