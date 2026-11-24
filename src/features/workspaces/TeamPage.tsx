import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/shared/Seo";
import { WORKSPACE_ROLES, type WorkspaceRole } from "@/types/workspace";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { getSupabaseInitResult } from "@/integrations/supabase/client";
import { workspaceService } from "@/services/workspace-service";
import { getErrorMessage } from "@/lib/errors";
import { useState } from "react";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(WORKSPACE_ROLES),
});

type InviteValues = z.infer<typeof inviteSchema>;

export function TeamPage() {
  const { activeWorkspaceId } = useWorkspace();
  const supabase = getSupabaseInitResult();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const membersQuery = useQuery({
    queryKey: ["workspace-members", activeWorkspaceId],
    enabled: Boolean(activeWorkspaceId) && supabase.status === "configured",
    queryFn: () => workspaceService.listMembers(activeWorkspaceId!),
  });

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "MEMBER" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    setMessage(null);
    try {
      if (!activeWorkspaceId) {
        setError("Select a workspace first.");
        return;
      }
      if (supabase.status === "unconfigured") {
        setError(supabase.reason);
        return;
      }
      await workspaceService.inviteMember(activeWorkspaceId, values.email, values.role as WorkspaceRole);
      setMessage(`Invitation created for ${values.email}. Email delivery depends on Supabase Auth mail settings.`);
      form.reset({ email: "", role: "MEMBER" });
      await queryClient.invalidateQueries({ queryKey: ["workspace-members", activeWorkspaceId] });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  });

  return (
    <>
      <Seo title="Team" />
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">
            Invite members and assign roles. Permissions are enforced by Postgres RLS helpers.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Invite teammate</CardTitle>
            <CardDescription>Roles: OWNER, ADMIN, MANAGER, MEMBER, VIEWER</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-[1fr_10rem_auto]" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...form.register("email")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <select
                  id="role"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...form.register("role")}
                >
                  {WORKSPACE_ROLES.filter((role) => role !== "OWNER").map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button type="submit">Invite</Button>
              </div>
            </form>
            {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
            {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent>
            {supabase.status === "unconfigured" ? (
              <p className="text-sm text-muted-foreground">{supabase.reason}</p>
            ) : null}
            {membersQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading members…</p> : null}
            {membersQuery.data && membersQuery.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members returned for this workspace yet.</p>
            ) : null}
            <ul className="space-y-2">
              {(membersQuery.data ?? []).map((member) => (
                <li
                  key={member.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="font-mono text-xs sm:text-sm">{member.user_id}</span>
                  <span className="text-muted-foreground">{member.role}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
