import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { emptyIcpCriteria, type IcpCriteria } from "@prospectra/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { getErrorMessage } from "@/lib/errors";
import { analysisService } from "@/services/analysis-service";
import { icpService } from "@/services/icp-service";

const listFields = [
  ["geography", "Geography"],
  ["technologies", "Technologies"],
  ["targetJobTitles", "Target job titles"],
  ["departments", "Departments"],
  ["seniority", "Seniority"],
  ["painPoints", "Pain points"],
  ["buyingSignals", "Buying signals"],
  ["exclusionCriteria", "Exclusion criteria"],
] as const;

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function IcpEditorPage() {
  const { icpId } = useParams();
  const isNew = !icpId || icpId === "new";
  const { activeWorkspaceId } = useWorkspace();
  const auth = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState<IcpCriteria>(emptyIcpCriteria());
  const [source, setSource] = useState<"manual" | "website_analysis" | "existing_customers" | "successful_prospects" | "ai_discovery">("manual");
  const [analysisId, setAnalysisId] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const existing = useQuery({
    queryKey: ["icp", activeWorkspaceId, icpId],
    enabled: Boolean(activeWorkspaceId && !isNew),
    queryFn: () => icpService.get(activeWorkspaceId!, icpId!),
  });
  const analyses = useQuery({
    queryKey: ["website-analyses", activeWorkspaceId],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => analysisService.list(activeWorkspaceId!),
  });

  useEffect(() => {
    if (!existing.data) {
      return;
    }
    setName(existing.data.name);
    setDescription(existing.data.description ?? "");
    setCriteria(existing.data.criteria_parsed);
    setSource(existing.data.source as typeof source);
  }, [existing.data]);

  const quality = icpService.assess(criteria, description);
  const save = useMutation({
    mutationFn: () =>
      icpService.save({
        workspaceId: activeWorkspaceId!,
        id: isNew ? undefined : icpId,
        name,
        description,
        criteria,
        source,
        createdBy: auth.status === "authenticated" ? auth.userId : null,
      }),
    onSuccess: (id) => navigate(`/app/icp/${id}`),
  });
  const generate = useMutation({
    mutationFn: () =>
      icpService.generate({
        workspaceId: activeWorkspaceId!,
        source,
        description,
        analysisId: analysisId || undefined,
      }),
    onSuccess: (result) => {
      setName(result.recommendation.name);
      setDescription(result.recommendation.description);
      setCriteria(result.recommendation.criteria);
      setMessage("The recommendation is editable. Save it when it looks right.");
    },
  });

  function setText(key: "industry" | "subIndustry" | "companySize" | "businessModel", value: string) {
    setCriteria((current) => ({ ...current, [key]: value }));
  }

  return (
    <>
      <Seo title={isNew ? "New ICP" : "Edit ICP"} />
      <WorkspaceGate>
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-3xl font-semibold tracking-tight">{isNew ? "New ICP" : "Edit ICP"}</h1>
            <div className="flex gap-2">
              <Button asChild variant="outline" type="button">
                <Link to="/app/icp">Back</Link>
              </Button>
              <Button type="submit" disabled={save.isPending || !name.trim()}>
                Save ICP
              </Button>
            </div>
          </div>
          {save.isError || generate.isError ? (
            <p className="text-sm text-destructive">{getErrorMessage(save.error ?? generate.error)}</p>
          ) : null}
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Card>
              <CardHeader>
                <CardTitle>Criteria</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="icp-name">Name</Label>
                  <Input id="icp-name" value={name} onChange={(event) => setName(event.target.value)} required />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="icp-description">Description</Label>
                  <Textarea id="icp-description" value={description} onChange={(event) => setDescription(event.target.value)} />
                </div>
                {(
                  [
                    ["industry", "Industry"],
                    ["subIndustry", "Sub-industry"],
                    ["companySize", "Company size"],
                    ["businessModel", "Business model"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={key}>{label}</Label>
                    <Input id={key} value={criteria[key]} onChange={(event) => setText(key, event.target.value)} />
                  </div>
                ))}
                <div className="space-y-2">
                  <Label htmlFor="employees">Employee range</Label>
                  <div className="flex gap-2">
                    <Input
                      id="employees"
                      type="number"
                      placeholder="Min"
                      value={criteria.employeeRange.min ?? ""}
                      onChange={(event) =>
                        setCriteria((current) => ({
                          ...current,
                          employeeRange: { ...current.employeeRange, min: event.target.value ? Number(event.target.value) : null },
                        }))
                      }
                    />
                    <Input
                      type="number"
                      placeholder="Max"
                      value={criteria.employeeRange.max ?? ""}
                      onChange={(event) =>
                        setCriteria((current) => ({
                          ...current,
                          employeeRange: { ...current.employeeRange, max: event.target.value ? Number(event.target.value) : null },
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="revenue">Revenue range ({criteria.revenueRange.currency})</Label>
                  <div className="flex gap-2">
                    <Input
                      id="revenue"
                      type="number"
                      placeholder="Min"
                      value={criteria.revenueRange.min ?? ""}
                      onChange={(event) =>
                        setCriteria((current) => ({
                          ...current,
                          revenueRange: { ...current.revenueRange, min: event.target.value ? Number(event.target.value) : null },
                        }))
                      }
                    />
                    <Input
                      type="number"
                      placeholder="Max"
                      value={criteria.revenueRange.max ?? ""}
                      onChange={(event) =>
                        setCriteria((current) => ({
                          ...current,
                          revenueRange: { ...current.revenueRange, max: event.target.value ? Number(event.target.value) : null },
                        }))
                      }
                    />
                  </div>
                </div>
                {listFields.map(([key, label]) => (
                  <div key={key} className="space-y-2 md:col-span-2">
                    <Label htmlFor={key}>{label}</Label>
                    <Input
                      id={key}
                      value={criteria[key].join(", ")}
                      onChange={(event) => setCriteria((current) => ({ ...current, [key]: splitList(event.target.value) }))}
                      placeholder="Comma-separated"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Quality {quality.overall}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>Completeness {quality.completeness}</p>
                  <p>Specificity {quality.specificity}</p>
                  <p>Consistency {quality.consistency}</p>
                  <p>Searchability {quality.searchability}</p>
                  <p>Target market clarity {quality.targetMarketClarity}</p>
                  {quality.recommendations.map((item) => (
                    <p key={item} className="text-muted-foreground">
                      {item}
                    </p>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Generate</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={source} onChange={(event) => setSource(event.target.value as typeof source)}>
                    <option value="manual">Manual description</option>
                    <option value="website_analysis">Website analysis</option>
                    <option value="existing_customers">Existing customers</option>
                    <option value="successful_prospects">Successful prospects</option>
                    <option value="ai_discovery">AI-assisted discovery</option>
                  </select>
                  {source === "website_analysis" || source === "ai_discovery" ? (
                    <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={analysisId} onChange={(event) => setAnalysisId(event.target.value)}>
                      <option value="">Select an analysis</option>
                      {analyses.data?.map((analysis) => (
                        <option key={analysis.id} value={analysis.id}>
                          {analysis.company_name || analysis.submitted_url}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <Button type="button" variant="outline" disabled={generate.isPending} onClick={() => generate.mutate()}>
                    {generate.isPending ? "Generating…" : "Generate recommendation"}
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Generation uses OpenAI on the worker. If it is not configured, nothing is invented.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </WorkspaceGate>
    </>
  );
}
