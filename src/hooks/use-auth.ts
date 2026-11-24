import { useEffect, useState } from "react";
import { RECOVERY_STORAGE_KEY } from "@/features/authentication/recovery";
import type { AuthSessionState } from "@/types/auth";
import { getSupabaseInitResult } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export function useAuth(): AuthSessionState {
  const [state, setState] = useState<AuthSessionState>({ status: "loading" });

  useEffect(() => {
    const init = getSupabaseInitResult();
    if (init.status === "unconfigured") {
      setState({ status: "unconfigured", reason: init.reason });
      return;
    }

    const client = init.client;

    void client.auth.getSession().then(({ data, error }) => {
      if (error) {
        logger.warn("Failed to restore session", { message: error.message });
        setState({ status: "unauthenticated" });
        return;
      }
      const session = data.session;
      if (!session?.user) {
        setState({ status: "unauthenticated" });
        return;
      }
      setState({
        status: "authenticated",
        userId: session.user.id,
        email: session.user.email ?? "",
      });
    });

    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        sessionStorage.setItem(RECOVERY_STORAGE_KEY, "1");
      }
      if (!session?.user) {
        setState({ status: "unauthenticated" });
        return;
      }
      setState({
        status: "authenticated",
        userId: session.user.id,
        email: session.user.email ?? "",
      });
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  return state;
}
