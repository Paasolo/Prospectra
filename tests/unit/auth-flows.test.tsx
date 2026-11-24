import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { ForgotPasswordPage } from "@/features/authentication/ForgotPasswordPage";
import { RegisterPage } from "@/features/authentication/RegisterPage";
import { ResetPasswordPage } from "@/features/authentication/ResetPasswordPage";
import { RECOVERY_STORAGE_KEY } from "@/features/authentication/recovery";
import { SettingsPage } from "@/features/settings/SettingsPage";

describe("phase 19 account flows without Supabase", () => {
  beforeEach(() => {
    sessionStorage.removeItem(RECOVERY_STORAGE_KEY);
  });

  it("rejects a short registration password and does not claim an account was created", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Supabase is not configured/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Full name"), "Ada Lovelace");
    await user.type(screen.getByLabelText("Work email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "short-pass");
    await user.type(screen.getByLabelText("Confirm password"), "short-pass");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getAllByText("Password must be at least 12 characters").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Check your email/i)).not.toBeInTheDocument();
  });

  it("does not say a reset link was sent when Auth is unconfigured", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Supabase is not configured/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(screen.getByText("Enter a valid email")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(screen.queryByText(/reset link has been sent/i)).not.toBeInTheDocument();
  });

  it("hides the reset form until a recovery link is present", () => {
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Supabase is not configured/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save password" })).not.toBeInTheDocument();
  });

  it("does not offer a password change from Settings without a session", async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Supabase is not configured/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update password" })).not.toBeInTheDocument();
  });
});
