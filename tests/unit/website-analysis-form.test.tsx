import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WebsiteAnalysisForm } from "@/features/website-analysis/WebsiteAnalysisForm";

describe("WebsiteAnalysisForm", () => {
  it("blocks a private destination before submit", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<WebsiteAnalysisForm submitting={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/website url/i), "http://127.0.0.1/admin");
    await user.click(screen.getByRole("button", { name: /analyse website/i }));

    expect(await screen.findByText(/not a public destination/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a public https url", async () => {
    const onSubmit = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(<WebsiteAnalysisForm submitting={false} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/website url/i), "https://example.com/about");
    await user.click(screen.getByRole("button", { name: /analyse website/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/about" }),
    );
  });
});
