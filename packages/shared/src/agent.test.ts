import { describe, expect, it } from "vitest";
import {
  acceptCompetitorCrawl,
  agentSegmentSchema,
  agentStartInputSchema,
  approvalCampaignAction,
  costPerLead,
  estimateAgentCredits,
  segmentStatusFromPerformance,
} from "./agent.js";

describe("outbound agent rules", () => {
  it("rejects segments without evidence and accepts scored segments", () => {
    expect(() =>
      agentSegmentSchema.parse({
        name: "Event designers",
        whoBuys: "Studios that stage large installs",
        fitScore: 92,
        evidenceNote: "",
      }),
    ).toThrow();
    const ok = agentSegmentSchema.parse({
      name: "Event designers",
      whoBuys: "Studios that stage large installs",
      fitScore: 92,
      evidenceNote: "Website lists event design as a primary market.",
    });
    expect(ok.fitScore).toBe(92);
  });

  it("requires a website or a written offer", () => {
    expect(agentStartInputSchema.safeParse({ workspaceId: "11111111-1111-4111-8111-111111111111" }).success).toBe(
      false,
    );
    expect(
      agentStartInputSchema.safeParse({
        workspaceId: "11111111-1111-4111-8111-111111111111",
        offerDescription: "We sell wholesale silk flowers to hotels and florists across the northeast.",
      }).success,
    ).toBe(true);
  });

  it("accepts competitors only after a successful crawl", () => {
    expect(
      acceptCompetitorCrawl({
        name: "Afloral",
        websiteUrl: "https://afloral.com",
        crawlOk: false,
        pageCount: 0,
      }),
    ).toBeNull();
    expect(
      acceptCompetitorCrawl({
        name: "Afloral",
        websiteUrl: "https://afloral.com",
        crawlOk: true,
        pageCount: 2,
        evidenceText: "Wholesale silk flowers",
      }),
    ).toMatchObject({ crawled: true, pageCount: 2 });
    expect(
      acceptCompetitorCrawl({
        name: "Local",
        websiteUrl: "http://127.0.0.1/secret",
        crawlOk: true,
        pageCount: 3,
      }),
    ).toBeNull();
  });

  it("keeps cost per lead null without replies and derives segment status from real activity", () => {
    expect(costPerLead(40, 0)).toBeNull();
    expect(costPerLead(40, 4)).toBe(10);
    expect(segmentStatusFromPerformance({ approved: false, sends: 0, positiveReplies: 0, creditsSpent: 0 })).toBe(
      "draft",
    );
    expect(segmentStatusFromPerformance({ approved: true, sends: 2, positiveReplies: 0, creditsSpent: 4 })).toBe(
      "working",
    );
    expect(segmentStatusFromPerformance({ approved: true, sends: 6, positiveReplies: 0, creditsSpent: 12 })).toBe(
      "paused",
    );
    expect(
      segmentStatusFromPerformance({ approved: true, sends: 10, positiveReplies: 4, creditsSpent: 12 }),
    ).toBe("scaling");
  });

  it("leaves campaigns in draft when no mailbox is connected", () => {
    expect(approvalCampaignAction(false)).toBe("leave_draft");
    expect(approvalCampaignAction(true)).toBe("activate");
    expect(estimateAgentCredits(10, 3)).toBeGreaterThan(0);
  });
});
