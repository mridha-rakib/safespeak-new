import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 7.1 focused smoke coverage: the controlled URL-backed recommendation
 * detail state (Back/Forward/refresh/direct access/invalid ids) and
 * explicit Reporting Destination selection into the canonical report draft.
 *
 * `tests/e2e/assistant-to-triage-five-topics.spec.ts` (Phase 6.1) reaches
 * Triage through the real Assistant conversation using its hijab-keyword
 * shortcut — but that shortcut's resulting `incidentCategory` (an
 * `AssistantIncidentCategory`, a different vocabulary than the five
 * `AssistantTopicKey`/URL `topic=` values) does not actually correspond to
 * the five topic keys, so it always resolves to the same governed content
 * (confirmed directly: it always lands on `general_assistant`'s match set,
 * which has no nested Microcard CTA and no reporting destination). That test
 * is correctly scoped to "some governed section renders", not per-topic
 * content — it never claimed to exercise a *specific* topic's content
 * through the browser.
 *
 * This spec needs specific, real records with a nested CTA and a reporting
 * destination match (confirmed directly against the matching engine, not
 * guessed — see the two `test.describe` blocks below), so it seeds
 * `AssistantTriageSource` (the same `sessionStorage` key/shape
 * `saveAssistantTriageSource()` writes, read by `getAssistantTriageSource()`
 * in `report-submission-support-page.tsx`'s `loadTriage()`) directly with
 * `incidentCategory` set to the real `AssistantTopicKey` string, then
 * navigates straight to the Triage route. This is a same-origin
 * `sessionStorage` write through the app's own documented mechanism, not a
 * mocked repository/resolver/adapter — `MockContentRepository` and the real
 * deterministic matching engine still run unmodified.
 *
 * Not run as part of the full historical E2E suite — invoke directly:
 *   npx playwright test tests/e2e/triage-recommendation-persistence-smoke.spec.ts
 */

const ASSISTANT_TRIAGE_CONTEXT_KEY = "safespeak_assistant_triage_context";

/**
 * The genuine first-load Safety Gate (src/components/safety/safety-gate.tsx)
 * mounts via a client-side effect after hydration — a one-shot `.isVisible()`
 * check right after `goto()` can race it, so this uses Playwright's
 * auto-retrying `expect`, matching the pattern established in
 * `tests/e2e/assistant-to-triage-five-topics.spec.ts`. Unlike that spec
 * (which always reaches Triage via a fresh Assistant conversation), several
 * tests here `page.goto()` the Triage route directly more than once per
 * worker, and the gate's once-per-session acknowledgement can already be
 * satisfied from an earlier test in the same browser context — that is a
 * legitimate "already dismissed" state, not a failure, so this only acts
 * when the gate actually appears.
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

test.describe("URL-backed detail state: nested Microcard -> Rights -> Legislation navigation", () => {
  test.beforeEach(async ({ page }) => {
    await reachTriage(page, "racial_abuse");
  });

  test("opening, nested navigation, browser Back/Back/Back, and Forward all resolve the correct URL and record", async ({
    page,
  }) => {
    const resourceGroup = page.getByTestId("triage-resource-group-matched-suggested-guides");
    await expect(resourceGroup).toBeVisible({ timeout: 15_000 });
    await resourceGroup.getByRole("button", { name: "View details" }).first().click();

    await expect(page).toHaveURL(/recommendationType=microcard/);
    await expect(page).toHaveURL(/recommendationId=demo-microcard-what-counts-as-racial-harassment/);

    const dialog = page.getByRole("dialog", { name: /.+/ });
    await expect(dialog).toBeVisible();

    // Nested navigation: Microcard's own CTA into Rights Content.
    await dialog.getByRole("button", { name: "Learn about your reporting rights" }).click();
    await expect(page).toHaveURL(/recommendationType=rights_content/);
    await expect(page).toHaveURL(/recommendationId=demo-rights-report-anonymously/);
    await expect(dialog.getByText("Rights & Legal Information")).toBeVisible();

    // Nested navigation: Rights Content -> related Legislation Source.
    await dialog.getByRole("button", { name: "View related legislation source" }).click();
    await expect(page).toHaveURL(/recommendationType=legislation_source/);
    await expect(page).toHaveURL(/recommendationId=demo-doc-discrimination-act-guide/);
    await expect(dialog.getByText("Legislation Source")).toBeVisible();
    // Safe-source-only rendering: a public disclaimer about not being the full text, no raw extracted chunks.
    await expect(dialog.getByText(/not the complete text of the law/i)).toBeVisible();

    // Browser Back restores the previous nested detail (Rights), not a full close.
    await page.goBack();
    await expect(page).toHaveURL(/recommendationType=rights_content/);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Rights & Legal Information")).toBeVisible();

    // Browser Back again restores the original Microcard.
    await page.goBack();
    await expect(page).toHaveURL(/recommendationType=microcard/);
    await expect(dialog).toBeVisible();

    // Browser Back again closes the detail entirely, back to plain Triage.
    await page.goBack();
    await expect(page).not.toHaveURL(/recommendationType=/);
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/view=reportsubmissionsupport/);

    // Browser Forward restores the Microcard detail.
    await page.goForward();
    await expect(page).toHaveURL(/recommendationType=microcard/);
    await expect(dialog).toBeVisible();
  });

  test("refreshing while a nested Legislation Source detail is open safely restores it from the repository", async ({
    page,
  }) => {
    const resourceGroup = page.getByTestId("triage-resource-group-matched-suggested-guides");
    await expect(resourceGroup).toBeVisible({ timeout: 15_000 });
    await resourceGroup.getByRole("button", { name: "View details" }).first().click();

    const dialog = page.getByRole("dialog", { name: /.+/ });
    await dialog.getByRole("button", { name: "Learn about your reporting rights" }).click();
    await dialog.getByRole("button", { name: "View related legislation source" }).click();
    await expect(page).toHaveURL(/recommendationType=legislation_source/);

    await page.reload();

    await expect(page).toHaveURL(/recommendationType=legislation_source/);
    await expect(page.getByRole("dialog", { name: /.+/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Legislation Source")).toBeVisible();
    // Triage underneath was safely reconstructed too, not destroyed.
    await expect(page.getByTestId("triage-resource-group-matched-suggested-guides")).toBeVisible();
  });

  test("a direct link with a missing record id shows the unavailable state without crashing", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    await page.goto(
      "/dashboard?view=reportsubmissionsupport&recommendationType=microcard&recommendationId=definitely-not-a-real-id"
    );
    await dismissSafetyGate(page);

    const dialog = page.getByRole("dialog", { name: /.+/ });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/no longer available/i)).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("a direct link with an unsupported entity type shows the unavailable state without crashing", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    await page.goto(
      "/dashboard?view=reportsubmissionsupport&recommendationType=matching_rule&recommendationId=whatever"
    );
    await dismissSafetyGate(page);

    const dialog = page.getByRole("dialog", { name: /.+/ });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/can't be shown here/i)).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("closing the detail removes only the recommendation-detail params, not unrelated Dashboard params", async ({
    page,
  }) => {
    await page.goto(
      "/dashboard?view=reportsubmissionsupport&triageDebug=1&recommendationType=microcard&recommendationId=demo-microcard-what-counts-as-racial-harassment"
    );
    await dismissSafetyGate(page);
    const dialog = page.getByRole("dialog", { name: /.+/ });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    await dialog.getByRole("button", { name: "Close details" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/view=reportsubmissionsupport/);
    await expect(page).toHaveURL(/triageDebug=1/);
    await expect(page).not.toHaveURL(/recommendationType=/);
  });
});

test.describe("Reporting Destination: view vs. explicit selection", () => {
  test.beforeEach(async ({ page }) => {
    await reachTriage(page, "domestic_violence");
  });

  test("viewing a destination never selects it; explicit 'Use this reporting option' stores the stable id and the selected state persists on reopen", async ({
    page,
  }) => {
    const destinationsSection = page.getByTestId("triage-reporting-destinations-section");
    await expect(destinationsSection).toBeVisible({ timeout: 15_000 });
    await destinationsSection.getByRole("button", { name: "View details" }).first().click();

    const dialog = page.getByRole("dialog", { name: /.+/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Anonymous reporting:")).toBeVisible();

    // Viewing alone must not select it.
    await expect(dialog.getByText("Selected for this report")).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Use this reporting option" })).toBeVisible();

    await dialog.getByRole("button", { name: "Use this reporting option" }).click();
    await expect(dialog.getByText("Selected for this report")).toBeVisible();
    // The action is withdrawn once selected — no duplicate/second selection control.
    await expect(dialog.getByRole("button", { name: "Use this reporting option" })).toHaveCount(0);

    // Selecting never submits or navigates away from Triage.
    await expect(page).toHaveURL(/view=reportsubmissionsupport/);
    await expect(page.getByText(/report submitted/i)).toHaveCount(0);

    await dialog.getByRole("button", { name: "Close details" }).click();
    await expect(dialog).toBeHidden();

    // Reopen the same destination: the selected state must persist (read from the draft, not just optimistic local UI).
    await destinationsSection.getByRole("button", { name: "View details" }).first().click();
    await expect(page.getByRole("dialog", { name: /.+/ })).toBeVisible();
    await expect(page.getByText("Selected for this report")).toBeVisible();
  });
});
