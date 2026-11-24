import {
  BarChart3,
  Building2,
  Mail,
  Radar,
  Sparkles,
  Target,
  Users,
  Workflow,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PricingCard } from "@/components/marketing/PricingCard";
import { Seo } from "@/components/shared/Seo";
import { pricingPlans } from "@/constants/pricing";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const capabilities = [
  {
    icon: Building2,
    title: "Company discovery",
    body: "Search authorised data providers for organisations that match your ICP filters — not a fabricated proprietary database.",
  },
  {
    icon: Sparkles,
    title: "AI prospect intelligence",
    body: "Analyse public company websites and generate structured insights you can review before acting.",
  },
  {
    icon: Users,
    title: "Lead enrichment",
    body: "Enrich prospects through configured providers with clear verification status and provenance.",
  },
  {
    icon: Mail,
    title: "Personalised outreach",
    body: "Draft sales emails with editable AI suggestions. Nothing sends without your campaign authorisation.",
  },
  {
    icon: Workflow,
    title: "Campaign automation",
    body: "Build multi-step sequences with schedules, limits, suppressions, and honest delivery tracking.",
  },
  {
    icon: BarChart3,
    title: "Sales analytics",
    body: "Measure enrolments, replies, meetings, and credit usage from real workspace activity.",
  },
];

const faqs = [
  {
    q: "Does Prospectra invent contact emails?",
    a: "No. Contact data comes from authorised providers or your imports. Unverified contacts are never marked verified.",
  },
  {
    q: "What happens if a data provider is not configured?",
    a: "Discovery and enrichment show an integration setup state. Demonstration mode is only available when you explicitly enable it.",
  },
  {
    q: "Is provider acceptance the same as email delivery?",
    a: "No. Prospectra distinguishes acceptance from delivery and labels tracking metrics carefully.",
  },
  {
    q: "Can teams share workspaces securely?",
    a: "Yes. Workspaces are multi-tenant with role-based permissions and row-level security on tenant data.",
  },
];

export function HomePage() {
  const [annual, setAnnual] = useState(false);

  return (
    <>
      <Seo
        title="Find Better Prospects. Build Better Connections."
        description="Prospectra is an AI-powered B2B sales intelligence and engagement platform for discovering companies, enriching contacts, and running authorised outreach."
      />

      <section className="relative overflow-hidden border-b border-border">
        <div
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--color-brand-electric-soft),_transparent_55%),radial-gradient(ellipse_at_bottom_left,_var(--color-brand-violet-soft),_transparent_50%)]"
          aria-hidden
        />
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-28">
          <div className="space-y-6">
            <Badge variant="ai">AI-powered B2B sales intelligence</Badge>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-brand-navy dark:text-white sm:text-5xl lg:text-6xl">
              Prospectra
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Find Better Prospects. Build Better Connections. Discover companies, enrich decision-makers, and run
              outreach with credits, compliance controls, and honest delivery status.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/register">Start free</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/features">Explore features</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/80 p-4 shadow-lg backdrop-blur">
            <div className="rounded-xl bg-brand-navy p-5 text-white">
              <div className="mb-4 flex items-center justify-between">
                <p className="font-display text-sm font-semibold">Workspace preview</p>
                <Badge variant="secondary">Illustrative UI</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Prospects", "From your data"],
                  ["Campaigns", "Draft → activate"],
                  ["Credits", "Ledger-backed"],
                  ["Inbox", "Provider sync"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-white/10 p-3">
                    <p className="text-white/60">{label}</p>
                    <p className="mt-1 font-medium">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 h-24 rounded-lg bg-gradient-to-r from-brand-electric/80 to-brand-violet/70 opacity-90" />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="max-w-2xl space-y-3">
          <h2 className="font-display text-3xl font-semibold tracking-tight">Built for serious outbound teams</h2>
          <p className="text-muted-foreground">
            Prospectra connects ICP definition, discovery, enrichment, and engagement in one workspace — without
            pretending unconfigured integrations are live.
          </p>
        </div>
      </section>

      <section className="border-y border-border bg-muted/40 py-16">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 md:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((item) => (
            <article key={item.title} className="rounded-xl border border-border bg-card p-6">
              <item.icon className="mb-4 h-6 w-6 text-brand-electric" aria-hidden />
              <h3 className="font-display text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h2 className="font-display text-3xl font-semibold tracking-tight">Transparent plans</h2>
            <p className="text-muted-foreground">
              Prices shown are list rates for planning. Billing activates only after verified payment setup.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="billing-toggle">Monthly</Label>
            <Switch id="billing-toggle" checked={annual} onCheckedChange={setAnnual} />
            <Label htmlFor="billing-toggle">Annual</Label>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {pricingPlans.slice(0, 3).map((plan) => (
            <PricingCard key={plan.id} plan={plan} billing={annual ? "annual" : "monthly"} />
          ))}
        </div>
        <div className="mt-6 text-center">
          <Button asChild variant="outline">
            <Link to="/pricing">View all plans</Link>
          </Button>
        </div>
      </section>

      <section className="border-t border-border bg-card py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="mb-6 flex items-center gap-2">
            <Target className="h-5 w-5 text-brand-violet" aria-hidden />
            <h2 className="font-display text-3xl font-semibold tracking-tight">FAQ</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((item, index) => (
              <AccordionItem key={item.q} value={`item-${index}`}>
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent>{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="overflow-hidden rounded-2xl bg-brand-navy px-8 py-12 text-white">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl space-y-3">
              <div className="flex items-center gap-2 text-brand-electric-soft">
                <Radar className="h-5 w-5" aria-hidden />
                <span className="text-sm font-medium">Ready when your providers are</span>
              </div>
              <h2 className="font-display text-3xl font-semibold tracking-tight">
                Start with a workspace. Connect providers when you are ready.
              </h2>
              <p className="text-white/70">
                Create your account, invite your team, and configure discovery, enrichment, and email integrations
                without mock success states.
              </p>
            </div>
            <Button asChild size="lg" className="bg-white text-brand-navy hover:bg-white/90">
              <Link to="/register">Create your workspace</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
