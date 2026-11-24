import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabaseInitResult } from "@/integrations/supabase/client";
import { workspaceService, type WorkspaceRecord } from "@/services/workspace-service";
import { useAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/errors";
import {
  WorkspaceContext,
  type WorkspaceContextValue,
} from "@/features/workspaces/workspace-context";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(
    () => localStorage.getItem("prospectra.activeWorkspaceId"),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const init = getSupabaseInitResult();
    if (init.status === "unconfigured" || auth.status !== "authenticated") {
      setWorkspaces([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await workspaceService.listWorkspaces();
      setWorkspaces(rows);
      if (!activeWorkspaceId && rows[0]) {
        setActiveWorkspaceIdState(rows[0].id);
        localStorage.setItem("prospectra.activeWorkspaceId", rows[0].id);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, auth.status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setActiveWorkspaceId = useCallback((id: string) => {
    setActiveWorkspaceIdState(id);
    localStorage.setItem("prospectra.activeWorkspaceId", id);
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      activeWorkspaceId,
      activeWorkspace: workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
      loading,
      error,
      setActiveWorkspaceId,
      refresh,
    }),
    [workspaces, activeWorkspaceId, loading, error, setActiveWorkspaceId, refresh],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
