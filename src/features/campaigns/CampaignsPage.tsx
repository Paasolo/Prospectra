import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { getErrorMessage } from "@/lib/errors";
import { campaignService } from "@/services/engagement-service";

export function CampaignsPage() {
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const campaigns = useQuery({ queryKey: ["campaigns", activeWorkspaceId], enabled: Boolean(activeWorkspaceId), queryFn: () => campaignService.list(activeWorkspaceId!) });
  const status = useMutation({
    mutationFn: (input: { campaignId: string; status: "PAUSED" | "ACTIVE" | "CANCELLED" }) => campaignService.setStatus({ workspaceId: activeWorkspaceId!, ...input }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["campaigns", activeWorkspaceId] }),
  });
  const duplicate = useMutation({
    mutationFn: async (id: string) => {
      const source = await campaignService.get(activeWorkspaceId!, id);
      return campaignService.save({
        workspaceId: activeWorkspaceId!,
        campaign: { name: `${source.campaign.name} copy`, description: source.campaign.description, objective: source.campaign.objective, timezone: source.campaign.timezone, daily_limit: source.campaign.daily_limit, sending_account_id: source.campaign.sending_account_id, list_id: source.campaign.list_id, audience_ids: source.campaign.audience_ids },
        steps: source.steps.map((step) => ({ subject: step.subject, body: step.body, delayDays: step.delay_days, branch: step.branch_condition })),
      });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["campaigns", activeWorkspaceId] }),
  });

  return (
    <>
      <Seo title="Campaigns" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Campaigns</h1>
            <p className="text-sm text-muted-foreground">Sequences send only inside the window, under the daily limit, and stop on reply, bounce, or cancellation.</p>
          </div>
          <Button asChild><Link to="/app/campaigns/new">New campaign</Link></Button>
        </div>
        <WorkspaceGate>
          <div className="space-y-3">
            {(campaigns.data ?? []).map((campaign) => (
              <Card key={campaign.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                  <div>
                    <Link className="font-medium" to={`/app/campaigns/${campaign.id}`}>{campaign.name}</Link>
                    <p className="text-sm text-muted-foreground">{campaign.objective}</p>
                  </div>
                  <Badge variant="outline">{campaign.status}</Badge>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => duplicate.mutate(campaign.id)}>Duplicate</Button>
                    {campaign.status === "ACTIVE" ? <Button size="sm" variant="outline" onClick={() => status.mutate({ campaignId: campaign.id, status: "PAUSED" })}>Pause</Button> : null}
                    {campaign.status === "PAUSED" ? <Button size="sm" variant="outline" onClick={() => status.mutate({ campaignId: campaign.id, status: "ACTIVE" })}>Resume</Button> : null}
                    {campaign.status !== "CANCELLED" && campaign.status !== "DRAFT" ? <Button size="sm" variant="outline" onClick={() => status.mutate({ campaignId: campaign.id, status: "CANCELLED" })}>Cancel</Button> : null}
                    {campaign.status === "DRAFT" ? <Button size="sm" variant="ghost" onClick={() => void campaignService.remove(campaign.id).then(() => queryClient.invalidateQueries({ queryKey: ["campaigns", activeWorkspaceId] }))}>Delete</Button> : null}
                  </div>
                </CardContent>
              </Card>
            ))}
            {status.isError || duplicate.isError ? <p className="text-sm text-destructive">{getErrorMessage(status.error ?? duplicate.error)}</p> : null}
          </div>
        </WorkspaceGate>
      </div>
    </>
  );
}
