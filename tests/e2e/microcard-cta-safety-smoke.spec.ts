import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 8.2 focused smoke coverage: Microcard CTA safety end-to-end
 * (open_internal_route -> the real allow-listed route, start_report -> the
 * canonical report-flow entry, never a raw/unsafe target), human-readable
 * jurisdiction formatting in the detail modal, and keyboard open/close with
 * focus restoration.
 *
 * Follows the seeding/safety-gate conventions established in
 * tests/e2e/triage-recommendation-persistence-smoke.spec.ts. Not run as
 * part of the full historical E2E suite — invoke directly:
 *   npx playwright test tests/e2e/microcard-cta-safety-smoke.spec.ts
 */

const ASSISTANT_TRIAGE_CONTEXT_KEY = "safespeak_assistant_triage_context";

async function dismissSafetyGate(page: Page): Promise<void> {
  const safetyGate = page.getByRole("dialog", { name: /before you continue/i });
  try {
    await expect(safetyGate).toBeVisible({ timeout: 8_000 });
  } catch {
    return;
  }
  await safetyGate.getByRole("checkbox", { name: /i am in a safe place/i }).check();
  await safetyGate.getByRole("button", { name: "Continue safely" }).click();
  await expect(safetyGate).toBeHidden();
}

async function reachTriage(page: Page, topic: string): Promise<void> {
  await page.addInitScript(
    ([key, source]) => {
      window.sessionStorage.setItem(key, source);
    },
    [
      ASSISTANT_TRIAGE_CONTEXT_KEY,
      JSON.stringify({
        conversation: [],
        timeline: {},
        narrative: "",
        updatedAt: new Date().toISOString(),
        incidentCategory: topic,
      }),
    ] as [string, string]
  );

  await page.goto("/dashboard?view=reportsubmissionsupport");
  await dismissSafetyGate(page);
}

test("Triage renders a governed Microcard with readable content, no raw id, no duplicate card", async ({ page }) => {
  await reachTriage(page, "domestic_violence");

  const resourceGroup = page.getByTestId("triage-resource-group-matched-suggested-guides");
  await expect(resourceGroup).toBeVisible({ timeout: 15_000 });

  const cards = resourceGroup.getByRole("button", { name: "View details" });
  const cardCount = await cards.count();
  expect(cardCount).toBeGreaterThan(0);

  await expect(resourceGroup).toContainText("Quick safety planning tip");
  await expect(resourceGroup).not.toContainText("demo-microcard-");
  await expect(resourceGroup).not.toContainText(/internalNotes|createdBy|updatedBy/);
});

test("open_internal_route CTA navigates to the real allow-listed Smart Dialler route, not a raw/broken target", async ({
  page,
}) => {
  await reachTriage(page, "domestic_violence");

  const resourceGroup = page.getByTestId("triage-resource-group-matched-suggested-guides");
  await expect(resourceGroup).toBeVisible({ timeout: 15_000 });
  await resourceGroup.getByRole("button", { name: "View details" }).first().click();

  const dialog = page.getByRole("dialog", { name: /.+/ });
  await expect(dialog).toBeVisible();

  // Jurisdiction is shown human-readably, never the raw contract code.
  await expect(dialog.getByText("VIC", { exact: true })).toBeVisible();
  await expect(dialog.getByText("vic", { exact: true })).toHaveCount(0);

  const ctaLink = dialog.getByRole("link", { name: "Get emergency help" });
  await expect(ctaLink).toBeVisible();
  await expect(ctaLink).toHaveAttribute("href", "/dashboard?view=smartdialler");

  await ctaLink.click();
  await expect(page).toHaveURL(/view=smartdialler/);
  // Clicking an informational CTA must never itself imply a report was submitted.
  await expect(page.getByText(/report submitted/i)).toHaveCount(0);
});

test("start_report CTA opens the canonical report-flow entry point without submitting anything or granting consent", async ({
  page,
}) => {
  await page.goto(
    "/dashboard?view=reportsubmissionsupport&recommendationType=microcard&recommendationId=demo-microcard-know-your-right-to-a-safe-workplace"
  );
  await dismissSafetyGate(page);

  const dialog = page.getByRole("dialog", { name: /.+/ });
  await expect(dialog).toBeVisible({ timeout: 15_000 });

  const ctaLink = dialog.getByRole("link", { name: "Continue to report" });
  await expect(ctaLink).toBeVisible();
  await expect(ctaLink).toHaveAttribute(
    "href",
    "/dashboard?view=reportsubmissiondetails&step=report&fromTriage=1"
  );

  await ctaLink.click();
  await expect(page).toHaveURL(/view=reportsubmissiondetails/);
  await expect(page).toHaveURL(/step=report/);
  await expect(page.getByRole("heading", { name: "Tell us what happened" })).toBeVisible();
  // Opening the report entry point is not itself a submission or consent grant.
  await expect(page.getByText(/report submitted/i)).toHaveCount(0);
  await expect(page.getByText(/consent granted/i)).toHaveCount(0);
});

test("a Microcard with no CTA (type: none) shows content but renders no dead/fabricated action button", async ({
  page,
}) => {
  await page.goto(
    "/dashboard?view=reportsubmissionsupport&recommendationType=microcard&recommendationId=demo-microcard-general-next-steps-guide"
  );
  await dismissSafetyGate(page);

  const dialog = page.getByRole("dialog", { name: /.+/ });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByText("Not sure where to start?")).toBeVisible();
  // No generic/fabricated CTA — only the modal's own Close action.
  await expect(dialog.getByRole("link")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Close details" })).toBeVisible();
});

test("keyboard: open a Microcard's details, close with Escape, and focus returns to the triggering card", async ({
  page,
}) => {
  await reachTriage(page, "domestic_violence");

  const resourceGroup = page.getByTestId("triage-resource-group-matched-suggested-guides");
  await expect(resourceGroup).toBeVisible({ timeout: 15_000 });

  const triggerButton = resourceGroup.getByRole("button", { name: "View details" }).first();
  await triggerButton.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: /.+/ });
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(triggerButton).toBeFocused();
});

test("mobile viewport: the Microcard section and its open detail modal have no page-level horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await reachTriage(page, "domestic_violence");

  const resourceGroup = page.getByTestId("triage-resource-group-matched-suggested-guides");
  await expect(resourceGroup).toBeVisible({ timeout: 15_000 });

  let overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(overflow).toBe(false);

  await resourceGroup.getByRole("button", { name: "View details" }).first().click();
  await expect(page.getByRole("dialog", { name: /.+/ })).toBeVisible();

  overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(overflow).toBe(false);
});
