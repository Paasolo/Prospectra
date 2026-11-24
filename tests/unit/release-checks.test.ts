import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { destructiveStatements, PRODUCTION_ENV_NAMES, tablesMissingRls } from "@prospectra/shared";

describe("repository release checks", () => {
  it("keeps migrations non-destructive and enables RLS on every public table", () => {
    const directory = join(process.cwd(), "supabase", "migrations");
    const sql = readdirSync(directory)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => readFileSync(join(directory, name), "utf8"))
      .join("\n");
    expect(destructiveStatements(sql)).toEqual([]);
    expect(tablesMissingRls(sql)).toEqual([]);
  });

  it("lists production variable names in the example file and does not seed tenant rows", () => {
    const example = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    for (const name of PRODUCTION_ENV_NAMES) {
      expect(example).toContain(`${name}=`);
    }
    const seed = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8").toLowerCase();
    expect(seed).not.toMatch(/insert\s+into\s+public\.(prospects|companies|email_messages|payment_events)/);
  });
});
