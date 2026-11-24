import { EMAIL_TYPES, renderTemplate, type EmailType } from "@prospectra/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { TemplateIssues } from "@/features/email/TemplateIssues";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { getErrorMessage } from "@/lib/errors";
import { emailService } from "@/services/engagement-service";

export function EmailStudioPage() {
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [emailType, setEmailType] = useState<EmailType>("cold_introduction");
  const [tone, setTone] = useState("direct");
  const [length, setLength] = useState<"short" | "medium" | "long">("short");
  const [objective, setObjective] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [instructions, setInstructions] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [explanation, setExplanation] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [category, setCategory] = useState("general");
  const [testTo, setTestTo] = useState("");
  const [accountId, setAccountId] = useState("");
  const templates = useQuery({ queryKey: ["email-templates", activeWorkspaceId], enabled: Boolean(activeWorkspaceId), queryFn: () => emailService.templates(activeWorkspaceId!) });
  const accounts = useQuery({ queryKey: ["connected-accounts", activeWorkspaceId], enabled: Boolean(activeWorkspaceId), queryFn: () => emailService.accounts(activeWorkspaceId!) });
  const generate = useMutation({
    mutationFn: () => emailService.generate({ workspaceId: activeWorkspaceId!, prospectId: null, companyId: null, icpId: null, objective, emailType, tone, length, callToAction, instructions }),
    onSuccess: (result) => {
      setSubject(result.draft.subject);
      setBody(result.draft.body);
      setExplanation(result.draft.explanation);
      setWarnings(result.warnings);
      setCallToAction(result.draft.suggestedCta || callToAction);
    },
  });
  const save = useMutation({
    mutationFn: () => emailService.saveDraft({ workspace_id: activeWorkspaceId!, email_type: emailType, tone, length, call_to_action: callToAction, instructions, subject, body, explanation, warnings }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["email-drafts", activeWorkspaceId] }),
  });
  const saveTemplate = useMutation({
    mutationFn: () => emailService.saveTemplate({ workspaceId: activeWorkspaceId!, name: templateName || subject || "Untitled", category, subject, body }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["email-templates", activeWorkspaceId] }),
  });
  const test = useMutation({
    mutationFn: () => emailService.testSend({ workspaceId: activeWorkspaceId!, accountId, to: testTo, subject, body }),
  });
  const preview = renderTemplate(body, { first_name: "Alex", last_name: "Kim", company_name: "Northwind", job_title: "Operations lead", company_website: "northwind.example" });

  return (
    <>
      <Seo title="Email studio" />
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Email studio</h1>
          <p className="text-sm text-muted-foreground">Drafts are editable. A provider acceptance is not a delivery confirmation.</p>
        </div>
        <WorkspaceGate>
          <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
            <Card>
              <CardHeader><CardTitle>Templates</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(templates.data ?? []).map((template) => (
                  <div key={template.id} className="rounded-md border border-border p-2 text-sm">
                    <button className="font-medium" onClick={() => { setSubject(template.subject); setBody(template.body); setCategory(template.category); setTemplateName(template.name); }}>{template.name}</button>
                    <p className="text-muted-foreground">{template.category}</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => void emailService.duplicateTemplate(template.id, activeWorkspaceId!).then(() => queryClient.invalidateQueries({ queryKey: ["email-templates", activeWorkspaceId] }))}>Duplicate</Button>
                      <Button size="sm" variant="ghost" onClick={() => void emailService.removeTemplate(template.id).then(() => queryClient.invalidateQueries({ queryKey: ["email-templates", activeWorkspaceId] }))}>Delete</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-3 pt-6">
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="text-sm">Type<select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2" value={emailType} onChange={(event) => setEmailType(event.target.value as EmailType)}>{EMAIL_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
                  <label className="text-sm">Tone<Input value={tone} onChange={(event) => setTone(event.target.value)} /></label>
                  <label className="text-sm">Length<select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2" value={length} onChange={(event) => setLength(event.target.value as "short" | "medium" | "long")}><option value="short">Short</option><option value="medium">Medium</option><option value="long">Long</option></select></label>
                </div>
                <Label>Objective<Input value={objective} onChange={(event) => setObjective(event.target.value)} /></Label>
                <Label>Call to action<Input value={callToAction} onChange={(event) => setCallToAction(event.target.value)} /></Label>
                <Label>Instructions<Textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} /></Label>
                <Button onClick={() => generate.mutate()} disabled={generate.isPending}>Generate</Button>
                {generate.isError ? <p className="text-sm text-destructive">{getErrorMessage(generate.error)}</p> : null}
                <Label>Subject<Input value={subject} onChange={(event) => setSubject(event.target.value)} /></Label>
                <Label>Body<Textarea value={body} onChange={(event) => setBody(event.target.value)} className="min-h-40" /></Label>
                <TemplateIssues subject={subject} body={body} />
                {warnings.length > 0 ? <p className="text-sm text-destructive">{warnings.join(" ")}</p> : null}
                {explanation ? <p className="text-sm text-muted-foreground">{explanation}</p> : null}
                <div>
                  <h2 className="text-sm font-medium">Preview with sample values</h2>
                  <p className="whitespace-pre-wrap text-sm">{preview}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => save.mutate()} disabled={!subject || !body}>Save draft</Button>
                  <Button variant="outline" onClick={() => void navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)}>Copy</Button>
                  <Button variant="outline" onClick={() => generate.mutate()} disabled={generate.isPending}>Regenerate</Button>
                </div>
                <div className="grid gap-2 md:grid-cols-[1fr_12rem_auto]">
                  <Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Template name" />
                  <Input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Category" />
                  <Button variant="outline" onClick={() => saveTemplate.mutate()} disabled={!subject || !body}>Save template</Button>
                </div>
                <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                  <select className="rounded-md border border-border bg-background px-2 py-2" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                    <option value="">Sending account</option>
                    {(accounts.data ?? []).filter((account) => account.kind === "email" && account.status === "connected").map((account) => <option key={account.id} value={account.id}>{account.email_address}</option>)}
                  </select>
                  <Input value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder="Test recipient" />
                  <Button variant="outline" disabled={!accountId || !testTo || !subject || !body || test.isPending} onClick={() => test.mutate()}>Send test</Button>
                </div>
                {test.data ? <p className="text-sm">Provider accepted the test. Delivery is not confirmed. Message {test.data.providerMessageId ?? "has no provider id"}.</p> : null}
                {test.isError ? <p className="text-sm text-destructive">{getErrorMessage(test.error)}</p> : null}
              </CardContent>
            </Card>
          </div>
        </WorkspaceGate>
      </div>
    </>
  );
}
