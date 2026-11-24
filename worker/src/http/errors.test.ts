import { describe, expect, it, vi } from "vitest";
import { clientSafeError, HttpError } from "./errors.js";

describe("client error sanitising", () => {
  it("hides internal database messages and keeps configuration messages", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const leaked = clientSafeError(new HttpError(500, "INTERNAL", "duplicate key value violates constraint"));
    expect(leaked.message).toBe("The request could not be completed.");
    expect(leaked.code).toBe("INTERNAL");

    const unconfigured = clientSafeError(
      new HttpError(503, "PROVIDER_UNCONFIGURED", "Stripe is not configured. Set STRIPE_SECRET_KEY on the worker."),
    );
    expect(unconfigured.message).toContain("Stripe is not configured");
    expect(unconfigured.statusCode).toBe(503);
  });
});
