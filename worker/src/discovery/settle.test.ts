import { describe, expect, it, vi } from "vitest";
import { settleDiscoveryJob } from "./settle.js";

describe("discovery credit settlement", () => {
  it("refunds the full reserve when the provider fails and the unused reserve when it succeeds", async () => {
    const ledger = { balance: 10 };
    const consume = vi.fn(async (amount: number) => {
      ledger.balance -= amount;
    });
    const refund = vi.fn(async (amount: number) => {
      ledger.balance += amount;
    });

    const failed = await settleDiscoveryJob({
      estimated: 4,
      consume,
      refund,
      run: async () => ({ ok: false, code: "rate_limited", message: "slow", creditsConsumed: 0 }),
    });
    expect(failed.ok).toBe(false);
    expect(ledger.balance).toBe(10);

    const succeeded = await settleDiscoveryJob({
      estimated: 4,
      consume,
      refund,
      run: async () => ({
        ok: true,
        records: [{ id: "1" }],
        creditsEstimated: 4,
        creditsConsumed: 1,
        duplicateCount: 0,
        notice: null,
      }),
    });
    expect(succeeded.ok).toBe(true);
    expect(ledger.balance).toBe(9);
  });
});
