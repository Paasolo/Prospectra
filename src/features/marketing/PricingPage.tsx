import { useState } from "react";
import { PricingCard } from "@/components/marketing/PricingCard";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { pricingPlans } from "@/constants/pricing";
import { ContentPage } from "@/features/marketing/ContentPage";

export function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <ContentPage
      title="Pricing"
      description="Choose a plan that matches your team size and credit needs. Subscription changes are verified server-side when payment providers are configured."
    >
      <div className="mb-8 flex items-center gap-3">
        <Label htmlFor="pricing-billing">Monthly</Label>
        <Switch id="pricing-billing" checked={annual} onCheckedChange={setAnnual} />
        <Label htmlFor="pricing-billing">Annual</Label>
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {pricingPlans.map((plan) => (
          <PricingCard key={plan.id} plan={plan} billing={annual ? "annual" : "monthly"} />
        ))}
      </div>
    </ContentPage>
  );
}
