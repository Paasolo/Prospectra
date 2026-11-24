import { describe, expect, it } from "vitest";
import { getClientEnv } from "@/lib/env";

describe("getClientEnv", () => {
  it("reports supabase as unconfigured without credentials", () => {
    const env = getClientEnv();
    expect(env.isSupabaseConfigured).toBe(false);
    expect(env.demoMode).toBe(false);
  });
});
