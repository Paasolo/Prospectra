import { ContentPage } from "@/features/marketing/ContentPage";

export function AboutPage() {
  return (
    <ContentPage
      title="About Prospectra"
      description="We build sales intelligence software that teams can trust — clear provenance, workspace isolation, and no fabricated performance claims."
    >
      <div className="prose prose-slate dark:prose-invert max-w-3xl space-y-4 text-muted-foreground">
        <p>
          Prospectra helps B2B teams discover companies that fit their ideal customer profile, enrich contacts through
          authorised providers, and run outreach campaigns with measurable controls.
        </p>
        <p>
          Our product principles are simple: keep business logic out of the UI, never expose privileged secrets to the
          browser, and never mark an integration successful unless the provider confirms it.
        </p>
        <p>
          Prospectra is developed incrementally. Features ship with migrations, tests, and documentation — not as an
          unverified mockup dump.
        </p>
      </div>
    </ContentPage>
  );
}
