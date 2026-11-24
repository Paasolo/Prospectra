import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { getErrorMessage } from "@/lib/errors";
import { agentService, type AgentSegmentRecord } from "@/services/agent-service";

function CompetitorList({ value }: { value: unknown }) {
  if (!Array.isArray(value) || value.length === 0) {
    return <p className="text-sm text-muted-foreground">No competitors crawled yet.</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {value.map((item, index) => {
        const row = item as { name?: string; websiteUrl?: string; pageCount?: number };
        return (
          <li key={`${row.websiteUrl ?? index}`} className="rounded-md border border-border p-2">
            <span className="font-medium">{row.name || "Competitor"}</span>
            <span className="block text-muted-foreground">{row.websiteUrl}</span>
            <span className="text-xs text-muted-foreground">{row.pageCount ?? 0} pages crawled</span>
          </li>
        );
      })}
    </ul>
  );
}

function SegmentCard({
  segment,
  workspaceId,
  mailboxConnected,
  onApprove,
  approving,
}: {
  segment: AgentSegmentRecord;
  workspaceId: string;
  mailboxConnected: boolean;
  onApprove: (segmentId: string) => void;
  approving: boolean;
}) {
  const cpl = agentService.costPerLead(segment.credits_spent, segment.positive_replies);
  const sendCredits = segment.prospect_ids.length;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{segment.name}</CardTitle>
            <CardDescription>{segment.who_buys}</CardDescription>
          </div>
          <Badge variant="outline">{segment.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          <span className="font-medium">Fit score (model estimate): </span>
          {segment.fit_score}
        </p>
        <p>
          <span className="font-medium">Evidence: </span>
          {segment.evidence_note}
        </p>
        <p>
          Prospects: {segment.prospect_ids.length} · Drafts: {segment.draft_ids.length} · Credits used:{" "}
          {segment.credits_spent}
        </p>
        <p>
          Cost per lead: {cpl === null ? "Unavailable until a positive reply is recorded" : `${cpl} credits`}
        </p>
        {segment.discovery_state !== "configured" || segment.setup_message ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-950 dark:text-amber-100">
            {segment.setup_message ||
              "Discovery is not fully configured. Set EnrichLayer (LinkedIn) credentials on the worker before expecting people here."}
          </p>
        ) : null}
        {segment.approved_at ? (
          <p className="text-muted-foreground">
            Approved
            {segment.campaign_id ? (
              <>
                {" "}
                ·{" "}
                <Link className="text-primary hover:underline" to={`/app/campaigns/${segment.campaign_id}`}>
                  Open campaign
                </Link>
              </>
            ) : null}
          </p>
        ) : (
          <div className="space-y-2 rounded-md border border-border p-3">
            <p>
              Approving this segment will create a campaign for {segment.prospect_ids.length} prospects. Estimated send
              cost: {sendCredits} credits.
            </p>
            {!mailboxConnected ? (
              <p className="text-amber-800 dark:text-amber-100">
                No mailbox is connected. Approval will leave the campaign in draft and nothing will be sent.
              </p>
            ) : null}
            <Button
              type="button"
              disabled={approving || segment.prospect_ids.length === 0 || segment.draft_ids.length === 0}
              onClick={() => onApprove(segment.id)}
            >
              {approving ? "Approving…" : "Approve segment"}
            </Button>
            {segment.prospect_ids.length === 0 || segment.draft_ids.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Approval needs at least one prospect and one draft from a completed research pass.
              </p>
            ) : null}
            <span className="sr-only">{workspaceId}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AgentRunPage() {
  const { runId = "" } = useParams();
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const run = useQuery({
    queryKey: ["agent-run", activeWorkspaceId, runId],
    enabled: Boolean(activeWorkspaceId && runId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "running" ? 3000 : false;
    },
    queryFn: () => agentService.getRun(activeWorkspaceId!, runId),
  });
  const segments = useQuery({
    queryKey: ["agent-segments", activeWorkspaceId, runId],
    enabled: Boolean(activeWorkspaceId && runId),
    refetchInterval: () => (run.data?.status === "queued" || run.data?.status === "running" ? 3000 : false),
    queryFn: () => agentService.listSegments(activeWorkspaceId!, runId),
  });
  const approve = useMutation({
    mutationFn: (segmentId: string) =>
      agentService.approve({ workspaceId: activeWorkspaceId!, segmentId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["agent-run", activeWorkspaceId, runId] });
      await queryClient.invalidateQueries({ queryKey: ["agent-segments", activeWorkspaceId, runId] });
    },
  });

  return (
    <>
      <Seo title="Agent run" />
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Agent run</h1>
            <p className="text-sm text-muted-foreground">Review researched segments before any send.</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/app/agent">All runs</Link>
          </Button>
        </div>
        <WorkspaceGate>
          {run.isLoading ? <p className="text-sm text-muted-foreground">Loading run…</p> : null}
          {run.isError ? <p className="text-sm text-destructive">{getErrorMessage(run.error)}</p> : null}
          {run.data ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>{run.data.company_name || run.data.website_url || "Offer description"}</CardTitle>
                      <CardDescription>
                        {run.data.offer_summary || run.data.offer_description || "Research in progress."}
                      </CardDescription>
                    </div>
                    <Badge variant={run.data.status === "failed" ? "warning" : "outline"}>{run.data.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>
                    Estimated hold {run.data.estimated_credits} · Consumed {run.data.consumed_credits} · Cap{" "}
                    {run.data.prospect_cap} prospects per segment
                  </p>
                  {!run.data.discovery_configured ? (
                    <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
                      Discovery is unconfigured on the worker. Segments will show setup guidance and zero invented
                      people.
                    </p>
                  ) : null}
                  {!run.data.mailbox_connected ? (
                    <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
                      No mailbox is connected. Approving a segment will leave the campaign in draft.
                    </p>
                  ) : null}
                  {run.data.error_detail ? (
                    <p className="text-destructive">{run.data.error_detail}</p>
                  ) : null}
                  <div>
                    <h2 className="mb-2 font-medium">Researched competitors</h2>
                    <CompetitorList value={run.data.competitors} />
                  </div>
                </CardContent>
              </Card>
              <div className="space-y-4">
                <h2 className="font-display text-xl font-semibold">Buyer segments</h2>
                {segments.isLoading ? <p className="text-sm text-muted-foreground">Loading segments…</p> : null}
                {segments.isError ? (
                  <p className="text-sm text-destructive">{getErrorMessage(segments.error)}</p>
                ) : null}
                {segments.data?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {run.data.status === "queued" || run.data.status === "running"
                      ? "The worker is researching this run…"
                      : "No segments were produced for this run."}
                  </p>
                ) : null}
                {segments.data?.map((segment) => (
                  <SegmentCard
                    key={segment.id}
                    segment={segment}
                    workspaceId={activeWorkspaceId!}
                    mailboxConnected={Boolean(run.data?.mailbox_connected)}
                    approving={approve.isPending}
                    onApprove={(segmentId) => approve.mutate(segmentId)}
                  />
                ))}
                {approve.isError ? (
                  <p className="text-sm text-destructive">{getErrorMessage(approve.error)}</p>
                ) : null}
                {approve.isSuccess && approve.data.setupMessage ? (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                    {approve.data.setupMessage}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          {run.data === null && !run.isLoading ? (
            <p className="text-sm text-muted-foreground">This agent run was not found in the active workspace.</p>
          ) : null}
        </WorkspaceGate>
      </div>
    </>
  );
}
