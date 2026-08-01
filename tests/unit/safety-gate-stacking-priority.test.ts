import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readdirSync, statSync } from "node:fs";
import test from "node:test";

/**
 * Phase 8.2 — regression guard for a real bug found via Playwright: a
 * direct/bookmarked link straight to a detail URL
 * (`?recommendationType=...&recommendationId=...`) on a fresh session
 * mounts the recommendation detail modal at the same time as the Safety
 * Gate. Both are `position: fixed` full-screen overlays — whichever has the
 * higher `z-*` class wins the stacking order and captures pointer events.
 * The Safety Gate previously used `z-[120]`, lower than several other app
 * overlays already using `z-[130]`/`z-[140]` (e.g. the recommendation
 * detail modal, smart dialer modal), so it could render usably but be
 * visually and interactively buried underneath them — a safety control
 * must always win. Fixed by moving it to `z-[150]`.
 *
 * This test doesn't hardcode "150" as the one true value — hardcoding a
 * number would let a future PR silently reintroduce the bug by adding a
 * new overlay at, say, z-[160]. It instead scans every `fixed inset-0
 * z-[N]` overlay declaration in the app and asserts the Safety Gate's is
 * the strict maximum, so any future higher overlay fails this test until
 * the Safety Gate is raised again.
 */

const SRC_DIR = join(__dirname, "../../src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (/\.(tsx|ts)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function findFixedOverlayZIndexes(): Array<{ file: string; zIndex: number }> {
  const results: Array<{ file: string; zIndex: number }> = [];
  const pattern = /fixed inset-0[^"'`]*?z-\[(\d+)\]/g;

  for (const file of walk(SRC_DIR)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(pattern)) {
      results.push({ file, zIndex: Number(match[1]) });
    }
  }

  return results;
}

test("the Safety Gate's overlay z-index is the strict maximum among every full-screen fixed overlay in the app", () => {
  const overlays = findFixedOverlayZIndexes();
  assert.ok(overlays.length > 1, "expected to find multiple fixed-overlay z-index declarations to compare");

  const safetyGateEntry = overlays.find((entry) => entry.file.endsWith("safety-gate.tsx"));
  assert.ok(safetyGateEntry, "safety-gate.tsx overlay z-index not found");

  const highestOther = Math.max(
    ...overlays.filter((entry) => entry !== safetyGateEntry).map((entry) => entry.zIndex)
  );

  assert.ok(
    safetyGateEntry!.zIndex > highestOther,
    `Safety Gate z-index (${safetyGateEntry!.zIndex}) must be strictly higher than every other fixed overlay's z-index (highest other: ${highestOther}). A direct link that opens a detail modal on an undismissed Safety Gate must never let that modal render on top of the gate.`
  );
});
