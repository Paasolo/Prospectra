import { unreadCount } from "@prospectra/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { getSupabaseInitResult } from "@/integrations/supabase/client";
import { notificationService } from "@/services/notification-service";

export function NotificationMenu() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const userId = auth.status === "authenticated" ? auth.userId : null;
  const notifications = useQuery({
    queryKey: ["notifications", userId],
    enabled: Boolean(userId),
    queryFn: () => notificationService.list(userId!),
    refetchInterval: 30_000,
  });
  useEffect(() => {
    const init = getSupabaseInitResult();
    if (!userId || init.status !== "configured") return;
    const channel = init.client.channel(`notifications:${userId}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      () => {
        void queryClient.invalidateQueries({ queryKey: ["notifications", userId] });
      },
    ).subscribe();
    return () => {
      void init.client.removeChannel(channel);
    };
  }, [queryClient, userId]);
  const unread = unreadCount((notifications.data ?? []).map((row) => ({ readAt: row.read_at })));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={unread ? `${unread} unread notifications` : "Notifications"}>
          <Bell className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {(notifications.data ?? []).slice(0, 6).map((row) => (
          <DropdownMenuItem key={row.id} className="flex flex-col items-start">
            <span>{row.title}</span>
            <span className="text-xs text-muted-foreground">{row.read_at ? "Read" : "Unread"}</span>
          </DropdownMenuItem>
        ))}
        {(notifications.data?.length ?? 0) === 0 ? <DropdownMenuItem disabled>No notifications</DropdownMenuItem> : null}
        <DropdownMenuItem asChild>
          <Link to="/app/notifications">View all</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
