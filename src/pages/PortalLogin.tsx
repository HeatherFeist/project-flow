import { useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { requestPortalLogin } from "@/lib/functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PortalLogin() {
  const { ownerId } = useParams<{ ownerId: string }>();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ownerId || !email.trim()) return;
    setSending(true);
    try {
      await requestPortalLogin(ownerId, email.trim());
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send login link");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Sparkles className="mx-auto size-6 text-primary" />
          <CardTitle>My project</CardTitle>
        </CardHeader>
        <CardContent className="pb-6">
          {sent ? (
            <p className="text-center text-sm text-muted-foreground">
              If that email matches a project on file, a login link is on its way — check your inbox (and
              spam folder) and click it to view your project.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-center text-sm text-muted-foreground">
                Enter your email and we'll send you a link to view your quotes, invoices, and photos —
                no password needed.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={sending}>
                {sending ? <Loader2 className="animate-spin" /> : null} {sending ? "Sending…" : "Send login link"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
