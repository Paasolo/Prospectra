import { describe, expect, it } from "vitest";
import { formatAppIdentity } from "./utils.js";

describe("formatAppIdentity", () => {
  it("returns the Prospectra brand identity string", () => {
    expect(formatAppIdentity()).toBe(
      "Prospectra — Find Better Prospects. Build Better Connections.",
    );
  });
});
