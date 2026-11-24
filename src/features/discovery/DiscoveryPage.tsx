import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  companySearchCriteriaSchema,
  contactSearchCriteriaSchema,
  criteriaFromIcp,
  type CompanySearchCriteria,
  type ContactSearchCriteria,
} from "@prospectra/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/shared/Seo";
import { WorkspaceGate } from "@/components/shared/WorkspaceGate";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/features/workspaces/workspace-context";
import { downloadTextFile } from "@/lib/download";
import { getErrorMessage } from "@/lib/errors";
import { discoveryService } from "@/services/discovery-service";
import { icpService } from "@/services/icp-service";
import { listService } from "@/services/list-service";
import { prospectService } from "@/services/prospect-service";

function textValue(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

export function DiscoveryPage({ kind }: { kind: "company" | "contact" }) {
  const { activeWorkspaceId } = useWorkspace();
  const auth = useAuth();
  const [params] = useSearchParams();
  const icpId = params.get("icp") ?? "";
  const [page, setPage] = useState(1);
  const [listId, setListId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const profiles = useQuery({
    queryKey: ["icp", activeWorkspaceId],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => icpService.list(activeWorkspaceId!),
  });
  const selectedIcp = profiles.data?.find((profile) => profile.id === icpId);
  const seeded = useMemo(() => {
    if (!selectedIcp) {
      return kind === "company" ? companySearchCriteriaSchema.parse({}) : contactSearchCriteriaSchema.parse({});
    }
    const filters = criteriaFromIcp(selectedIcp.filters_parsed);
    return kind === "company" ? filters.company : filters.contact;
  }, [kind, selectedIcp]);
  const [criteria, setCriteria] = useState<CompanySearchCriteria | ContactSearchCriteria | null>(null);
  const activeCriteria = criteria ?? seeded;
  const providers = useQuery({
    queryKey: ["providers", activeWorkspaceId],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => discoveryService.providerStatus(activeWorkspaceId!),
    retry: false,
  });
  const lists = useQuery({
    queryKey: ["lists", activeWorkspaceId],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => listService.list(activeWorkspaceId!),
  });
  const searches = useQuery({
    queryKey: ["discovery", activeWorkspaceId, kind],
    enabled: Boolean(activeWorkspaceId),
    queryFn: () => discoveryService.listSearches(activeWorkspaceId!, kind),
  });
  const provider = providers.data?.providers.find((item) => item.role === (kind === "company" ? "company_discovery" : "contact_discovery"));
  const search = useMutation({
    mutationFn: async () => {
      if (kind === "company") {
        return discoveryService.searchCompanies({
          workspaceId: activeWorkspaceId!,
          criteria: activeCriteria as CompanySearchCriteria,
          page,
          pageSize: 10,
          icpProfileId: icpId || undefined,
        });
      }
      return discoveryService.searchContacts({
        workspaceId: activeWorkspaceId!,
        criteria: activeCriteria as ContactSearchCriteria,
        page,
        pageSize: 10,
        icpProfileId: icpId || undefined,
      });
    },
    onSuccess: (result) => {
      setNotice(
        result.notice === "no_results"
          ? "The provider returned no matching records."
          : result.notice === "partial_results"
            ? "Some provider records were omitted because they could not be normalized."
            : `Saved ${result.records.length} records. Credits used: ${result.creditsConsumed}. Duplicates removed: ${result.duplicateCount}.`,
      );
      setSelected([]);
    },
  });
  const records = search.data?.records ?? [];

  async function addSelected() {
    const userId = auth.status === "authenticated" ? auth.userId : null;
    for (const id of selected) {
      const record = records.find((item) => String(item.providerRecordId ?? "") === id);
      if (!record) {
        continue;
      }
      const prospectId = await prospectService.addFromDiscovery({
        workspaceId: activeWorkspaceId!,
        name: textValue(record, "fullName") || textValue(record, "name"),
        email: textValue(record, "email") || null,
        jobTitle: textValue(record, "jobTitle") || null,
        companyName: textValue(record, "companyName") || textValue(record, "name"),
        domain: textValue(record, "domain") || textValue(record, "companyDomain"),
        location: textValue(record, "location"),
        linkedinUrl: textValue(record, "linkedinUrl"),
        actorUserId: userId,
      });
      if (listId) {
        await listService.addProspects(activeWorkspaceId!, listId, [prospectId]);
      }
    }
    setNotice("Selected records were added to prospects. Emails stay unverified until a verification provider confirms them.");
  }

  return (
    <>
      <Seo title={kind === "company" ? "Discover companies" : "Discover contacts"} />
      <WorkspaceGate>
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              {kind === "company" ? "Discover companies" : "Discover contacts"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Results come from the configured provider. Prospectra does not fill this screen with an internal database.
            </p>
          </div>
          {provider ? (
            <Badge variant={provider.state === "configured" ? "success" : "warning"}>
              {provider.id}: {provider.state}. {provider.detail}
            </Badge>
          ) : null}
          {providers.isError ? <p className="text-sm text-destructive">{getErrorMessage(providers.error)}</p> : null}
          <Card>
            <CardHeader>
              <CardTitle>Search</CardTitle>
              <CardDescription>
                {selectedIcp ? `Using ICP ${selectedIcp.name}. ` : ""}
                <Link to="/app/icp">Choose another ICP</Link>
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {kind === "company" ? (
                <CompanyFields criteria={activeCriteria as CompanySearchCriteria} onChange={setCriteria} />
              ) : (
                <ContactFields criteria={activeCriteria as ContactSearchCriteria} onChange={setCriteria} />
              )}
              <div className="flex items-end gap-2">
                <Button disabled={provider?.state !== "configured" || search.isPending} onClick={() => search.mutate()}>
                  {search.isPending ? "Searching…" : "Run search"}
                </Button>
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                  Previous
                </Button>
                <Button variant="outline" onClick={() => setPage((current) => current + 1)}>
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>
          {search.isError ? <p className="text-sm text-destructive">{getErrorMessage(search.error)}</p> : null}
          {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
          <div className="flex flex-wrap gap-2">
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={listId} onChange={(event) => setListId(event.target.value)}>
              <option value="">Save to list (optional)</option>
              {lists.data?.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
            <Button variant="outline" disabled={!selected.length} onClick={() => void addSelected()}>
              Add to prospects
            </Button>
            <Button
              variant="outline"
              disabled={!records.length}
              onClick={() => downloadTextFile(`${kind}-discovery.json`, JSON.stringify(records, null, 2), "application/json")}
            >
              Export
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="p-3" />
                  <th className="p-3">Name</th>
                  <th className="p-3">{kind === "company" ? "Domain" : "Title"}</th>
                  <th className="p-3">Location</th>
                  <th className="p-3">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const id = String(record.providerRecordId ?? record.provider_record_id ?? "");
                  return (
                    <tr key={id} className="border-b border-border">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selected.includes(id)}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked ? [...current, id] : current.filter((item) => item !== id),
                            )
                          }
                        />
                      </td>
                      <td className="p-3">
                        {textValue(record, "name") || textValue(record, "fullName") || "Unnamed"}
                        {record.alreadyInWorkspace === true ? <Badge className="ml-2">Already saved</Badge> : null}
                      </td>
                      <td className="p-3">{textValue(record, "domain") || textValue(record, "jobTitle") || "—"}</td>
                      <td className="p-3">{textValue(record, "location") || "—"}</td>
                      <td className="p-3">{textValue(record, "confidence")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Previous searches</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {searches.data?.map((item) => (
                <p key={item.id}>
                  {item.status} · {item.result_count} results · {item.consumed_credits} credits
                  {item.error_detail ? ` · ${item.error_detail}` : ""}
                </p>
              ))}
              {searches.data?.length === 0 ? <p className="text-muted-foreground">No searches have been saved.</p> : null}
            </CardContent>
          </Card>
        </div>
      </WorkspaceGate>
    </>
  );
}

function CompanyFields({
  criteria,
  onChange,
}: {
  criteria: CompanySearchCriteria;
  onChange: (criteria: CompanySearchCriteria) => void;
}) {
  return (
    <>
      <Field label="Company name" value={criteria.companyName} onChange={(companyName) => onChange({ ...criteria, companyName })} />
      <Field label="Website" value={criteria.website} onChange={(website) => onChange({ ...criteria, website })} />
      <Field label="Industries" value={criteria.industries.join(", ")} onChange={(value) => onChange({ ...criteria, industries: split(value) })} />
      <Field label="Geographies" value={criteria.geographies.join(", ")} onChange={(value) => onChange({ ...criteria, geographies: split(value) })} />
      <Field label="Keywords" value={criteria.keywords.join(", ")} onChange={(value) => onChange({ ...criteria, keywords: split(value) })} />
      <Field label="Technologies" value={criteria.technologies.join(", ")} onChange={(value) => onChange({ ...criteria, technologies: split(value) })} />
    </>
  );
}

function ContactFields({
  criteria,
  onChange,
}: {
  criteria: ContactSearchCriteria;
  onChange: (criteria: ContactSearchCriteria) => void;
}) {
  return (
    <>
      <Field label="Company" value={criteria.companyName} onChange={(companyName) => onChange({ ...criteria, companyName })} />
      <Field label="Domain" value={criteria.companyDomain} onChange={(companyDomain) => onChange({ ...criteria, companyDomain })} />
      <Field label="Job titles" value={criteria.jobTitles.join(", ")} onChange={(value) => onChange({ ...criteria, jobTitles: split(value) })} />
      <Field label="Departments" value={criteria.departments.join(", ")} onChange={(value) => onChange({ ...criteria, departments: split(value) })} />
      <Field label="Seniority" value={criteria.seniority.join(", ")} onChange={(value) => onChange({ ...criteria, seniority: split(value) })} />
      <Field label="Locations" value={criteria.locations.join(", ")} onChange={(value) => onChange({ ...criteria, locations: split(value) })} />
    </>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function split(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
