import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 8.1 focused browser verification for every supported manual-flow
 * attachment category (TXT, PDF, DOCX, image, video) plus the combined
 * multi-file flow, duplicate handling, refresh/reselection truthfulness,
 * and preview object-URL lifecycle.
 *
 * Follows the seeding/safety-gate conventions established in
 * tests/e2e/report-destination-handoff-smoke.spec.ts and
 * tests/e2e/manual-report-flow.spec.ts. Not run as part of the full
 * historical E2E suite — invoke directly:
 *   npx playwright test tests/e2e/manual-report-attachments.spec.ts
 */

const FIXTURES_DIR = path.join(__dirname, "../fixtures/evidence");
const fixture = (name: string) => path.join(FIXTURES_DIR, name);

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

async function gotoIncidentReport(page: Page): Promise<void> {
  await page.goto("/dashboard?view=reportsubmissiondetails&step=report");
  await dismissSafetyGate(page);
  await expect(page.getByRole("heading", { name: "Tell us what happened" })).toBeVisible();
}

function fileInput(page: Page) {
  return page.locator('input[type="file"]');
}

test.describe("TXT attachment flow", () => {
  test("Bengali + English TXT: readable metadata, real text-read wording, no OCR/AI claim, Unicode preserved, remove/re-add stays at one record", async ({
    page,
  }) => {
    await gotoIncidentReport(page);

    await fileInput(page).setInputFiles(fixture("sample-bn.txt"));

    const card = page.getByTestId("evidence-upload-panel").locator('[data-testid^="evidence-card-"]').first();
    await expect(card).toContainText("sample-bn.txt");
    await expect(card).toContainText("TXT document");
    await expect(card).toContainText(/\d+(\.\d+)? (B|KB)/);
    await expect(card).toContainText("Ready for review", { timeout: 10_000 });
    await expect(card).toContainText(/Text was read directly from this file in your browser/);
    await expect(card).not.toContainText(/OCR|transcri|analysed by AI/i);

    await card.getByText("Show text read from this file").click();
    await expect(card).toContainText("এটি একটি বাংলা পরীক্ষার নথি");
    await expect(card).toContainText("This line mixes English and বাংলা");

    // Continue to Review — evidence must still be present, narrative not overwritten.
    await page.locator("#incident-summary").fill("Manual narrative that must not be overwritten.");
    await page.getByRole("button", { name: "Review your incident" }).click();
    await expect(page).toHaveURL(/step=review/);
    await expect(page.locator("#manual-review-summary")).toHaveValue(
      "Manual narrative that must not be overwritten."
    );
    await expect(page.getByTestId(/^evidence-card-/)).toContainText("sample-bn.txt");

    // Remove then re-add: exactly one evidence record.
    await page.goBack();
    await gotoIncidentReport(page);
    await page.getByRole("button", { name: /Remove sample-bn\.txt/ }).click();
    await expect(page.getByText("No files attached yet.")).toBeVisible();

    await fileInput(page).setInputFiles(fixture("sample-bn.txt"));
    await expect(page.getByTestId(/^evidence-card-/)).toHaveCount(1);
  });

  test("selecting the same TXT twice in one action attaches it only once, with a readable notice", async ({
    page,
  }) => {
    await gotoIncidentReport(page);

    await fileInput(page).setInputFiles([fixture("sample-en.txt"), fixture("sample-en.txt")]);

    await expect(page.getByTestId(/^evidence-card-/)).toHaveCount(1);
    await expect(page.getByText(/sample-en\.txt is already attached\./)).toBeVisible();
  });

  test("an empty file and an unsupported file type are both rejected with human-readable messages", async ({
    page,
  }) => {
    await gotoIncidentReport(page);

    await fileInput(page).setInputFiles(fixture("empty.txt"));
    await expect(page.getByText(/empty\.txt appears to be empty/)).toBeVisible();
    await expect(page.getByTestId(/^evidence-card-/)).toHaveCount(0);

    await fileInput(page).setInputFiles(fixture("sample.mp3"));
    await expect(page.getByText(/sample\.mp3 isn't a supported file type/)).toBeVisible();
    await expect(page.getByTestId(/^evidence-card-/)).toHaveCount(0);
  });

  test("a Unicode filename attaches and renders without breaking the layout", async ({ page }) => {
    await gotoIncidentReport(page);

    await fileInput(page).setInputFiles(fixture("প্রতিবেদন-নথি.txt"));
    await expect(page.getByTestId(/^evidence-card-/)).toContainText("প্রতিবেদন-নথি.txt");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflow).toBe(false);
  });
});

test.describe("PDF and DOCX attachment flow", () => {
  test("PDF and DOCX: readable type/size, simulated-extraction wording, no invented content, survives refresh as metadata-only", async ({
    page,
  }) => {
    await gotoIncidentReport(page);

    await fileInput(page).setInputFiles(fixture("sample.pdf"));
    const pdfCard = page.getByTestId("evidence-upload-panel").locator('[data-testid^="evidence-card-"]').first();
    await expect(pdfCard).toContainText("PDF document");
    await expect(pdfCard).toContainText("Ready for review", { timeout: 10_000 });
    await expect(pdfCard).toContainText(/simulated in this prototype/i);
    await expect(pdfCard).not.toContainText(/"SafeSpeak test fixture"/);

    await fileInput(page).setInputFiles(fixture("sample.docx"));
    const cards = page.getByTestId("evidence-upload-panel").locator('[data-testid^="evidence-card-"]');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(1)).toContainText("DOCX document");
    await expect(cards.nth(1)).toContainText("Ready for review", { timeout: 10_000 });
    await expect(cards.nth(1)).not.toContainText(/paragraph|heading extracted/i);

    await page.locator("#incident-summary").fill("Report referencing attached documents.");
    await page.getByRole("button", { name: "Review your incident" }).click();
    await expect(page).toHaveURL(/step=review/);
    await expect(page.getByTestId(/^evidence-card-/)).toHaveCount(2);

    await page.reload();
    await dismissSafetyGate(page);

    // Refresh wipes the in-memory live-file registry: metadata (name/type/size) remains,
    // but the truthful reselection limitation must now be shown for both documents.
    await expect(page.getByRole("heading", { name: "Review your report" })).toBeVisible();
    const reloadedCards = page.getByTestId(/^evidence-card-/);
    await expect(reloadedCards).toHaveCount(2);
    await expect(reloadedCards.first()).toContainText("sample.pdf");
    await expect(reloadedCards.first()).toContainText(
      /the original local file must be selected again after a browser refresh/
    );
    await expect(page.locator("#manual-review-summary")).toHaveValue(
      "Report referencing attached documents."
    );
  });
});

