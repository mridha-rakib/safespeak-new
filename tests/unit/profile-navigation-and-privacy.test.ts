import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * Phase 8.4 — structural pins for the SafeSpeak User Self-Profile route and
 * its navigation entry points. `/profile` previously rendered its own bare
 * `<main>` (no Sidebar, no Emergency call / Quick Exit / Smart Dialler —
 * every safety control was missing while viewing Profile) and "My SafeSpeak"
 * pointed at `/dashboard/settings` instead of the canonical profile route.
 * These are source-text assertions (no React rendering harness exists in
 * this project) mirroring the convention used by the other structural specs
 * in this suite.
 */

const profilePageSource = readFileSync(
  path.join(__dirname, "../../src/app/profile/page.tsx"),
  "utf-8"
);
const dashboardLayoutSource = readFileSync(
  path.join(__dirname, "../../src/components/dashboard/dashboard-layout.tsx"),
  "utf-8"
);

test("the Profile route is wrapped in DashboardShell, so safety controls (Emergency call, Quick Exit, Smart Dialler, sidebar) are present on every render branch", () => {
  const shellOpenings = profilePageSource.match(/<DashboardShell activeTab="settings">/g) ?? [];
  assert.ok(
    shellOpenings.length >= 3,
    "expected the loading, no-session, and loaded branches to all render inside DashboardShell"
  );
});

test("desktop and mobile 'My SafeSpeak' nav entries point at the canonical /profile route, not /dashboard/settings", () => {
  assert.doesNotMatch(dashboardLayoutSource, /href="\/dashboard\/settings"/);
  const profileLinks = dashboardLayoutSource.match(/href="\/profile"/g) ?? [];
  assert.ok(profileLinks.length >= 3, "expected desktop nav, mobile nav, and the toolbar identity link");
});

test("the top-right account/identity trigger in the toolbar is a real link to /profile with an avatar and an aria-label, not inert text", () => {
  assert.match(dashboardLayoutSource, /<Link\s+href="\/profile"[\s\S]{0,200}aria-label=/);
  assert.match(dashboardLayoutSource, /getPersonInitials\(userName\)/);
});

test("no invented personal fields (date of birth, gender, religion, ethnicity, address, government ID) appear on the Profile page", () => {
  const forbidden = [
    /date of birth/i,
    /\bgender\b/i,
    /\breligion\b/i,
    /\bethnicity\b/i,
    /home address/i,
    /government id/i,
  ];
  for (const pattern of forbidden) {
    assert.doesNotMatch(profilePageSource, pattern);
  }
});

test("no report/conversation/evidence/consent content is shown on the Profile page — only a count already safe elsewhere, or a shortcut link", () => {
  assert.doesNotMatch(profilePageSource, /conversation (history|transcript|content)/i);
  assert.doesNotMatch(profilePageSource, /evidence (count|list)/i);
  assert.doesNotMatch(profilePageSource, /consent history/i);
  assert.doesNotMatch(profilePageSource, /incident history/i);
});

test("preference persistence uses truthful, local-only wording — never a fabricated server-sync claim", () => {
  assert.match(profilePageSource, /Profile preferences saved on this device\./);
  assert.doesNotMatch(profilePageSource, /profile updated on the server/i);
  assert.doesNotMatch(profilePageSource, /account synchroni[sz]ed/i);
});

test("the fake Security card (fabricated 'active sessions' count) has been removed", () => {
  assert.doesNotMatch(profilePageSource, /active sessions/i);
});

test("dead/fake editable fields (Phone with no backing data, Timezone/Preferred Contact with no real edit path) are not present", () => {
  assert.doesNotMatch(profilePageSource, /label="Phone"/);
});

test("no raw storage key, enum value, or internal id is rendered as user-facing text on the Profile page", () => {
  assert.doesNotMatch(profilePageSource, /safespeak_user_profile/);
  assert.doesNotMatch(profilePageSource, /safespeak_auth_session/);
});
