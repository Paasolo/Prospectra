import { describe, expect, it } from "vitest";
import { canManageBilling, canManageMembers, canWriteProspects, roleAtLeast } from "@/utils/permissions";

describe("permissions", () => {
  it("ranks roles correctly", () => {
    expect(roleAtLeast("ADMIN", "MANAGER")).toBe(true);
    expect(roleAtLeast("VIEWER", "MEMBER")).toBe(false);
  });

  it("gates member management", () => {
    expect(canManageMembers("ADMIN")).toBe(true);
    expect(canManageMembers("MEMBER")).toBe(false);
  });

  it("gates prospect writes and billing", () => {
    expect(canWriteProspects("MEMBER")).toBe(true);
    expect(canWriteProspects("VIEWER")).toBe(false);
    expect(canManageBilling("OWNER")).toBe(true);
    expect(canManageBilling("MANAGER")).toBe(false);
  });
});