test.describe("Image attachment flow", () => {
  test("image: current-session preview, meaningful alt text, no OCR claim, refresh shows reselection state, remove clears the right record", async ({
    page,
  }) => {
    await gotoIncidentReport(page);

    await fileInput(page).setInputFiles(fixture("sample.png"));
    const card = page.getByTestId("evidence-upload-panel").locator('[data-testid^="evidence-card-"]').first();
    await expect(card).toContainText("Ready for review", { timeout: 10_000 });
    await expect(card).toContainText(/No visual analysis or OCR has been performed/);

    const previewImg = card.locator("img[alt]");
    await expect(previewImg).toBeVisible();
    await expect(previewImg).toHaveAttribute("alt", /Preview of sample\.png/);

    await page.locator("#incident-summary").fill("Report with a photo attached.");
    await page.getByRole("button", { name: "Review your incident" }).click();
    await expect(page).toHaveURL(/step=review/);
    await expect(page.getByTestId(/^evidence-card-/).locator("img[alt]")).toBeVisible();

    await page.reload();
    await dismissSafetyGate(page);

    const reloadedCard = page.getByTestId(/^evidence-card-/);
    await expect(reloadedCard).toContainText("sample.png");
    await expect(reloadedCard.locator("img")).toHaveCount(0);
    await expect(reloadedCard).toContainText(
      /Preview unavailable after refresh\. Reselect the file to preview it again\./
    );

    await reloadedCard.getByRole("button", { name: /Remove sample\.png/ }).click();
    await expect(page.getByText("No files attached. You can add supporting files from the Incident")).toBeVisible();
  });
});

