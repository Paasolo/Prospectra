import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { ProspectStage } from "@prospectra/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { downloadTextFile } from "@/lib/download";
import { getErrorMessage } from "@/lib/errors";
import { prospectService } from "@/services/prospect-service";
import { workspaceService } from "@/services/workspace-service";

export function ProspectsPage() {
  const { activeWorkspaceId } = useWorkspace();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<ProspectStage | "">("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const userId = auth.status === "authenticated" ? auth.userId : null;
  const prospects = useQuery({
    queryKey: ["prospects", activeWorkspaceId, search, stage, page],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => prospectService.list(activeWorkspaceId!, { search, stage, page, pageSize: 20, sort: "created_at" }),
  });
  const stages = useQuery({
    queryKey: ["stages", activeWorkspaceId],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => prospectService.stagesFor(activeWorkspaceId!),
  });
  const members = useQuery({
    queryKey: ["workspace-members", activeWorkspaceId],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => workspaceService.listMembers(activeWorkspaceId!),
  });
  const isAdmin = members.data?.some(
    (member) => member.user_id === userId && (member.role === "OWNER" || member.role === "ADMIN"),
  );
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["prospects", activeWorkspaceId] });
  const mutate = useMutation({ mutationFn: async (task: () => Promise<unknown>) => task(), onSuccess: refresh });
  const pages = Math.max(1, Math.ceil((prospects.data?.count ?? 0) / 20));

  return (
    <>
      <Seo title="Prospects" />
      <WorkspaceGate>
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight">Prospects</h1>
              <p className="text-sm text-muted-foreground">{prospects.data?.count ?? 0} records in this workspace.</p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link to="/app/prospects/import">Import CSV</Link>
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  void prospectService.exportCsv(activeWorkspaceId!).then((csv) => downloadTextFile("prospects.csv", csv, "text/csv"))
                }
              >
                Export
              </Button>
              <Button asChild>
                <Link to="/app/prospects/new">Create prospect</Link>
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input className="max-w-xs" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search name, email, or title" />
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={stage} onChange={(event) => { setStage(event.target.value as ProspectStage | ""); setPage(1); }}>
              <option value="">All stages</option>
              {stages.data?.filter((item) => item.is_enabled).map((item) => (
                <option key={item.code} value={item.code}>{item.label}</option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue=""
              onChange={(event) => {
                const next = event.target.value as ProspectStage;
                if (next && selected.length) {
                  mutate.mutate(() => prospectService.setStage(activeWorkspaceId!, selected, next, userId));
                }
              }}
            >
              <option value="">Bulk stage</option>
              {stages.data?.filter((item) => item.is_enabled).map((item) => (
                <option key={item.code} value={item.code}>{item.label}</option>
              ))}
            </select>
            <Button variant="outline" disabled={!selected.length} onClick={() => setConfirmDelete(true)}>
              Delete selected
            </Button>
          </div>
          {confirmDelete ? (
            <Card>
              <CardHeader>
                <CardTitle>Delete {selected.length} prospects?</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button
                  onClick={() =>
                    mutate.mutate(async () => {
                      await prospectService.remove(activeWorkspaceId!, selected);
                      setSelected([]);
                      setConfirmDelete(false);
                    })
                  }
                >
                  Confirm delete
                </Button>
                <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </CardContent>
            </Card>
          ) : null}
          {prospects.isError || mutate.isError ? (
            <p className="text-sm text-destructive">{getErrorMessage(prospects.error ?? mutate.error)}</p>
          ) : null}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="p-3" />
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Company</th>
                  <th className="p-3">Stage</th>
                </tr>
              </thead>
              <tbody>
                {prospects.data?.rows.map((prospect) => (
                  <tr key={prospect.id} className="border-b border-border">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selected.includes(prospect.id)}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked ? [...current, prospect.id] : current.filter((id) => id !== prospect.id),
                          )
                        }
                      />
                    </td>
                    <td className="p-3">
                      <Link className="font-medium" to={`/app/prospects/${prospect.id}`}>
                        {prospect.full_name || "Unnamed prospect"}
                      </Link>
                    </td>
                    <td className="p-3">
                      {prospect.email || "—"}
                      {prospect.email ? (prospect.email_verified ? " · verified" : " · unverified") : ""}
                    </td>
                    <td className="p-3">{prospect.companies?.name || "—"}</td>
                    <td className="p-3">{prospect.stage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>Pipeline stages</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3 text-sm">
                {stages.data?.map((item) => (
                  <label key={item.code} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.is_enabled}
                      disabled={item.code === "NEW"}
                      onChange={(event) =>
                        mutate.mutate(async () => {
                          await prospectService.setStageEnabled(activeWorkspaceId!, item.code, event.target.checked);
                          await queryClient.invalidateQueries({ queryKey: ["stages", activeWorkspaceId] });
                        })
                      }
                    />
                    {item.label}
                  </label>
                ))}
              </CardContent>
            </Card>
          ) : null}
          <div className="flex items-center gap-2 text-sm">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button>
            <span>Page {page} of {pages}</span>
            <Button variant="outline" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Next</Button>
          </div>
        </div>
      </WorkspaceGate>
    </>
  );
}
