import type { IcpCriteria } from "./icp.js";

export const SCORE_VERSION = "2026.1";

export const DEFAULT_SCORING_WEIGHTS = {
  icpMatch: 15,
  industryMatch: 15,
  companySizeMatch: 10,
  geographicMatch: 10,
  jobTitleMatch: 15,
  seniorityMatch: 10,
  technologyMatch: 10,
  buyingSignals: 10,
  dataCompleteness: 5,
} as const;

export type ScoringWeights = { [Key in keyof typeof DEFAULT_SCORING_WEIGHTS]: number };

export const scoringWeightsSchemaKeys = Object.keys(DEFAULT_SCORING_WEIGHTS) as Array<keyof ScoringWeights>;

export type ScoreSubject = {
  fullName: string | null;
  email: string | null;
  jobTitle: string | null;
  seniority: string | null;
  department: string | null;
  location: string | null;
  linkedinUrl: string | null;
  companyName: string | null;
  companyWebsite: string | null;
  industry: string | null;
  employeeCount: number | null;
  technologies: string[];
  buyingSignals: string[];
  businessModel: string | null;
};

export type ScoreFactor = { dimension: string; detail: string };

export type ScoreResult = {
  score: number;
  category: "strong_fit" | "moderate_fit" | "weak_fit" | "low_fit" | "insufficient_criteria";
  positiveFactors: ScoreFactor[];
  negativeFactors: ScoreFactor[];
  explanation: string;
  recommendedAction: "prioritize" | "review" | "nurture" | "deprioritize" | "collect_data";
  scoringVersion: typeof SCORE_VERSION;
  inputs: { subject: ScoreSubject; weights: ScoringWeights; icpSpecified: boolean };
};

type Dimension = {
  key: keyof ScoringWeights;
  label: string;
  applicable: boolean;
  score: number;
  detail: string;
};

