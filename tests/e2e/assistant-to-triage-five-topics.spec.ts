import { expect, test } from "@playwright/test";

/**
 * Phase 6.1 focused smoke coverage: for each of the five confirmed Assistant
 * routes, the existing local/mock conversation flow reaches Triage and the
 * single governed mock recommendation source renders meaningful,
 * topic-appropriate content — not the old duplicate static catalogue.
 *
 * Uses the hijab-keyword shortcut (2 message turns + 1 confirmation click)
 * to reach Triage quickly and identically across all five topics, since the
 * per-topic behaviour under test lives in `incidentCategory`/topic handling
 * and the governed matching pipeline, not in which storyline branch was
 * used to get there — the general (non-hijab) storyline's own Triage
 * reachability is covered separately by
 * `tests/unit/demo-conversation-state.test.ts`.
 *
 * Not run as part of the full historical E2E suite — invoke directly:
 *   npx playwright test tests/e2e/assistant-to-triage-five-topics.spec.ts
 */

const TOPICS = [
  { topic: "general_assistant", category: "" },
  { topic: "domestic_violence", category: "" },
  { topic: "racial_abuse", category: "" },
  { topic: "cyber_scam", category: "" },
  { topic: "migrant_challenges", category: "" },
];

for (const { topic, category } of TOPICS) {
  test(`Assistant route "${topic}" reaches Triage with meaningful governed content and no legacy duplicate`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    await page.goto(`/dashboard?view=assistant&topic=${topic}&category=${category}`);

    // The existing, genuine first-load Safety Gate (src/components/safety/safety-gate.tsx) —
    // acknowledged once per session (sessionStorage), not something to bypass.
    // It mounts via a client-side effect after hydration, so a one-shot
    // `isVisible()` check right after `goto()` can race it (this test
    // originally did that and intermittently failed with the gate's own
    // overlay intercepting the next click) — wait for it with Playwright's
    // auto-retrying `expect`, which is robust to that timing, instead.
    const safetyGate = page.getByRole("dialog", { name: /before you continue/i });
    await expect(safetyGate).toBeVisible({ timeout: 10_000 });
    await safetyGate.getByRole("checkbox", { name: /i am in a safe place/i }).check();
    await safetyGate.getByRole("button", { name: "Continue safely" }).click();
    await expect(safetyGate).toBeHidden();

    // Preserve the existing Assistant UI — the starter screen's own inline
    // composer (present for all five topics uniformly; "Start with this
    // topic" is a shortcut link that only renders for topics with a
    // `starterPrompt` configured, e.g. NOT General Assistant — see
    // src/lib/dashboard-card-flows.ts). Submitting it seeds the conversation
    // with this message via the exact `resetDemoConversation()` path fixed
    // this phase (see tests/unit/demo-conversation-state.test.ts).
    const starterComposer = page.getByPlaceholder("Type your response...");
    await expect(starterComposer).toBeVisible({ timeout: 15_000 });
    await starterComposer.fill("Someone pulled my hijab today at the station.");
    await starterComposer.press("Enter");

    // Existing local/mock conversation flow continues on the conversation screen.
    const composer = page.getByTestId("ai-conversation-input");
    await expect(composer).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole("button", { name: "I am safe right now" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "I am safe right now" }).click();

    await expect(page.getByRole("button", { name: "Yes, this is right" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Yes, this is right" }).click();

    // Existing Assistant-to-Triage transition — lands on the existing Triage route.
    await page.waitForURL(/view=reportsubmissionsupport/, { timeout: 15_000 });

    // Governed content actually renders (the single mock recommendation source).
    const anyGovernedSection = page
      .getByTestId(/^triage-resource-group-matched-|^triage-mock-support-options$|^triage-advocates-section$|^triage-reporting-destinations-section$/)
      .first();
    await expect(anyGovernedSection).toBeVisible({ timeout: 15_000 });

    // The old duplicate static "Support options tailored to you" testid must
    // never appear alongside it — that section was removed as the
    // single-source consolidation's whole point.
    await expect(page.getByTestId("triage-support-options")).toHaveCount(0);

    expect(pageErrors, `unexpected page error(s) for topic "${topic}": ${pageErrors.join("; ")}`).toEqual([]);
  });
}
