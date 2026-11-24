import { APP_NAME, APP_VERSION } from "@prospectra/shared";
import { getClientEnv } from "@/lib/env";
import { getSupabaseInitResult } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

export function HealthPage() {
  const env = getClientEnv();
  const supabase = getSupabaseInitResult();

  return (
    <section className="mx-auto max-w-2xl space-y-6 px-6 py-16" aria-labelledby="health-heading">
      <div>
        <h1 id="health-heading" className="font-display text-3xl font-semibold tracking-tight">
          Application health
        </h1>
        <p className="mt-2 text-muted-foreground">
          Runtime status for {APP_NAME} foundation services. This screen reports configuration state
          honestly — it does not invent connectivity success.
        </p>
      </div>

      <dl className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-sm text-muted-foreground">Application</dt>
          <dd className="text-sm font-medium">
            {APP_NAME} v{APP_VERSION}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-sm text-muted-foreground">Frontend</dt>
          <dd>
            <Badge variant="success">ok</Badge>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-sm text-muted-foreground">Supabase client</dt>
          <dd>
            {supabase.status === "configured" ? (
              <Badge variant="success">configured</Badge>
            ) : (
              <Badge variant="warning">unconfigured</Badge>
            )}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-sm text-muted-foreground">Demonstration mode</dt>
          <dd className="text-sm font-medium">{env.demoMode ? "enabled" : "disabled"}</dd>
        </div>
        {supabase.status === "unconfigured" ? (
          <p className="text-sm text-muted-foreground">{supabase.reason}</p>
        ) : null}
      </dl>
    </section>
  );
}
