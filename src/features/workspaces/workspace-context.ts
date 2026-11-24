import { createContext, useContext } from "react";
import type { WorkspaceRecord } from "@/services/workspace-service";

export type WorkspaceContextValue = {
  workspaces: WorkspaceRecord[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceRecord | null;
  loading: boolean;
  error: string | null;
  setActiveWorkspaceId: (id: string) => void;
  refresh: () => Promise<void>;
};

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return ctx;
}
