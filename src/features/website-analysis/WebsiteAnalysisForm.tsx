import { useState, type FormEvent } from "react";
import { parsePublicHttpUrl } from "@prospectra/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type AnalysisFormValues = {
  url: string;
  companyName: string;
  instructions: string;
};

export function WebsiteAnalysisForm({
  submitting,
  onSubmit,
}: {
  submitting: boolean;
  onSubmit: (values: AnalysisFormValues) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const decision = parsePublicHttpUrl(url);
    if (!decision.ok) {
      setError(decision.reason);
      return;
    }
    setError(null);
    await onSubmit({ url: decision.url.href, companyName, instructions });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="website-url">Website URL</Label>
        <Input
          id="website-url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="company-name">Company name (optional)</Label>
        <Input id="company-name" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="instructions">Analysis instructions (optional)</Label>
        <Textarea
          id="instructions"
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder="Focus on the buyer and the products they sell."
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Analysing…" : "Analyse website"}
      </Button>
    </form>
  );
}
