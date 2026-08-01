import assert from "node:assert/strict";
import test from "node:test";

import { getPersonInitials } from "../../src/lib/user-identity";

/**
 * Phase 8.4 — the shared "how do we show this person" helper used by both
 * the dashboard header's account trigger and the Profile page's avatar.
 */

test("takes the first letter of the first two words of a full name", () => {
  assert.equal(getPersonInitials("Amara Okafor"), "AO");
});

test("a single-word name still produces an initial", () => {
  assert.equal(getPersonInitials("Amara"), "A");
});

test("a name with more than two words uses only the first two", () => {
  assert.equal(getPersonInitials("Amara Chidi Okafor"), "AC");
});

test("Bengali (or any non-Latin script) name is initialed the same way, never transliterated or blanked", () => {
  assert.equal(getPersonInitials("রহিমা বেগম"), "রব");
});

test("falls back to the email local-part when no name is available", () => {
  assert.equal(getPersonInitials(undefined, "amara.okafor@example.com"), "A");
});

test("falls back to a generic 'SafeSpeak User' label when neither name nor email is available", () => {
  assert.equal(getPersonInitials(null, null), "SU");
});

test("blank/whitespace-only name falls back exactly like a missing one", () => {
  assert.equal(getPersonInitials("   ", "amara@example.com"), "A");
});

test("collapses repeated internal whitespace instead of producing an empty initial segment", () => {
  assert.equal(getPersonInitials("Amara   Okafor"), "AO");
});
