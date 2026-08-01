/**
 * Phase 8 — canonical language catalogue for the manual report builder's
 * Language stage. Previously this list lived inline in
 * `report-submission-details-page.tsx`; it now lives here so the Review and
 * Consent stages can look up a stable code's human-readable label without
 * re-declaring the catalogue.
 *
 * These codes describe the *reporting experience/content* language the
 * person is using with SafeSpeak. The prototype does not perform automatic
 * translation of typed text or uploaded files — see
 * `LANGUAGE_TRANSLATION_DISCLAIMER` below, shown on the Language stage.
 */
export type ReportLanguageCode =
  | "en-AU"
  | "ar-SA"
  | "zh-CN"
  | "yue-HK"
  | "vi-VN"
  | "pa-IN"
  | "hi-IN"
  | "bn-BD"
  | "el-GR";

export type ReportLanguageOption = {
  code: ReportLanguageCode;
  region: string;
  englishName: string;
  nativeName: string;
};

export const REPORT_LANGUAGE_OPTIONS: ReportLanguageOption[] = [
  { code: "en-AU", region: "AU", englishName: "English", nativeName: "English" },
  { code: "ar-SA", region: "SA", englishName: "Arabic", nativeName: "العربية" },
  { code: "zh-CN", region: "CN", englishName: "Mandarin Chinese", nativeName: "中文" },
  { code: "yue-HK", region: "HK", englishName: "Cantonese", nativeName: "粵語" },
  { code: "vi-VN", region: "VN", englishName: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "pa-IN", region: "IN", englishName: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
  { code: "hi-IN", region: "IN", englishName: "Hindi", nativeName: "हिन्दी" },
  { code: "bn-BD", region: "BD", englishName: "Bengali", nativeName: "বাংলা" },
  { code: "el-GR", region: "GR", englishName: "Greek", nativeName: "Ελληνικά" },
];

export const LANGUAGE_TRANSLATION_DISCLAIMER =
  "SafeSpeak does not automatically translate what you type or any files you attach in this prototype. Your language choice sets how the report experience is presented.";

export function findReportLanguage(
  code: string | null | undefined
): ReportLanguageOption | undefined {
  return REPORT_LANGUAGE_OPTIONS.find((language) => language.code === code);
}

/** Human-readable "English name — Native name" label, e.g. "বাংলা — Bengali" style formatting used across Review/Consent/Complete. */
export function formatReportLanguageLabel(
  code: string | null | undefined
): string {
  const language = findReportLanguage(code);

  if (!language) {
    return "No language selected";
  }

  return language.nativeName === language.englishName
    ? language.englishName
    : `${language.nativeName} — ${language.englishName}`;
}
