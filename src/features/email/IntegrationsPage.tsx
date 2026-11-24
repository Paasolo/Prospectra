import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { getErrorMessage } from "@/lib/errors";
import { emailService } from "@/services/engagement-service";

export function IntegrationsPage() {
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [fromAddress, setFromAddress] = useState("");
  const accounts = useQuery({ queryKey: ["connected-accounts", activeWorkspaceId], enabled: Boolean(activeWorkspaceId), queryFn: () => emailService.accounts(activeWorkspaceId!) });
  const connect = useMutation({
    mutationFn: (input: { provider: "gmail" | "microsoft"; kind: "email" | "calendar" }) => emailService.startOAuth({ workspaceId: activeWorkspaceId!, ...input }),
    onSuccess: (result) => {
      window.location.assign(result.url);
    },
  });
  const resend = useMutation({
    mutationFn: () => emailService.connectResend({ workspaceId: activeWorkspaceId!, fromAddress }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["connected-accounts", activeWorkspaceId] }),
  });

  return (
    <>
      <Seo title="Integrations" />
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Integrations</h1>
          <p className="text-sm text-muted-foreground">OAuth tokens stay on the worker. Refresh tokens are not returned to the browser.</p>
        </div>
        <WorkspaceGate>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Email</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button onClick={() => connect.mutate({ provider: "gmail", kind: "email" })} disabled={connect.isPending}>Connect Gmail</Button>
                <Button variant="outline" onClick={() => connect.mutate({ provider: "microsoft", kind: "email" })} disabled={connect.isPending}>Connect Microsoft 365</Button>
                <div className="flex gap-2">
                  <Input value={fromAddress} onChange={(event) => setFromAddress(event.target.value)} placeholder="Resend from address" />
                  <Button variant="outline" onClick={() => resend.mutate()}>Use Resend</Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Calendar</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button onClick={() => connect.mutate({ provider: "gmail", kind: "calendar" })} disabled={connect.isPending}>Connect Google Calendar</Button>
                <Button variant="outline" onClick={() => connect.mutate({ provider: "microsoft", kind: "calendar" })} disabled={connect.isPending}>Connect Microsoft calendar</Button>
              </CardContent>
            </Card>
          </div>
          {connect.isError || resend.isError ? <p className="text-sm text-destructive">{getErrorMessage(connect.error ?? resend.error)}</p> : null}
          <div className="space-y-2">
            {(accounts.data ?? []).map((account) => (
              <Card key={account.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-6 text-sm">
                  <div>
                    <p className="font-medium">{account.email_address ?? account.provider}</p>
                    <p className="text-muted-foreground">{account.kind} · {account.provider} · limit {account.daily_limit}/day</p>
                  </div>
                  <Badge variant={account.status === "connected" ? "success" : "warning"}>{account.status}</Badge>
                  <Button variant="outline" onClick={() => void emailService.disconnect({ workspaceId: activeWorkspaceId!, accountId: account.id }).then(() => queryClient.invalidateQueries({ queryKey: ["connected-accounts", activeWorkspaceId] }))}>Disconnect</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </WorkspaceGate>
      </div>
    </>
  );
}
