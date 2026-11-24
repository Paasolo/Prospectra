import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/shared/Seo";

type PlaceholderFeaturePageProps = {
  title: string;
  description: string;
  phaseHint: string;
};

export function PlaceholderFeaturePage({ title, description, phaseHint }: PlaceholderFeaturePageProps) {
  return (
    <>
      <Seo title={title} />
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Navigation is live. Full workflow implementation is scheduled for {phaseHint}. This screen is not mocked
            as a completed feature.
          </p>
          <Button asChild variant="outline">
            <Link to="/app">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
