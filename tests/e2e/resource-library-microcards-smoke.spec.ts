import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 8.3 focused smoke coverage: the dedicated Resource Library and
 * Micro-card browsing routes (`?view=resources`, `?view=microcards`,
 * `?view=microeducation`), which previously called the real `/microeducation`
 * backend exclusively and showed a raw `500 Internal Server Error` /
 * "could not be loaded" state with no backend running. They now source
 * published Microcards from the same generated mock bundle Triage already
 * uses (`MockContentRepository` via `microcard-library-adapter.ts`).
 *
 * Not run as part of the full historical E2E suite — invoke directly:
 *   npx playwright test tests/e2e/resource-library-microcards-smoke.spec.ts
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

test("Resource Library (?view=resources) shows real micro-education content, no raw backend error", async ({
  page,
}) => {
  await page.goto("/dashboard?view=resources");
  await dismissSafetyGate(page);

  await expect(page.getByRole("heading", { name: "Resource Library" })).toBeVisible();
  await expect(page.getByText(/Internal Server Error/i)).toHaveCount(0);
  await expect(page.getByText(/could not be loaded/i)).toHaveCount(0);

  const microEducationAside = page.getByText("Micro-education").locator("..").locator("..");
  await expect(microEducationAside.getByText("Not sure where to start?")).toBeVisible({
    timeout: 15_000,
  });
  await expect(microEducationAside.getByText("Micro-education content will appear here when published.")).toHaveCount(0);
});

test("dedicated Micro-cards page (?view=microcards) lists real published categories and cards, no raw error", async ({
  page,
}) => {
  await page.goto("/dashboard?view=microcards");
  await dismissSafetyGate(page);

  await expect(page.getByRole("heading", { name: "Micro-Cards" })).toBeVisible();
  await expect(page.getByText("Micro-card categories could not be loaded.")).toHaveCount(0);
  await expect(page.getByText(/Internal Server Error/i)).toHaveCount(0);

  await expect(page.getByRole("button", { name: "Legal rights" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Safety", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Legal rights" }).click();
  await expect(page.getByText("Know your right to a safe workplace")).toBeVisible();
  await expect(page.getByText("What counts as racial harassment?")).toBeVisible();

  await page.getByRole("button", { name: "Know your right to a safe workplace" }).click();
  await expect(page.locator("h2", { hasText: "Know your right to a safe workplace" })).toBeVisible({
    timeout: 15_000,
  });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(overflow).toBe(false);
});

test("Micro-education page (?view=microeducation) lists real published lessons, no raw error", async ({
  page,
}) => {
  await page.goto("/dashboard?view=microeducation");
  await dismissSafetyGate(page);

  await expect(page.getByText(/Internal Server Error/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Quick safety planning tip/ })).toBeVisible({
    timeout: 15_000,
  });
});

test("mobile viewport: the dedicated Micro-cards page has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/dashboard?view=microcards");
  await dismissSafetyGate(page);

  await expect(page.getByRole("button", { name: "Legal rights" })).toBeVisible({ timeout: 15_000 });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(overflow).toBe(false);
});
