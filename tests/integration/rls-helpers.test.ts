/**
 * Documents expected membership helper behaviour.
 * Full Postgres RLS integration requires a running Supabase instance (`supabase start` + migrations).
 */
import { describe, expect, it } from "vitest";
import { canManageMembers, canWriteProspects } from "@/utils/permissions";

describe("RLS helper expectations", () => {
  it("mirrors SQL permission intent for common roles", () => {
    expect(canManageMembers("OWNER")).toBe(true);
    expect(canManageMembers("ADMIN")).toBe(true);
    expect(canManageMembers("VIEWER")).toBe(false);
    expect(canWriteProspects("MEMBER")).toBe(true);
    expect(canWriteProspects("VIEWER")).toBe(false);
  });
});
