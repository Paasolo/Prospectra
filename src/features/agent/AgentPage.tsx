import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { AgentStartForm } from "@/features/agent/AgentStartForm";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { getErrorMessage } from "@/lib/errors";
import { agentService } from "@/services/agent-service";

export function AgentPage() {
  const { activeWorkspaceId } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runs = useQuery({
    queryKey: ["agent-runs", activeWorkspaceId],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => agentService.listRuns(activeWorkspaceId!),
  });
  const start = useMutation({
    mutationFn: (values: {
      websiteUrl: string;
      offerDescription: string;
      companyName: string;
      prospectCap: number;
    }) =>
      agentService.start({
        workspaceId: activeWorkspaceId!,
        websiteUrl: values.websiteUrl,
        offerDescription: values.offerDescription,
        companyName: values.companyName,
        prospectCap: values.prospectCap,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["agent-runs", activeWorkspaceId] });
      navigate(`/app/agent/${result.id}`);
    },
  });

  return (
    <>
      <Seo title="Outbound agent" />
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Outbound agent</h1>
          <p className="text-sm text-muted-foreground">
            Research your offer, score buyer segments, find real prospects, and draft personal emails. Sending waits
            for your approval on each segment.
          </p>
        </div>
        <WorkspaceGate>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>New run</CardTitle>
                <CardDescription>
                  Enter a public website or describe what you sell. Competitor sites are only stored after a successful
                  crawl.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <AgentStartForm
                  submitting={start.isPending}
                  estimatedCredits={agentService.estimateCredits()}
                  onSubmit={async (values) => {
                    await start.mutateAsync(values);
                  }}
                />
                {start.isError ? <p className="text-sm text-destructive">{getErrorMessage(start.error)}</p> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Previous runs</CardTitle>
                <CardDescription>Saved for this workspace.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {runs.isLoading ? <p className="text-sm text-muted-foreground">Loading runs…</p> : null}
                {runs.isError ? <p className="text-sm text-destructive">{getErrorMessage(runs.error)}</p> : null}
                {runs.data?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No agent runs yet.</p>
                ) : null}
                {runs.data?.map((run) => (
                  <Link
                    key={run.id}
                    to={`/app/agent/${run.id}`}
                    className="flex items-center justify-between rounded-lg border border-border p-3 text-sm hover:bg-accent"
                  >
                    <span>
                      <span className="block font-medium">
                        {run.company_name || run.website_url || "Offer description"}
                      </span>
                      <span className="text-muted-foreground">
                        {run.website_url || run.offer_description?.slice(0, 80) || "—"}
                      </span>
                    </span>
                    <Badge
                      variant={
                        run.status === "failed"
                          ? "warning"
                          : run.status === "awaiting_approval" || run.status === "completed"
                            ? "success"
                            : "outline"
                      }
                    >
                      {run.status}
                    </Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        </WorkspaceGate>
      </div>
    </>
  );
}
