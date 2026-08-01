import assert from "node:assert/strict";
import test from "node:test";

import {
  getMockMicrocardCategories,
  getMockMicrocardById,
  getMockMicrocards,
  getMockMicrocardsByCategory,
  isMicrocardLibraryUnavailable,
} from "../../src/lib/mock/microcard-library-adapter";

/**
 * Phase 8.3 — the dedicated Resource Library / Micro-card browsing pages
 * (`?view=resources`, `?view=microcards`, `?view=microeducation`) now
 * source from this adapter (over the real, committed `MockContentRepository`
 * singleton and generated bundle — not a hand-built fixture) instead of the
 * real-backend `microeducation.ts` client, which has no data in this
 * design/mock phase. Pins: only published records surface, categories with
 * zero published cards are excluded, admin-only fields never leak, ids stay
 * stable, and nothing crashes on a missing id.
 */

test("the repository is ready and not unavailable against the committed bundle", () => {
  assert.equal(isMicrocardLibraryUnavailable(), false);
});

test("getMockMicrocardCategories returns only categories with at least one published card, sorted by displayOrder", () => {
  const categories = getMockMicrocardCategories();
  assert.ok(categories.length > 0, "expected at least one category with published cards");

  for (const category of categories) {
    assert.ok((category.cardCount ?? 0) > 0);
    assert.equal(category.status, "published");
    assert.equal(typeof category.name, "string");
    assert.ok(category.name.length > 0);
  }

  const sortOrders = categories.map((category) => category.sortOrder);
  assert.deepEqual(sortOrders, [...sortOrders].sort((a, b) => a - b));
});

test("category colours are derived deterministically from accentToken, never left as a raw token string", () => {
  const categories = getMockMicrocardCategories();
  for (const category of categories) {
    assert.match(category.backgroundColor, /^#[0-9a-f]{6}$/i);
    assert.match(category.textColor, /^#[0-9a-f]{6}$/i);
  }
});

test("getMockMicrocardsByCategory returns only that category's published cards, sorted by displayOrder", () => {
  const [firstCategory] = getMockMicrocardCategories();
  assert.ok(firstCategory, "expected at least one category to test against");

  const cards = getMockMicrocardsByCategory(firstCategory!.id);
  assert.ok(cards.length > 0);

  for (const card of cards) {
    assert.equal(card.categoryId, firstCategory!.id);
    assert.ok(card.title.length > 0);
    assert.ok(card.summary.length > 0);
  }

  const orders = cards.map((card) => card.sortOrder);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
});

test("getMockMicrocardsByCategory returns an empty array for an unknown/missing category id, never throwing", () => {
  assert.deepEqual(getMockMicrocardsByCategory("not-a-real-category"), []);
});

test("getMockMicrocards returns every published card exactly once, deterministically ordered", () => {
  const first = getMockMicrocards().map((card) => card.id);
  const second = getMockMicrocards().map((card) => card.id);
  assert.deepEqual(first, second);
  assert.equal(new Set(first).size, first.length, "no duplicate ids");
  assert.ok(first.length > 0);
});

test("getMockMicrocardById resolves a real card by its stable id and returns undefined for a missing one", () => {
  const [card] = getMockMicrocards();
  assert.ok(card, "expected at least one published card");

  const resolved = getMockMicrocardById(card!.id);
  assert.ok(resolved);
  assert.equal(resolved!.id, card!.id);
  assert.equal(resolved!.title, card!.title);

  assert.equal(getMockMicrocardById("definitely-not-a-real-id"), undefined);
});

test("no admin-only field (internalNotes, createdBy, updatedBy) is present on a mapped card", () => {
  for (const card of getMockMicrocards()) {
    const raw = card as unknown as Record<string, unknown>;
    assert.equal("internalNotes" in raw, false);
    assert.equal("createdBy" in raw, false);
    assert.equal("updatedBy" in raw, false);
  }
});

test("a mapped card never renders a raw snake_case cardType as its tag when no category name is available", () => {
  for (const card of getMockMicrocards()) {
    assert.doesNotMatch(card.tag, /_/);
  }
});

test("structural defaults (readTimeLabel/duration/format) are present but clearly generic, never a per-card fabrication", () => {
  for (const card of getMockMicrocards()) {
    assert.equal(card.duration, "quick");
    assert.equal(card.format, "guide");
    assert.equal(card.readTimeLabel, "4 min read");
  }
});
