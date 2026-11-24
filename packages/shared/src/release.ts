import { healthResponseSchema } from "./schemas.js";

const DESTRUCTIVE_SQL =
  /\b(drop\s+table|drop\s+schema|drop\s+database|truncate\s+table|truncate\s+only)\b/i;

export function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

export function destructiveStatements(sql: string): string[] {
  const found = new Set<string>();
  const pattern = new RegExp(DESTRUCTIVE_SQL.source, "gi");
  for (const match of stripSqlComments(sql).matchAll(pattern)) {
    if (match[0]) found.add(match[0].toLowerCase().replace(/\s+/g, " "));
  }
  return [...found];
}

export function tablesMissingRls(sql: string): string[] {
  const stripped = stripSqlComments(sql);
  const created = new Set<string>();
  const protectedTables = new Set<string>();
  for (const match of stripped.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi)) {
    if (match[1]) created.add(match[1].toLowerCase());
  }
  for (const match of stripped.matchAll(
    /alter\s+table\s+public\.([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi,
  )) {
    if (match[1]) protectedTables.add(match[1].toLowerCase());
  }
  return [...created].filter((table) => !protectedTables.has(table)).sort();
}

export function workerHealthOk(status: number, body: unknown): boolean {
  if (status !== 200) return false;
  const parsed = healthResponseSchema.safeParse(body);
  return parsed.success && parsed.data.status === "ok";
}

export const PRODUCTION_ENV_NAMES = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_APP_URL",
  "VITE_WORKER_URL",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "APP_URL",
  "WORKER_PUBLIC_URL",
  "WORKER_CREDENTIAL_KEY",
  "WORKER_ALLOWED_ORIGINS",
] as const;
