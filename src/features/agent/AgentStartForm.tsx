import {
  AGENT_DEFAULT_PROSPECT_CAP,
  AGENT_MAX_PROSPECT_CAP,
  parsePublicHttpUrl,
} from "@prospectra/shared";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type AgentStartFormValues = {
  websiteUrl: string;
  offerDescription: string;
  companyName: string;
  prospectCap: number;
};

export function AgentStartForm({
  submitting,
  estimatedCredits,
  onSubmit,
}: {
  submitting: boolean;
  estimatedCredits: number;
  onSubmit: (values: AgentStartFormValues) => Promise<void>;
}) {
  const form = useForm<AgentStartFormValues>({
    defaultValues: {
      websiteUrl: "",
      offerDescription: "",
      companyName: "",
      prospectCap: AGENT_DEFAULT_PROSPECT_CAP,
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (values) => {
        const url = values.websiteUrl.trim();
        const offer = values.offerDescription.trim();
        if (!url && offer.length < 20) {
          form.setError("offerDescription", {
            message: "Enter a public website or at least 20 characters describing what you sell.",
          });
          return;
        }
        if (url) {
          const parsed = parsePublicHttpUrl(url);
          if (!parsed.ok) {
            form.setError("websiteUrl", { message: parsed.reason });
            return;
          }
        }
        const cap = Number(values.prospectCap);
        if (!Number.isFinite(cap) || cap < 1 || cap > AGENT_MAX_PROSPECT_CAP) {
          form.setError("prospectCap", {
            message: `Choose between 1 and ${AGENT_MAX_PROSPECT_CAP} prospects per segment.`,
          });
          return;
        }
        await onSubmit({
          websiteUrl: url,
          offerDescription: offer,
          companyName: values.companyName.trim(),
          prospectCap: Math.floor(cap),
        });
      })}
      noValidate
    >
      <div className="space-y-2">
        <Label htmlFor="companyName">Company name</Label>
        <Input id="companyName" {...form.register("companyName")} placeholder="Optional" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="websiteUrl">Website</Label>
        <Input id="websiteUrl" {...form.register("websiteUrl")} placeholder="https://example.com" />
        {form.formState.errors.websiteUrl ? (
          <p className="text-sm text-destructive">{form.formState.errors.websiteUrl.message}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="offerDescription">What you sell</Label>
        <Textarea
          id="offerDescription"
          rows={4}
          {...form.register("offerDescription")}
          placeholder="Required when you do not have a website. Describe the product and who buys it."
        />
        {form.formState.errors.offerDescription ? (
          <p className="text-sm text-destructive">{form.formState.errors.offerDescription.message}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="prospectCap">Prospects per segment (max {AGENT_MAX_PROSPECT_CAP})</Label>
        <Input
          id="prospectCap"
          type="number"
          min={1}
          max={AGENT_MAX_PROSPECT_CAP}
          {...form.register("prospectCap", { valueAsNumber: true })}
        />
        {form.formState.errors.prospectCap ? (
          <p className="text-sm text-destructive">{form.formState.errors.prospectCap.message}</p>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        Estimated hold: {estimatedCredits} credits. Discovery and drafts use only real provider results. Nothing is
        sent until you approve a segment.
      </p>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Starting…" : "Start agent"}
      </Button>
    </form>
  );
}
