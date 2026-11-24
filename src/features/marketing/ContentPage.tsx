import type { ReactNode } from "react";
import { Seo } from "@/components/shared/Seo";

type ContentPageProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function ContentPage({ title, description, children }: ContentPageProps) {
  return (
    <>
      <Seo title={title} description={description} />
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <header className="mb-10 max-w-3xl space-y-3">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-brand-navy dark:text-white">
            {title}
          </h1>
          <p className="text-lg text-muted-foreground">{description}</p>
        </header>
        {children}
      </div>
    </>
  );
}
