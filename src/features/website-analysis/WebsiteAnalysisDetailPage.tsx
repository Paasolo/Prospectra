import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { downloadTextFile } from "@/lib/download";
import { getErrorMessage } from "@/lib/errors";
import { analysisService } from "@/services/analysis-service";

function ListBlock({ title, values }: { title: string; values: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {values.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {values.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing was recorded for this section.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function WebsiteAnalysisDetailPage() {
  const { analysisId } = useParams();
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const analysis = useQuery({
    queryKey: ["website-analysis", activeWorkspaceId, analysisId],
    enabled: Boolean(activeWorkspaceId && analysisId),
    queryFn: () => analysisService.get(activeWorkspaceId!, analysisId!),
    refetchInterval: (query) => (query.state.data?.status === "running" ? 2000 : false),
  });
  const save = useMutation({
    mutationFn: () => analysisService.saveCompany(activeWorkspaceId!, analysis.data!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["website-analysis", activeWorkspaceId, analysisId] }),
  });
  const record = analysis.data;
  const annotated = record ? analysisService.annotated(record) : null;

  return (
    <>
      <Seo title="Analysis report" />
      <WorkspaceGate>
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight">Analysis report</h1>
              <p className="text-sm text-muted-foreground">{record?.submitted_url ?? "Loading the saved analysis…"}</p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link to="/app/website-analysis">All analyses</Link>
              </Button>
              <Button
                variant="outline"
                disabled={!record}
                onClick={() => record && downloadTextFile("website-analysis.md", analysisService.report(record), "text/markdown")}
              >
                Export report
              </Button>
              <Button disabled={!record || record.status !== "succeeded" || save.isPending} onClick={() => save.mutate()}>
                Save company
              </Button>
            </div>
          </div>
          {analysis.isError ? <p className="text-sm text-destructive">{getErrorMessage(analysis.error)}</p> : null}
          {save.isError ? <p className="text-sm text-destructive">{getErrorMessage(save.error)}</p> : null}
          {save.isSuccess ? <p className="text-sm text-muted-foreground">Company saved in this workspace.</p> : null}
          {record?.status === "running" ? <p className="text-sm text-muted-foreground">Analysis in progress…</p> : null}
          {record?.error_detail ? (
            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
                <CardDescription>{record.error_code}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{record.error_detail}</p>
              </CardContent>
            </Card>
          ) : null}
          {annotated ? (
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Summary</CardTitle>
                  <CardDescription>
                    Model {record?.ai_model ?? "not recorded"}
                    {record?.estimated_cost_usd != null ? ` · estimated cost $${record.estimated_cost_usd}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>{annotated.companyOverview}</p>
                  <p>
                    <span className="font-medium">Value proposition: </span>
                    {annotated.valueProposition || "Not stated."}
                  </p>
                  <p>
                    <span className="font-medium">Business model: </span>
                    {annotated.businessModel || "Not stated."}
                  </p>
                </CardContent>
              </Card>
              <ListBlock title="Products and services" values={annotated.productsAndServices} />
              <ListBlock title="Target markets" values={annotated.targetMarkets} />
              <ListBlock title="Buyer personas" values={annotated.potentialBuyerRoles} />
              <Card>
                <CardHeader>
                  <CardTitle>AI insights</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>{annotated.recommendedIcp || "No ICP recommendation was returned."}</p>
                  <ListBlock title="Pain points" values={annotated.painPointsAddressed} />
                  <ListBlock title="Buying signals" values={annotated.potentialBuyingSignals} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Confidence</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{annotated.confidenceNotes || "No confidence notes were returned."}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Source references</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {annotated.sourceReferences.length ? (
                    annotated.sourceReferences.map((reference) => (
                      <div key={`${reference.url}-${reference.note}`} className="flex items-start justify-between gap-3">
                        <p>
                          {reference.url}
                          <span className="block text-muted-foreground">{reference.note}</span>
                        </p>
                        <Badge variant={reference.matchedCrawl ? "success" : "warning"}>
                          {reference.matchedCrawl ? "Crawled" : "Not in crawl"}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground">No source references were retained.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </WorkspaceGate>
    </>
  );
}
