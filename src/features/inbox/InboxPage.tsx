import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { useAuth } from "@/hooks/use-auth";
import { getErrorMessage } from "@/lib/errors";
import { emailService, inboxService } from "@/services/engagement-service";

export function InboxPage() {
  const { activeWorkspaceId } = useWorkspace();
  const auth = useAuth();
  const userId = auth.status === "authenticated" ? auth.userId : null;
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread" | "mine" | "unassigned" | "archived" | "sent">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [accountId, setAccountId] = useState("");
  const [recipient, setRecipient] = useState("");
  const conversations = useQuery({ queryKey: ["inbox", activeWorkspaceId], enabled: Boolean(activeWorkspaceId), queryFn: () => inboxService.list(activeWorkspaceId!) });
  const messages = useQuery({ queryKey: ["inbox-messages", selected], enabled: Boolean(selected), queryFn: () => inboxService.messages(selected!) });
  const notes = useQuery({ queryKey: ["inbox-notes", selected], enabled: Boolean(selected), queryFn: () => inboxService.notes(selected!) });
  const accounts = useQuery({ queryKey: ["connected-accounts", activeWorkspaceId], enabled: Boolean(activeWorkspaceId), queryFn: () => emailService.accounts(activeWorkspaceId!) });
  const visible = useMemo(() => (conversations.data ?? []).filter((conversation) => {
    if (filter === "unread") return conversation.unread && conversation.status !== "archived";
    if (filter === "mine") return conversation.assigned_to === userId;
    if (filter === "unassigned") return !conversation.assigned_to;
    if (filter === "archived") return conversation.status === "archived";
    if (filter === "sent") return false;
    return conversation.status !== "archived";
  }), [conversations.data, filter, userId]);
  const sent = useQuery({
    queryKey: ["sent-messages", activeWorkspaceId],
    enabled: filter === "sent" && Boolean(activeWorkspaceId),
    queryFn: async () => (await (await import("@/integrations/supabase/client")).getSupabaseClient().from("email_messages").select("*").eq("workspace_id", activeWorkspaceId!).eq("direction", "outbound").order("created_at", { ascending: false })).data ?? [],
  });
  const sync = useMutation({ mutationFn: () => inboxService.sync(activeWorkspaceId!), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["inbox", activeWorkspaceId] }) });
  const suggest = useMutation({
    mutationFn: () => inboxService.suggest({ workspaceId: activeWorkspaceId!, conversationId: selected! }),
    onSuccess: (result) => setReply(result.suggestion.suggestedResponse),
  });
  const send = useMutation({
    mutationFn: () => inboxService.reply({ workspaceId: activeWorkspaceId!, conversationId: selected!, accountId, to: recipient, subject: conversations.data?.find((item) => item.id === selected)?.subject ?? "Re:", body: reply }),
  });

  return (
    <>
      <Seo title="Inbox" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Inbox</h1>
          <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>Sync</Button>
        </div>
        <WorkspaceGate>
          <div className="flex flex-wrap gap-2">
            {(["all", "unread", "mine", "unassigned", "archived", "sent"] as const).map((item) => <Button key={item} size="sm" variant={filter === item ? "default" : "outline"} onClick={() => setFilter(item)}>{item}</Button>)}
          </div>
          {sync.isError ? <p className="text-sm text-destructive">{getErrorMessage(sync.error)}</p> : null}
          {sync.data ? <p className="text-sm">Inserted {sync.data.inserted}. Skipped {sync.data.duplicates.length} duplicates.</p> : null}
          {filter === "sent" ? (
            <div className="space-y-2">{(sent.data ?? []).map((message) => <Card key={message.id}><CardContent className="pt-6 text-sm"><p className="font-medium">{message.subject}</p><p>{message.recipient}</p><Badge variant="outline">{message.delivery_state}</Badge></CardContent></Card>)}</div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
              <Card><CardContent className="space-y-2 pt-6">{visible.map((conversation) => <button key={conversation.id} className="block w-full text-left text-sm" onClick={() => setSelected(conversation.id)}>{conversation.subject || "Untitled"} {conversation.unread ? <Badge>Unread</Badge> : null}</button>)}</CardContent></Card>
              {selected ? (
                <Card>
                  <CardHeader><CardTitle>Conversation</CardTitle></CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {(messages.data ?? []).map((message) => <article key={message.id} className="rounded-md border border-border p-3"><p className="text-muted-foreground">{message.direction} · {message.created_at} · {message.delivery_state}</p><p className="whitespace-pre-wrap">{message.body}</p></article>)}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => void inboxService.update(selected, { status: "archived" })}>Archive</Button>
                      <Button size="sm" variant="outline" onClick={() => void inboxService.update(selected, { status: "open", unread: true })}>Reopen</Button>
                      <Button size="sm" variant="outline" onClick={() => void inboxService.update(selected, { unread: true })}>Mark unread</Button>
                      <Button size="sm" variant="outline" onClick={() => userId && void inboxService.update(selected, { assigned_to: userId })}>Assign to me</Button>
                      <Button size="sm" variant="outline" onClick={() => void inboxService.update(selected, { assigned_to: null })}>Unassign</Button>
                    </div>
                    {(notes.data ?? []).map((item) => <p key={item.id} className="rounded-md bg-muted p-2">Note: {item.body}</p>)}
                    <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Internal note" />
                    <Button size="sm" variant="outline" onClick={() => void inboxService.addNote({ workspaceId: activeWorkspaceId!, conversationId: selected, body: note }).then(() => { setNote(""); void queryClient.invalidateQueries({ queryKey: ["inbox-notes", selected] }); })}>Add note</Button>
                    <Button size="sm" onClick={() => suggest.mutate()} disabled={suggest.isPending}>Suggest reply</Button>
                    {suggest.data ? <p>Intent {suggest.data.suggestion.intent}, sentiment {suggest.data.suggestion.sentiment}. Next: {suggest.data.suggestion.nextStep}. This draft is not sent until you approve it.</p> : null}
                    <Textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Reply" />
                    <div className="grid gap-2 md:grid-cols-2">
                      <select className="rounded-md border border-border bg-background px-2 py-2" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Sending account</option>{(accounts.data ?? []).filter((account) => account.status === "connected" && account.kind === "email").map((account) => <option key={account.id} value={account.id}>{account.email_address}</option>)}</select>
                      <input className="rounded-md border border-border bg-background px-2 py-2" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Recipient" />
                    </div>
                    <Button disabled={!reply || !accountId || !recipient || send.isPending} onClick={() => send.mutate()}>Send approved reply</Button>
                    {send.data ? <p>Provider accepted the reply. Delivery is not confirmed.</p> : null}
                    {send.isError || suggest.isError ? <p className="text-destructive">{getErrorMessage(send.error ?? suggest.error)}</p> : null}
                    <Link to="/app/prospects">Open prospects</Link>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          )}
        </WorkspaceGate>
      </div>
    </>
  );
}
