import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TemplateIssues } from "@/features/email/TemplateIssues";

describe("TemplateIssues", () => {
  it("shows unknown variables and unsupported claims", () => {
    render(<TemplateIssues subject="Hi {{secret}}" body="As we discussed the rollout." />);
    expect(screen.getByRole("alert")).toHaveTextContent("secret");
    expect(screen.getByRole("alert")).toHaveTextContent(/unsupported personal claims/i);
  });
});
