import type { WorkspaceRole } from "@/types/workspace";

const roleRank: Record<WorkspaceRole, number> = {
  VIEWER: 1,
  MEMBER: 2,
  MANAGER: 3,
  ADMIN: 4,
  OWNER: 5,
};

export function roleAtLeast(role: WorkspaceRole, minimum: WorkspaceRole): boolean {
  return roleRank[role] >= roleRank[minimum];
}

export function canManageMembers(role: WorkspaceRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canWriteProspects(role: WorkspaceRole): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "MANAGER" || role === "MEMBER";
}

export function canManageBilling(role: WorkspaceRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}
