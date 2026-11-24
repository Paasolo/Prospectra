import { describe, expect, it } from "vitest";
import { approvalCampaignAction } from "@prospectra/shared";

describe("agent segment approval", () => {
  it("leaves the campaign in draft when no mailbox is connected", () => {
    expect(approvalCampaignAction(false)).toBe("leave_draft");
  });

  it("activates only when a mailbox is connected", () => {
    expect(approvalCampaignAction(true)).toBe("activate");
  });
});
