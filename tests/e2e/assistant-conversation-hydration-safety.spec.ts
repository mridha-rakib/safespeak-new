import { expect, test } from "@playwright/test";

const DEMO_ASSISTANT_STORAGE_KEY = "safespeak_demo_assistant_conversation";

test("no hydration mismatch when a saved demo conversation (with suggestion chips) already exists in sessionStorage", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await page.addInitScript(
    ([key]) => {
      window.sessionStorage.setItem(
        key,
        JSON.stringify({
          stage: "initial_clarification",
          messages: [
            {
              id: "demo-1",
              role: "assistant",
              content: "Thanks for sharing that. Can you tell me more?",
              createdAt: new Date().toISOString(),
              suggestions: [
                { id: "sug-1", label: "It happened once" },
                { id: "sug-2", label: "It has happened before" },
              ],
            },
          ],
          collectedAnswers: {},
          attachments: [],
          progress: 20,
          readiness: 0,
        })
      );
    },
    [DEMO_ASSISTANT_STORAGE_KEY]
  );

  await page.goto("/dashboard?view=assistantconversation");
  await page.waitForTimeout(1500);

  const hydrationErrors = consoleErrors.filter((text) =>
    /hydration/i.test(text)
  );
  expect(hydrationErrors, hydrationErrors.join("\n---\n")).toHaveLength(0);

  // The restored session's suggestion chips should show up post-hydration.
  await expect(page.getByText("It happened once")).toBeVisible({ timeout: 5_000 });
});
