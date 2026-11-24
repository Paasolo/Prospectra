import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { assistantOutputSchema, type AssistantContext, type AssistantOutput } from "@prospectra/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { getSupabaseClient } from "@/integrations/supabase/client";
import { assistantError, assistantService, outputFromMessage } from "@/services/assistant-service";

const emptyContext: AssistantContext = {
  prospectId: null,
  companyId: null,
  icpId: null,
  campaignId: null,
  previousConversationId: null,
};

export function AssistantPage() {
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState("");
  const [context, setContext] = useState<AssistantContext>(emptyContext);
  const conversations = useQuery({
    queryKey: ["assistant-conversations", activeWorkspaceId],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => assistantService.list(activeWorkspaceId!),
  });
  const messages = useQuery({
    queryKey: ["assistant-messages", selected],
    enabled: Boolean(selected),
    queryFn: () => assistantService.messages(selected!),
  });
  const options = useQuery({
    queryKey: ["assistant-context", activeWorkspaceId],
    enabled: Boolean(activeWorkspaceId),
    queryFn: async () => {
      const client = getSupabaseClient();
      const [prospects, icps, campaigns] = await Promise.all([
        client.from("prospects").select("id, full_name, email").eq("workspace_id", activeWorkspaceId!),
        client.from("icp_profiles").select("id, name").eq("workspace_id", activeWorkspaceId!),
        client.from("campaigns").select("id, name").eq("workspace_id", activeWorkspaceId!),
      ]);
      return { prospects: prospects.data ?? [], icps: icps.data ?? [], campaigns: campaigns.data ?? [] };
    },
  });

  const create = useMutation({
    mutationFn: () => assistantService.create(activeWorkspaceId!, context),
    onSuccess: async (conversation) => {
      setSelected(conversation.id);
      await queryClient.invalidateQueries({ queryKey: ["assistant-conversations", activeWorkspaceId] });
    },
  });
  const send = useMutation({
    mutationFn: async (content: string) => {
      if (!selected) {
        const created = await assistantService.create(activeWorkspaceId!, context);
        setSelected(created.id);
        await assistantService.updateContext(created.id, context);
        setStreaming("");
        return assistantService.send({
          workspaceId: activeWorkspaceId!,
          conversationId: created.id,
          content,
          onDelta: (text) => setStreaming((current) => current + text),
        });
      }
      await assistantService.updateContext(selected, context);
      setStreaming("");
      return assistantService.send({
        workspaceId: activeWorkspaceId!,
        conversationId: selected,
        content,
        onDelta: (text) => setStreaming((current) => current + text),
      });
    },
    onSuccess: async () => {
      setDraft("");
      setStreaming("");
      await queryClient.invalidateQueries({ queryKey: ["assistant-messages", selected] });
      await queryClient.invalidateQueries({ queryKey: ["assistant-conversations", activeWorkspaceId] });
    },
  });

  return (
    <>
      <Seo title="AI sales assistant" />
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">AI sales assistant</h1>
          <p className="text-sm text-muted-foreground">Research and recommendations stay tied to workspace records you can access. Sourced facts are verbatim excerpts.</p>
        </div>
        <WorkspaceGate>
          <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Conversations</CardTitle>
                <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>New</Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {(conversations.data ?? []).map((conversation) => (
                  <button key={conversation.id} className={`block w-full rounded-md px-2 py-1 text-left text-sm ${selected === conversation.id ? "bg-accent" : ""}`} onClick={() => { setSelected(conversation.id); setContext({ ...emptyContext, ...(conversation.context as Partial<AssistantContext>) }); }}>
                    {conversation.title}
                  </button>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="grid gap-2 md:grid-cols-2">
                  <ContextSelect label="Prospect" value={context.prospectId} options={(options.data?.prospects ?? []).map((item) => ({ id: item.id, label: item.full_name || item.email || item.id }))} onChange={(prospectId) => setContext({ ...context, prospectId })} />
                  <ContextSelect label="ICP" value={context.icpId} options={(options.data?.icps ?? []).map((item) => ({ id: item.id, label: item.name }))} onChange={(icpId) => setContext({ ...context, icpId })} />
                  <ContextSelect label="Campaign" value={context.campaignId} options={(options.data?.campaigns ?? []).map((item) => ({ id: item.id, label: item.name }))} onChange={(campaignId) => setContext({ ...context, campaignId })} />
                  <ContextSelect label="Previous conversation" value={context.previousConversationId} options={(conversations.data ?? []).filter((item) => item.id !== selected).map((item) => ({ id: item.id, label: item.title }))} onChange={(previousConversationId) => setContext({ ...context, previousConversationId })} />
                </div>
                <div className="space-y-3">
                  {(messages.data ?? []).map((message) => {
                    const output = message.role === "assistant" ? outputFromMessage(message.structured) : null;
                    return (
                      <article key={message.id} className="rounded-md border border-border p-3 text-sm">
                        <div className="mb-1 flex items-center justify-between">
                          <Badge variant={message.status === "failed" ? "warning" : "outline"}>{message.role}</Badge>
                          <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(output ? JSON.stringify(output, null, 2) : message.content)}>Copy</Button>
                        </div>
                        {output ? <AssistantResult output={output} /> : <p className="whitespace-pre-wrap">{message.content}</p>}
                        {message.status === "failed" ? <Button size="sm" variant="outline" className="mt-2" onClick={() => send.mutate(message.content)}>Retry</Button> : null}
                      </article>
                    );
                  })}
                  {streaming ? <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">{streaming}</pre> : null}
                </div>
                <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about a prospect, market, or next step." />
                {send.isError ? <p className="text-sm text-destructive">{assistantError(send.error)}</p> : null}
                <div className="flex gap-2">
                  <Button disabled={!draft.trim() || send.isPending} onClick={() => send.mutate(draft.trim())}>{send.isPending ? "Generating" : "Send"}</Button>
                  {selected ? <Button variant="outline" onClick={() => void assistantService.remove(selected).then(() => { setSelected(null); void queryClient.invalidateQueries({ queryKey: ["assistant-conversations", activeWorkspaceId] }); })}>Delete</Button> : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </WorkspaceGate>
      </div>
    </>
  );
}

function AssistantResult({ output }: { output: AssistantOutput }) {
  const parsed = assistantOutputSchema.parse(output);
  return (
    <div className="space-y-3">
      <p>{parsed.summary}</p>
      <section>
        <h2 className="font-medium">Sourced facts</h2>
        {parsed.sourcedFacts.length === 0 ? <p className="text-muted-foreground">No verbatim source excerpts.</p> : parsed.sourcedFacts.map((fact) => <p key={fact.sourceId + fact.statement}>{fact.statement} <Badge variant="outline">{fact.sourceId}</Badge></p>)}
      </section>
      <section>
        <h2 className="font-medium">Inferences</h2>
        {parsed.inferences.map((item) => <p key={item.statement}>{item.statement} — {item.basis}</p>)}
      </section>
      <p><span className="font-medium">Qualification. </span>{parsed.qualificationExplanation}</p>
      <p><span className="font-medium">Approaches. </span>{parsed.suggestedApproaches.join(" ")}</p>
      <p><span className="font-medium">Next actions. </span>{parsed.recommendedActions.join(" ")}</p>
    </div>
  );
}

function ContextSelect({ label, value, options, onChange }: { label: string; value: string | null; options: Array<{ id: string; label: string }>; onChange: (value: string | null) => void }) {
  return (
    <label className="text-sm">
      {label}
      <select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2" value={value ?? ""} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">None</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}
