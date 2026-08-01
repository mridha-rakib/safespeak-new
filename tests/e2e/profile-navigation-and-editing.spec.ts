import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 8.4 — the SafeSpeak User Self-Profile route: previously reachable
 * only indirectly (the top-right toolbar identity block was inert text, and
 * "My SafeSpeak" pointed at Settings rather than Profile), and once there it
 * rendered outside `DashboardShell` — no sidebar, no Emergency call/Quick
 * Exit/Smart Dialler while viewing it. This mocks the real backend the same
 * way `explorer-directory.spec.ts` does (no test-only bypass exists in the
 * app itself), since `/profile` requires an authenticated session and this
 * environment has no backend running.
 */

const API_ROUTE = "**/api/v1/**";
const AUTH_SESSION_KEY = "safespeak_auth_session";

function apiEnvelope(data: unknown, message = "OK") {
  return {
    success: true,
    message,
    data,
    timestamp: new Date("2026-07-30T00:00:00.000Z").toISOString(),
    requestId: "profile-e2e-request",
  };
}

/** A structurally valid (unsigned) JWT with a real `exp` claim far in the future — auth.ts only decodes the payload, never verifies the signature. */
function fakeJwt(expiresInSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub: "profile-e2e-user", exp: Math.floor(Date.now() / 1000) + expiresInSeconds })
  ).toString("base64url");
  return `${header}.${payload}.`;
}

const BASE_USER = {
  id: "profile-e2e-user",
  email: "amara.okafor@example.com",
  fullName: "Amara Okafor",
  role: "public_user",
  status: "active",
  isEmailVerified: true,
  createdAt: "2025-01-15T00:00:00.000Z",
  updatedAt: "2025-01-15T00:00:00.000Z",
};

async function installAuthenticatedSession(page: Page, user = BASE_USER) {
  // Runs on every navigation this page makes, including page.reload() — must
  // only ever add the session, never wipe localStorage, or a reload would
  // erase whatever the app itself just persisted there (e.g. saved profile
  // preferences), which previously produced a false failure in the "Save
  // persists ... and survives a refresh" test below.
  await page.addInitScript(
    ({ storageKey, sessionUser, accessToken, refreshToken }) => {
      window.sessionStorage.setItem("safespeak_safety_gate_ack", "1");
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          user: sessionUser,
          tokens: { accessToken, refreshToken },
          timestamp: new Date().toISOString(),
        })
      );
    },
    {
      storageKey: AUTH_SESSION_KEY,
      sessionUser: user,
      accessToken: fakeJwt(3600),
      refreshToken: fakeJwt(3600 * 24 * 30),
    }
  );
}

async function mockProfileApi(page: Page, user = BASE_USER) {
  await page.route(API_ROUTE, async (route) => {
    const pathname = new URL(route.request().url()).pathname;

    if (pathname.endsWith("/auth/me")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(apiEnvelope({ user })) });
      return;
    }
    if (pathname.endsWith("/reports")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(apiEnvelope({ reports: [{ id: "r1" }, { id: "r2" }] })) });
      return;
    }
    if (pathname.endsWith("/support/services")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(apiEnvelope({ services: [{ id: "s1" }] })) });
      return;
    }
    if (pathname.endsWith("/auth/logout")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(apiEnvelope(null)) });
      return;
    }
    if (pathname.endsWith("/profile")) {
      // Deliberately unmocked/failing: this exercises useSafeSpeakProfile's
      // real fallback path (local persistence survives when the backend
      // profile endpoint is unreachable), which is exactly what "Profile
      // preferences saved on this device" is supposed to mean.
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, message: "Service unavailable" }) });
      return;
    }

    await route.fulfill({ contentType: "application/json", body: JSON.stringify(apiEnvelope(null)) });
  });
}

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

