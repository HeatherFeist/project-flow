import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";

// Sits inside ProtectedRoute (so a session already exists) and gates the
// rest of the app behind an active Project Flow subscription — or the
// profiles.is_exempt comp flag. /subscribe itself is NOT wrapped in this,
// so a signed-in-but-unpaid owner can always reach the page that lets them
// pay.
export function RequireSubscription({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { data, isLoading } = useSubscription(user?.id);

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!data?.isActive) {
    return <Navigate to="/subscribe" replace />;
  }

  return <>{children}</>;
}
