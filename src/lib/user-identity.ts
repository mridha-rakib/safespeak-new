/**
 * Phase 8.4 — the one shared "how do we show this person" helper, reused by
 * both the dashboard header's account trigger and the Profile page's
 * avatar. Previously duplicated as a page-local, unexported function inside
 * `src/app/profile/page.tsx` — never shared, so the header had no equivalent
 * and rendered plain text with no avatar at all.
 *
 * Deliberately separate from `src/lib/organisation.ts`'s `initialsForName`
 * (organisation-name initials, a different domain) rather than importing
 * across that boundary.
 */
export function getPersonInitials(
  name: string | null | undefined,
  email?: string | null
): string {
  const source = name?.trim() || email?.trim().split("@")[0] || "SafeSpeak User";
  const parts = source.split(/\s+/).filter(Boolean);

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
