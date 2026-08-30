import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { fetchSubApproval, signSubApproval } from "@/lib/functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";

type SubData = Awaited<ReturnType<typeof fetchSubApproval>>;

// A subcontractor's own view of a job they've been added to — their
// scope of work, their pay, the project's payment timeline, and who else
// is on the job — with a way to sign off by typing their name. Never
// shows the client's contact info or another sub's pay (see
// docs/schema_v32_sub_approval_and_milestones.sql).
export default function SubApproval() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signedName, setSignedName] = useState("");
  const [signing, setSigning] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const result = await fetchSubApproval(token);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleSign(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !signedName.trim()) return;
    setSigning(true);
    try {
      await signSubApproval(token, signedName.trim());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign off");
    } finally {
      setSigning(false);
    }
  }

  if (loading) {
    return (
      <Centered>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </Centered>
    );
  }

  if (error && !data) {
    return (
      <Centered>
        <p className="text-muted-foreground">{error}</p>
      </Centered>
    );
  }

  if (!data) return null;

  const { subcontractor, business, milestones, otherSubs } = data;
  const businessName = business?.business_name || "your contractor";

  return (
    <Centered wide>
      <Card className="w-full">
        <CardHeader className="items-center text-center">
          {business?.logo_url ? (
            <img src={business.logo_url} alt={businessName} className="mb-1 max-h-14 max-w-40 object-contain" />
          ) : (
            <Sparkles className="mb-1 size-6 text-primary" />
          )}
          <CardTitle>Job details from {businessName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pb-6">
          <div className="rounded-md border p-3">
            <p className="text-sm text-muted-foreground">Your scope of work</p>
            <p className="font-medium">{subcontractor.scope_of_work}</p>
            {subcontractor.pay_cents !== null && (
              <p className="mt-1 text-sm">
                Your pay: <span className="font-medium">{formatCurrency(subcontractor.pay_cents)}</span>
              </p>
            )}
          </div>

          {otherSubs.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Also working on this job</p>
              <div className="divide-y rounded-md border text-sm">
                {otherSubs.map((sub) => (
                  <div key={sub.id} className="px-3 py-2">
                    <p className="font-medium">{sub.name}</p>
                    <p className="text-muted-foreground">{sub.scope_of_work}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {milestones.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Payment timeline (client to {businessName})</p>
              <div className="divide-y rounded-md border text-sm">
                {milestones.map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <p>{m.title}</p>
                      {m.due_date && <p className="text-xs text-muted-foreground">Due {formatDate(m.due_date)}</p>}
                    </div>
                    <span>{formatCurrency(m.amount_cents)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {subcontractor.signed_at ? (
            <div className="rounded-md border bg-secondary/50 p-4 text-center">
              <CheckCircle2 className="mx-auto mb-1 size-6 text-success" />
              <p className="font-medium">You{"'"}ve agreed to this scope of work</p>
              <p className="text-sm text-muted-foreground">
                Signed as "{subcontractor.signed_name}" on {formatDate(subcontractor.signed_at)}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSign} className="space-y-3 rounded-md border p-4">
              <p className="text-sm font-medium">Agree to this scope of work and pay</p>
              <p className="text-xs text-muted-foreground">
                Type your full name below to confirm you agree to the scope of work and pay shown above.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="signedName">Your full name</Label>
                <Input
                  id="signedName"
                  value={signedName}
                  onChange={(e) => setSignedName(e.target.value)}
                  placeholder="Type your full name"
                  required
                />
              </div>
              <Button type="submit" disabled={signing || !signedName.trim()}>
                {signing ? "Signing…" : "I agree"}
              </Button>
            </form>
          )}

          {error && <p className="text-center text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </Centered>
  );
}

function Centered({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className={wide ? "w-full max-w-lg" : undefined}>{children}</div>
    </div>
  );
}
