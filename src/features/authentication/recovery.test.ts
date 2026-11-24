import { describe, expect, it } from "vitest";
import { recoveryIntentFromUrl, rememberRecoveryIntent, resetPasswordView } from "./recovery";

describe("password recovery", () => {
  it("recognises a recovery link and ignores other hashes", () => {
    expect(recoveryIntentFromUrl("https://app.example/reset-password#access_token=abc&type=recovery")).toBe(true);
    expect(recoveryIntentFromUrl("https://app.example/reset-password#access_token=abc&type=signup")).toBe(false);
    expect(recoveryIntentFromUrl("https://app.example/reset-password")).toBe(false);
  });

  it("remembers a recovery link until the page reads it again", () => {
    const stored = new Map<string, string>();
    const storage = {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        stored.set(key, value);
      },
    };
    expect(rememberRecoveryIntent("https://app.example/reset-password#access_token=abc&type=recovery", storage)).toBe(true);
    expect(rememberRecoveryIntent("https://app.example/reset-password", storage)).toBe(true);
  });

  it("shows the new-password form only for a recovery session", () => {
    expect(resetPasswordView("loading", false)).toBe("loading");
    expect(resetPasswordView("unconfigured", true)).toBe("unconfigured");
    expect(resetPasswordView("unauthenticated", false)).toBe("invalid");
    expect(resetPasswordView("authenticated", false)).toBe("signed-in");
    expect(resetPasswordView("authenticated", true)).toBe("form");
  });
});
