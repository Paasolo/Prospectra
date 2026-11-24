import { ContentPage } from "@/features/marketing/ContentPage";

export function BlogPage() {
  return (
    <ContentPage
      title="Blog"
      description="Product updates and practical guidance on B2B prospecting. Posts appear here when published — no fabricated articles."
    >
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center">
        <p className="font-display text-lg font-semibold">No posts published yet</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Check back after the content pipeline is connected. We will not invent case studies or logos.
        </p>
      </div>
    </ContentPage>
  );
}
