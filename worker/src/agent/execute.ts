import {
  AGENT_MAX_COMPETITORS,
  CREDIT_COSTS,
  EMAIL_GENERATION_SYSTEM_PROMPT,
  acceptCompetitorCrawl,
  agentSegmentsJsonSchema,
  agentSegmentsOutputSchema,
  approvalCampaignAction,
  buildAgentSegmentMessages,
  companyDedupeKey,
  contactDedupeKey,
  emailGenerationJsonSchema,
  emailGenerationSchema,
  extractBusinessEvidence,
  normalizeEmail,
  parsePublicHttpUrl,
  runDiscoveryJob,
  unsupportedPersonalClaims,
  type AgentSegment,
  type CompetitorCrawlResult,
  type NormalizedContact,
} from "@prospectra/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createStructuredCompletion } from "../ai/openai.js";
import { executeWebsiteAnalysis } from "../analysis/execute.js";
import { describeProviders, type WorkerConfig } from "../config.js";
import { crawlWebsite } from "../crawl/crawler.js";
import { resolveHostname, requestPinned } from "../crawl/node-transport.js";
import { preferredDiscoveryClient, type DiscoveryClient } from "../providers/discovery-client.js";

type Admin = SupabaseClient;

export async function executeOutboundAgent(
  deps: { admin: Admin; config: WorkerConfig },
  payload: { runId: string; workspaceId: string; actorId?: string; reservationId?: string },
): Promise<void> {
  const { admin, config } = deps;
  const { data: run, error } = await admin.from("agent_runs").select("*").eq("id", payload.runId).eq("workspace_id", payload.workspaceId).maybeSingle();
  if (error || !run) {
    throw new Error(error?.message ?? "Agent run was not found.");
  }
  if (!config.openaiApiKey) {
    await failRun(admin, run.id, "PROVIDER_UNCONFIGURED", "OpenAI is not configured on the worker.", payload.reservationId, payload.actorId);
    throw new Error("OpenAI is not configured on the worker.");
  }

  const companyProvider = describeProviders(config).find((item) => item.role === "company_discovery");
  const contactProvider = describeProviders(config).find((item) => item.role === "contact_discovery");
  const discoveryConfigured =
    companyProvider?.state === "configured" && contactProvider?.state === "configured";

  await admin
    .from("agent_runs")
    .update({
      status: "running",
      error_code: null,
      error_detail: null,
      discovery_configured: discoveryConfigured,
    })
    .eq("id", run.id);

  let consumed = 0;
  try {
    const evidenceParts: string[] = [];
    let offerSummary = (run.offer_description as string | null)?.trim() || "";
    let websiteAnalysisId: string | null = run.website_analysis_id ?? null;

    const websiteUrl = (run.website_url as string | null)?.trim() || "";
    if (websiteUrl) {
      const analysisInsert = await admin
        .from("website_analyses")
        .insert({
          workspace_id: payload.workspaceId,
          submitted_url: websiteUrl,
          company_name: run.company_name || null,
          status: "running",
          created_by: payload.actorId ?? null,
        })
        .select("id")
        .single();
      if (analysisInsert.error || !analysisInsert.data) {
        throw new Error(analysisInsert.error?.message ?? "Could not save the website analysis.");
      }
      websiteAnalysisId = analysisInsert.data.id;
      const execution = await executeWebsiteAnalysis(
        {
          url: websiteUrl,
          companyName: run.company_name,
          openaiApiKey: config.openaiApiKey,
          openaiModel: config.openaiModel,
        },
        { resolve: resolveHostname, request: requestPinned },
      );
      await admin
        .from("website_analyses")
        .update({
          status: execution.status,
          normalized_domain: execution.normalizedDomain,
          extracted_content: execution.extractedContent,
          crawled_urls: execution.crawledUrls,
          ai_output: execution.aiOutput,
          ai_model: execution.aiModel,
          usage: execution.usage,
          error_code: execution.errorCode,
          error_detail: execution.errorDetail,
        })
        .eq("id", websiteAnalysisId);
      if (execution.status !== "succeeded" || !execution.aiOutput) {
        throw new Error(execution.errorDetail ?? "Website analysis failed.");
      }
      consumed += CREDIT_COSTS.outboundAgentResearch;
      offerSummary =
        execution.aiOutput.companyOverview ||
        execution.aiOutput.valueProposition ||
        offerSummary ||
        "Offer summarised from the website crawl.";
      evidenceParts.push(JSON.stringify(execution.aiOutput));
      evidenceParts.push(
        (execution.extractedContent.excerpts ?? [])
          .slice(0, 12)
          .map((excerpt) => excerpt.text)
          .join("\n"),
      );
    } else {
      offerSummary = offerSummary || "Offer described by the workspace.";
      evidenceParts.push(offerSummary);
      consumed += CREDIT_COSTS.outboundAgentResearch;
    }

    const segmentCompletion = await createStructuredCompletion({
      apiKey: config.openaiApiKey,
      model: config.openaiModel,
      schemaName: "outbound_agent_segments",
      jsonSchema: agentSegmentsJsonSchema,
      messages: buildAgentSegmentMessages({
        offerSummary,
        companyName: run.company_name ?? undefined,
        evidence: evidenceParts.join("\n\n"),
      }),
      parse: (value) => agentSegmentsOutputSchema.parse(value),
      maxTokens: 2200,
    });

    const competitors: CompetitorCrawlResult[] = [];
    for (const candidate of segmentCompletion.data.competitorCandidates.slice(0, AGENT_MAX_COMPETITORS)) {
      const parsed = parsePublicHttpUrl(candidate.websiteUrl);
      if (!parsed.ok) {
        continue;
      }
      const crawled = await crawlWebsite(parsed.url.toString(), { resolve: resolveHostname, request: requestPinned });
      if (!crawled.ok) {
        continue;
      }
      const extracted = extractBusinessEvidence(
        crawled.pages.map((page) => ({ url: page.url, html: page.html, title: page.title })),
      );
      const accepted = acceptCompetitorCrawl({
        name: candidate.name,
        websiteUrl: parsed.url.toString(),
        crawlOk: true,
        pageCount: crawled.pages.length,
        evidenceText: [
          extracted.description,
          extracted.valueProposition,
          ...(extracted.excerpts ?? []).map((excerpt) => excerpt.text),
        ]
          .filter(Boolean)
          .join("\n")
          .slice(0, 4000),
      });
      if (accepted) {
        competitors.push(accepted);
        evidenceParts.push(`Competitor ${accepted.name} (${accepted.websiteUrl}):\n${accepted.evidenceText}`);
      }
    }

    const finalOfferSummary = segmentCompletion.data.offerSummary || offerSummary;
    const segments = segmentCompletion.data.segments;

    const { data: mailbox } = await admin
      .from("connected_accounts")
      .select("id")
      .eq("workspace_id", payload.workspaceId)
      .eq("kind", "email")
      .eq("status", "connected")
      .limit(1)
      .maybeSingle();

    await admin
      .from("agent_runs")
      .update({
        offer_summary: finalOfferSummary,
        website_analysis_id: websiteAnalysisId,
        competitors,
        discovery_configured: discoveryConfigured,
        mailbox_connected: Boolean(mailbox),
      })
      .eq("id", run.id);

    const discovery = discoveryConfigured ? preferredDiscoveryClient(config) : null;
    const prospectCap = Number(run.prospect_cap ?? 10);

    let position = 1;
    for (const segment of segments) {
      const created = await materializeSegment({
        admin,
        config,
        discovery,
        discoveryConfigured,
        workspaceId: payload.workspaceId,
        runId: run.id,
        actorId: payload.actorId,
        position,
        segment,
        prospectCap,
        offerSummary: finalOfferSummary,
        companyName: run.company_name,
      });
      consumed += created.credits;
      position += 1;
    }

    if (payload.reservationId) {
      await admin.rpc("settle_workspace_credits", {
        p_reservation_id: payload.reservationId,
        p_actual: Math.min(consumed, Number(run.reserved_credits ?? consumed)),
        p_actor: payload.actorId ?? null,
      });
    }

    await admin
      .from("agent_runs")
      .update({
        status: "awaiting_approval",
        consumed_credits: Math.min(consumed, Number(run.reserved_credits ?? consumed)),
        reservation_id: null,
      })
      .eq("id", run.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The outbound agent failed.";
    const code = message.toLowerCase().includes("not configured") ? "PROVIDER_UNCONFIGURED" : "AGENT_FAILED";
    await failRun(admin, run.id, code, message, payload.reservationId, payload.actorId);
    throw error instanceof Error ? error : new Error(message);
  }
}

async function failRun(
  admin: Admin,
  runId: string,
  code: string,
  detail: string,
  reservationId: string | undefined,
  actorId: string | undefined,
): Promise<void> {
  if (reservationId) {
    await admin.rpc("release_workspace_credits", { p_reservation_id: reservationId, p_actor: actorId ?? null });
  }
  await admin
    .from("agent_runs")
    .update({
      status: "failed",
      error_code: code,
      error_detail: detail,
      reservation_id: null,
    })
    .eq("id", runId);
}

async function materializeSegment(input: {
  admin: Admin;
  config: WorkerConfig;
  discovery: DiscoveryClient | null;
  discoveryConfigured: boolean;
  workspaceId: string;
  runId: string;
  actorId?: string;
  position: number;
  segment: AgentSegment;
  prospectCap: number;
  offerSummary: string;
  companyName: string | null;
}): Promise<{ credits: number }> {
  let credits = 0;
  let discoveryState: "configured" | "unconfigured" | "partial" | "failed" = input.discoveryConfigured
    ? "configured"
    : "unconfigured";
  let setupMessage: string | null = input.discoveryConfigured
    ? null
    : "Company and contact discovery is not configured. Set EnrichLayer (LinkedIn) credentials on the worker. No people were invented.";
  const prospectIds: string[] = [];
  const draftIds: string[] = [];

  const { data: list } = await input.admin
    .from("prospect_lists")
    .insert({
      workspace_id: input.workspaceId,
      name: `Agent · ${input.segment.name}`.slice(0, 120),
      description: input.segment.whoBuys.slice(0, 500),
      created_by: input.actorId ?? null,
    })
    .select("id")
    .single();

  const { data: icp } = await input.admin
    .from("icp_profiles")
    .insert({
      workspace_id: input.workspaceId,
      name: `Agent · ${input.segment.name}`.slice(0, 120),
      description: input.segment.whoBuys.slice(0, 2000),
      status: "active",
      source: "ai_discovery",
      criteria: {
        industry: input.segment.industries[0] ?? "",
        subIndustry: "",
        geography: input.segment.geographies,
        companySize: "",
        employeeRange: { min: null, max: null },
        revenueRange: { min: null, max: null, currency: "USD" },
        businessModel: "",
        technologies: [],
        targetJobTitles: input.segment.jobTitles,
        departments: [],
        seniority: [],
        painPoints: [],
        buyingSignals: [],
        exclusionCriteria: [],
      },
      created_by: input.actorId ?? null,
    })
    .select("id")
    .single();

  if (input.discovery && input.discoveryConfigured) {
    try {
      const retrievedAt = new Date().toISOString();
      const companyResult = await runDiscoveryJob({
        kind: "company",
        pageSize: Math.min(10, input.prospectCap),
        balance: CREDIT_COSTS.companyDiscoveryPerResult * Math.min(10, input.prospectCap),
        existingKeys: [],
        keyOf: companyDedupeKey,
        markExisting: (record) => record,
        search: () =>
          input.discovery!.searchCompanies(
            {
              companyName: "",
              industries: input.segment.industries,
              geographies: input.segment.geographies,
              employeeMin: null,
              employeeMax: null,
              revenueMin: null,
              revenueMax: null,
              companyType: "",
              website: "",
              keywords: input.segment.keywords,
              technologies: [],
              businessModel: "",
              buyingSignals: [],
            },
            1,
            Math.min(10, input.prospectCap),
            retrievedAt,
          ),
      });
      if (companyResult.ok) {
        credits += companyResult.creditsConsumed;
      }

      const contactResult = await runDiscoveryJob({
        kind: "contact",
        pageSize: input.prospectCap,
        balance: CREDIT_COSTS.contactDiscoveryPerResult * input.prospectCap,
        existingKeys: [],
        keyOf: contactDedupeKey,
        markExisting: (record) => record,
        search: async () => {
          const result = await input.discovery!.searchContacts(
            {
              companyName: "",
              companyDomain: "",
              jobTitles: input.segment.jobTitles.length ? input.segment.jobTitles : ["Founder", "Owner", "CEO"],
              departments: [],
              seniority: [],
              locations: input.segment.geographies,
              professionalProfile: input.segment.keywords.slice(0, 3).join(" "),
              requireEmail: false,
            },
            1,
            input.prospectCap,
            retrievedAt,
          );
          return {
            records: result.records.filter((record) => record.linkedinUrl || record.email),
            partial: result.partial || result.records.some((record) => !record.email),
          };
        },
      });
      if (!contactResult.ok) {
        discoveryState = "failed";
        setupMessage = contactResult.message;
      } else {
        credits += contactResult.creditsConsumed;
        let missingEmail = 0;
        for (const contact of contactResult.records as NormalizedContact[]) {
          const prospectId = await upsertProspect(input.admin, input.workspaceId, contact, input.actorId);
          if (!prospectId) {
            continue;
          }
          prospectIds.push(prospectId);
          if (list?.id) {
            await input.admin.from("prospect_list_members").upsert(
              {
                workspace_id: input.workspaceId,
                list_id: list.id,
                prospect_id: prospectId,
              },
              { onConflict: "list_id,prospect_id" },
            );
          }
          if (!contact.email) {
            missingEmail += 1;
            continue;
          }
          if (!input.config.openaiApiKey) {
            continue;
          }
          try {
            const draft = await createStructuredCompletion({
              apiKey: input.config.openaiApiKey,
              model: input.config.openaiModel,
              schemaName: "sales_email",
              jsonSchema: emailGenerationJsonSchema,
              messages: [
                { role: "system", content: EMAIL_GENERATION_SYSTEM_PROMPT },
                {
                  role: "user",
                  content: [
                    "<untrusted_context>",
                    `Offer: ${input.offerSummary}`,
                    `Segment: ${input.segment.name} — ${input.segment.whoBuys}`,
                    `Evidence: ${input.segment.evidenceNote}`,
                    `Prospect: ${contact.fullName ?? ""} ${contact.jobTitle ?? ""} ${contact.companyName ?? ""}`,
                    `LinkedIn: ${contact.linkedinUrl ?? ""}`,
                    `Company website: ${contact.companyDomain ?? ""}`,
                    "</untrusted_context>",
                    "Type: cold_introduction",
                    "Tone: direct",
                    "Length: short",
                    `Objective: Introduce ${input.companyName || "our product"} to this buyer segment.`,
                    "CTA: Ask whether a short call would help.",
                  ].join("\n"),
                },
              ],
              parse: (value) => emailGenerationSchema.parse(value),
              maxTokens: 900,
            });
            const evidenceText = `${input.offerSummary}\n${input.segment.evidenceNote}\n${contact.fullName}\n${contact.companyName}`;
            const warnings = unsupportedPersonalClaims(`${draft.data.subject}\n${draft.data.body}`, evidenceText);
            const { data: saved } = await input.admin
              .from("email_drafts")
              .insert({
                workspace_id: input.workspaceId,
                prospect_id: prospectId,
                icp_id: icp?.id ?? null,
                email_type: "cold_introduction",
                tone: "direct",
                length: "short",
                call_to_action: draft.data.suggestedCta,
                subject: draft.data.subject,
                body: draft.data.body,
                explanation: draft.data.explanation,
                variables: draft.data.personalisationVariables,
                warnings,
                model: draft.model,
                usage: draft.usage,
                created_by: input.actorId ?? null,
              })
              .select("id")
              .single();
            if (saved?.id) {
              draftIds.push(saved.id);
              credits += CREDIT_COSTS.emailGeneration;
            }
          } catch {
            // Leave the prospect without a draft rather than inventing one.
          }
        }
        if (prospectIds.length === 0) {
          discoveryState = "partial";
          setupMessage = "LinkedIn discovery returned no usable contacts for this segment.";
        } else if (missingEmail > 0 || draftIds.length === 0) {
          discoveryState = "partial";
          setupMessage =
            "LinkedIn discovery found profiles, but some are missing email addresses. Drafts are only created when a real email is present.";
        }
      }
    } catch (error) {
      discoveryState = "failed";
      setupMessage = error instanceof Error ? error.message : "Discovery failed for this segment.";
    }
  }

  await input.admin.from("agent_segments").insert({
    workspace_id: input.workspaceId,
    run_id: input.runId,
    position: input.position,
    name: input.segment.name,
    who_buys: input.segment.whoBuys,
    fit_score: input.segment.fitScore,
    evidence_note: input.segment.evidenceNote,
    job_titles: input.segment.jobTitles,
    industries: input.segment.industries,
    geographies: input.segment.geographies,
    keywords: input.segment.keywords,
    status: "draft",
    discovery_state: discoveryState,
    setup_message: setupMessage,
    prospect_ids: prospectIds,
    draft_ids: draftIds,
    list_id: list?.id ?? null,
    icp_profile_id: icp?.id ?? null,
    credits_spent: credits,
  });

  return { credits };
}

async function upsertProspect(
  admin: Admin,
  workspaceId: string,
  contact: NormalizedContact,
  actorId?: string,
): Promise<string | null> {
  const email = contact.email ? normalizeEmail(contact.email) : null;
  let companyId: string | null = null;
  const domain = contact.companyDomain?.trim() || null;
  if (domain || contact.companyName) {
    const existingCompany = domain
      ? await admin.from("companies").select("id").eq("workspace_id", workspaceId).eq("domain", domain).maybeSingle()
      : { data: null };
    if (existingCompany.data?.id) {
      companyId = existingCompany.data.id;
    } else {
      const inserted = await admin
        .from("companies")
        .insert({
          workspace_id: workspaceId,
          name: contact.companyName || domain || "Unknown company",
          domain,
          normalized_domain: domain,
          website_url: domain ? `https://${domain}` : null,
        })
        .select("id")
        .single();
      companyId = inserted.data?.id ?? null;
    }
  }

  if (email) {
    const existing = await admin
      .from("prospects")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("normalized_email", email)
      .maybeSingle();
    if (existing.data?.id) {
      return existing.data.id;
    }
  }

  if (contact.linkedinUrl) {
    const existingProfile = await admin
      .from("prospects")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("linkedin_url", contact.linkedinUrl)
      .maybeSingle();
    if (existingProfile.data?.id) {
      return existingProfile.data.id;
    }
  }

  if (!email && !contact.linkedinUrl) {
    return null;
  }

  const inserted = await admin
    .from("prospects")
    .insert({
      workspace_id: workspaceId,
      company_id: companyId,
      full_name: contact.fullName || contact.email || contact.linkedinUrl || "Unknown contact",
      email: contact.email,
      normalized_email: email,
      job_title: contact.jobTitle,
      department: contact.department,
      seniority: contact.seniority,
      location: contact.location,
      linkedin_url: contact.linkedinUrl,
      stage: "NEW",
      source: "agent",
      owner_user_id: actorId ?? null,
      tags: ["agent"],
    })
    .select("id")
    .single();
  return inserted.data?.id ?? null;
}

export async function approveAgentSegment(
  deps: { admin: Admin; config: WorkerConfig },
  input: { workspaceId: string; segmentId: string; userId: string },
): Promise<{
  segmentId: string;
  campaignId: string | null;
  action: "activate" | "leave_draft";
  status: string;
  estimatedSendCredits: number;
  setupMessage: string | null;
}> {
  const { admin } = deps;
  const { data: segment } = await admin
    .from("agent_segments")
    .select("*")
    .eq("id", input.segmentId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle();
  if (!segment) {
    throw Object.assign(new Error("Segment was not found."), { category: "validation" as const });
  }
  if (segment.approved_at) {
    throw Object.assign(new Error("This segment was already approved."), { category: "validation" as const });
  }
  if (!segment.prospect_ids?.length) {
    throw Object.assign(
      new Error("This segment has no prospects to enroll. Discovery must return people first."),
      { category: "validation" as const },
    );
  }

  const { data: drafts } = await admin
    .from("email_drafts")
    .select("id, subject, body")
    .eq("workspace_id", input.workspaceId)
    .in("id", segment.draft_ids ?? []);
  const firstDraft = drafts?.[0];
  if (!firstDraft?.subject || !firstDraft.body) {
    throw Object.assign(
      new Error("This segment has no email drafts to send. Approve only after drafts exist."),
      { category: "validation" as const },
    );
  }

  const { data: mailbox } = await admin
    .from("connected_accounts")
    .select("id, status")
    .eq("workspace_id", input.workspaceId)
    .eq("kind", "email")
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();
  const action = approvalCampaignAction(Boolean(mailbox));
  const estimatedSendCredits = (segment.prospect_ids as string[]).length * CREDIT_COSTS.emailSend;

  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .insert({
      workspace_id: input.workspaceId,
      name: `Agent · ${segment.name}`.slice(0, 120),
      description: segment.who_buys,
      objective: `First-touch outreach for ${segment.name}`,
      status: "DRAFT",
      list_id: segment.list_id,
      audience_ids: segment.prospect_ids,
      sending_account_id: mailbox?.id ?? null,
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (campaignError || !campaign) {
    throw Object.assign(new Error(campaignError?.message ?? "Could not create the campaign."), {
      category: "temporary" as const,
    });
  }

  await admin.from("campaign_steps").insert({
    workspace_id: input.workspaceId,
    campaign_id: campaign.id,
    position: 1,
    subject: firstDraft.subject,
    body: firstDraft.body,
    delay_days: 0,
  });

  let setupMessage: string | null = null;
  let status = "draft";

  if (action === "activate") {
    // Enroll and activate using the same rules as campaign activation.
    const credits = estimatedSendCredits;
    const { error: consumeError } = await admin.rpc("consume_workspace_credits", {
      p_workspace_id: input.workspaceId,
      p_amount: credits,
      p_reason: "campaign_enrollment",
      p_reference_type: "campaign",
      p_reference_id: campaign.id,
      p_actor: input.userId,
    });
    if (consumeError) {
      throw Object.assign(new Error(consumeError.message), {
        category: (consumeError.message.toLowerCase().includes("insufficient") ? "quota" : "temporary") as
          | "quota"
          | "temporary",
      });
    }
    for (const prospectId of segment.prospect_ids as string[]) {
      const { data: enrollment } = await admin
        .from("campaign_enrollments")
        .insert({
          workspace_id: input.workspaceId,
          campaign_id: campaign.id,
          prospect_id: prospectId,
          status: "active",
        })
        .select("id")
        .single();
      if (!enrollment) {
        continue;
      }
      await admin.from("outreach_jobs").insert({
        workspace_id: input.workspaceId,
        campaign_id: campaign.id,
        enrollment_id: enrollment.id,
        step_position: 1,
        run_at: new Date().toISOString(),
        idempotency_key: `${enrollment.id}:1`,
      });
    }
    await admin
      .from("campaigns")
      .update({ status: "ACTIVE", activated_at: new Date().toISOString() })
      .eq("id", campaign.id);
    status = "working";
  } else {
    setupMessage =
      "A connected mailbox is required before Prospectra can send. The campaign was saved as a draft and nothing was sent.";
  }

  await admin
    .from("agent_segments")
    .update({
      campaign_id: campaign.id,
      status,
      approved_at: new Date().toISOString(),
      approved_by: input.userId,
      setup_message: setupMessage ?? segment.setup_message,
      credits_spent: Number(segment.credits_spent ?? 0) + (action === "activate" ? estimatedSendCredits : 0),
    })
    .eq("id", segment.id);

  const { data: siblings } = await admin.from("agent_segments").select("id, approved_at").eq("run_id", segment.run_id);
  const approvedCount = (siblings ?? []).filter((row) => row.approved_at || row.id === segment.id).length;
  const runStatus = approvedCount >= (siblings?.length ?? 0) ? "completed" : "partially_approved";
  await admin.from("agent_runs").update({ status: runStatus }).eq("id", segment.run_id);

  return {
    segmentId: segment.id,
    campaignId: campaign.id,
    action,
    status,
    estimatedSendCredits,
    setupMessage,
  };
}
