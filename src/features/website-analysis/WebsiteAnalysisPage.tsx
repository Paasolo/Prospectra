import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { getErrorMessage } from "@/lib/errors";
import { analysisService } from "@/services/analysis-service";
import { WebsiteAnalysisForm } from "@/features/website-analysis/WebsiteAnalysisForm";

export function WebsiteAnalysisPage() {
  const { activeWorkspaceId } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const analyses = useQuery({
    queryKey: ["website-analyses", activeWorkspaceId],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => analysisService.list(activeWorkspaceId!),
  });
  const start = useMutation({
    mutationFn: (values: { url: string; companyName: string; instructions: string }) =>
      analysisService.start({
        workspaceId: activeWorkspaceId!,
        url: values.url,
        companyName: values.companyName,
        instructions: values.instructions,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["website-analyses", activeWorkspaceId] });
      navigate(`/app/website-analysis/${result.id}`);
    },
  });

  return (
    <>
      <Seo title="Website analysis" />
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Website analysis</h1>
          <p className="text-sm text-muted-foreground">
            Public company websites are crawled on the worker, then turned into a structured report. Page content is
            treated as evidence, not instructions.
          </p>
        </div>
        <WorkspaceGate>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>New analysis</CardTitle>
                <CardDescription>Only public HTTP and HTTPS destinations are accepted.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <WebsiteAnalysisForm
                  submitting={start.isPending}
                  onSubmit={async (values) => {
                    await start.mutateAsync(values);
                  }}
                />
                {start.isError ? <p className="text-sm text-destructive">{getErrorMessage(start.error)}</p> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Previous analyses</CardTitle>
                <CardDescription>Saved for this workspace.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {analyses.isLoading ? <p className="text-sm text-muted-foreground">Loading analyses…</p> : null}
                {analyses.isError ? <p className="text-sm text-destructive">{getErrorMessage(analyses.error)}</p> : null}
                {analyses.data?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No analyses yet.</p>
                ) : null}
                {analyses.data?.map((analysis) => (
                  <Link
                    key={analysis.id}
                    to={`/app/website-analysis/${analysis.id}`}
                    className="flex items-center justify-between rounded-lg border border-border p-3 text-sm hover:bg-accent"
                  >
                    <span>
                      <span className="block font-medium">{analysis.company_name || analysis.submitted_url}</span>
                      <span className="text-muted-foreground">{analysis.submitted_url}</span>
                    </span>
                    <Badge variant={analysis.status === "succeeded" ? "success" : analysis.status === "failed" ? "warning" : "outline"}>
                      {analysis.status}
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
