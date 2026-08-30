import { useEffect, useState } from "react";

// Chrome/Edge/Android fire `beforeinstallprompt` when the app is
// installable and hasn't been installed yet — capturing it lets us show
// our own "Install app" button instead of waiting on the browser's own
// (easy-to-miss) address-bar icon. iOS Safari never fires this event —
// there's no programmatic install prompt there, only the user's own
// Share → Add to Home Screen, so that path is handled separately (see
// isIosSafari below) with on-screen instructions instead of a button.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own (non-standard) flag for "already added to home screen"
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    function handleBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function handleInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function promptInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  return {
    installed,
    canPromptInstall: !!deferredPrompt,
    canShowIosInstructions: !installed && isIosSafari(),
    promptInstall,
  };
}
