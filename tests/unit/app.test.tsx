import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";

describe("App", () => {
  it("renders the marketing homepage brand", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: /^prospectra$/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /start free/i }).length).toBeGreaterThan(0);
  }, 15000);
});
