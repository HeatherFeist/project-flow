import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAcceptTeamInvite } from "@/hooks/useTeamAccounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Where an invited team member lands (see docs/schema_v29_team_accounts.sql
// and invite-team-member). If they're not signed in yet, this handles
// sign-in/sign-up right here so the invite token in the URL isn't lost to
// a redirect — sign-up still needs email confirmation first (existing
// account-creation flow), so this same link is meant to be revisited
// after that.
export default function TeamJoin() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading, signInWithPassword, signUp } = useAuth();
  const navigate = useNavigate();
  const acceptInvite = useAcceptTeamInvite();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!user || !token || attempted) return;
    setAttempted(true);
    acceptInvite.mutateAsync(token).then(
      () => setAccepted(true),
      (err) => setAcceptError(err instanceof Error ? err.message : "Failed to join the team"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token, attempted]);

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const action = mode === "sign-in" ? signInWithPassword : signUp;
    const { error } = await action(email, password);
    setSubmitting(false);

    if (error) {
      toast.error(error);
      return;
    }
    if (mode === "sign-up") {
      toast.success("Account created. Check your email to confirm, then come back to this same invite link.");
    }
  }

  if (authLoading) {
    return <Centered>Loading…</Centered>;
  }

  if (user) {
    return (
      <Centered>
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center text-center">
            <Sparkles className="mb-2 size-6 text-primary" />
            <CardTitle className="gradient-text">Project Flow</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            {acceptError ? (
              <p className="text-sm text-destructive">{acceptError}</p>
            ) : accepted ? (
              <div className="space-y-3">
                <CheckCircle2 className="mx-auto size-8 text-success" />
                <p className="text-sm">You're on the team.</p>
                <Button className="w-full" onClick={() => navigate("/dashboard", { replace: true })}>
                  Go to Dashboard
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Joining the team…</p>
            )}
          </CardContent>
        </Card>
      </Centered>
    );
  }

  return (
    <Centered>
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Sparkles className="mb-2 size-6 text-primary" />
          <CardTitle className="gradient-text">Project Flow</CardTitle>
          <CardDescription>
            {mode === "sign-in" ? "Sign in to accept your team invite" : "Create your account to join the team"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Please wait…" : mode === "sign-in" ? "Sign in & join" : "Sign up"}
            </Button>
          </form>
          <button
            type="button"
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
          >
            {mode === "sign-in" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </CardContent>
      </Card>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-svh items-center justify-center p-4">{children}</div>;
}