test.describe("Video attachment flow", () => {
  test("video: native controls without autoplay, no transcription claim, readable metadata, refresh shows reselection state", async ({
    page,
  }) => {
    await gotoIncidentReport(page);

    await fileInput(page).setInputFiles(fixture("sample.webm"));
    const card = page.getByTestId("evidence-upload-panel").locator('[data-testid^="evidence-card-"]').first();
    await expect(card).toContainText("Ready for review", { timeout: 10_000 });
    await expect(card).toContainText(/No transcription or content analysis has been performed/);

    const video = card.locator("video");
    // If this browser build cannot decode the tiny VP8/Opus fixture, the card's onError
    // fallback ("This preview couldn't be loaded...") is the safe, truthful path — both
    // outcomes are asserted rather than assuming decode succeeds.
    const videoVisible = await video
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (videoVisible) {
      await expect(video).toHaveAttribute("controls", "");
      await expect(video).not.toHaveAttribute("autoplay", "");
      await expect(video).toHaveAttribute("playsinline", "");
    } else {
      await expect(card).toContainText(/couldn't be loaded/);
    }

    await page.locator("#incident-summary").fill("Report with a video attached.");
    await page.getByRole("button", { name: "Review your incident" }).click();
    await expect(page).toHaveURL(/step=review/);

    await page.reload();
    await dismissSafetyGate(page);

    const reloadedCard = page.getByTestId(/^evidence-card-/);
    await expect(reloadedCard).toContainText("sample.webm");
    await expect(reloadedCard.locator("video")).toHaveCount(0);
    await expect(reloadedCard).toContainText(
      /Preview unavailable after refresh\. Reselect the file to preview it again\./
    );
  });
});

test.describe("Combined multi-file flow", () => {
  test("Bengali + English text, four distinct attachments, cross-selection duplicate rejected, refresh preserves everything, completes through Destination/Consent/Complete", async ({
    page,
  }) => {
    await page.goto("/dashboard?view=reportsubmissiondetails&step=language");
    await dismissSafetyGate(page);
    await page.getByRole("radio", { name: /বাংলা/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Prefer not to say" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Tell us what happened" })).toBeVisible();
    await page
      .locator("#incident-summary")
      .fill("এটি একটি সম্মিলিত পরীক্ষা।\nThis is a combined English and Bengali narrative.");

    await fileInput(page).setInputFiles([
      fixture("sample-en.txt"),
      fixture("sample.pdf"),
      fixture("sample.png"),
      fixture("sample.webm"),
    ]);

    const cards = page.getByTestId("evidence-upload-panel").locator('[data-testid^="evidence-card-"]');
    await expect(cards).toHaveCount(4);
    for (const name of ["sample-en.txt", "sample.pdf", "sample.png", "sample.webm"]) {
      await expect(cards.filter({ hasText: name })).toHaveCount(1);
    }

    // Re-selecting the same PDF must not create a duplicate.
    await fileInput(page).setInputFiles(fixture("sample.pdf"));
    await expect(page.getByText(/sample\.pdf is already attached\./)).toBeVisible();
    await expect(cards).toHaveCount(4);

    await page.reload();
    await dismissSafetyGate(page);

    await expect(page.locator("#incident-summary")).toHaveValue(
      "এটি একটি সম্মিলিত পরীক্ষা।\nThis is a combined English and Bengali narrative."
    );
    await expect(page.getByTestId(/^evidence-card-/)).toHaveCount(4);

    await page.getByRole("button", { name: "Review your incident" }).click();
    await expect(page).toHaveURL(/step=review/);
    await expect(page.locator("#manual-review-title")).toBeVisible();
    await page.locator("#manual-review-title").fill("Combined evidence report");

    // Remove one, go back to Incident Report, re-add it: still no accidental duplicates.
    const reviewCards = page.getByTestId(/^evidence-card-/);
    await reviewCards.filter({ hasText: "sample.png" }).getByRole("button", { name: /Remove/ }).click();
    await expect(reviewCards).toHaveCount(3);

    await page.getByRole("button", { name: "Back to Incident Report" }).click();
    await expect(page.getByRole("heading", { name: "Tell us what happened" })).toBeVisible();
    await fileInput(page).setInputFiles(fixture("sample.png"));
    await expect(page.getByTestId("evidence-upload-panel").locator('[data-testid^="evidence-card-"]')).toHaveCount(4);

    await page.getByRole("button", { name: "Review your incident" }).click();
    await expect(page).toHaveURL(/step=review/);
    await expect(page.getByTestId(/^evidence-card-/)).toHaveCount(4);

    await page.getByRole("button", { name: "Choose a destination" }).click();
    await expect(page).toHaveURL(/step=destination/);
    const destinationOptions = page.getByTestId("destination-options");
    await expect(destinationOptions).toBeVisible({ timeout: 15_000 });
    await destinationOptions.getByRole("button").first().click();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page).toHaveURL(/step=consent/);
    const localOnlyCheckbox = page.getByRole("checkbox", {
      name: /keep my report prepared locally only/i,
    });
    await expect(localOnlyCheckbox).toBeVisible({ timeout: 15_000 });
    await localOnlyCheckbox.check();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page).toHaveURL(/step=complete/);
    await expect(page.getByTestId("report-complete-summary")).toBeVisible();
    await expect(page.getByText(/has not shared, submitted, or sent/i)).toBeVisible();
    await expect(page.getByText(/report submitted/i)).toHaveCount(0);
  });
});
