import type { DiscoveryJobFailure, DiscoveryJobSuccess } from "@prospectra/shared";

export async function settleDiscoveryJob<T>(input: {
  estimated: number;
  consume: (amount: number) => Promise<void>;
  refund: (amount: number) => Promise<void>;
  run: () => Promise<DiscoveryJobSuccess<T> | DiscoveryJobFailure>;
}): Promise<DiscoveryJobSuccess<T> | DiscoveryJobFailure> {
  if (input.estimated > 0) {
    await input.consume(input.estimated);
  }

  try {
    const result = await input.run();
    if (!result.ok) {
      if (input.estimated > 0) {
        await input.refund(input.estimated);
      }
      return result;
    }
    const unused = input.estimated - result.creditsConsumed;
    if (unused > 0) {
      await input.refund(unused);
    }
    return result;
  } catch (error) {
    if (input.estimated > 0) {
      await input.refund(input.estimated);
    }
    throw error;
  }
}