function text(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function contains(haystack: string | null, needle: string): boolean {
  const left = text(haystack);
  const right = text(needle);
  return Boolean(left && right && (left.includes(right) || right.includes(left)));
}

function listMatch(haystack: string | null, needles: string[]): number | null {
  if (!needles.length) {
    return null;
  }
  if (!text(haystack)) {
    return 0;
  }
  return needles.some((needle) => contains(haystack, needle)) ? 100 : 0;
}

function overlapScore(have: string[], want: string[]): number | null {
  if (!want.length) {
    return null;
  }
  if (!have.length) {
    return 0;
  }
  const owned = new Set(have.map((item) => item.toLowerCase()));
  const hits = want.filter((item) => owned.has(item.toLowerCase())).length;
  return Math.round((hits / want.length) * 100);
}

export function scoreProspect(input: {
  subject: ScoreSubject;
  icp: IcpCriteria | null;
  weights?: Partial<ScoringWeights>;
}): ScoreResult {
  const weights: ScoringWeights = { ...DEFAULT_SCORING_WEIGHTS, ...input.weights };
  const weightTotal = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (weightTotal <= 0 || Object.values(weights).some((value) => value < 0)) {
    throw new Error("Scoring weights must be non-negative and total more than zero.");
  }

  const icp = input.icp;
  const subject = input.subject;
  const industryNeedles = [icp?.industry ?? "", icp?.subIndustry ?? ""].filter((value) => value.trim());
  const industry = listMatch(subject.industry, industryNeedles);
  const size = employeeScore(subject.employeeCount, icp);
  const geo = listMatch(subject.location, icp?.geography ?? []);
  const title = listMatch(subject.jobTitle, icp?.targetJobTitles ?? []);
  const seniority = listMatch(subject.seniority, icp?.seniority ?? []);
  const technology = overlapScore(subject.technologies, icp?.technologies ?? []);
  const signals = overlapScore(subject.buyingSignals, icp?.buyingSignals ?? []);
  const completeness = completenessScore(subject);

  const parts: Array<Omit<Dimension, "key" | "label"> & { key: keyof ScoringWeights; label: string }> = [
    { key: "industryMatch", label: "Industry", applicable: industry !== null, score: industry ?? 0, detail: detail("Industry", industry, subject.industry) },
    { key: "companySizeMatch", label: "Company size", applicable: size !== null, score: size ?? 0, detail: sizeDetail(size, subject.employeeCount) },
    { key: "geographicMatch", label: "Geography", applicable: geo !== null, score: geo ?? 0, detail: detail("Geography", geo, subject.location) },
    { key: "jobTitleMatch", label: "Job title", applicable: title !== null, score: title ?? 0, detail: detail("Job title", title, subject.jobTitle) },
    { key: "seniorityMatch", label: "Seniority", applicable: seniority !== null, score: seniority ?? 0, detail: detail("Seniority", seniority, subject.seniority) },
    { key: "technologyMatch", label: "Technology", applicable: technology !== null, score: technology ?? 0, detail: technology === null ? "No technology criterion." : technology === 0 && !subject.technologies.length ? "No technology data is recorded." : `Technology match is ${technology}.` },
    { key: "buyingSignals", label: "Buying signals", applicable: signals !== null, score: signals ?? 0, detail: signals === null ? "No buying-signal criterion." : signals === 0 ? "No recorded buying signal matches the ICP." : "Recorded buying signals match the ICP." },
  ];

  const specified = parts.filter((part) => part.applicable);
  const icpMatch = specified.length
    ? Math.round((specified.filter((part) => part.score >= 70).length / specified.length) * 100)
    : null;
  const dimensions: Dimension[] = [
    {
      key: "icpMatch",
      label: "ICP match",
      applicable: icpMatch !== null,
      score: icpMatch ?? 0,
      detail: icpMatch === null ? "No ICP criteria were available to compare." : `${icpMatch}% of comparable ICP criteria match.`,
    },
    ...parts,
    {
      key: "dataCompleteness",
      label: "Data completeness",
      applicable: true,
      score: completeness,
      detail: `Data completeness is ${completeness}%.`,
    },
  ];

  const applicable = dimensions.filter((dimension) => dimension.applicable);
  const applicableWeight = applicable.reduce((sum, dimension) => sum + weights[dimension.key], 0);
  const score = Math.round(
    applicable.reduce((sum, dimension) => sum + dimension.score * weights[dimension.key], 0) / applicableWeight,
  );

  const positiveFactors = applicable
    .filter((dimension) => dimension.score >= 70)
    .map((dimension) => ({ dimension: dimension.label, detail: dimension.detail }));
  const negativeFactors = applicable
    .filter((dimension) => dimension.score < 70)
    .map((dimension) => ({ dimension: dimension.label, detail: dimension.detail }));

  const insufficient = icpMatch === null;
  const category = insufficient
    ? "insufficient_criteria"
    : score >= 80
      ? "strong_fit"
      : score >= 60
        ? "moderate_fit"
        : score >= 40
          ? "weak_fit"
          : "low_fit";
  const recommendedAction = insufficient
    ? "collect_data"
    : category === "strong_fit"
      ? "prioritize"
      : category === "moderate_fit"
        ? "review"
        : category === "weak_fit"
          ? "nurture"
          : "deprioritize";

  const explanation = [
    `Score ${score}/100 (${category.replaceAll("_", " ")}).`,
    positiveFactors.length ? `Positive: ${positiveFactors.map((factor) => factor.detail).join(" ")}` : "No strong positive matches.",
    negativeFactors.length ? `Negative: ${negativeFactors.map((factor) => factor.detail).join(" ")}` : "No negative matches.",
    `Recommended action: ${recommendedAction.replaceAll("_", " ")}.`,
  ].join(" ");

  return {
    score,
    category,
    positiveFactors,
    negativeFactors,
    explanation,
    recommendedAction,
    scoringVersion: SCORE_VERSION,
    inputs: { subject, weights, icpSpecified: !insufficient },
  };
}

function employeeScore(count: number | null, icp: IcpCriteria | null): number | null {
  if (!icp) {
    return null;
  }
  const { min, max } = icp.employeeRange;
  if (min === null && max === null && !icp.companySize.trim()) {
    return null;
  }
  if (count === null) {
    return 0;
  }
  if (min !== null && count < min) {
    return 0;
  }
  if (max !== null && count > max) {
    return 0;
  }
  return 100;
}

function completenessScore(subject: ScoreSubject): number {
  const present = [
    subject.fullName,
    subject.email,
    subject.jobTitle,
    subject.seniority,
    subject.location,
    subject.companyName,
    subject.companyWebsite,
    subject.industry,
    subject.employeeCount,
    subject.technologies.length ? "yes" : "",
    subject.buyingSignals.length ? "yes" : "",
    subject.linkedinUrl,
  ].filter((value) => (typeof value === "number" ? true : Boolean(value && String(value).trim()))).length;
  return Math.round((present / 12) * 100);
}

function detail(label: string, score: number | null, value: string | null): string {
  if (score === null) {
    return `${label} was not part of the ICP.`;
  }
  if (!text(value)) {
    return `${label} is not recorded.`;
  }
  return score >= 70 ? `${label} matches the ICP.` : `${label} does not match the ICP.`;
}

function sizeDetail(score: number | null, count: number | null): string {
  if (score === null) {
    return "Company size was not part of the ICP.";
  }
  if (count === null) {
    return "Employee count is not recorded.";
  }
  return score >= 70 ? "Company size matches the ICP." : "Company size is outside the ICP range.";
}
