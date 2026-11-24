import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type PricingPlan = {
  id: string;
  name: string;
  priceMonthly: string;
  priceAnnual: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  ctaLabel: string;
  ctaHref: string;
};

type PricingCardProps = {
  plan: PricingPlan;
  billing: "monthly" | "annual";
  className?: string;
};

export function PricingCard({ plan, billing, className }: PricingCardProps) {
  const price = billing === "monthly" ? plan.priceMonthly : plan.priceAnnual;

  return (
    <Card
      className={cn(
        "relative flex h-full flex-col",
        plan.highlighted && "border-brand-electric shadow-md ring-1 ring-brand-electric/30",
        className,
      )}
    >
      {plan.highlighted ? (
        <Badge className="absolute -top-3 left-6" variant="ai">
          Most popular
        </Badge>
      ) : null}
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
        <CardDescription>{plan.description}</CardDescription>
        <p className="pt-4">
          <span className="font-display text-3xl font-semibold text-foreground">{price}</span>
          <span className="text-sm text-muted-foreground">
            {price === "Custom" ? "" : billing === "monthly" ? " / month" : " / year"}
          </span>
        </p>
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="space-y-2">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-electric" aria-hidden />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full" variant={plan.highlighted ? "default" : "outline"}>
          <Link to={plan.ctaHref}>{plan.ctaLabel}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
