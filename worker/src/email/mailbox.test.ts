import { describe, expect, it, vi } from "vitest";
import { ProviderRequestError } from "../providers/errors.js";
import { handleClaimedJob } from "../campaigns/process.js";
import { decryptJson, encryptJson, readState, signState } from "../credentials/crypto.js";
import { buildRfc822, createMailbox } from "./mailbox.js";

const active = {
  reconcile: false,
  attempts: 0,
  maxAttempts: 3,
  campaignStatus: "ACTIVE",
  enrollmentStatus: "active",
  suppressed: false,
  insideWindow: true,
  sentToday: 0,
  dailyLimit: 10,
};

describe("mailbox and outreach safety", () => {
  it("encrypts tokens and rejects a tampered oauth state", () => {
    const encrypted = encryptJson({ refreshToken: "secret-token" }, "key-material");
    expect(encrypted).not.toContain("secret-token");
    expect(decryptJson(encrypted, "key-material")).toEqual({ refreshToken: "secret-token" });
    const state = signState({ workspaceId: "w", userId: "u", provider: "gmail", kind: "email" }, "key-material");
    expect(readState(state, "key-material").workspaceId).toBe("w");
    expect(() => readState(`${state}x`, "key-material")).toThrow(/Invalid OAuth state/);
  });

  it("records Gmail acceptance without calling it delivered", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ id: "msg_1", threadId: "th_1" }));
    const mailbox = createMailbox(fetchImpl as typeof fetch);
    const raw = buildRfc822({ from: "ada@example.com", to: "prospect@example.com", subject: "Hello", body: "Hi", messageId: "job-1@prospectra.local" });
    const result = await mailbox.sendGmail("token", raw);
    expect(result.deliveryState).toBe("accepted");
    expect(result.providerMessageId).toBe("msg_1");
    expect(JSON.stringify(fetchImpl.mock.calls)).toContain("gmail.googleapis.com");
  });

  it("does not send again when a previous attempt is ambiguous", async () => {
    const send = vi.fn(async () => {
      throw new ProviderRequestError("timeout", "timed out");
    });
    const reconcile = vi.fn(async () => null);
    const updates: string[] = [];
    await handleClaimedJob(active, {
      now: new Date("2026-01-05T15:00:00.000Z"),
      send,
      reconcile,
      update: async (patch) => {
        updates.push(patch.status);
      },
    });
    expect(send).toHaveBeenCalledOnce();
    expect(updates).toEqual(["needs_reconciliation"]);

    send.mockClear();
    await handleClaimedJob(
      { ...active, reconcile: true },
      {
        now: new Date("2026-01-05T15:10:00.000Z"),
        send,
        reconcile,
        update: async (patch) => {
          updates.push(patch.status);
        },
      },
    );
    expect(send).not.toHaveBeenCalled();
    expect(reconcile).toHaveBeenCalledOnce();
  });
});
