import { expect, test } from "@playwright/test";

test("public homepage and password recovery pages render", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Prospectra", exact: true })).toBeVisible();

  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await page.getByLabel("Email").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();

  await page.goto("/forgot-password");
  await expect(page.getByText(/Supabase is not configured/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
  await expect(page.getByText(/reset link has been sent/i)).toHaveCount(0);

  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save password" })).toHaveCount(0);
});

test("signed-in routes show the configuration gate without Supabase", async ({ page }) => {
  for (const path of ["/app/billing", "/app/reports", "/app/notifications", "/app/settings", "/admin"]) {
    await page.goto(path);
    await expect(page.getByText(/Supabase is not configured|Supabase unconfigured|configuration/i).first()).toBeVisible();
  }
});
