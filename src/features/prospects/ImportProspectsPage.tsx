import { useState } from "react";
import { Link } from "react-router-dom";
import { CSV_PROSPECT_FIELDS, type CsvImportRow, type CsvProspectField } from "@prospectra/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { getErrorMessage } from "@/lib/errors";
import { prospectService } from "@/services/prospect-service";

export function ImportProspectsPage() {
  const { activeWorkspaceId } = useWorkspace();
  const auth = useAuth();
  const [headers, setHeaders] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [mapping, setMapping] = useState<Partial<Record<CsvProspectField, string>>>({});
  const [rows, setRows] = useState<CsvImportRow[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Seo title="Import prospects" />
      <WorkspaceGate>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-3xl font-semibold tracking-tight">Import prospects</h1>
            <Button asChild variant="outline"><Link to="/app/prospects">Back</Link></Button>
          </div>
          <Card>
            <CardHeader><CardTitle>CSV file</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  if (!file.name.endsWith(".csv") || file.size > 2_000_000) {
                    setError("Upload a CSV file under 2 MB.");
                    return;
                  }
                  const contents = await file.text();
                  setText(contents);
                  const first = contents.split(/\r?\n/)[0] ?? "";
                  const parsedHeaders = first.split(",").map((header) => header.trim().replace(/^"|"$/g, ""));
                  setHeaders(parsedHeaders);
                  setError(null);
                }}
              />
              <div className="grid gap-3 md:grid-cols-2">
                {CSV_PROSPECT_FIELDS.map((field) => (
                  <label key={field} className="text-sm">
                    {field}
                    <select
                      className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
                      value={mapping[field] ?? ""}
                      onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}
                    >
                      <option value="">Ignore</option>
                      {headers.map((header) => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <Button
                variant="outline"
                disabled={!text}
                onClick={async () => {
                  const listed = await prospectService.list(activeWorkspaceId!, { page: 1, pageSize: 1000 });
                  setRows(
                    prospectService.previewCsv(
                      text,
                      mapping,
                      listed.rows.flatMap((row) => (row.normalized_email ? [row.normalized_email] : [])),
                      listed.rows.flatMap((row) => (row.companies?.normalized_domain ? [row.companies.normalized_domain] : [])),
                    ),
                  );
                }}
              >
                Preview
              </Button>
            </CardContent>
          </Card>
          {rows.length ? (
            <Card>
              <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {rows.slice(0, 20).map((row) => (
                  <p key={row.rowNumber}>
                    Row {row.rowNumber}: {row.errors.join("; ") || row.draft?.fullName || row.draft?.email || "Ready"}
                    {row.duplicateOf ? ` · duplicate ${row.duplicateOf}` : ""}
                  </p>
                ))}
                <Button
                  onClick={async () => {
                    try {
                      const ready = rows.filter((row) => row.draft && !row.duplicateOf).map((row) => row.draft!);
                      const result = await prospectService.importRows(
                        activeWorkspaceId!,
                        ready,
                        auth.status === "authenticated" ? auth.userId : null,
                      );
                      setSummary(`Imported ${result.imported}. Failed ${result.failed.length}. Skipped duplicates ${rows.filter((row) => row.duplicateOf).length}.`);
                      if (result.failed.length) {
                        setError(result.failed.map((item) => item.message).join(" "));
                      }
                    } catch (err) {
                      setError(getErrorMessage(err));
                    }
                  }}
                >
                  Import valid rows
                </Button>
              </CardContent>
            </Card>
          ) : null}
          {summary ? <p className="text-sm">{summary}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </WorkspaceGate>
    </>
  );
}
