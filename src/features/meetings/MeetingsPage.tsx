import { meetingIsConfirmed } from "@prospectra/shared";
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
import { emailService, meetingService } from "@/services/engagement-service";

export function MeetingsPage() {
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState("");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [timeZone, setTimeZone] = useState("UTC");
  const [attendees, setAttendees] = useState("");
  const [slots, setSlots] = useState<Array<{ start: string; end: string }>>([]);
  const meetings = useQuery({ queryKey: ["meetings", activeWorkspaceId], enabled: Boolean(activeWorkspaceId), queryFn: () => meetingService.list(activeWorkspaceId!) });
  const accounts = useQuery({ queryKey: ["connected-accounts", activeWorkspaceId], enabled: Boolean(activeWorkspaceId), queryFn: () => emailService.accounts(activeWorkspaceId!) });
  const availability = useMutation({
    mutationFn: () => meetingService.availability({
      workspaceId: activeWorkspaceId!,
      accountId,
      rangeStart: new Date().toISOString(),
      rangeEnd: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      durationMinutes: 30,
    }),
    onSuccess: (result) => setSlots(result.slots),
  });
  const create = useMutation({
    mutationFn: () => meetingService.create({
      workspaceId: activeWorkspaceId!,
      accountId,
      title,
      description: "",
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      timeZone,
      attendees: attendees.split(",").map((value) => value.trim()).filter(Boolean),
      location: "",
      prospectId: null,
      companyId: null,
      conversationId: null,
      campaignId: null,
    }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["meetings", activeWorkspaceId] }),
  });

  return (
    <>
      <Seo title="Meetings" />
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Meetings</h1>
          <p className="text-sm text-muted-foreground">A meeting is booked only after the calendar provider confirms it.</p>
        </div>
        <WorkspaceGate>
          <Card>
            <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <select className="w-full rounded-md border border-border bg-background px-2 py-2" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                <option value="">Calendar account</option>
                {(accounts.data ?? []).filter((account) => account.kind === "calendar").map((account) => <option key={account.id} value={account.id}>{account.email_address} · {account.status}</option>)}
              </select>
              <Button variant="outline" disabled={!accountId || availability.isPending} onClick={() => availability.mutate()}>Load availability</Button>
              {availability.isError ? <p className="text-sm text-destructive">{getErrorMessage(availability.error)}</p> : null}
              <div className="flex flex-wrap gap-2">{slots.map((slot) => <Button key={slot.start} size="sm" variant="outline" onClick={() => { setStartsAt(slot.start.slice(0, 16)); setEndsAt(slot.end.slice(0, 16)); }}>{new Date(slot.start).toLocaleString()}</Button>)}</div>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" />
              <div className="grid gap-2 md:grid-cols-3">
                <Input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
                <Input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
                <Input value={timeZone} onChange={(event) => setTimeZone(event.target.value)} />
              </div>
              <Input value={attendees} onChange={(event) => setAttendees(event.target.value)} placeholder="Attendee emails" />
              <Button disabled={!accountId || !title || !startsAt || !endsAt || create.isPending} onClick={() => create.mutate()}>Create meeting</Button>
              {create.data ? <p className="text-sm">{create.data.providerConfirmed ? `Booked. Provider event ${create.data.providerEventId}.` : `Not booked. ${create.data.error ?? "The provider did not confirm the meeting."}`}</p> : null}
              {create.isError ? <p className="text-sm text-destructive">{getErrorMessage(create.error)}</p> : null}
            </CardContent>
          </Card>
          <div className="space-y-2">
            {(meetings.data ?? []).map((meeting) => {
              const booked = meetingIsConfirmed({
                providerConfirmed: meeting.provider_confirmed,
                providerEventId: meeting.provider_event_id,
                status: meeting.status,
              });
              return (
                <Card key={meeting.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-6 text-sm">
                    <div>
                      <p className="font-medium">{meeting.title}</p>
                      <p className="text-muted-foreground">{meeting.starts_at} · {meeting.timezone}</p>
                      {meeting.provider_error ? <p className="text-destructive">{meeting.provider_error}</p> : null}
                    </div>
                    <Badge variant={booked ? "success" : "warning"}>{booked ? "Booked" : meeting.status}</Badge>
                    {booked ? <Button size="sm" variant="outline" onClick={() => void meetingService.cancel({ workspaceId: activeWorkspaceId!, meetingId: meeting.id }).then(() => queryClient.invalidateQueries({ queryKey: ["meetings", activeWorkspaceId] }))}>Cancel</Button> : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </WorkspaceGate>
      </div>
    </>
  );
}
