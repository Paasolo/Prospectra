import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DEFAULT_SCORING_WEIGHTS, type ScoringWeights } from "@prospectra/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { getErrorMessage } from "@/lib/errors";
import { enrichmentService, scoringService } from "@/services/scoring-service";
import { prospectService } from "@/services/prospect-service";
import { workspaceService } from "@/services/workspace-service";

export function EnrichmentPage() {
  const { activeWorkspaceId } = useWorkspace();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const userId = auth.status === "authenticated" ? auth.userId : null;
  const prospects = useQuery({
    queryKey: ["prospects", activeWorkspaceId, "enrichment"],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => prospectService.list(activeWorkspaceId!, { page: 1, pageSize: 50 }),
  });
  const jobs = useQuery({
    queryKey: ["enrichment-jobs", activeWorkspaceId],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => enrichmentService.jobs(activeWorkspaceId!),
  });
  const weights = useQuery({
    queryKey: ["scoring-weights", activeWorkspaceId],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => scoringService.weights(activeWorkspaceId!),
  });
  const members = useQuery({
    queryKey: ["workspace-members", activeWorkspaceId],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => workspaceService.listMembers(activeWorkspaceId!),
  });
  const isAdmin = members.data?.some((member) => member.user_id === userId && (member.role === "OWNER" || member.role === "ADMIN"));
  const [draftWeights, setDraftWeights] = useState<ScoringWeights | null>(null);
  const shownWeights = draftWeights ?? weights.data ?? DEFAULT_SCORING_WEIGHTS;
  const run = useMutation({
    mutationFn: () => enrichmentService.run(activeWorkspaceId!, selected),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["enrichment-jobs", activeWorkspaceId] }),
  });
  const duplicates = useQuery({
    queryKey: ["duplicates", activeWorkspaceId],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => prospectService.duplicateCandidates(activeWorkspaceId!),
  });

  return (
    <>
      <Seo title="Enrichment and scoring" />
      <WorkspaceGate>
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Enrichment and scoring</h1>
            <p className="text-sm text-muted-foreground">
              Enrichment uses the configured provider. Missing fields stay blank, and email verification is recorded only when the verification provider confirms it.
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Enrich prospects</CardTitle>
              <CardDescription>Select up to 25 prospects. Credits are reserved and unused credits are returned.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {prospects.data?.rows.map((prospect) => (
                <label key={prospect.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(prospect.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked ? [...current, prospect.id] : current.filter((id) => id !== prospect.id),
                      )
                    }
                  />
                  {prospect.full_name || prospect.email || prospect.id}
                </label>
              ))}
              <Button disabled={!selected.length || run.isPending} onClick={() => run.mutate()}>
                {run.isPending ? "Enriching…" : "Run enrichment"}
              </Button>
              {run.isError ? <p className="text-sm text-destructive">{getErrorMessage(run.error)}</p> : null}
              {run.data ? <p className="text-sm">Credits used: {run.data.creditsConsumed}</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Jobs</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {jobs.data?.map((job) => (
                <p key={job.id}>{job.status} · attempts {job.attempt_count} · credits {job.credits_consumed}{job.error_detail ? ` · ${job.error_detail}` : ""}</p>
              ))}
              {jobs.data?.length === 0 ? <p className="text-muted-foreground">No enrichment jobs yet.</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Scoring weights</CardTitle>
              <CardDescription>Scores are calculated from these weights and stored with the inputs used.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {(Object.keys(DEFAULT_SCORING_WEIGHTS) as Array<keyof ScoringWeights>).map((key) => (
                <label key={key} className="text-sm">
                  {key}
                  <Input
                    type="number"
                    disabled={!isAdmin}
                    value={shownWeights[key]}
                    onChange={(event) =>
                      setDraftWeights({ ...shownWeights, [key]: Number(event.target.value) })
                    }
                  />
                </label>
              ))}
              {isAdmin ? (
                <Button className="md:col-span-3" onClick={() => void scoringService.saveWeights(activeWorkspaceId!, shownWeights, userId)}>
                  Save weights
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground md:col-span-3">Only workspace owners and admins can change weights.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Possible duplicates</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {duplicates.data?.map((pair) => (
                <div key={`${pair.leftId}-${pair.rightId}`} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{pair.confidence}: {pair.reason}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void prospectService.merge({
                        workspaceId: activeWorkspaceId!,
                        survivingId: pair.leftId,
                        mergedId: pair.rightId,
                        reason: pair.reason,
                        confidence: pair.confidence,
                        actorUserId: userId,
                      }).then(() => queryClient.invalidateQueries({ queryKey: ["duplicates", activeWorkspaceId] }))
                    }
                  >
                    Review and merge
                  </Button>
                </div>
              ))}
              {duplicates.data?.length === 0 ? <p className="text-muted-foreground">No likely or uncertain duplicates were found.</p> : null}
            </CardContent>
          </Card>
        </div>
      </WorkspaceGate>
    </>
  );
}
