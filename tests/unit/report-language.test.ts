import assert from "node:assert/strict";
import test from "node:test";

import {
  LANGUAGE_TRANSLATION_DISCLAIMER,
  REPORT_LANGUAGE_OPTIONS,
  findReportLanguage,
  formatReportLanguageLabel,
} from "../../src/lib/report-language";

/**
 * Phase 8.1 — Bengali (`bn-BD`) support. Pins that Bengali resolves through
 * the same catalogue/label helpers as every other language, that existing
 * codes were not disturbed, and that no automatic-translation claim exists.
 */

test("bn-BD resolves to a Bengali option with the correct native/English names", () => {
  const bengali = findReportLanguage("bn-BD");
  assert.ok(bengali, "bn-BD should resolve");
  assert.equal(bengali!.englishName, "Bengali");
  assert.equal(bengali!.nativeName, "বাংলা");
  assert.equal(bengali!.region, "BD");
});

test("formatReportLanguageLabel renders Bengali as 'বাংলা — Bengali'", () => {
  assert.equal(formatReportLanguageLabel("bn-BD"), "বাংলা — Bengali");
});

test("Bengali is present in the canonical catalogue exactly once", () => {
  const matches = REPORT_LANGUAGE_OPTIONS.filter((language) => language.code === "bn-BD");
  assert.equal(matches.length, 1);
});

test("adding Bengali did not remove or alter any previously supported language", () => {
  const previouslySupported: Array<{ code: string; englishName: string; nativeName: string }> = [
    { code: "en-AU", englishName: "English", nativeName: "English" },
    { code: "ar-SA", englishName: "Arabic", nativeName: "العربية" },
    { code: "zh-CN", englishName: "Mandarin Chinese", nativeName: "中文" },
    { code: "yue-HK", englishName: "Cantonese", nativeName: "粵語" },
    { code: "vi-VN", englishName: "Vietnamese", nativeName: "Tiếng Việt" },
    { code: "pa-IN", englishName: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
    { code: "hi-IN", englishName: "Hindi", nativeName: "हिन्दी" },
    { code: "el-GR", englishName: "Greek", nativeName: "Ελληνικά" },
  ];

  for (const expected of previouslySupported) {
    const found = findReportLanguage(expected.code);
    assert.ok(found, `${expected.code} should still resolve`);
    assert.equal(found!.englishName, expected.englishName);
    assert.equal(found!.nativeName, expected.nativeName);
  }

  assert.equal(REPORT_LANGUAGE_OPTIONS.length, previouslySupported.length + 1);
});

test("the language disclaimer never claims automatic translation of typed or attached content", () => {
  assert.match(LANGUAGE_TRANSLATION_DISCLAIMER, /does not automatically translate/i);
  assert.doesNotMatch(LANGUAGE_TRANSLATION_DISCLAIMER, /\bwill translate\b/i);
});

test("an unknown code degrades to a clear 'no language selected' label, never a raw code", () => {
  assert.equal(formatReportLanguageLabel("xx-XX"), "No language selected");
  assert.equal(formatReportLanguageLabel(null), "No language selected");
  assert.equal(formatReportLanguageLabel(undefined), "No language selected");
});
