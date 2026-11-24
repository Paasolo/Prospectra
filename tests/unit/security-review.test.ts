import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { passwordResetClientError } from "@/services/auth-service";

describe("security review guards", () => {
  it("does not tell the requester whether an account exists", () => {
    expect(passwordResetClientError("User not found")).toBeNull();
    expect(passwordResetClientError("over_email_send_rate_limit")).toMatch(/Too many reset attempts/);
    expect(passwordResetClientError("Failed to send the recovery email")).toMatch(/could not be sent/);
  });

  it("keeps example environment values empty of live credentials", () => {
    const example = readFileSync(".env.example", "utf8");
    expect(example).not.toMatch(/sk-proj-/);
    expect(example).not.toMatch(/sb_publishable_/);
    expect(example).not.toMatch(/eyJhbGciOiJIUzI1Ni/);
    expect(example).not.toMatch(/supabase\.co/);
    expect(example).toContain("SUPABASE_SERVICE_ROLE_KEY=");
    expect(example).toContain("OPENAI_API_KEY=");
  });

  it("revokes member credit grants and scopes audit inserts to the workspace", () => {
    const migration = readFileSync("supabase/migrations/20260323000011_security_hardening.sql", "utf8");
    expect(migration).toContain("revoke all on function public.consume_workspace_credits");
    expect(migration).toContain("revoke all on function public.grant_workspace_credits");
    expect(migration).toContain("drop policy if exists workspaces_insert_authenticated");
    expect(migration).toContain("has_workspace_role(workspace_id, array['OWNER', 'ADMIN'])");
    expect(migration).toContain("prospect_notes_workspace_match");
    expect(migration).toContain("campaign_steps_workspace_match");
    expect(migration).toContain("%I.%I");
    expect(migration).not.toMatch(/grant execute on function public\.consume_workspace_credits[\s\S]*to authenticated/);
  });
});
