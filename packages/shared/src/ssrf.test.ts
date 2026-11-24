import { describe, expect, it } from "vitest";
import { isBlockedIp, parsePublicHttpUrl } from "./ssrf.js";

describe("public destination policy", () => {
  it("accepts a public https website", () => {
    const decision = parsePublicHttpUrl("https://www.example.com/about");
    expect(decision.ok).toBe(true);
  });

  it("blocks localhost, metadata, private addresses, and non-http schemes", () => {
    const blocked = [
      "http://localhost/admin",
      "http://127.0.0.1/",
      "http://10.0.0.8/",
      "http://192.168.1.20/",
      "http://172.16.5.5/",
      "http://169.254.169.254/latest/meta-data",
      "http://169.254.1.1/",
      "http://0.0.0.0/",
      "http://100.64.0.1/",
      "http://[::ffff:169.254.169.254]/",
      "ftp://example.com/file",
      "http://",
      "http://[::1]/",
      "http://[fd00::1]/",
      "http://metadata.google.internal/",
      "http://2130706433/",
      "http://0177.0.0.1/",
      "http://user:pass@example.com/",
      "https://example.com:8443/",
      "file:///etc/passwd",
      "http://intranet/",
    ];

    for (const target of blocked) {
      const decision = parsePublicHttpUrl(target);
      expect(decision.ok, target).toBe(false);
      if (!decision.ok) {
        expect(["SSRF_BLOCKED", "VALIDATION_FAILED"]).toContain(decision.code);
      }
    }
  });

  it("classifies reserved and public IP addresses", () => {
    expect(isBlockedIp("8.8.8.8")).toBe(false);
    expect(isBlockedIp("1.1.1.1")).toBe(false);
    expect(isBlockedIp("100.100.100.200")).toBe(true);
    expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIp("fe80::1")).toBe(true);
    expect(isBlockedIp("2001:4860:4860::8888")).toBe(false);
  });
});
