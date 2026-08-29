import { useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Trash2, UserPlus } from "lucide-react";
import { useTeam } from "@/contexts/TeamContext";
import {
  useInviteTeamMember,
  useRemoveTeamMember,
  useTeamMembers,
  useUpdateTeamMemberRole,
  type TeamRole,
} from "@/hooks/useTeamAccounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Only rendered for an owner/admin (see Settings.tsx) — a field_tech
// doesn't manage the team. docs/schema_v29_team_accounts.sql.
export function TeamSettingsCard() {
  const { ownerId } = useTeam();
  const { data: members, isLoading } = useTeamMembers(ownerId);
  const inviteMember = useInviteTeamMember();
  const removeMember = useRemoveTeamMember();
  const updateRole = useUpdateTeamMemberRole();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("field_tech");
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      const { inviteLink } = await inviteMember.mutateAsync({ email: email.trim(), role });
      setLastInviteLink(inviteLink);
      setEmail("");
      toast.success("Invite created — copy the link below and send it to them");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invite");
    }
  }

  function copyLink(link: string) {
    navigator.clipboard.writeText(link);
    toast.success("Invite link copied");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team</CardTitle>
        <CardDescription>
          Invite people to work in Project Flow alongside you — an Admin has full access, same as you; a
          Field Tech sees Clients, Schedule, and job photos/checklists, but not quotes, invoices, payments,
          or Settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pb-6">
        <form onSubmit={handleInvite} className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1 space-y-1.5">
            <Label htmlFor="invite_email">Email</Label>
            <Input
              id="invite_email"
              type="email"
              placeholder="teammate@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as TeamRole)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="field_tech">Field Tech</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={inviteMember.isPending}>
            {inviteMember.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
            Invite
          </Button>
        </form>

        {lastInviteLink && (
          <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="truncate">{lastInviteLink}</span>
            <Button variant="outline" size="sm" onClick={() => copyLink(lastInviteLink)}>
              <Copy /> Copy
            </Button>
          </div>
        )}

        {isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (members ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No team members yet — it's just you.</p>
        ) : (
          <div className="space-y-2">
            {(members ?? []).map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.email}</p>
                  <Badge variant={m.status === "active" ? "success" : "warning"}>{m.status}</Badge>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Select value={m.role} onValueChange={(v) => updateRole.mutate({ id: m.id, role: v as TeamRole })}>
                    <SelectTrigger className="h-8 w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="field_tech">Field Tech</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Remove from team"
                    onClick={() => removeMember.mutate(m.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
