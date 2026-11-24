import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { getSupabaseInitResult } from "@/integrations/supabase/client";

export function WorkspaceGate({ children }: { children: ReactNode }) {
  const supabase = getSupabaseInitResult();
  const { activeWorkspaceId } = useWorkspace();

  if (supabase.status === "unconfigured") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Supabase unconfigured</CardTitle>
          <CardDescription>{supabase.reason}</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant="warning">Configuration required</Badge>
        </CardContent>
      </Card>
    );
  }

  if (!activeWorkspaceId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No workspace selected</CardTitle>
          <CardDescription>Create a workspace before using this workflow.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/onboarding">Start onboarding</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return children;
}
