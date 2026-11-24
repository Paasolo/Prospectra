import { z } from "zod";
import { normalizeDomain } from "./ssrf.js";

export const PROSPECT_STAGES = [
  "NEW",
  "QUALIFIED",
  "CONTACTED",
  "ENGAGED",
  "MEETING_BOOKED",
  "CUSTOMER",
  "DISQUALIFIED",
] as const;

export type ProspectStage = (typeof PROSPECT_STAGES)[number];

export const PROSPECT_ACTIVITY_TYPES = [
  "prospect_created",
  "prospect_updated",
  "assigned",
  "status_changed",
  "enrichment_requested",
  "enrichment_completed",
  "email_generated",
  "email_sent",
  "email_response_received",
  "campaign_enrollment",
  "meeting_booked",
  "note_added",
  "prospect_merged",
] as const;

export type ProspectActivityType = (typeof PROSPECT_ACTIVITY_TYPES)[number];

export function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }
  return email;
}

export const prospectDraftSchema = z.object({
  fullName: z.string().trim().max(160).optional().default(""),
  email: z.string().trim().max(200).optional().default(""),
  jobTitle: z.string().trim().max(160).optional().default(""),
  companyName: z.string().trim().max(200).optional().default(""),
  companyDomain: z.string().trim().max(200).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  department: z.string().trim().max(80).optional().default(""),
  seniority: z.string().trim().max(40).optional().default(""),
  location: z.string().trim().max(160).optional().default(""),
  linkedinUrl: z.string().trim().max(300).optional().default(""),
  stage: z.enum(PROSPECT_STAGES).optional().default("NEW"),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional().default([]),
});

export type ProspectDraft = z.infer<typeof prospectDraftSchema>;

export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (quoted && char === '"' && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && char === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }
  return rows;
}

export const CSV_PROSPECT_FIELDS = [
  "fullName",
  "email",
  "jobTitle",
  "companyName",
  "companyDomain",
  "phone",
  "department",
  "seniority",
  "location",
  "linkedinUrl",
  "stage",
  "tags",
] as const;

export type CsvProspectField = (typeof CSV_PROSPECT_FIELDS)[number];

export type CsvImportRow = {
  rowNumber: number;
  draft: ProspectDraft | null;
  errors: string[];
  duplicateOf: string | null;
};

export function mapCsvImport(input: {
  headers: string[];
  rows: string[][];
  mapping: Partial<Record<CsvProspectField, string>>;
  existingEmails: string[];
  existingDomains: string[];
}): CsvImportRow[] {
  const headerIndex = new Map(input.headers.map((header, index) => [header, index]));
  const seenEmails = new Set(input.existingEmails.map((email) => email.toLowerCase()));
  const seenDomains = new Set(input.existingDomains.map((domain) => domain.toLowerCase()));

  return input.rows.map((row, index) => {
    const read = (field: CsvProspectField) => {
      const header = input.mapping[field];
      if (!header) {
        return "";
      }
      const column = headerIndex.get(header);
      return column === undefined ? "" : (row[column] ?? "");
    };
    const tags = read("tags")
      .split(/[|;]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    const parsed = prospectDraftSchema.safeParse({
      fullName: read("fullName"),
      email: read("email"),
      jobTitle: read("jobTitle"),
      companyName: read("companyName"),
      companyDomain: read("companyDomain"),
      phone: read("phone"),
      department: read("department"),
      seniority: read("seniority"),
      location: read("location"),
      linkedinUrl: read("linkedinUrl"),
      stage: read("stage") || "NEW",
      tags,
    });
    const errors: string[] = [];
    if (!parsed.success) {
      errors.push(...parsed.error.issues.map((issue) => issue.message));
      return { rowNumber: index + 2, draft: null, errors, duplicateOf: null };
    }
    const draft = parsed.data;
    if (!draft.fullName && !draft.email && !draft.companyName) {
      errors.push("Add a name, email, or company.");
    }
    if (draft.email && !normalizeEmail(draft.email)) {
      errors.push("Email is not valid.");
    }
    const email = normalizeEmail(draft.email);
    const domain = normalizeDomain(draft.companyDomain);
    let duplicateOf: string | null = null;
    if (email && seenEmails.has(email)) {
      duplicateOf = `email:${email}`;
    } else if (domain && draft.fullName && seenDomains.has(domain)) {
      duplicateOf = `domain:${domain}`;
    }
    if (email) {
      seenEmails.add(email);
    }
    return { rowNumber: index + 2, draft: errors.length ? null : draft, errors, duplicateOf };
  });
}

export type DuplicateCandidate = {
  leftId: string;
  rightId: string;
  reason: string;
  confidence: "likely" | "uncertain";
};

export type DuplicateRecord = {
  id: string;
  fullName: string | null;
  normalizedEmail: string | null;
  domain: string | null;
  linkedinUrl: string | null;
};

function nameTokens(name: string | null): Set<string> {
  return new Set(
    (name ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1),
  );
}

function similarName(left: string | null, right: string | null): boolean {
  const a = nameTokens(left);
  const b = nameTokens(right);
  if (!a.size || !b.size) {
    return false;
  }
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) {
      shared += 1;
    }
  }
  return shared / Math.min(a.size, b.size) >= 0.5;
}

export function findDuplicatePairs(records: DuplicateRecord[]): DuplicateCandidate[] {
  const pairs: DuplicateCandidate[] = [];
  for (let left = 0; left < records.length; left += 1) {
    for (let right = left + 1; right < records.length; right += 1) {
      const a = records[left]!;
      const b = records[right]!;
      if (a.normalizedEmail && a.normalizedEmail === b.normalizedEmail) {
        pairs.push({
          leftId: a.id,
          rightId: b.id,
          reason: "Same normalized email",
          confidence: "likely",
        });
        continue;
      }
      if (a.linkedinUrl && b.linkedinUrl && a.linkedinUrl.toLowerCase() === b.linkedinUrl.toLowerCase()) {
        pairs.push({
          leftId: a.id,
          rightId: b.id,
          reason: "Same professional profile URL",
          confidence: "likely",
        });
        continue;
      }
      if (a.domain && a.domain === b.domain && similarName(a.fullName, b.fullName)) {
        pairs.push({
          leftId: a.id,
          rightId: b.id,
          reason: "Same company domain and similar name",
          confidence: "uncertain",
        });
      }
    }
  }
  return pairs;
}

export function prospectsToCsv(
  rows: Array<{
    fullName: string | null;
    email: string | null;
    jobTitle: string | null;
    companyName: string | null;
    stage: string;
    tags: string[];
  }>,
): string {
  const header = ["full_name", "email", "job_title", "company", "stage", "tags"];
  const body = rows.map((row) =>
    [row.fullName, row.email, row.jobTitle, row.companyName, row.stage, row.tags.join("|")]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...body].join("\n");
}

function csvCell(value: string | null): string {
  const text = value ?? "";
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
