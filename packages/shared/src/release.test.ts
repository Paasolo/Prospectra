import { describe, expect, it } from "vitest";
import { destructiveStatements, tablesMissingRls, workerHealthOk } from "./release.js";

describe("release checks", () => {
  it("flags destructive SQL and ignores comments and policy drops", () => {
    const sql = `
      -- drop table public.plans
      drop policy if exists audit_logs_insert on public.audit_logs;
      truncate table public.credit_transactions;
    `;
    expect(destructiveStatements(sql)).toEqual(["truncate table"]);
    expect(destructiveStatements("drop trigger if exists t on public.meetings;")).toEqual([]);
  });

  it("requires row level security on every created public table", () => {
    const sample = `
      create table public.widgets (id uuid);
      create table public.notes (id uuid);
      alter table public.notes enable row level security;
    `;
    expect(tablesMissingRls(sample)).toEqual(["widgets"]);
  });

  it("accepts a healthy worker payload", () => {
    expect(
      workerHealthOk(200, {
        service: "prospectra-worker",
        status: "ok",
        version: "0.1.0",
        timestamp: "2026-11-24T10:00:00.000Z",
        uptimeSeconds: 3,
      }),
    ).toBe(true);
    expect(workerHealthOk(200, { status: "ok" })).toBe(false);
    expect(workerHealthOk(503, { status: "ok" })).toBe(false);
  });
});
