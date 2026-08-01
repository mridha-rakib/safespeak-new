import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTINUE_TO_TRIAGE_SUGGESTION_ID,
  HIJAB_CONFIRM_TRIAGE_SUGGESTION_ID,
  resetDemoConversation,
  sendDemoConversationMessage,
  type DemoCollectedAnswers,
  type DemoConversationStage,
} from "../../src/lib/demo-assistant-conversation";

/**
 * Phase 6.1 — canonical Assistant conversation state. Two confirmed,
 * previously-separate bugs, both fixed by making `resetDemoConversation`
 * delegate to the same stage-transition logic manually-typed messages use,
 * and by giving the general (non-hijab) storyline its own `understanding`
 * builder:
 *
 *  1. A seeded (`?message=...`) non-hijab message stayed on `stage: "opening"`
 *     forever instead of advancing to `"initial_clarification"` the way the
 *     identical text typed manually into the opening stage would — the next
 *     turn then silently re-processed the user's actual next message as if
 *     it were still the very first message.
 *  2. `demoState.understanding` was only ever set by the hijab-specific
 *     storyline. `handleContinueToTriage` requires it, so the "Continue to
 *     Triage" action was unreachable for the general storyline regardless
 *     of topic — the four Assistant topics that don't happen to mention
 *     "hijab" had no working path to Triage at all.
 */

test("a seeded non-hijab initial message advances to initial_clarification (not opening) — matches the manually-typed path", async () => {
  const seeded = resetDemoConversation("Someone has been following me around.");
  assert.equal(seeded.stage, "initial_clarification");
  assert.equal(seeded.collectedAnswers.initialConcern, "Someone has been following me around.");

  // The manually-typed path for the exact same "opening" stage + content.
  const typed = await sendDemoConversationMessage({
    content: "Someone has been following me around.",
    stage: "opening",
    collectedAnswers: {},
  });
  assert.equal(typed.stage, seeded.stage);
  assert.equal(typed.message.content, seeded.messages[1]!.content);
});

test("a seeded message with no content still greets with opening suggestions (unchanged first-load behaviour)", () => {
  const state = resetDemoConversation();
  assert.equal(state.stage, "opening");
  assert.deepEqual(state.collectedAnswers, {});
  assert.ok(state.messages[0]!.suggestions && state.messages[0]!.suggestions!.length > 0);
});

test("a seeded hijab-mentioning message still routes to hijab_clarification (unchanged, still correct)", () => {
  const state = resetDemoConversation("Someone pulled my hijab today.");
  assert.equal(state.stage, "hijab_clarification");
  assert.equal(state.messages.length, 2);
  assert.equal(state.messages[0]!.role, "user");
  assert.equal(state.messages[1]!.role, "assistant");
});

test("the general (non-hijab) storyline reaches final_result with an understanding object, unblocking Triage handoff", async () => {
  let stage: DemoConversationStage = "opening";
  let answers: DemoCollectedAnswers = {};

  const turns = [
    "Someone has been following me around.",
    "It happened yesterday near my work.",
    "They kept showing up at random times.",
    "Yes that is correct.",
    "A former coworker.",
    "Yes that is right.",
    "Okay, show me the options.",
  ];

  let understanding;
  for (const content of turns) {
    const turn = await sendDemoConversationMessage({ content, stage, collectedAnswers: answers, understanding });
    stage = turn.stage;
    answers = turn.collectedAnswers;
    understanding = turn.understanding;
  }

  assert.equal(stage, "final_result");
  assert.ok(understanding, "the general storyline must produce an understanding object by final_result");
  assert.equal(typeof understanding!.concernType, "string");
  assert.ok(understanding!.concernType.length > 0);
  assert.ok(["low", "medium", "high"].includes(understanding!.urgencyLevel));
  assert.ok(["unknown", "safe", "unsafe"].includes(understanding!.safetyStatus));
});

test("final_result's suggestions include the Continue-to-Triage action, wired to the same suggestion id the hijab storyline uses", async () => {
  const turn = await sendDemoConversationMessage({
    content: "Okay, show me the options.",
    stage: "completion_transition",
    collectedAnswers: { initialConcern: "test", timingOrLocation: "test", details: "test", people: "test" },
  });

  assert.equal(turn.stage, "final_result");
  const suggestionIds = turn.message.suggestions?.map((s) => s.id) ?? [];
  assert.ok(
    suggestionIds.includes(CONTINUE_TO_TRIAGE_SUGGESTION_ID),
    "final_result must offer a suggestion the UI wires to handleContinueToTriage()"
  );
  // Distinct from the hijab confirmation id — two separate storylines, one shared handoff behaviour.
  assert.notEqual(CONTINUE_TO_TRIAGE_SUGGESTION_ID, HIJAB_CONFIRM_TRIAGE_SUGGESTION_ID);
});
