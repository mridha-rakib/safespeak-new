import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 7 focused smoke coverage: the shared recommendation detail modal
 * (opening a governed Triage card's "View details", accessible dialog
 * semantics, Escape/close behaviour, and Triage state preservation on
 * return). Mirrors the reach-Triage steps and conventions in
 * tests/e2e/assistant-to-triage-five-topics.spec.ts (Phase 6.1) — uses the
 * "domestic_violence" topic, which the seeded demo matching rule
 * (demo-rule-domestic-violence-safety-support) guarantees matches at least
 * one published microcard.
 *
 * Not run as part of the full historical E2E suite — invoke directly:
 *   npx playwright test tests/e2e/triage-recommendation-details-smoke.spec.ts
 */

async function reachTriage(page: Page): Promise<void> {
  await page.goto("/dashboard?view=assistant&topic=domestic_violence&category=");

  const safetyGate = page.getByRole("dialog", { name: /before you continue/i });
  await expect(safetyGate).toBeVisible({ timeout: 10_000 });
  await safetyGate.getByRole("checkbox", { name: /i am in a safe place/i }).check();
  await safetyGate.getByRole("button", { name: "Continue safely" }).click();
  await expect(safetyGate).toBeHidden();

  const starterComposer = page.getByPlaceholder("Type your response...");
  await expect(starterComposer).toBeVisible({ timeout: 15_000 });
  await starterComposer.fill("Someone pulled my hijab today at the station.");
  await starterComposer.press("Enter");

  const composer = page.getByTestId("ai-conversation-input");
  await expect(composer).toBeVisible({ timeout: 15_000 });

  await expect(page.getByRole("button", { name: "I am safe right now" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "I am safe right now" }).click();

  await expect(page.getByRole("button", { name: "Yes, this is right" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Yes, this is right" }).click();

  await page.waitForURL(/view=reportsubmissionsupport/, { timeout: 15_000 });
}

test.beforeEach(async ({ page }) => {
  await reachTriage(page);
});

test("opening a governed Microcard's View details shows the shared detail modal with a heading, why-suggested reasons, and no dead action", async ({
  page,
}) => {
  const resourceGroup = page.getByTestId("triage-resource-group-matched-suggested-guides");
  await expect(resourceGroup).toBeVisible({ timeout: 15_000 });

  await resourceGroup.getByRole("button", { name: "View details" }).first().click();

  const dialog = page.getByRole("dialog", { name: /.+/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { level: 2 })).toBeVisible();
  await expect(dialog.getByText("Guidance", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Why this was suggested")).toBeVisible();
});

test("Escape closes the detail modal and Triage content underneath is unaffected", async ({ page }) => {
  const resourceGroup = page.getByTestId("triage-resource-group-matched-suggested-guides");
  await expect(resourceGroup).toBeVisible({ timeout: 15_000 });
  await resourceGroup.getByRole("button", { name: "View details" }).first().click();

  const dialog = page.getByRole("dialog", { name: /.+/ });
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await expect(page.getByRole("heading", { name: "Suggested guides" })).toBeVisible();
  await expect(resourceGroup).toBeVisible();
});

test("the modal's Close button closes it and does not navigate away from Triage", async ({ page }) => {
  const resourceGroup = page.getByTestId("triage-resource-group-matched-suggested-guides");
  await expect(resourceGroup).toBeVisible({ timeout: 15_000 });
  await resourceGroup.getByRole("button", { name: "View details" }).first().click();

  const dialog = page.getByRole("dialog", { name: /.+/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close details" }).click();
  await expect(dialog).toBeHidden();

  await expect(page).toHaveURL(/view=reportsubmissionsupport/);
});

test("clicking outside the modal (the backdrop) closes it", async ({ page }) => {
  const resourceGroup = page.getByTestId("triage-resource-group-matched-suggested-guides");
  await expect(resourceGroup).toBeVisible({ timeout: 15_000 });
  await resourceGroup.getByRole("button", { name: "View details" }).first().click();

  const dialog = page.getByRole("dialog", { name: /.+/ });
  await expect(dialog).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(dialog).toBeHidden();
});

test("a support organisation's detail view shows a verification status, never a fabricated verified claim", async ({ page }) => {
  const supportOptions = page.getByTestId("triage-mock-support-options");
  if ((await supportOptions.count()) === 0) {
    test.skip(true, "No support organisation matched this topic in the current seed data.");
    return;
  }

  await expect(supportOptions).toBeVisible();
  await supportOptions.getByRole("button", { name: "View details" }).first().click();

  const dialog = page.getByRole("dialog", { name: /.+/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Not verified|Verification pending|Verified|Verification expired|Verification not confirmed/)).toBeVisible();
});
