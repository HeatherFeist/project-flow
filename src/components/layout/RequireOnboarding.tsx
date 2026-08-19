import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOnboardingStatus } from "@/hooks/useOnboarding";

// Sits inside RequireSubscription (so billing is already sorted) and sends
// a first-time owner through the setup wizard before they see the app.
// /onboarding itself is not wrapped in this, same pattern as /subscribe.
export function RequireOnboarding({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { data, isLoading } = useOnboardingStatus(user?.id);

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!data?.completed) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
