/**
 * Phase 8 — canonical community-background catalogue for the manual report
 * builder's Community stage. Kept separate from `report-language.ts` so
 * Review/Consent stages can resolve a stable value to a readable label
 * without re-declaring the option list, and so no other surface infers a
 * community selection from language, uploaded files, or typed narrative.
 */
export const REPORT_COMMUNITY_OPTIONS = [
  "CALD (Culturally & Linguistically Diverse)",
  "Aboriginal or Torres Strait Islander",
  "Migrant or refugee",
] as const;

export type ReportCommunityOption = (typeof REPORT_COMMUNITY_OPTIONS)[number];

export const REPORT_COMMUNITY_SKIP_OPTION = "Prefer not to say";

export function formatReportCommunityLabel(
  value: string | null | undefined
): string {
  if (!value) {
    return "Not provided";
  }

  return value;
}
