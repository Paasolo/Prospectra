import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === "loading") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        Restoring session…
      </div>
    );
  }

  // Allow exploring the app shell when Supabase is not configured so local UI work continues honestly.
  if (auth.status === "unconfigured") {
    return <Outlet />;
  }

  if (auth.status !== "authenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
