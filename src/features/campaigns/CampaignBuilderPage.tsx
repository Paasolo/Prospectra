import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { TemplateIssues } from "@/features/email/TemplateIssues";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { getSupabaseClient } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/errors";
import { campaignService, emailService } from "@/services/engagement-service";

const STEPS = ["Name", "Objective", "Audience", "Sending account", "First email", "Follow-ups", "Delays", "Schedule", "Daily limit", "Suppression", "Preview", "Test", "Review"];

type StepDraft = { subject: string; body: string; delayDays: number; branch: string };

const firstStep: StepDraft = { subject: "", body: "If this is not relevant, reply unsubscribe.", delayDays: 0, branch: "always" };

export function CampaignBuilderPage() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { activeWorkspaceId } = useWorkspace();
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState("");
  const [listId, setListId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([firstStep]);
  const [timezone, setTimezone] = useState("UTC");
  const [start, setStart] = useState(540);
  const [end, setEnd] = useState(1020);
  const [dailyLimit, setDailyLimit] = useState(40);
  const [scheduledFor, setScheduledFor] = useState("");
  const [suppression, setSuppression] = useState("");
  const [testTo, setTestTo] = useState("");
  const [savedId, setSavedId] = useState(campaignId ?? "");
  const lists = useQuery({ queryKey: ["lists", activeWorkspaceId], enabled: Boolean(activeWorkspaceId), queryFn: async () => (await getSupabaseClient().from("prospect_lists").select("id, name").eq("workspace_id", activeWorkspaceId!)).data ?? [] });
  const accounts = useQuery({ queryKey: ["connected-accounts", activeWorkspaceId], enabled: Boolean(activeWorkspaceId), queryFn: () => emailService.accounts(activeWorkspaceId!) });
  const monitor = useQuery({ queryKey: ["campaign-monitor", savedId], enabled: Boolean(savedId && activeWorkspaceId), queryFn: () => campaignService.monitor(activeWorkspaceId!, savedId) });
  const save = useMutation({
    mutationFn: () => campaignService.save({
      workspaceId: activeWorkspaceId!,
      id: savedId || undefined,
      campaign: { name, description, objective, list_id: listId || null, sending_account_id: accountId || null, timezone, daily_limit: dailyLimit, send_window_start_minutes: start, send_window_end_minutes: end, scheduled_for: scheduledFor || null },
      steps,
    }),
    onSuccess: (campaign) => setSavedId(campaign.id),
  });
  const activate = useMutation({
    mutationFn: async () => {
      const saved = await save.mutateAsync();
      for (const email of suppression.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean)) {
        await getSupabaseClient().from("suppressions").upsert({ workspace_id: activeWorkspaceId!, email, reason: "campaign_exclusion" }, { onConflict: "workspace_id,email" });
      }
      return campaignService.activate({ workspaceId: activeWorkspaceId!, campaignId: saved.id });
    },
    onSuccess: () => navigate("/app/campaigns"),
  });
  const test = useMutation({
    mutationFn: () => emailService.testSend({ workspaceId: activeWorkspaceId!, accountId, to: testTo, subject: steps[0]?.subject ?? "", body: steps[0]?.body ?? "" }),
  });
  const current = steps[0] ?? firstStep;

  return (
    <>
      <Seo title="Campaign builder" />
      <WorkspaceGate>
        <Card>
          <CardHeader>
            <CardTitle>Step {stepIndex + 1}. {STEPS[stepIndex]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stepIndex === 0 ? <><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Campaign name" /><Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" /></> : null}
            {stepIndex === 1 ? <Textarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Objective" /> : null}
            {stepIndex === 2 ? <select className="w-full rounded-md border border-border bg-background px-2 py-2" value={listId} onChange={(event) => setListId(event.target.value)}><option value="">Select a prospect list</option>{(lists.data ?? []).map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select> : null}
            {stepIndex === 3 ? <select className="w-full rounded-md border border-border bg-background px-2 py-2" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Sending account</option>{(accounts.data ?? []).filter((account) => account.kind === "email" && account.status === "connected").map((account) => <option key={account.id} value={account.id}>{account.email_address}</option>)}</select> : null}
            {stepIndex === 4 || stepIndex === 5 ? (
              <div className="space-y-2">
                {steps.map((item, index) => (
                  <div key={index} className="space-y-2 rounded-md border border-border p-3">
                    <Input value={item.subject} onChange={(event) => setSteps(steps.map((step, stepIndex) => stepIndex === index ? { ...step, subject: event.target.value } : step))} placeholder={`Subject ${index + 1}`} />
                    <Textarea value={item.body} onChange={(event) => setSteps(steps.map((step, stepIndex) => stepIndex === index ? { ...step, body: event.target.value } : step))} />
                    <TemplateIssues subject={item.subject} body={item.body} />
                  </div>
                ))}
                {stepIndex === 5 ? <Button variant="outline" onClick={() => setSteps([...steps, { subject: "", body: "If this is not relevant, reply unsubscribe.", delayDays: 3, branch: "no_reply" }])}>Add follow-up</Button> : null}
              </div>
            ) : null}
            {stepIndex === 6 ? steps.map((item, index) => <label key={index} className="block text-sm">Step {index + 1} delay days<Input type="number" value={item.delayDays} onChange={(event) => setSteps(steps.map((step, stepIndex) => stepIndex === index ? { ...step, delayDays: Number(event.target.value) } : step))} /></label>) : null}
            {stepIndex === 7 ? <div className="grid gap-2 md:grid-cols-2"><Input value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Timezone" /><Input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} /><Input type="number" value={start} onChange={(event) => setStart(Number(event.target.value))} placeholder="Start minute" /><Input type="number" value={end} onChange={(event) => setEnd(Number(event.target.value))} placeholder="End minute" /></div> : null}
            {stepIndex === 8 ? <Input type="number" value={dailyLimit} onChange={(event) => setDailyLimit(Number(event.target.value))} /> : null}
            {stepIndex === 9 ? <Textarea value={suppression} onChange={(event) => setSuppression(event.target.value)} placeholder="Excluded emails, comma separated" /> : null}
            {stepIndex === 10 ? <pre className="whitespace-pre-wrap text-sm">{current.subject}{"\n\n"}{current.body}</pre> : null}
            {stepIndex === 11 ? <div className="flex gap-2"><Input value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder="Test recipient" /><Button variant="outline" onClick={() => test.mutate()} disabled={!accountId || !testTo}>Send test</Button></div> : null}
            {stepIndex === 12 ? <div className="text-sm"><p>{name} · {objective || "No objective"} · {steps.length} steps · {dailyLimit}/day · {timezone}</p>{monitor.data ? <p>{monitor.data.enrollments.length} enrolled, {monitor.data.messages.length} recorded messages.</p> : null}</div> : null}
            {save.isError || activate.isError || test.isError ? <p className="text-sm text-destructive">{getErrorMessage(save.error ?? activate.error ?? test.error)}</p> : null}
            {test.data ? <p className="text-sm">Test accepted by the provider. Delivery is not confirmed.</p> : null}
            <div className="flex gap-2">
              <Button variant="outline" disabled={stepIndex === 0} onClick={() => setStepIndex((value) => value - 1)}>Back</Button>
              {stepIndex < STEPS.length - 1 ? <Button onClick={() => setStepIndex((value) => value + 1)}>Next</Button> : <Button onClick={() => activate.mutate()} disabled={activate.isPending}>Activate</Button>}
              <Button variant="outline" onClick={() => save.mutate()} disabled={!name || save.isPending}>Save draft</Button>
            </div>
          </CardContent>
        </Card>
      </WorkspaceGate>
    </>
  );
}
