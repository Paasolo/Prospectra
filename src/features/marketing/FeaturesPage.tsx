import { ContentPage } from "@/features/marketing/ContentPage";

const features = [
  {
    title: "Website analysis",
    body: "Crawl public pages with SSRF protections and produce structured company summaries for ICP recommendations.",
  },
  {
    title: "ICP builder",
    body: "Generate, edit, and quality-assess ideal customer profiles from website analysis or manual inputs.",
  },
  {
    title: "Discovery jobs",
    body: "Queue provider searches, normalise results, detect duplicates, and score prospects against your ICP.",
  },
  {
    title: "Enrichment queue",
    body: "Single and bulk enrichment with credit reservations, retries, and provider provenance.",
  },
  {
    title: "Email studio & campaigns",
    body: "Editable AI drafts, templates, sequences, schedules, and stop-on-reply rules.",
  },
  {
    title: "Inbox & meetings",
    body: "Unified conversations from authorised email sync and calendar adapters that confirm only after providers succeed.",
  },
];

export function FeaturesPage() {
  return (
    <ContentPage
      title="Features"
      description="Everything Prospectra provides to move from ICP definition to engaged conversations — with honest integration states."
    >
      <div className="grid gap-6 md:grid-cols-2">
        {features.map((feature) => (
          <article key={feature.title} className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-display text-xl font-semibold">{feature.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
          </article>
        ))}
      </div>
    </ContentPage>
  );
}
