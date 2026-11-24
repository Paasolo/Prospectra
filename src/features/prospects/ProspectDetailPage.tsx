import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ProspectStage } from "@prospectra/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { getErrorMessage } from "@/lib/errors";
import { getSupabaseClient } from "@/integrations/supabase/client";
import { enrichmentService } from "@/services/scoring-service";
import { icpService } from "@/services/icp-service";
import { prospectService } from "@/services/prospect-service";
import { scoringService } from "@/services/scoring-service";

const tabs = ["Overview", "Contact", "Company", "Enrichment", "AI Insights", "Notes", "Activities", "Emails", "Campaigns"] as const;

export function ProspectDetailPage() {
  const { prospectId } = useParams();
  const isNew = prospectId === "new";
  const { activeWorkspaceId } = useWorkspace();
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [note, setNote] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyDomain, setCompanyDomain] = useState("");
  const userId = auth.status === "authenticated" ? auth.userId : null;
  const prospectEmails = useQuery({
    queryKey: ["prospect-emails", activeWorkspaceId, prospectId],
    enabled: Boolean(activeWorkspaceId && prospectId && !isNew && tab === "Emails"),
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().from("email_messages").select("*").eq("workspace_id", activeWorkspaceId!).eq("prospect_id", prospectId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const prospectCampaigns = useQuery({
    queryKey: ["prospect-campaigns", prospectId],
    enabled: Boolean(prospectId && !isNew && tab === "Campaigns"),
    queryFn: async () => {
      const { data, error } = await getSupabaseClient().from("campaign_enrollments").select("*").eq("prospect_id", prospectId!);
      if (error) throw error;
      return data ?? [];
    },
  });
  const prospect = useQuery({
    queryKey: ["prospect", activeWorkspaceId, prospectId],
    enabled: Boolean(activeWorkspaceId && prospectId && !isNew),
    queryFn: () => prospectService.get(activeWorkspaceId!, prospectId!),
  });
  const notes = useQuery({
    queryKey: ["prospect-notes", prospectId],
    enabled: Boolean(activeWorkspaceId && prospectId && !isNew),
    queryFn: () => prospectService.notes(activeWorkspaceId!, prospectId!),
  });
  const activities = useQuery({
    queryKey: ["prospect-activities", prospectId],
    enabled: Boolean(activeWorkspaceId && prospectId && !isNew),
    queryFn: () => prospectService.activities(activeWorkspaceId!, prospectId!),
  });
  const fields = useQuery({
    queryKey: ["enrichment-fields", prospectId],
    enabled: Boolean(activeWorkspaceId && prospectId && !isNew),
    queryFn: () => enrichmentService.fields(activeWorkspaceId!, prospectId!),
  });
  const score = useQuery({
    queryKey: ["prospect-score", prospectId],
    enabled: Boolean(activeWorkspaceId && prospectId && !isNew),
    queryFn: () => scoringService.latest(activeWorkspaceId!, prospectId!),
  });
  const profiles = useQuery({
    queryKey: ["icp", activeWorkspaceId],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => icpService.list(activeWorkspaceId!),
  });
  const stages = useQuery({
    queryKey: ["stages", activeWorkspaceId],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => prospectService.stagesFor(activeWorkspaceId!),
  });
  const current = prospect.data;
  const save = useMutation({
    mutationFn: async () => {
      const draft = {
        fullName: isNew ? fullName : current?.full_name ?? "",
        email: isNew ? email : current?.email ?? "",
        jobTitle: isNew ? jobTitle : current?.job_title ?? "",
        companyName: isNew ? companyName : current?.companies?.name ?? "",
        companyDomain: isNew ? companyDomain : current?.companies?.normalized_domain ?? "",
        phone: current?.phone ?? "",
        department: current?.department ?? "",
        seniority: current?.seniority ?? "",
        location: current?.location ?? "",
        linkedinUrl: current?.linkedin_url ?? "",
        stage: (current?.stage ?? "NEW") as ProspectStage,
        tags: current?.tags ?? [],
      };
      if (isNew) {
        return prospectService.create(activeWorkspaceId!, { ...draft, fullName, email, jobTitle, companyName, companyDomain }, userId);
      }
      await prospectService.update(activeWorkspaceId!, prospectId!, draft, userId);
      return prospectId!;
    },
    onSuccess: (id) => {
      if (isNew && typeof id === "string") {
        navigate(`/app/prospects/${id}`);
      }
      void queryClient.invalidateQueries({ queryKey: ["prospect", activeWorkspaceId, prospectId] });
    },
  });

  return (
    <>
      <Seo title={isNew ? "New prospect" : current?.full_name || "Prospect"} />
      <WorkspaceGate>
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-3xl font-semibold tracking-tight">{isNew ? "New prospect" : current?.full_name || "Prospect"}</h1>
            <Button asChild variant="outline">
              <Link to="/app/prospects">All prospects</Link>
            </Button>
          </div>
          {isNew ? (
            <Card>
              <CardContent className="grid gap-3 pt-6 md:grid-cols-2">
                <Field label="Name" value={fullName} onChange={setFullName} />
                <Field label="Email" value={email} onChange={setEmail} />
                <Field label="Title" value={jobTitle} onChange={setJobTitle} />
                <Field label="Company" value={companyName} onChange={setCompanyName} />
                <Field label="Domain" value={companyDomain} onChange={setCompanyDomain} />
                <Button className="md:col-span-2" onClick={() => save.mutate()} disabled={save.isPending}>Create</Button>
                {save.isError ? <p className="text-sm text-destructive">{getErrorMessage(save.error)}</p> : null}
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {tabs.map((item) => (
                  <Button key={item} size="sm" variant={tab === item ? "default" : "outline"} onClick={() => setTab(item)}>
                    {item}
                  </Button>
                ))}
              </div>
              {prospect.isError ? <p className="text-sm text-destructive">{getErrorMessage(prospect.error)}</p> : null}
              {tab === "Overview" && current ? (
                <Card>
                  <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p>Stage: {current.stage}</p>
                    <p>Owner: {current.owner_user_id || "Unassigned"}</p>
                    <p>Tags: {current.tags.join(", ") || "None"}</p>
                    <div className="flex gap-2">
                      <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={current.stage}
                        onChange={(event) =>
                          void prospectService
                            .setStage(activeWorkspaceId!, [current.id], event.target.value as ProspectStage, userId)
                            .then(() => queryClient.invalidateQueries({ queryKey: ["prospect", activeWorkspaceId, prospectId] }))
                        }
                      >
                        {stages.data?.filter((item) => item.is_enabled).map((item) => (
                          <option key={item.code} value={item.code}>{item.label}</option>
                        ))}
                      </select>
                      <Button variant="outline" onClick={() => void prospectService.assign(activeWorkspaceId!, [current.id], userId, userId).then(() => queryClient.invalidateQueries({ queryKey: ["prospect", activeWorkspaceId, prospectId] }))}>
                        Assign to me
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
              {tab === "Contact" && current ? (
                <Card><CardContent className="space-y-2 pt-6 text-sm">
                  <p>Email: {current.email || "Not recorded"} {current.email_verified ? "(verified)" : current.email ? "(not verified)" : ""}</p>
                  <p>Phone: {current.phone || "Not recorded"}</p>
                  <p>Title: {current.job_title || "Not recorded"}</p>
                  <p>Department: {current.department || "Not recorded"}</p>
                  <p>Seniority: {current.seniority || "Not recorded"}</p>
                  <p>Location: {current.location || "Not recorded"}</p>
                  <p>Profile: {current.linkedin_url || "Not recorded"}</p>
                </CardContent></Card>
              ) : null}
              {tab === "Company" && current ? (
                <Card><CardContent className="space-y-2 pt-6 text-sm">
                  <p>Name: {current.companies?.name || "Not linked"}</p>
                  <p>Domain: {current.companies?.normalized_domain || "Not recorded"}</p>
                  <p>Website: {current.companies?.website_url || "Not recorded"}</p>
                  <p>Industry: {current.companies?.industry || "Not recorded"}</p>
                </CardContent></Card>
              ) : null}
              {tab === "Enrichment" ? (
                <Card><CardContent className="space-y-2 pt-6 text-sm">
                  {fields.data?.map((field) => (
                    <p key={field.id}>{field.field_name}: {field.field_value} · {field.source} · {field.verified ? "verified" : "unverified"} · {field.retrieved_at}</p>
                  ))}
                  {fields.data?.length === 0 ? <p className="text-muted-foreground">No enrichment history.</p> : null}
                </CardContent></Card>
              ) : null}
              {tab === "AI Insights" && current ? (
                <Card><CardContent className="space-y-3 pt-6 text-sm">
                  {score.data ? (
                    <>
                      <p>Score {score.data.score}/100 · {score.data.category}</p>
                      <p>{score.data.explanation}</p>
                      <p>Recommended action: {score.data.recommended_action}</p>
                      {score.data.ai_explanation ? <p>AI explanation: {score.data.ai_explanation}</p> : <p className="text-muted-foreground">No AI explanation has been generated. The score above is deterministic.</p>}
                    </>
                  ) : (
                    <p className="text-muted-foreground">No score has been calculated.</p>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => {
                      const icp = profiles.data?.find((profile) => profile.status === "active") ?? profiles.data?.[0];
                      if (!current) return;
                      void scoringService.recalculate({
                        workspaceId: activeWorkspaceId!,
                        prospect: current,
                        icp: icp?.criteria_parsed ?? null,
                        icpId: icp?.id ?? null,
                      }).then(() => queryClient.invalidateQueries({ queryKey: ["prospect-score", prospectId] }));
                    }}
                  >
                    Recalculate score
                  </Button>
                </CardContent></Card>
              ) : null}
              {tab === "Notes" ? (
                <Card><CardContent className="space-y-3 pt-6">
                  <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
                  <Button onClick={() => void prospectService.addNote(activeWorkspaceId!, prospectId!, note, userId).then(() => { setNote(""); void queryClient.invalidateQueries({ queryKey: ["prospect-notes", prospectId] }); })}>Add note</Button>
                  {notes.data?.map((item) => <p key={item.id} className="text-sm">{item.body}</p>)}
                </CardContent></Card>
              ) : null}
              {tab === "Activities" ? (
                <Card><CardContent className="space-y-2 pt-6 text-sm">
                  {activities.data?.map((item) => <p key={item.id}>{item.created_at}: {item.summary}</p>)}
                  {activities.data?.length === 0 ? <p className="text-muted-foreground">No activity yet.</p> : null}
                </CardContent></Card>
              ) : null}
              {tab === "Emails" ? <Card><CardContent className="space-y-2 pt-6 text-sm">{prospectEmails.data?.length ? prospectEmails.data.map((message) => <p key={message.id}>{message.subject} · {message.delivery_state}</p>) : <p className="text-muted-foreground">No emails have been recorded for this prospect.</p>}</CardContent></Card> : null}
              {tab === "Campaigns" ? <Card><CardContent className="space-y-2 pt-6 text-sm">{prospectCampaigns.data?.length ? prospectCampaigns.data.map((enrollment) => <p key={enrollment.id}>{enrollment.status}{enrollment.stop_reason ? ` · ${enrollment.stop_reason}` : ""}</p>) : <p className="text-muted-foreground">This prospect is not enrolled in a campaign.</p>}</CardContent></Card> : null}
            </>
          )}
        </div>
      </WorkspaceGate>
    </>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
