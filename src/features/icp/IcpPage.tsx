import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { getErrorMessage } from "@/lib/errors";
import { icpService } from "@/services/icp-service";

export function IcpPage() {
  const { activeWorkspaceId } = useWorkspace();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const profiles = useQuery({
    queryKey: ["icp", activeWorkspaceId],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => icpService.list(activeWorkspaceId!),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["icp", activeWorkspaceId] });
  const action = useMutation({
    mutationFn: async (task: () => Promise<unknown>) => task(),
    onSuccess: refresh,
  });
  const userId = auth.status === "authenticated" ? auth.userId : null;
  const compared = profiles.data?.filter((profile) => profile.id === left || profile.id === right) ?? [];

  return (
    <>
      <Seo title="Ideal customer profiles" />
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Ideal customer profiles</h1>
            <p className="text-sm text-muted-foreground">Create, compare, and reuse workspace-specific ICPs.</p>
          </div>
          <Button asChild>
            <Link to="/app/icp/new">Create ICP</Link>
          </Button>
        </div>
        <WorkspaceGate>
          {profiles.isError ? <p className="text-sm text-destructive">{getErrorMessage(profiles.error)}</p> : null}
          {action.isError ? <p className="text-sm text-destructive">{getErrorMessage(action.error)}</p> : null}
          <div className="space-y-3">
            {profiles.data?.map((profile) => (
              <Card key={profile.id}>
                <CardHeader className="flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle>{profile.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{profile.description}</p>
                  </div>
                  <Badge variant={profile.status === "active" ? "success" : "outline"}>{profile.status}</Badge>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Badge variant="ai">Quality {profile.quality_parsed.overall}</Badge>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/app/icp/${profile.id}`}>Edit</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/app/discover/companies?icp=${profile.id}`}>Discover companies</Link>
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => action.mutate(() => icpService.setStatus(activeWorkspaceId!, profile.id, "active"))}>
                    Activate
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => action.mutate(() => icpService.setStatus(activeWorkspaceId!, profile.id, "archived"))}>
                    Archive
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => action.mutate(() => icpService.duplicate(activeWorkspaceId!, profile.id, userId))}>
                    Duplicate
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => action.mutate(() => icpService.remove(activeWorkspaceId!, profile.id))}>
                    Delete
                  </Button>
                </CardContent>
              </Card>
            ))}
            {profiles.data?.length === 0 ? <p className="text-sm text-muted-foreground">No ICPs yet.</p> : null}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Compare</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {[left, right].map((_value, index) => (
                <select
                  key={index}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={index === 0 ? left : right}
                  onChange={(event) => (index === 0 ? setLeft(event.target.value) : setRight(event.target.value))}
                >
                  <option value="">Select an ICP</option>
                  {profiles.data?.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              ))}
              {compared.map((profile) => (
                <div key={profile.id} className="text-sm">
                  <p className="font-medium">{profile.name}</p>
                  <p>Industry: {profile.criteria_parsed.industry || "—"}</p>
                  <p>Geography: {profile.criteria_parsed.geography.join(", ") || "—"}</p>
                  <p>Titles: {profile.criteria_parsed.targetJobTitles.join(", ") || "—"}</p>
                  <p>Quality: {profile.quality_parsed.overall}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </WorkspaceGate>
      </div>
    </>
  );
}
