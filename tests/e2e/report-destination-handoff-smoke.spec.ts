import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 7.2 focused smoke coverage: a Reporting Destination selected from
 * Triage remains the same canonical destination through the Destination,
 * Consent, and Complete stages of the onboarding report flow.
 *
 * Reach-Triage and safety-gate handling follow the same conventions
 * established in tests/e2e/triage-recommendation-persistence-smoke.spec.ts
 * (Phase 7.1) — seeding `AssistantTriageSource` directly via `sessionStorage`
 * rather than the flaky hijab-shortcut Assistant conversation, because that
 * conversation's resulting `incidentCategory` does not correspond to the
 * five `AssistantTopicKey` values (confirmed directly against the matching
 * engine).
 *
 * "domestic_violence" is used because it's confirmed (via the matching
 * engine, not guessed) to match reporting destination
 * demo-destination-community-helpline.
 *
 * The later onboarding steps (language/community/information/privacy/
 * services/report) are unrelated to this phase's scope, so this spec
 * navigates directly to `step=destination`/`step=consent` once the draft
 * already has the Triage-made selection — a real, directly-accessible route
 * this app already supports (`DestinationStage` has no direct-access guard),
 * not a workaround for a defect.
 *
 * Not run as part of the full historical E2E suite — invoke directly:
 *   npx playwright test tests/e2e/report-destination-handoff-smoke.spec.ts
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

test("a destination selected from Triage stays selected through Destination, Consent, and Complete without implying real submission", async ({
  page,
}) => {
  await reachTriage(page, "domestic_violence");

  const destinationsSection = page.getByTestId("triage-reporting-destinations-section");
  await expect(destinationsSection).toBeVisible({ timeout: 15_000 });
  await destinationsSection.getByRole("button", { name: "View details" }).first().click();

  const dialog = page.getByRole("dialog", { name: /.+/ });
  await expect(dialog).toBeVisible();
  const destinationName = await dialog.getByRole("heading", { level: 2 }).textContent();
  await dialog.getByRole("button", { name: "Use this reporting option" }).click();
  await expect(dialog.getByText("Selected for this report")).toBeVisible();
  await dialog.getByRole("button", { name: "Close details" }).click();

  // Destination step: the Triage selection is highlighted, not mixed into the backend/manual list.
  await page.goto("/dashboard?view=reportsubmissiondetails&step=destination&fromTriage=1");
  await dismissSafetyGate(page);

  const triageSelectedCard = page.getByTestId("triage-selected-destination");
  await expect(triageSelectedCard).toBeVisible({ timeout: 15_000 });
  await expect(triageSelectedCard).toContainText(destinationName ?? "");
  await expect(triageSelectedCard.getByRole("status")).toBeVisible();
  await expect(triageSelectedCard.getByRole("button", { name: "Use this destination" })).toHaveCount(0);

  await page.getByRole("button", { name: "Continue" }).click();

  // Consent step: shows the exact resolved destination, tri-states included.
  await expect(page).toHaveURL(/step=consent/);
  await expect(page.getByRole("heading", { name: "Selected destination" })).toBeVisible();
  await expect(page.getByText(destinationName ?? "", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Anonymous reporting:")).toBeVisible();
  await expect(page.getByText("Emergency suitability:")).toBeVisible();

  // No backend is running in this test environment, so the consent gate
  // falls back to its own existing "local only" acknowledgement path —
  // deterministic here, not a workaround.
  const localOnlyCheckbox = page.getByRole("checkbox", {
    name: /keep my report prepared locally only/i,
  });
  await expect(localOnlyCheckbox).toBeVisible({ timeout: 15_000 });
  await localOnlyCheckbox.check();

  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
  await page.getByRole("button", { name: "Continue" }).click();

  // Complete step: truthful mock-only wording, and the same destination is shown.
  await expect(page).toHaveURL(/step=complete/);
  const summary = page.getByTestId("report-complete-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText(destinationName ?? "");
  await expect(page.getByText(/has not shared, submitted, or sent/i)).toBeVisible();
  await expect(page.getByText(/report submitted/i)).toHaveCount(0);
  await expect(page.getByText(/successfully (submitted|sent)/i)).toHaveCount(0);
});
