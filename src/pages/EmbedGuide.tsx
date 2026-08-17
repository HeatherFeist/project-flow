import { useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { Check, Code2, MessageCircle, Sparkles } from "lucide-react";
import { embedSnippet, WEBSITE_PLATFORMS } from "@/lib/websitePlatforms";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Standalone, no-login-required page: a link Heather can text/email straight
// to Nick, or he can open himself, that walks through adding the estimate
// chat to his own business website — one dropdown, one numbered list, one
// code box to copy. Deliberately kept separate from the app's Settings page
// so there's nothing else on screen to be confused by.
export default function EmbedGuide() {
  const { ownerId } = useParams<{ ownerId: string }>();
  const [platform, setPlatform] = useState(WEBSITE_PLATFORMS[0].value);
  const [copied, setCopied] = useState(false);

  if (!ownerId) return null;

  const selected = WEBSITE_PLATFORMS.find((p) => p.value === platform) ?? WEBSITE_PLATFORMS[0];
  const snippet = embedSnippet(window.location.origin, ownerId);

  function handleCopy() {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast.success("Code copied — now paste it where step 3 or 4 says to.");
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="min-h-svh bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="text-center">
          <Sparkles className="mx-auto size-8 text-primary" />
          <h1 className="mt-2 text-2xl font-semibold">Add the estimate chat to your website</h1>
          <p className="mt-1 text-muted-foreground">
            Follow the steps below for your website — it only takes a couple of minutes.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. What's your website built on?</CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEBSITE_PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Copy this code</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-6">
            <Textarea readOnly value={snippet} className="min-h-16 font-mono text-xs" />
            <Button type="button" onClick={handleCopy} className="w-full">
              {copied ? <Check className="size-4" /> : <Code2 className="size-4" />}
              {copied ? "Copied!" : "Copy code"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Follow these steps for {selected.label}</CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            <ol className="space-y-3">
              {selected.steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <MessageCircle className="size-4" />
          <a href={`/estimate/${ownerId}`} target="_blank" rel="noreferrer" className="underline">
            Preview the chat on its own page
          </a>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Once it's added, refresh your website's page to see it live. If it doesn't show up, double-check
          the code was pasted exactly as copied, with nothing added or removed.
        </p>
      </div>
    </div>
  );
}
