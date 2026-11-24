import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const shared = await import("../packages/shared/dist/index.js").catch(() => null);
if (!shared?.destructiveStatements || !shared?.tablesMissingRls) {
  console.error("Build @prospectra/shared before checking migrations.");
  process.exit(1);
}

const directory = join(process.cwd(), "supabase", "migrations");
const sql = readdirSync(directory)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(directory, name), "utf8"))
  .join("\n");

const destructive = shared.destructiveStatements(sql);
const missingRls = shared.tablesMissingRls(sql);
if (destructive.length || missingRls.length) {
  console.error(
    JSON.stringify({
      level: "error",
      message: "Migration check failed",
      destructive,
      missingRls,
    }),
  );
  process.exit(1);
}

console.log(JSON.stringify({ level: "info", message: "Migrations are non-destructive and enable RLS on every public table." }));
