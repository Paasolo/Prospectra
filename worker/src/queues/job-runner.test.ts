import { describe, expect, it } from "vitest";
import { createJobRunner } from "./job-runner.js";

describe("createJobRunner", () => {
  it("registers job types without executing them", () => {
    const runner = createJobRunner();
    runner.register("example.noop", async () => undefined);

    expect(runner.listRegisteredTypes()).toEqual(["example.noop"]);
    expect(runner.getStatusPlaceholder()).toBe("pending");
  });

  it("rejects duplicate job type registration", () => {
    const runner = createJobRunner();
    runner.register("example.noop", async () => undefined);

    expect(() => runner.register("example.noop", async () => undefined)).toThrow(
      /already registered/,
    );
  });
});
