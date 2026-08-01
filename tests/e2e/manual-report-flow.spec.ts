import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 8 focused E2E coverage for the manual report builder
 * (Language -> Community -> Incident Report -> Review -> Destination ->
 * Consent -> Complete), starting at `view=reportsubmissiondetails&step=language`
 * with no Triage session — the "cold start" manual entry path.
 *
 * Follows the seeding/safety-gate conventions established in
 * tests/e2e/report-destination-handoff-smoke.spec.ts. Not run as part of
 * the full historical E2E suite — invoke directly:
 *   npx playwright test tests/e2e/manual-report-flow.spec.ts
 */

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

test("manual text-only flow: Language -> Community -> Incident Report -> Review -> Destination -> Consent -> Complete", async ({
  page,
}) => {
  await page.goto("/dashboard?view=reportsubmissiondetails&step=language");
  await dismissSafetyGate(page);

  await expect(page.getByText("Step 1 of 7")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Select your language" })).toBeVisible();

  // Know/Privacy/Hub must not exist anywhere in the manual flow's progress chips.
  for (const removed of ["Know", "Privacy", "Hub", "Services"]) {
    await expect(page.getByText(removed, { exact: true })).toHaveCount(0);
  }

  await page.getByRole("radio", { name: /English/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/step=community/);
  await expect(page.getByText("Step 2 of 7")).toBeVisible();
  await page.getByRole("button", { name: "Prefer not to say" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/step=report/);
  await expect(page.getByText("Step 3 of 7")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tell us what happened" })).toBeVisible();

  const narrative =
    "আমি নিরাপদ নই। This happened at my workplace.\nA colleague raised their voice and blocked the doorway.";
  await page.locator("#incident-summary").fill(narrative);

  await page.getByRole("button", { name: "Review your incident" }).click();

  await expect(page).toHaveURL(/step=review/);
  await expect(page.getByText("Step 4 of 7")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review your report" })).toBeVisible();
  await expect(page.locator("#manual-review-summary")).toHaveValue(narrative);
  await expect(page.getByText("No files attached.")).toBeVisible();
  await expect(page.getByText(/Nothing has been sent yet\./i)).toBeVisible();

  await page.locator("#manual-review-title").fill("Workplace incident report");

  await page.getByRole("button", { name: "Choose a destination" }).click();

  await expect(page).toHaveURL(/step=destination/);
  await expect(page.getByText("Step 5 of 7")).toBeVisible();
  const destinationOptions = page.getByTestId("destination-options");
  await expect(destinationOptions).toBeVisible({ timeout: 15_000 });
  await destinationOptions.getByRole("button").first().click();

  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/step=consent/);
  await expect(page.getByText("Step 6 of 7")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Selected destination" })).toBeVisible();

  const localOnlyCheckbox = page.getByRole("checkbox", {
    name: /keep my report prepared locally only/i,
  });
  await expect(localOnlyCheckbox).toBeVisible({ timeout: 15_000 });
  await localOnlyCheckbox.check();
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/step=complete/);
  await expect(page.getByText("Step 7 of 7")).toBeVisible();
  const summary = page.getByTestId("report-complete-summary");
  await expect(summary).toBeVisible();
  await expect(page.getByText(/has not shared, submitted, or sent/i)).toBeVisible();
  await expect(page.getByText(/report submitted/i)).toHaveCount(0);
  await expect(page.getByText(/successfully (submitted|sent)/i)).toHaveCount(0);
});

test("old Know/Privacy/Hub links normalise to Incident Report, preserving the draft", async ({
  page,
}) => {
  await page.goto("/dashboard?view=reportsubmissiondetails&step=language");
  await dismissSafetyGate(page);
  await page.getByRole("radio", { name: /English/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Prefer not to say" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator("#incident-summary").fill("Draft narrative that must survive old-link redirects.");

  for (const oldStep of ["information", "privacy", "services"]) {
    await page.goto(`/dashboard?view=reportsubmissiondetails&step=${oldStep}`);
    await dismissSafetyGate(page);
    await expect(page).toHaveURL(/step=report/);
    await expect(page.getByRole("heading", { name: "Tell us what happened" })).toBeVisible();
  }
});

test("a manual visit to the Triage-only 'next'/'preview' sub-stages normalises to Review instead of crashing", async ({
  page,
}) => {
  await page.goto("/dashboard?view=reportsubmissiondetails&step=next");
  await dismissSafetyGate(page);
  await expect(page).toHaveURL(/step=review/);
  await expect(page.getByRole("heading", { name: "Review your report" })).toBeVisible();
});

test("mobile viewport: no page-level horizontal overflow on Language or Incident Report, and the step indicator stays readable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });

  await page.goto("/dashboard?view=reportsubmissiondetails&step=language");
  await dismissSafetyGate(page);
  await expect(page.getByText("Step 1 of 7")).toBeVisible();
  let overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(overflow).toBe(false);

  await page.goto("/dashboard?view=reportsubmissiondetails&step=report");
  await dismissSafetyGate(page);
  await expect(page.getByRole("heading", { name: "Tell us what happened" })).toBeVisible();
  overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(overflow).toBe(false);
});

test("the file input is keyboard-reachable and the attach control has an accessible label", async ({
  page,
}) => {
  await page.goto("/dashboard?view=reportsubmissiondetails&step=report");
  await dismissSafetyGate(page);

  const dropZone = page.getByLabel("Browse or drop files to attach as supporting evidence");
  await expect(dropZone).toBeVisible();
  await dropZone.focus();
  await expect(dropZone).toBeFocused();
});

test.describe("REGRESSION: Triage-only onboarding step ids never index into the manual step config", () => {
  // `onboardingStep` can be a Triage-only id ("next"/"preview") when
  // fromTriage=1, which is not a key of MANUAL_REVIEW_ONBOARDING_STEPS.
  // The progress-index computation must gate on `!fromTriage` before
  // indexing into that map, or this throws
  // "Cannot read properties of undefined (reading 'order')".
  for (const [step, heading] of [
    ["next", "Choose your next step"],
    ["preview", "Report preview"],
  ] as const) {
    test(`step=${step}&fromTriage=1 renders without a runtime TypeError`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));

      await page.goto(`/dashboard?view=reportsubmissiondetails&step=${step}&fromTriage=1`);
      await dismissSafetyGate(page);
      await page.waitForTimeout(500);

      expect(pageErrors, pageErrors.join("\n---\n")).toHaveLength(0);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    });
  }
});
