import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Seo } from "@/components/shared/Seo";
import { ProspectraLogo } from "@/components/brand/ProspectraLogo";
import { getErrorMessage } from "@/lib/errors";
import { getSupabaseInitResult } from "@/integrations/supabase/client";
import { workspaceService } from "@/services/workspace-service";

const steps = [
  "Workspace",
  "Company",
  "Industry",
  "Size",
  "Product",
  "Customers",
  "Markets",
  "Objectives",
  "Invite",
  "Complete",
] as const;

export function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [targetCustomers, setTargetCustomers] = useState("");
  const [targetMarkets, setTargetMarkets] = useState("");
  const [salesObjectives, setSalesObjectives] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const config = getSupabaseInitResult();

  useEffect(() => {
    const saved = localStorage.getItem("prospectra.onboarding.step");
    if (saved) {
      setStep(Number.parseInt(saved, 10) || 0);
    }
    const savedWorkspace = localStorage.getItem("prospectra.onboarding.workspaceId");
    if (savedWorkspace) {
      setWorkspaceId(savedWorkspace);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("prospectra.onboarding.step", String(step));
  }, [step]);

  const persistSettings = async (patch: Record<string, unknown>, nextStep: number) => {
    if (!workspaceId || config.status === "unconfigured") {
      setStep(nextStep);
      return;
    }
    await workspaceService.updateSettings(workspaceId, {
      ...patch,
      onboarding_step: nextStep,
    });
    setStep(nextStep);
  };

  const createWorkspace = async () => {
    setError(null);
    try {
      if (config.status === "unconfigured") {
        setError(config.reason);
        return;
      }
      const workspace = await workspaceService.createWorkspace(workspaceName.trim());
      setWorkspaceId(workspace.id);
      localStorage.setItem("prospectra.activeWorkspaceId", workspace.id);
      localStorage.setItem("prospectra.onboarding.workspaceId", workspace.id);
      await workspaceService.updateSettings(workspace.id, {
        onboarding_step: 1,
        website_url: websiteUrl || null,
      });
      setStep(1);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const complete = async () => {
    setError(null);
    try {
      if (workspaceId && config.status === "configured") {
        await workspaceService.updateSettings(workspaceId, {
          onboarding_step: steps.length,
          onboarding_completed_at: new Date().toISOString(),
        });
      }
      localStorage.removeItem("prospectra.onboarding.step");
      navigate("/app/welcome");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <>
      <Seo title="Onboarding" />
      <div className="mx-auto max-w-2xl px-4 py-12">
        <ProspectraLogo className="mb-8" />
        <p className="mb-2 text-sm text-muted-foreground">
          Step {step + 1} of {steps.length}: {steps[step]}
        </p>
        <div className="mb-6 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-brand-electric transition-all"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        {config.status === "unconfigured" ? (
          <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            {config.reason} You can still walk through the wizard UI; workspace persistence requires Supabase.
          </p>
        ) : null}

        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          {step === 0 ? (
            <>
              <h1 className="font-display text-2xl font-semibold">Create your workspace</h1>
              <div className="space-y-2">
                <Label htmlFor="workspaceName">Workspace name</Label>
                <Input
                  id="workspaceName"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="Acme Sales"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="websiteUrl">Company website</Label>
                <Input
                  id="websiteUrl"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
              <Button type="button" onClick={() => void createWorkspace()} disabled={!workspaceName.trim()}>
                Continue
              </Button>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h1 className="font-display text-2xl font-semibold">Confirm company website</h1>
              <Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => void persistSettings({ website_url: websiteUrl || null }, 2)}
                >
                  Continue
                </Button>
                <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                  Skip
                </Button>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h1 className="font-display text-2xl font-semibold">Industry</h1>
              <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="B2B SaaS" />
              <div className="flex gap-2">
                <Button type="button" onClick={() => void persistSettings({ industry }, 3)}>
                  Continue
                </Button>
                <Button type="button" variant="ghost" onClick={() => setStep(3)}>
                  Skip
                </Button>
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <h1 className="font-display text-2xl font-semibold">Company size</h1>
              <Input
                value={companySize}
                onChange={(e) => setCompanySize(e.target.value)}
                placeholder="11-50 employees"
              />
              <div className="flex gap-2">
                <Button type="button" onClick={() => void persistSettings({ company_size: companySize }, 4)}>
                  Continue
                </Button>
                <Button type="button" variant="ghost" onClick={() => setStep(4)}>
                  Skip
                </Button>
              </div>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <h1 className="font-display text-2xl font-semibold">Products and services</h1>
              <Textarea
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                placeholder="What do you sell?"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => void persistSettings({ product_description: productDescription }, 5)}
                >
                  Continue
                </Button>
                <Button type="button" variant="ghost" onClick={() => setStep(5)}>
                  Skip
                </Button>
              </div>
            </>
          ) : null}

          {step === 5 ? (
            <>
              <h1 className="font-display text-2xl font-semibold">Target customers</h1>
              <Textarea
                value={targetCustomers}
                onChange={(e) => setTargetCustomers(e.target.value)}
                placeholder="Who buys from you?"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => void persistSettings({ target_customers: targetCustomers }, 6)}
                >
                  Continue
                </Button>
                <Button type="button" variant="ghost" onClick={() => setStep(6)}>
                  Skip
                </Button>
              </div>
            </>
          ) : null}

          {step === 6 ? (
            <>
              <h1 className="font-display text-2xl font-semibold">Target markets</h1>
              <Input
                value={targetMarkets}
                onChange={(e) => setTargetMarkets(e.target.value)}
                placeholder="Ghana, UK, United States"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() =>
                    void persistSettings(
                      {
                        target_markets: targetMarkets
                          .split(",")
                          .map((part) => part.trim())
                          .filter(Boolean),
                      },
                      7,
                    )
                  }
                >
                  Continue
                </Button>
                <Button type="button" variant="ghost" onClick={() => setStep(7)}>
                  Skip
                </Button>
              </div>
            </>
          ) : null}

          {step === 7 ? (
            <>
              <h1 className="font-display text-2xl font-semibold">Sales objectives</h1>
              <Textarea
                value={salesObjectives}
                onChange={(e) => setSalesObjectives(e.target.value)}
                placeholder="Book discovery calls with qualified accounts"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => void persistSettings({ sales_objectives: salesObjectives }, 8)}
                >
                  Continue
                </Button>
                <Button type="button" variant="ghost" onClick={() => setStep(8)}>
                  Skip
                </Button>
              </div>
            </>
          ) : null}

          {step === 8 ? (
            <>
              <h1 className="font-display text-2xl font-semibold">Invite a teammate</h1>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={async () => {
                    if (workspaceId && inviteEmail && config.status === "configured") {
                      await workspaceService.inviteMember(workspaceId, inviteEmail, "MEMBER");
                    }
                    setStep(9);
                  }}
                >
                  {inviteEmail ? "Send invite & continue" : "Continue"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setStep(9)}>
                  Skip
                </Button>
              </div>
            </>
          ) : null}

          {step === 9 ? (
            <>
              <h1 className="font-display text-2xl font-semibold">You are ready</h1>
              <p className="text-sm text-muted-foreground">
                Next, create an ICP and analyse your website. Credits remain ledger-backed once your workspace is
                provisioned.
              </p>
              <Button type="button" onClick={() => void complete()}>
                Go to Prospectra
              </Button>
            </>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          Prefer to explore first?{" "}
          <Link className="text-primary hover:underline" to="/app">
            Open dashboard
          </Link>
        </p>
      </div>
    </>
  );
}
