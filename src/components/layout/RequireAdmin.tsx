import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useSupportTickets";

// Gates /admin/* routes to accounts with profiles.is_admin set — the
// platform-team flag (see docs/schema_v28_support_inbox.sql). Sits
// alongside RequireSubscription/RequireOnboarding, but is not part of
// that chain — an admin viewing the support inbox doesn't need their own
// subscription/onboarding state to matter for this one page.
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { data: isAdmin, isLoading } = useIsAdmin(user?.id);

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
