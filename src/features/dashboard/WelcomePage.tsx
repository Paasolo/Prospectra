import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/shared/Seo";
import { useWorkspace } from "@/features/workspaces/workspace-context";

export function WelcomePage() {
  const { activeWorkspace } = useWorkspace();

  return (
    <>
      <Seo title="Welcome" />
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Welcome to Prospectra</h1>
          <p className="mt-2 text-muted-foreground">
            {activeWorkspace
              ? `${activeWorkspace.name} is ready. Here is a practical first path.`
              : "Your account is ready. Create a workspace to unlock prospecting workflows."}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Start the outbound agent</CardTitle>
              <CardDescription>
                Research your offer, score buyer segments, and draft emails. Sending waits for your approval.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link to="/app/agent">Open outbound agent</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Create an ICP</CardTitle>
              <CardDescription>Define who you sell to before running discovery.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link to="/app/icp">Open ICP builder</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Analyse your website</CardTitle>
              <CardDescription>Generate structured insights from your public site.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link to="/app/website-analysis">Start analysis</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Credits</CardTitle>
              <CardDescription>
                New workspaces receive ledger-backed starter credits when provisioned through Supabase.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link to="/app/billing">View billing</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Dashboard</CardTitle>
              <CardDescription>Track prospects, campaigns, and replies from real records.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link to="/app">Go to dashboard</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
