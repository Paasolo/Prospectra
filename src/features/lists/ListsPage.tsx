import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { downloadTextFile } from "@/lib/download";
import { getErrorMessage } from "@/lib/errors";
import { listService } from "@/services/list-service";

export function ListsPage() {
  const { activeWorkspaceId } = useWorkspace();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const lists = useQuery({
    queryKey: ["lists", activeWorkspaceId, search],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => listService.list(activeWorkspaceId!, search),
  });
  const members = useQuery({
    queryKey: ["list-members", activeId],
    enabled: Boolean(activeWorkspaceId && activeId),
    queryFn: () => listService.members(activeWorkspaceId!, activeId!),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["lists", activeWorkspaceId] });
  const create = useMutation({
    mutationFn: () => listService.create(activeWorkspaceId!, name, description, auth.status === "authenticated" ? auth.userId : null),
    onSuccess: () => {
      setName("");
      setDescription("");
      refresh();
    },
  });

  return (
    <>
      <Seo title="Lists" />
      <WorkspaceGate>
        <div className="space-y-6">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Lists</h1>
          <Card>
            <CardHeader><CardTitle>Create list</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="List name" />
              <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" />
              <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>Create</Button>
            </CardContent>
          </Card>
          <Input className="max-w-xs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lists" />
          {lists.isError || create.isError ? <p className="text-sm text-destructive">{getErrorMessage(lists.error ?? create.error)}</p> : null}
          <div className="space-y-3">
            {lists.data?.map((list) => (
              <Card key={list.id}>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>{list.name}</CardTitle>
                  <span className="text-sm text-muted-foreground">{list.count} prospects</span>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setActiveId(list.id)}>View</Button>
                  <Button size="sm" variant="outline" onClick={() => void listService.export(activeWorkspaceId!, list.id).then((csv) => downloadTextFile(`${list.name}.csv`, csv, "text/csv"))}>Export</Button>
                  <Button size="sm" variant="outline" onClick={() => void listService.remove(activeWorkspaceId!, list.id).then(refresh)}>Delete</Button>
                </CardContent>
              </Card>
            ))}
          </div>
          {activeId ? (
            <Card>
              <CardHeader><CardTitle>Members</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {members.data?.map((member) => {
                  const prospect = Array.isArray(member.prospects) ? member.prospects[0] : member.prospects;
                  return (
                    <div key={member.prospect_id} className="flex items-center justify-between">
                      <span>{prospect?.full_name || prospect?.email || member.prospect_id}</span>
                      <Button size="sm" variant="outline" onClick={() => void listService.removeProspect(activeWorkspaceId!, activeId, member.prospect_id).then(() => queryClient.invalidateQueries({ queryKey: ["list-members", activeId] }))}>Remove</Button>
                    </div>
                  );
                })}
                {members.data?.length === 0 ? <p className="text-muted-foreground">This list is empty.</p> : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </WorkspaceGate>
    </>
  );
}
