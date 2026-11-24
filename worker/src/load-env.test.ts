import { describe, expect, it } from "vitest";
import { applyEnvFile } from "./load-env.js";

describe("applyEnvFile", () => {
  it("reads quoted values and leaves existing variables in place", () => {
    const env: NodeJS.ProcessEnv = { OPENAI_MODEL: "already-set" };
    applyEnvFile(
      `
# comment
OPENAI_MODEL="gpt-4.1-mini"
OPENAI_ORG_ID='org-example'
NOT A LINE
EMPTY=
`,
      env,
    );
    expect(env.OPENAI_MODEL).toBe("already-set");
    expect(env.OPENAI_ORG_ID).toBe("org-example");
    expect(env.EMPTY).toBe("");
  });
});
