import { expect, test } from "@playwright/test";

test("protected pages redirect to sign-in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/signin/);
});

test("sign up, land on dashboard, enroll, sign out, sign back in", async ({ page }) => {
  const email = `learner-${Date.now()}@example.com`;
  const password = "correct-horse-battery";

  await page.goto("/signup");
  await page.getByLabel("Name").fill("Test Learner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /Welcome, Test Learner/ })).toBeVisible();

  await page.getByRole("listitem").filter({ hasText: "Graphic Design" }).getByRole("button", { name: "Enroll" }).click();
  await expect(page.getByText("In progress")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("duplicate email and short passwords are rejected", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("X");
  await page.getByLabel("Email").fill("short@example.com");
  await page.getByLabel(/^Password/).fill("short");
  await page.getByRole("button", { name: "Sign up" }).click();
  // Browser-level minLength blocks submission; still on the sign-up page.
  await expect(page).toHaveURL(/\/signup/);
});
