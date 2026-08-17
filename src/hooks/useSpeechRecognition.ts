import { useEffect, useRef, useState } from "react";

// Minimal wrapper around the browser's built-in Web Speech API
// (SpeechRecognition) — free, no API key, no server round-trip. Support
// varies: solid in Chrome/Edge/Safari, absent in Firefox — callers should
// check `supported` and hide the mic button if false rather than show a
// broken control.
//
// Deliberately not using a server-side STT service (e.g. Azure Speech):
// this needs zero setup/cost and works today; if browser STT quality turns
// out to be a problem in practice, swapping in Azure Speech later is a
// contained change (an edge function + this hook's onResult callback).

// deno-lint-ignore no-explicit-any
type SpeechRecognitionCtor = new () => any;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition(onResult: (transcript: string) => void) {
  const [supported] = useState(() => getRecognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // deno-lint-ignore no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    // deno-lint-ignore no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as ArrayLike<{ 0: { transcript: string } }>)
        .map((r) => r[0].transcript)
        .join(" ");
      onResult(transcript);
    };
    recognition.onerror = (event: { error: string }) => {
      setError(event.error === "not-allowed" ? "Microphone access was denied." : "Voice input failed — try typing instead.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    return () => recognition.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function start() {
    if (!recognitionRef.current || listening) return;
    setError(null);
    setListening(true);
    recognitionRef.current.start();
  }

  function stop() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  return { supported, listening, error, start, stop };
}
