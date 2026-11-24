import { unreadCount } from "@prospectra/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { useAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/errors";
import { notificationService } from "@/services/notification-service";

export function NotificationsPage() {
  return (
    <WorkspaceGate>
      <NotificationsContent />
    </WorkspaceGate>
  );
}

function NotificationsContent() {
  const auth = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const userId = auth.status === "authenticated" ? auth.userId : "";
  const queryClient = useQueryClient();
  const notifications = useQuery({ queryKey: ["notifications", userId], enabled: Boolean(userId), queryFn: () => notificationService.list(userId) });
  const preferences = useQuery({
    queryKey: ["notification-preferences", userId, activeWorkspaceId],
    enabled: Boolean(userId && activeWorkspaceId),
    queryFn: () => notificationService.preferences(userId, activeWorkspaceId!),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
    await queryClient.invalidateQueries({ queryKey: ["notification-preferences", userId, activeWorkspaceId] });
  };
  const markRead = useMutation({ mutationFn: (id: string) => notificationService.markRead(id), onSuccess: refresh });
  const markAll = useMutation({ mutationFn: () => notificationService.markAllRead(userId), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => notificationService.remove(id), onSuccess: refresh });
  const preference = useMutation({
    mutationFn: (input: { type: string; inApp: boolean; email: boolean }) => notificationService.setPreference({ userId, workspaceId: activeWorkspaceId!, ...input }),
    onSuccess: refresh,
  });
  const unread = unreadCount((notifications.data ?? []).map((row) => ({ readAt: row.read_at })));

  return (
    <>
      <Seo title="Notifications" />
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold">Notifications</h1>
            <p className="text-sm text-muted-foreground">{unread} unread. Email is sent only when a preference is on and a mail provider is configured.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => markAll.mutate()} disabled={!unread || markAll.isPending}>Mark all read</Button>
        </div>
        {notifications.isError ? <p className="text-sm text-destructive">{getErrorMessage(notifications.error)}</p> : null}
        <div className="space-y-3">
          {(notifications.data ?? []).map((row) => (
            <Card key={row.id}>
              <CardHeader>
                <CardTitle className="text-base">{row.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>{row.body}</p>
                <p className="text-muted-foreground">{row.type} · {row.read_at ? "Read" : "Unread"}</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => markRead.mutate(row.id)} disabled={Boolean(row.read_at)}>Mark read</Button>
                  <Button type="button" variant="outline" onClick={() => remove.mutate(row.id)}>Delete</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader><CardTitle>Preferences</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {notificationService.types.map((type) => {
              const current = preferences.data?.find((row) => row.type === type);
              return (
                <div key={type} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{type}</span>
                  <div className="flex gap-2">
                    <Button type="button" variant={current?.in_app === false ? "outline" : "default"} onClick={() => preference.mutate({ type, inApp: current?.in_app === false, email: current?.email ?? false })}>In app</Button>
                    <Button type="button" variant={current?.email ? "default" : "outline"} onClick={() => preference.mutate({ type, inApp: current?.in_app !== false, email: !current?.email })}>Email</Button>
                  </div>
                </div>
              );
            })}
            {preference.isError ? <p className="text-sm text-destructive">{getErrorMessage(preference.error)}</p> : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
