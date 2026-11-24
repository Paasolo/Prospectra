export const WORKSPACE_ROLES = ["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceMember = {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
};
