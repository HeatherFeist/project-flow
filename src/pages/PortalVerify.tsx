import { useEffect, useRef, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { verifyPortalLogin } from "@/lib/functions";
import { portalSessionKey } from "@/lib/portalSession";

export default function PortalVerify() {
  const { ownerId } = useParams<{ ownerId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!token || !ownerId || ranRef.current) return;
    ranRef.current = true;
    verifyPortalLogin(token)
      .then((result) => {
        localStorage.setItem(portalSessionKey(ownerId), result.sessionToken);
        setDone(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "That link didn't work"));
  }, [token, ownerId]);

  if (!ownerId) return null;
  if (done) return <Navigate to={`/portal/${ownerId}`} replace />;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-4 text-center">
      {error ? (
        <>
          <p className="text-muted-foreground">{error}</p>
          <a href={`/portal/${ownerId}/login`} className="text-sm underline">
            Request a new link
          </a>
        </>
      ) : (
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