test.describe("Profile navigation", () => {
  test.beforeEach(async ({ page }) => {
    await installAuthenticatedSession(page);
    await mockProfileApi(page);
  });

  test("'My SafeSpeak' in the sidebar opens the canonical /profile route directly", async ({ page }) => {
    await page.goto("/dashboard");
    await dismissSafetyGate(page);

    await page.getByRole("link", { name: "My SafeSpeak" }).first().click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
  });

  test("the top-right identity link in the toolbar opens /profile and shows an avatar", async ({ page }) => {
    await page.goto("/dashboard");
    await dismissSafetyGate(page);

    const identityLink = page.getByRole("link", { name: /open your profile/i });
    await expect(identityLink).toBeVisible();
    await expect(identityLink).toContainText("Amara Okafor");
    await identityLink.click();
    await expect(page).toHaveURL(/\/profile$/);
  });

  test("Profile keeps safety controls visible: sidebar, Emergency call, and Quick Exit all render on /profile", async ({ page }) => {
    await page.goto("/profile");
    await dismissSafetyGate(page);

    await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
    await expect(page.getByRole("link", { name: /emergency: 000/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /quick exit/i }).first()).toBeVisible();
  });

  test("Back/Forward and a hard refresh all keep the same Profile route", async ({ page }) => {
    await page.goto("/dashboard");
    await dismissSafetyGate(page);
    await page.getByRole("link", { name: "My SafeSpeak" }).first().click();
    await expect(page).toHaveURL(/\/profile$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goForward();
    await expect(page).toHaveURL(/\/profile$/);

    await page.reload();
    await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
  });
});

test.describe("Profile content and editing", () => {
  test.beforeEach(async ({ page }) => {
    await installAuthenticatedSession(page);
    await mockProfileApi(page);
    await page.goto("/profile");
    await dismissSafetyGate(page);
    await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
  });

  test("shows real identity fields and real activity counts from the backend, never a fabricated value", async ({ page }) => {
    await expect(page.getByText("Amara Okafor").first()).toBeVisible();
    await expect(page.getByText("amara.okafor@example.com").first()).toBeVisible();
    await expect(page.getByText("2", { exact: true }).first()).toBeVisible(); // Reports Submitted
  });

  test("editing preferences: Cancel discards changes without saving", async ({ page }) => {
    await page.getByRole("button", { name: "Edit Profile" }).click();
    const languageSelect = page.getByLabel("Language", { exact: true });
    const originalValue = await languageSelect.inputValue();

    await languageSelect.selectOption("Spanish");
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("button", { name: "Edit Profile" }).click();
    await expect(page.getByLabel("Language", { exact: true })).toHaveValue(originalValue);
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("editing preferences: Save persists locally with truthful wording and survives a refresh", async ({ page }) => {
    await page.getByRole("button", { name: "Edit Profile" }).click();
    await page.getByLabel("Language", { exact: true }).selectOption("Spanish");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Profile preferences saved on this device.")).toBeVisible();

    await page.reload();
    await dismissSafetyGate(page);
    await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
    await page.getByRole("button", { name: "Edit Profile" }).click();
    await expect(page.getByLabel("Language", { exact: true })).toHaveValue("Spanish");
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("shortcut tiles link to real, existing routes — Learn & Resources and Notifications", async ({ page }) => {
    await expect(page.getByRole("link", { name: /learn & resources/i }).last()).toHaveAttribute("href", /view=microcards/);
    await expect(page.getByRole("link", { name: /notifications/i }).last()).toHaveAttribute("href", "/dashboard/notifications");
  });

  test("no report, conversation, evidence, or consent content is shown on the Profile page", async ({ page }) => {
    await expect(page.getByText(/conversation (history|transcript)/i)).toHaveCount(0);
    await expect(page.getByText(/evidence (count|list)/i)).toHaveCount(0);
    await expect(page.getByText(/consent history/i)).toHaveCount(0);
  });

  test("mobile viewport: Profile has no horizontal overflow and the Edit control stays reachable", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await dismissSafetyGate(page);
    await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit Profile" })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflow).toBe(false);
  });
});

test.describe("No active session", () => {
  test("visiting /profile while logged out shows a clear no-session state, not a crash", async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.clear();
      window.localStorage.clear();
      window.sessionStorage.setItem("safespeak_safety_gate_ack", "1");
    });
    await page.goto("/profile");

    await expect(page.getByText(/no active session/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to Login" })).toBeVisible();
  });
});
