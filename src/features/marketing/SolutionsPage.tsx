import { ContentPage } from "@/features/marketing/ContentPage";

const solutions = [
  {
    title: "B2B SaaS sales teams",
    body: "Standardise ICP-led outbound, keep enrichment credits under control, and review AI drafts before send.",
  },
  {
    title: "Agencies running client outreach",
    body: "Separate client work into workspaces, invite collaborators with roles, and export campaign analytics.",
  },
  {
    title: "Founder-led sales",
    body: "Start on Free or Starter, analyse your own website, generate an ICP, and grow integrations as you scale.",
  },
];

export function SolutionsPage() {
  return (
    <ContentPage
      title="Solutions"
      description="Prospectra adapts to how your organisation sells — without requiring a proprietary global company database."
    >
      <div className="space-y-6">
        {solutions.map((item) => (
          <article key={item.title} className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-display text-xl font-semibold">{item.title}</h2>
            <p className="mt-2 text-muted-foreground">{item.body}</p>
          </article>
        ))}
      </div>
    </ContentPage>
  );
}
