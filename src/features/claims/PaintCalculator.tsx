/**
 * PaintCalculator.tsx
 * מחשבון עלות צבע לרכב — גרסה 2025-v9
 * משולב במערכת ניהול התביעות (STAGING בלבד).
 * כולל עבודה מהירה, הסברים מקצועיים אוטומטיים, שמירת טיוטה/שמירה רשמית והיסטוריה.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ClaimRecord } from './claimsConstants';
import type { PaintCalcData, PaintCalcPart, PaintCalcRow } from './claimPaintCalc';
import { loadPaintCalcDraft, savePaintCalcDraft, savePaintCalcOfficial, loadPaintCalcHistory } from './claimPaintCalc';
import './paint-calc.css';

// ─── PARTS DATA (A, B, C, D) ──────────────────────────────────────────────────

const PARTS_DATA: Record<string, Record<string, number>> = {
  A: {
    "מגן קדמי חיצוני": 1.95, "מכסה מנוע": 2.50, "כנף קדמית": 1.90, "דלת קדמית": 2.20, "דלת אחורית": 2.05,
    "גג": 3.40, "כנף או דופן אחורית": 2.30, "מכסה תא מטען": 2.20, "דלת תא מטען": 1.95, "מגן אחורי חיצוני": 1.95,
    "פגוש קדמי": 2.00, "פגוש אחורי": 2.00, "מגן קדמי": 1.95, "מגן אחורי": 1.95, "פנימי פגוש קדמי": 1.20,
    "פנימי פגוש אחורי": 1.20, "כנף קדמית ימין": 1.90, "כנף קדמית שמאל": 1.90, "כנף אחורית ימין": 2.10,
    "כנף אחורית שמאל": 2.10, "כנף עליונה ימין": 1.50, "כנף עליונה שמאל": 1.50, "כנף תחתונה ימין": 1.40,
    "כנף תחתונה שמאל": 1.40, "דופן אחורית ימין": 2.20, "דופן אחורית שמאל": 2.20, "דלת קדמית ימין": 2.20,
    "דלת קדמית שמאל": 2.20, "דלת אחורית ימין": 2.05, "דלת אחורית שמאל": 2.05, "סף עליון ימין": 1.10,
    "סף עליון שמאל": 1.10, "סף תחתון ימין": 1.00, "סף תחתון שמאל": 1.00, "סף פלסטיק ימין": 0.90,
    "סף פלסטיק שמאל": 0.90, "משקוף קדמי ימין": 0.80, "משקוף קדמי שמאל": 0.80, "משקוף אמצעי ימין": 0.80,
    "משקוף אמצעי שמאל": 0.80, "משקוף אחורי ימין": 0.80, "משקוף אחורי שמאל": 0.80, "משקוף עליון ימין": 0.70,
    "משקוף עליון שמאל": 0.70, "קורה קדמית ימין": 1.00, "קורה קדמית שמאל": 1.00, "קורה אמצעית ימין": 0.90,
    "קורה אמצעית שמאל": 0.90, "קורה אחורית ימין": 0.90, "קורה אחורית שמאל": 0.90, "קורת גג ימין": 1.20,
    "קורת גג שמאל": 1.20, "בית מראה ימין": 0.60, "בית מראה שמאל": 0.60, "ידית דלת קדמית ימין": 0.40,
    "ידית דלת קדמית שמאל": 0.40, "ידית דלת אחורית ימין": 0.40, "ידית דלת אחורית שמאל": 0.40,
    "קישוט דלת קדמית ימין": 0.50, "קישוט דלת קדמית שמאל": 0.50, "קישוט דלת אחורית ימין": 0.50,
    "קישוט דלת אחורית שמאל": 0.50, "פס קישוט צד ימין": 0.60, "פס קישוט צד שמאל": 0.60, "ספוילר קדמי": 1.20,
    "ספוילר אחורי": 1.10, "גריל קדמי": 0.80, "כיסוי פנס ערפל ימין": 0.50, "כיסוי פנס ערפל שמאל": 0.50,
    "פח חזית": 1.80, "פח אחורי": 1.80, "מסגרת רדיאטור": 1.00, "קורת רוחב קדמית": 0.90,
    "קורת רוחב אחורית": 0.90, "בית גלגל קדמי ימין": 0.70, "בית גלגל קדמי שמאל": 0.70,
    "בית גלגל אחורי ימין": 0.70, "בית גלגל אחורי שמאל": 0.70
  },
  B: {
    "מגן קדמי חיצוני": 2.05, "מכסה מנוע": 2.65, "כנף קדמית": 1.90, "דלת קדמית": 2.20, "דלת אחורית": 2.05,
    "גג": 3.00, "כנף או דופן אחורית": 2.30, "מכסה תא מטען": 2.30, "דלת תא מטען": 1.95, "מגן אחורי חיצוני": 2.40,
    "פגוש קדמי": 2.10, "פגוש אחורי": 2.10, "מגן קדמי": 2.05, "מגן אחורי": 2.40, "פנימי פגוש קדמי": 1.30,
    "פנימי פגוש אחורי": 1.30, "כנף קדמית ימין": 1.90, "כנף קדמית שמאל": 1.90, "כנף אחורית ימין": 2.20,
    "כנף אחורית שמאל": 2.20, "כנף עליונה ימין": 1.60, "כנף עליונה שמאל": 1.60, "כנף תחתונה ימין": 1.50,
    "כנף תחתונה שמאל": 1.50, "דופן אחורית ימין": 2.30, "דופן אחורית שמאל": 2.30, "דלת קדמית ימין": 2.20,
    "דלת קדמית שמאל": 2.20, "דלת אחורית ימין": 2.05, "דלת אחורית שמאל": 2.05, "סף עליון ימין": 1.20,
    "סף עליון שמאל": 1.20, "סף תחתון ימין": 1.10, "סף תחתון שמאל": 1.10, "סף פלסטיק ימין": 1.00,
    "סף פלסטיק שמאל": 1.00, "משקוף קדמי ימין": 0.90, "משקוף קדמי שמאל": 0.90, "משקוף אמצעי ימין": 0.90,
    "משקוף אמצעי שמאל": 0.90, "משקוף אחורי ימין": 0.90, "משקוף אחורי שמאל": 0.90, "משקוף עליון ימין": 0.80,
    "משקוף עליון שמאל": 0.80, "קורה קדמית ימין": 1.10, "קורה קדמית שמאל": 1.10, "קורה אמצעית ימין": 1.00,
    "קורה אמצעית שמאל": 1.00, "קורה אחורית ימין": 1.00, "קורה אחורית שמאל": 1.00, "קורת גג ימין": 1.30,
    "קורת גג שמאל": 1.30, "בית מראה ימין": 0.65, "בית מראה שמאל": 0.65, "ידית דלת קדמית ימין": 0.45,
    "ידית דלת קדמית שמאל": 0.45, "ידית דלת אחורית ימין": 0.45, "ידית דלת אחורית שמאל": 0.45,
    "קישוט דלת קדמית ימין": 0.55, "קישוט דלת קדמית שמאל": 0.55, "קישוט דלת אחורית ימין": 0.55,
    "קישוט דלת אחורית שמאל": 0.55, "פס קישוט צד ימין": 0.65, "פס קישוט צד שמאל": 0.65, "ספוילר קדמי": 1.30,
    "ספוילר אחורי": 1.20, "גריל קדמי": 0.90, "כיסוי פנס ערפל ימין": 0.55, "כיסוי פנס ערפל שמאל": 0.55,
    "פח חזית": 1.90, "פח אחורי": 1.90, "מסגרת רדיאטור": 1.10, "קורת רוחב קדמית": 1.00,
    "קורת רוחב אחורית": 1.00, "בית גלגל קדמי ימין": 0.75, "בית גלגל קדמי שמאל": 0.75,
    "בית גלגל אחורי ימין": 0.75, "בית גלגל אחורי שמאל": 0.75
  },
  C: {
    "מגן קדמי חיצוני": 2.45, "מכסה מנוע": 2.75, "כנף קדמית": 2.15, "דלת קדמית": 2.15, "דלת אחורית": 2.10,
    "גג": 3.20, "כנף או דופן אחורית": 2.15, "מכסה תא מטען": 2.35, "דלת תא מטען": 2.35, "מגן אחורי חיצוני": 2.75,
    "פגוש קדמי": 2.50, "פגוש אחורי": 2.50, "מגן קדמי": 2.45, "מגן אחורי": 2.75, "פנימי פגוש קדמי": 1.50,
    "פנימי פגוש אחורי": 1.50, "כנף קדמית ימין": 2.15, "כנף קדמית שמאל": 2.15, "כנף אחורית ימין": 2.30,
    "כנף אחורית שמאל": 2.30, "כנף עליונה ימין": 1.75, "כנף עליונה שמאל": 1.75, "כנף תחתונה ימין": 1.65,
    "כנף תחתונה שמאל": 1.65, "דופן אחורית ימין": 2.40, "דופן אחורית שמאל": 2.40, "דלת קדמית ימין": 2.15,
    "דלת קדמית שמאל": 2.15, "דלת אחורית ימין": 2.10, "דלת אחורית שמאל": 2.10, "סף עליון ימין": 1.35,
    "סף עליון שמאל": 1.35, "סף תחתון ימין": 1.25, "סף תחתון שמאל": 1.25, "סף פלסטיק ימין": 1.10,
    "סף פלסטיק שמאל": 1.10, "משקוף קדמי ימין": 1.00, "משקוף קדמי שמאל": 1.00, "משקוף אמצעי ימין": 1.00,
    "משקוף אמצעי שמאל": 1.00, "משקוף אחורי ימין": 1.00, "משקוף אחורי שמאל": 1.00, "משקוף עליון ימין": 0.90,
    "משקוף עליון שמאל": 0.90, "קורה קדמית ימין": 1.20, "קורה קדמית שמאל": 1.20, "קורה אמצעית ימין": 1.10,
    "קורה אמצעית שמאל": 1.10, "קורה אחורית ימין": 1.10, "קורה אחורית שמאל": 1.10, "קורת גג ימין": 1.45,
    "קורת גג שמאל": 1.45, "בית מראה ימין": 0.75, "בית מראה שמאל": 0.75, "ידית דלת קדמית ימין": 0.50,
    "ידית דלת קדמית שמאל": 0.50, "ידית דלת אחורית ימין": 0.50, "ידית דלת אחורית שמאל": 0.50,
    "קישוט דלת קדמית ימין": 0.65, "קישוט דלת קדמית שמאל": 0.65, "קישוט דלת אחורית ימין": 0.65,
    "קישוט דלת אחורית שמאל": 0.65, "פס קישוט צד ימין": 0.75, "פס קישוט צד שמאל": 0.75, "ספוילר קדמי": 1.50,
    "ספוילר אחורי": 1.40, "גריל קדמי": 1.00, "כיסוי פנס ערפל ימין": 0.65, "כיסוי פנס ערפל שמאל": 0.65,
    "פח חזית": 2.10, "פח אחורי": 2.10, "מסגרת רדיאטור": 1.20, "קורת רוחב קדמית": 1.10,
    "קורת רוחב אחורית": 1.10, "בית גלגל קדמי ימין": 0.85, "בית גלגל קדמי שמאל": 0.85,
    "בית גלגל אחורי ימין": 0.85, "בית גלגל אחורי שמאל": 0.85
  },
  D: {
    "מגן קדמי חיצוני": 2.45, "מכסה מנוע": 2.75, "כנף קדמית": 2.15, "דלת קדמית": 2.15, "דלת אחורית": 2.10,
    "גג": 3.30, "כנף או דופן אחורית": 2.15, "מכסה תא מטען": 2.35, "דלת תא מטען": 2.35, "מגן אחורי חיצוני": 2.75,
    "פגוש קדמי": 2.60, "פגוש אחורי": 2.60, "מגן קדמי": 2.45, "מגן אחורי": 2.75, "פנימי פגוש קדמי": 1.60,
    "פנימי פגוש אחורי": 1.60, "כנף קדמית ימין": 2.15, "כנף קדמית שמאל": 2.15, "כנף אחורית ימין": 2.35,
    "כנף אחורית שמאל": 2.35, "כנף עליונה ימין": 1.80, "כנף עליונה שמאל": 1.80, "כנף תחתונה ימין": 1.70,
    "כנף תחתונה שמאל": 1.70, "דופן אחורית ימין": 2.50, "דופן אחורית שמאל": 2.50, "דלת קדמית ימין": 2.15,
    "דלת קדמית שמאל": 2.15, "דלת אחורית ימין": 2.10, "דלת אחורית שמאל": 2.10, "סף עליון ימין": 1.40,
    "סף עליון שמאל": 1.40, "סף תחתון ימין": 1.30, "סף תחתון שמאל": 1.30, "סף פלסטיק ימין": 1.15,
    "סף פלסטיק שמאל": 1.15, "משקוף קדמי ימין": 1.05, "משקוף קדמי שמאל": 1.05, "משקוף אמצעי ימין": 1.05,
    "משקוף אמצעי שמאל": 1.05, "משקוף אחורי ימין": 1.05, "משקוף אחורי שמאל": 1.05, "משקוף עליון ימין": 0.95,
    "משקוף עליון שמאל": 0.95, "קורה קדמית ימין": 1.25, "קורה קדמית שמאל": 1.25, "קורה אמצעית ימין": 1.15,
    "קורה אמצעית שמאל": 1.15, "קורה אחורית ימין": 1.15, "קורה אחורית שמאל": 1.15, "קורת גג ימין": 1.55,
    "קורת גג שמאל": 1.55, "בית מראה ימין": 0.80, "בית מראה שמאל": 0.80, "ידית דלת קדמית ימין": 0.55,
    "ידית דלת קדמית שמאל": 0.55, "ידית דלת אחורית ימין": 0.55, "ידית דלת אחורית שמאל": 0.55,
    "קישוט דלת קדמית ימין": 0.70, "קישוט דלת קדמית שמאל": 0.70, "קישוט דלת אחורית ימין": 0.70,
    "קישוט דלת אחורית שמאל": 0.70, "פס קישוט צד ימין": 0.80, "פס קישוט צד שמאל": 0.80, "ספוילר קדמי": 1.60,
    "ספוילר אחורי": 1.50, "גריל קדמי": 1.10, "כיסוי פנס ערפל ימין": 0.70, "כיסוי פנס ערפל שמאל": 0.70,
    "פח חזית": 2.20, "פח אחורי": 2.20, "מסגרת רדיאטור": 1.30, "קורת רוחב קדמית": 1.20,
    "קורת רוחב אחורית": 1.20, "בית גלגל קדמי ימין": 0.90, "בית גלגל קדמי שמאל": 0.90,
    "בית גלגל אחורי ימין": 0.90, "בית גלגל אחורי שמאל": 0.90
  }
};

const PAINT_RULES: Record<string, { name: string; defaultMaterialPercent: number }> = {
  solid: { name: "ברק ישיר", defaultMaterialPercent: 25 },
  baseclear: { name: "דו שכבתי", defaultMaterialPercent: 35 },
  pearl: { name: "תלת שכבתי או פנינה", defaultMaterialPercent: 45 }
};

const GROUP_MATERIAL_PERCENT: Record<string, number> = { A: 35, B: 38, C: 42, D: 45 };

const WORK_MODES: Record<string, { label: string; defaultPercent: number }> = {
  full: { label: "תיקון או צבע מלא", defaultPercent: 100 },
  blend: { label: "טשטוש", defaultPercent: 50 },
  newpart: { label: "חלק חדש", defaultPercent: 70 },
  none: { label: "בלי עבודה", defaultPercent: 0 },
  custom: { label: "אחוז ידני", defaultPercent: 100 }
};

const EXTRA_HOURS_TEXT = "נוספו שעות הכנה נוספות לפני כניסה לתא צבע ותנור, הכוללות ליטושים נוספים, ניקוי פני שטח, הכנת אזורי מעבר, ניקוי אנטי סיליקון, דבק אבק והכנת החלק לצביעה.";

const PRESETS: Record<string, string> = {
  דלת_חדש: `בוצעה הכנה וצביעה לדלת חדשה, לרבות צביעה פנימית וחיצונית, קנטים ואזורי קיפול.\nהדלת הוכנה בנפרד באמצעות ליטוש עדין, ניקוי אנטי סיליקון, דבק אבק והכנת פני שטח לקבלת צבע תקין.\nבוצעה צביעה פנימית של הדלת בנפרד לפני הרכבה, כולל עיטוף נפרד, הכנת תנור, הכנת פיסטולטים וייבוש ביניים.\nלאחר מכן הורכבה הדלת על הרכב ובוצעה צביעה חיצונית יחד עם חלקי המרכב הסמוכים לצורך התאמת גוון מלאה.\nהעבודה בדלת חדשה מחייבת שני שלבי הכנה וצביעה, ולכן אינה זהה לדלת שעברה תיקון.`,
  דלת_תיקון: `בוצעו עבודות הכנה לצבע בדלת לאחר תיקון פחחות. העבודה כללה ליטושים בדרגות שונות, החלקת פני שטח, פתיחת אזורי מעבר והכנת אזור התיקון לצביעה.\nבוצע שימוש בפילר מקצועי וחומרי צבע מסוג Sikkens לסגירת נקבוביות, סימני תיקון ואי אחידויות במשטח.\nבוצע שימוש בחומר ביקורת Guide Coat לצורך איתור גלים, שקיעות ופגמים זעירים לפני הצביעה.\nלפני הכניסה לתא הצבע בוצע ניקוי אנטי סיליקון, דבק אבק, הכנת פיסטולטים, ערבוב צבע ולכה וסינון חומרים.\nהעבודה נועדה לקבלת פני שטח אחידים ומניעת סימני תיקון לאחר הצביעה.`,
  דלת_טשטוש: `בוצע טשטוש צבע בדלת לצורך התאמת גוון ומניעת הבדלי צבע בין החלק שנצבע לבין חלק מקורי.\nהעבודה כללה ליטוש עדין, פתיחת אזור מעבר, ניקוי אנטי סיליקון, דבק אבק, שימוש בטינר טשטוש, יישום צבע מדורג ולכה באזור המעבר.\nהטשטוש מחושב כחלקי ואינו כולל עבודת פחחות.`,
  כנף_חדש: `בוצעה הכנה וצביעה לכנף חדשה, לרבות דפנות, קנטים ואזורי חיבור פנימיים.\nהכנף עברה ליטוש עדין, ניקוי אנטי סיליקון, דבק אבק והכנת פני שטח לקבלת מערכת צבע תקינה.\nהקנטים והדפנות נצבעו בשלב ראשון בנפרד, מאחר שאזורים אלו אינם נגישים באופן מלא לאחר הרכבת החלק על הרכב.\nלאחר ייבוש ביניים בוצעה התאמת הכנף לצביעה חיצונית יחד עם חלקי המרכב הסמוכים לקבלת אחידות גוון וברק.\nהעבודה כללה הכנת תנור, הכנת פיסטולטים, סינון צבעים, יישום צבע ולכה ובדיקת גוון.`,
  כנף_תיקון: `בוצעו עבודות הכנה לצבע בכנף לאחר תיקון פחחות. העבודה כללה ליטושים בדרגות שונות, החלקת אזורי תיקון, פתיחת אזורי מעבר והכנת פני שטח לצביעה.\nבוצע שימוש בפילר מקצועי מסוג Sikkens לצורך סגירת נקבוביות, סימני תיקון ואי אחידויות במשטח.\nבוצע שימוש בחומר ביקורת Guide Coat לצורך איתור גלים ושקיעות לפני צבע.\nלאחר מכן בוצעו ליטושי גמר, ניקוי אנטי סיליקון, דבק אבק והכנת החלק לכניסה לתא הצבע.\nהעבודה כללה הכנת ציוד התזה, צבע ולכה, וסיום בבדיקת גוון וברק.`,
  כנף_טשטוש: `בוצע טשטוש צבע בכנף לצורך התאמת גוון ומניעת הבדלי צבע בין החלק שנצבע לבין חלק מקורי.\nהעבודה כללה ליטוש עדין, פתיחת אזור מעבר, ניקוי אנטי סיליקון, דבק אבק, שימוש בטינר טשטוש, יישום צבע מדורג ולכה באזור המעבר.\nהטשטוש מחושב כחלקי ואינו כולל עבודת פחחות.`,
  פגוש_חדש: `בוצעה הכנה וצביעה לפגוש חדש מחומר פלסטי. העבודה כללה ניקוי יסודי להסרת שומנים, חומרים משמרים ושאריות סיליקון הקיימים בחלקי פלסטיק חדשים.\nבוצע ליטוש עדין וחספוס פני שטח לצורך יצירת אחיזה תקינה למערכת הצבע.\nבוצע שימוש בפריימר פלסטיק וחומר מקשר ייעודי לחלקי פלסטיק לצורך מניעת קילופי צבע ושמירה על אחיזת הצבע לאורך זמן.\nהפגוש הוכן ונצבע בנפרד מחוץ לרכב, לרבות הכנת תא צבע ותנור, הכנת פיסטולטים, עיטוף מתאים, ניקוי לפני התזה, יישום צבע ולכה וייבוש בתנור.\nבסיום בוצעה התאמת גוון לחלקי המרכב הסמוכים ובדיקת ברק.`,
  פגוש_תיקון: `בוצעו עבודות הכנה וצביעה לפגוש לאחר תיקון / שיפוץ. העבודה כללה ליטוש אזורי תיקון, החלקת פני שטח, תיקון אזורי פלסטיק פגועים והכנת החלק לצביעה.\nבוצע שימוש בחומרי הכנה ייעודיים לפלסטיק, פריימר פלסטיק וחומר מקשר לצורך אחיזת צבע תקינה.\nבוצעה הכנה נפרדת של החלק מחוץ לרכב, כולל עיטוף, ניקוי אנטי סיליקון, דבק אבק, הכנת פיסטולטים, יישום צבע ולכה וייבוש בתנור.\nבסיום בוצעה בקרת גוון וברק והתאמת החלק לחלקי המרכב הסמוכים.`,
  פגוש_טשטוש: `בוצע טשטוש צבע באזור פגוש / מגן לצורך התאמת גוון ומניעת הבדלי צבע.\nהעבודה כללה ניקוי, ליטוש עדין, ניקוי אנטי סיליקון, דבק אבק, שימוש בטינר טשטוש ויישום צבע מדורג ולכה באזור המעבר.\nהטשטוש מחושב כחלקי ואינו כולל עבודת פחחות.`,
  מכסה_מנוע: `בוצעו עבודות הכנה לצבע במכסה מנוע לאחר תיקון. העבודה כללה ליטושים בדרגות שונות, החלקת פני שטח, פתיחת אזורי מעבר והכנת אזור התיקון לקבלת מערכת צבע אחידה.\nבוצע שימוש בפילר וחומרי צבע מקצועיים מסוג Sikkens לצורך סגירת נקבוביות, סימני תיקון ואי אחידויות.\nבוצע שימוש בחומר ביקורת Guide Coat לצורך בדיקת פני שטח ואיתור פגמים לפני צבע.\nלפני הכניסה לתא הצבע בוצע ניקוי אנטי סיליקון, שימוש בדבק אבק, הכנת פיסטולטים, ערבוב צבע, סינון חומרים והכנת לכה.\nמכסה מנוע הוא חלק רחב ובולט ולכן נדרשת הקפדה על אחידות גוון, פריסת צבע, מניעת עננות ובקרת ברק.`,
  משקוף_כל: `בוצעו עבודות הכנה וצביעה נפרדות באזור המשקוף / קורה. העבודה כללה ליטושים, התזת פילר, הכנת פני שטח, ניקוי אנטי סיליקון ודבק אבק.\nהמשקוף מחייב עבודה נפרדת מאחר שמדובר באזור פנימי / צר / אזור מעבר, ולעיתים נדרשת פתיחה, סיבוב או גישה מיוחדת לאזורי קיפול וקנטים.\nבוצעו הדבקה ועיטוף נפרדים של אזור העבודה, הכנת תנור נפרדת, הכנת פיסטולטים וייבוש ביניים.\nלאחר ייבוש בוצע פירוק עיטופים, ניקוי אזורי מעבר והמשך התאמת גוון חיצונית.\nהעבודה כוללת שלב הכנה נפרד שאינו זהה לצביעה רגילה של חלק חיצוני.`,
  סף_פלסטיק: `בוצעה הכנה וצביעה לסף פלסטיק. העבודה כללה ניקוי יסודי, ליטוש עדין, חספוס פני שטח ושימוש בפריימר פלסטיק וחומר מקשר ייעודי.\nבוצעה הכנת ציוד התזה, יישום צבע ולכה, ייבוש ובדיקת התאמת גוון וברק לחלקי המרכב הסמוכים.\nהכנת סף פלסטיק שונה מסף מתכת מאחר שנדרש חומר מקשר ייעודי לחלקי פלסטיק.`,
  סף_מתכת: `בוצעו עבודות הכנה וצבע לסף תחתון מברזל לאחר תיקון. העבודה כללה ליטושים, החלקת אזורי תיקון, שימוש בחומרי יסוד להגנה על אזור הברזל, פילר לסגירת סימני תיקון וליטושי גמר.\nמאחר שמדובר באזור תחתון החשוף ללחות, לכלוך ופגיעות כביש, נדרשה הכנה קפדנית לפני הצביעה.\nבוצע שימוש בחומרי איטום / זפת באזור התחתון לפי הצורך לצורך הגנה נוספת על אזור הסף.\nבוצע ניקוי אנטי סיליקון, דבק אבק, הכנת ציוד התזה, יישום צבע ולכה ובדיקת גימור.`,
  טשטוש_כללי: `בוצע טשטוש צבע באזור חלק סמוך לצורך התאמת גוון ומניעת הבדלי צבע בין החלק שנצבע לבין חלק מקורי.\nהעבודה כללה ליטוש עדין, פתיחת אזור מעבר, ניקוי אנטי סיליקון, דבק אבק, שימוש בטינר טשטוש, יישום צבע מדורג ולכה באזור המעבר.\nהטשטוש מחושב כחלקי ואינו כולל עבודת פחחות.`,
  גג_תיקון: `בוצעו עבודות הכנה לצבע בגג הרכב. העבודה כללה עיטוף שמשות וצדדים, ליטושים, פילר, שלייף, ניקוי אנטי סיליקון, דבק אבק, הכנת פיסטולטים, יישום צבע ולכה, פוליש וגימור.\nמאחר שמדובר בחלק רחב ובולט נדרשת הקפדה מיוחדת על פריסת צבע אחידה, מניעת עננות ובקרת ברק.`,
  דופן_תיקון: `בוצעו עבודות הכנה לצבע בדופן אחורית. העבודה כללה ליטושים, פילר, שלייף, ניקוי אנטי סיליקון, דבק אבק, הכנת פיסטולטים, יישום צבע ולכה ופוליש.`
};

const GENERAL_WORK_DESCRIPTION = `בוצעו עבודות הכנה כלליות לצביעה הכוללות הדבקות ועיטופים של חלקי הרכב באמצעות ניירות מסכה, ניילונים וסרטי הדבקה מקצועיים.
בוצע ניקוי תא הצבע, ניקוי רצפת תא הצבע, ניקוי התנור והכנת מערכות אוויר וייבוש לפני תחילת העבודה.
בוצע ניקוי מלא של הפיסטולטים לפני שימוש, הכנת כוסות ערבוב, מסנני צבע, ערבוב חומרי צבע ולכה וסינון החומרים לפני ההתזה.
בין שלבי הצביעה בוצעו ניקיונות חוזרים של הפיסטולטים בין חומר לחומר, החלפת כוסות ומסננים ושמירה על סביבת עבודה נקייה לפני שלב הלכה.
בוצע ניקוי אנטי סיליקון, שימוש בדבק אבק, הכנת ציוד ההתזה וסינון נוסף לפני כניסה לתא הצבע.
לאחר הצביעה בוצע פירוק עיטופים, ניקוי שאריות דבק, ניקוי אבק צבע, שלייף סבון באזורים נדרשים, פוליש מקצועי, שטיפת רכב, בדיקות גוון וברק והכנת הרכב למסירה ללקוח.`;

const FAST_WORK_CATEGORIES = [
  { label: "כנף", items: [
    { key: "כנף_חדש", label: "כנף חדשה", part: "כנף קדמית ימין", mode: "newpart", pct: 70 },
    { key: "כנף_תיקון", label: "כנף לאחר תיקון", part: "כנף קדמית ימין", mode: "full", pct: 100 },
    { key: "כנף_טשטוש", label: "כנף טשטוש", part: "כנף קדמית ימין", mode: "blend", pct: 50 }
  ]},
  { label: "דלת", items: [
    { key: "דלת_חדש", label: "דלת חדשה", part: "דלת קדמית ימין", mode: "newpart", pct: 70 },
    { key: "דלת_תיקון", label: "דלת לאחר תיקון", part: "דלת קדמית ימין", mode: "full", pct: 100 },
    { key: "דלת_טשטוש", label: "דלת טשטוש", part: "דלת קדמית ימין", mode: "blend", pct: 50 }
  ]},
  { label: "פגוש / מגן", items: [
    { key: "פגוש_חדש", label: "פגוש חדש", part: "פגוש קדמי", mode: "newpart", pct: 70 },
    { key: "פגוש_תיקון", label: "פגוש מתוקן", part: "פגוש קדמי", mode: "full", pct: 100 },
    { key: "פגוש_טשטוש", label: "פגוש טשטוש", part: "פגוש קדמי", mode: "blend", pct: 50 }
  ]},
  { label: "מכסה מנוע", items: [
    { key: "מכסה_מנוע", label: "מכסה מנוע לאחר תיקון", part: "מכסה מנוע", mode: "full", pct: 100 },
    { key: "מכסה_טשטוש", label: "מכסה מנוע טשטוש", part: "מכסה מנוע", mode: "blend", pct: 50 }
  ]},
  { label: "דופן", items: [
    { key: "דופן_תיקון", label: "דופן לאחר תיקון", part: "דופן אחורית ימין", mode: "full", pct: 100 },
    { key: "דופן_טשטוש", label: "דופן טשטוש", part: "דופן אחורית ימין", mode: "blend", pct: 50 }
  ]},
  { label: "סף", items: [
    { key: "סף_מתכת", label: "סף מתכת", part: "סף עליון ימין", mode: "full", pct: 100 },
    { key: "סף_פלסטיק", label: "סף פלסטיק", part: "סף פלסטיק ימין", mode: "full", pct: 100 }
  ]},
  { label: "משקוף / קורה", items: [
    { key: "משקוף_כל", label: "משקוף / קורה", part: "משקוף קדמי ימין", mode: "full", pct: 100 }
  ]},
  { label: "שאר חלקים", items: [
    { key: "גג_תיקון", label: "גג", part: "גג", mode: "full", pct: 100 },
    { key: "טשטוש_כללי", label: "טשטוש כללי", part: "כנף קדמית ימין", mode: "blend", pct: 50 }
  ]}
];

function getPresetKey(partName: string, workMode: string): string {
  const n = partName || "";
  const isNew = workMode === "newpart";
  const isBlend = workMode === "blend";
  if (n.includes("דלת")) return isNew ? "דלת_חדש" : isBlend ? "דלת_טשטוש" : "דלת_תיקון";
  if (n.includes("כנף") || n.includes("דופן")) {
    if (n.includes("דופן")) return isBlend ? "טשטוש_כללי" : "דופן_תיקון";
    return isNew ? "כנף_חדש" : isBlend ? "כנף_טשטוש" : "כנף_תיקון";
  }
  if (n.includes("פגוש") || n.includes("מגן")) return isNew ? "פגוש_חדש" : isBlend ? "פגוש_טשטוש" : "פגוש_תיקון";
  if (n.includes("מכסה מנוע") || n.includes("מכסה תא מטען")) return "מכסה_מנוע";
  if (n.includes("משקוף") || n.includes("קורה")) return "משקוף_כל";
  if (n.includes("סף פלסטיק")) return "סף_פלסטיק";
  if (n.includes("סף")) return "סף_מתכת";
  if (n.includes("גג")) return "גג_תיקון";
  if (isBlend) return "טשטוש_כללי";
  return "";
}

function buildRowNote(partName: string, workMode: string, extraHours: number): string {
  const key = getPresetKey(partName, workMode);
  const base = PRESETS[key] || "";
  const extra = Number(extraHours) > 0 ? EXTRA_HOURS_TEXT : "";
  if (base && extra) return base + "\n" + extra;
  return base || extra;
}

function round2(num: number): number {
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

function formatCurrency(num: number): string {
  return "₪" + Number(num || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface RowState {
  id: string;
  partName: string;
  customName: string;
  workMode: string;
  baseHours: number;
  customBaseHours: number;
  percent: number;
  extraHours: number;
  rowNote: string;
}

let _rowCounter = 0;
function newRowState(prefill: Partial<RowState> = {}): RowState {
  _rowCounter += 1;
  const mode = prefill.workMode || 'full';
  return {
    id: 'row_' + _rowCounter,
    partName: prefill.partName || '',
    customName: prefill.customName || '',
    workMode: mode,
    baseHours: prefill.baseHours ?? 0,
    customBaseHours: prefill.customBaseHours ?? (prefill.baseHours ?? 0),
    percent: prefill.percent ?? (WORK_MODES[mode]?.defaultPercent ?? 100),
    extraHours: prefill.extraHours ?? 0,
    rowNote: prefill.rowNote ?? ''
  };
}

interface PaintCalculatorProps {
  claim: ClaimRecord;
  actor: { id: string; full_name: string; company_name: string };
  onClose?: () => void;
  initialCalc?: PaintCalcRow | null;
  /** Opened from a claim quote: saves the calculation officially, then hands it to the quote. */
  onApplyToQuote?: (data: PaintCalcData, saved: { id: string; version: number } | null) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const PaintCalculator: React.FC<PaintCalculatorProps> = ({ claim, actor, onClose, initialCalc, onApplyToQuote }) => {
  const [customerName, setCustomerName] = useState('');
  const [carModel, setCarModel] = useState('');
  const [carGroup, setCarGroup] = useState<'A' | 'B' | 'C' | 'D'>('B');
  const [paintType, setPaintType] = useState<'solid' | 'baseclear' | 'pearl'>('baseclear');
  const [hourRate, setHourRate] = useState(380);
  const [materialPercent, setMaterialPercent] = useState(38);
  const [generalHours, setGeneralHours] = useState(0);
  const [generalWorkNotes, setGeneralWorkNotes] = useState(GENERAL_WORK_DESCRIPTION);
  const [vatPercent, setVatPercent] = useState(18);
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<RowState[]>([]);
  const [quickAddCount, setQuickAddCount] = useState(1);
  const [selectedFastItems, setSelectedFastItems] = useState<string[]>([]);
  const [openFastCats, setOpenFastCats] = useState<Record<number, boolean>>({});

  const [result, setResult] = useState<PaintCalcData | null>(null);
  const [history, setHistory] = useState<PaintCalcRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Init Load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (initialCalc) {
      loadFromRow(initialCalc);
      return;
    }
    // Auto-populate from active claim
    setCustomerName(claim.clientName || claim.driverName || '');
    const vehicleStr = [claim.manufacturer, claim.model, claim.year].filter(Boolean).join(' ') || claim.plate || claim.carModel || '';
    setCarModel(vehicleStr);
    setNotes(`תיק תביעה: ${claim.claimNum || claim.id || ''} | חברת ביטוח: ${claim.insCompany || 'לא צוינה'}`);

    // Load last draft if present
    if (claim.id) {
      loadPaintCalcDraft(claim.id).then(draft => {
        if (draft) loadFromRow(draft);
      });
      loadPaintCalcHistory(claim.id).then(setHistory);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claim.id, initialCalc]);

  function loadFromRow(r: PaintCalcRow) {
    const d = r.calc_data;
    setCustomerName(d.customerName || '');
    setCarModel(d.carModel || '');
    setCarGroup(d.carGroup || 'B');
    setPaintType(d.paintType || 'baseclear');
    setHourRate(d.hourRate ?? 380);
    setMaterialPercent(d.materialPercent ?? 38);
    setGeneralHours(d.generalHours ?? 0);
    setGeneralWorkNotes(d.generalWorkNotes || GENERAL_WORK_DESCRIPTION);
    setVatPercent(d.vatPercent ?? 18);
    setNotes(d.notes || '');
    setRows((d.parts || []).map(p => ({
      id: 'row_' + (++_rowCounter),
      partName: p.partName,
      customName: p.customName || '',
      workMode: p.workMode,
      baseHours: p.baseHours,
      customBaseHours: p.baseHours,
      percent: p.percent,
      extraHours: p.extraHours,
      rowNote: p.rowNote
    })));
  }

  // ─── Calculation ────────────────────────────────────────────────────
  const runCalculate = useCallback((): PaintCalcData => {
    const generalHoursCost = round2(generalHours * hourRate);
    let totalBaseHours = 0;
    let totalFinalHours = 0;
    let laborCost = 0;

    const parts: PaintCalcPart[] = rows.map(r => {
      const chargedBase = round2(r.baseHours * (r.percent / 100));
      const finalH = round2(chargedBase + r.extraHours);
      const rowPrice = round2(finalH * hourRate);
      totalBaseHours += r.baseHours;
      totalFinalHours += finalH;
      laborCost += rowPrice;
      return {
        partName: r.partName,
        customName: r.customName,
        workMode: r.workMode,
        baseHours: r.baseHours,
        percent: r.percent,
        extraHours: r.extraHours,
        finalHours: finalH,
        rowPrice,
        rowNote: r.rowNote
      };
    });

    totalBaseHours = round2(totalBaseHours);
    totalFinalHours = round2(totalFinalHours + generalHours);
    laborCost = round2(laborCost + generalHoursCost);
    const materialsCost = round2(laborCost * (materialPercent / 100));
    const subtotal = round2(laborCost + materialsCost);
    const vatAmount = round2(subtotal * (vatPercent / 100));
    const total = round2(subtotal + vatAmount);

    const calcData: PaintCalcData = {
      customerName, carModel, carGroup, paintType, hourRate, materialPercent,
      generalHours, generalWorkNotes, vatPercent, notes, parts,
      baseHours: totalBaseHours, adjustedHours: totalFinalHours,
      laborCost, materialsCost, generalHoursCost, vatAmount, total
    };
    setResult(calcData);
    return calcData;
  }, [rows, customerName, carModel, carGroup, paintType, hourRate, materialPercent, generalHours, generalWorkNotes, vatPercent, notes]);

  useEffect(() => {
    const res = runCalculate();
    // Auto-save draft debounced
    if (claim.id) {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => {
        savePaintCalcDraft(claim.id, actor.company_name, res, actor.id, actor.full_name);
      }, 3500);
    }
  }, [runCalculate, claim.id, actor]);

  // ─── Event Handlers ─────────────────────────────────────────────────────────

  const handleGroupChange = (grp: 'A' | 'B' | 'C' | 'D') => {
    setCarGroup(grp);
    if (GROUP_MATERIAL_PERCENT[grp] != null) {
      setMaterialPercent(GROUP_MATERIAL_PERCENT[grp]);
    }
    // Update base hours for all rows
    setRows(prev => prev.map(r => {
      if (r.partName && r.partName !== '__custom__') {
        const newBase = PARTS_DATA[grp]?.[r.partName] ?? r.baseHours;
        return { ...r, baseHours: newBase };
      }
      return r;
    }));
  };

  const handlePaintTypeChange = (pt: 'solid' | 'baseclear' | 'pearl') => {
    setPaintType(pt);
    if (PAINT_RULES[pt]) {
      setMaterialPercent(PAINT_RULES[pt].defaultMaterialPercent);
    }
  };

  const addPartRow = (prefill: Partial<RowState> = {}) => {
    const r = newRowState(prefill);
    if (r.partName && r.partName !== '__custom__') {
      r.baseHours = PARTS_DATA[carGroup]?.[r.partName] ?? 0;
      if (!r.rowNote) {
        r.rowNote = buildRowNote(r.partName, r.workMode, r.extraHours);
      }
    }
    setRows(prev => [...prev, r]);
  };

  const addMultipleRows = () => {
    const count = Math.min(Math.max(quickAddCount, 1), 20);
    for (let i = 0; i < count; i++) addPartRow();
  };

  const removePartRow = (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const updateRowField = (id: string, patch: Partial<RowState>) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, ...patch };

      if (patch.partName !== undefined) {
        if (patch.partName === '__custom__') {
          updated.baseHours = updated.customBaseHours || 0;
        } else {
          updated.baseHours = PARTS_DATA[carGroup]?.[patch.partName] ?? 0;
          updated.rowNote = buildRowNote(patch.partName, updated.workMode, updated.extraHours);
        }
      }

      if (patch.workMode !== undefined) {
        if (WORK_MODES[patch.workMode]) {
          updated.percent = WORK_MODES[patch.workMode].defaultPercent;
        }
        if (updated.partName && updated.partName !== '__custom__') {
          updated.rowNote = buildRowNote(updated.partName, patch.workMode, updated.extraHours);
        }
      }

      if (patch.extraHours !== undefined && updated.partName && updated.partName !== '__custom__') {
        updated.rowNote = buildRowNote(updated.partName, updated.workMode, patch.extraHours);
      }

      return updated;
    }));
  };

  // ─── Fast Work Handlers ────────────────────────────────────────────────────

  const toggleFastItem = (key: string) => {
    setSelectedFastItems(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const fastWorkSelectAll = () => {
    const all = FAST_WORK_CATEGORIES.flatMap(c => c.items.map(i => i.key));
    setSelectedFastItems(all);
  };

  const fastWorkClearAll = () => {
    setSelectedFastItems([]);
  };

  const fastWorkCreate = () => {
    if (selectedFastItems.length === 0) return;
    selectedFastItems.forEach(k => {
      for (const cat of FAST_WORK_CATEGORIES) {
        const item = cat.items.find(i => i.key === k);
        if (item) {
          const partsInGrp = PARTS_DATA[carGroup] || {};
          let targetPart = item.part;
          if (partsInGrp[targetPart] == null) {
            const family = targetPart.split(' ')[0];
            const found = Object.keys(partsInGrp).find(p => p.startsWith(family));
            if (found) targetPart = found;
          }
          const baseH = partsInGrp[targetPart] ?? 2.0;
          const noteText = PRESETS[k] || buildRowNote(targetPart, item.mode, 0);

          addPartRow({
            partName: targetPart,
            workMode: item.mode,
            percent: item.pct,
            baseHours: baseH,
            extraHours: 0,
            rowNote: noteText
          });
          break;
        }
      }
    });
    fastWorkClearAll();
  };

  const handleSaveOfficial = async () => {
    const calcData = runCalculate();
    setSaveStatus('saving');
    const saved = await savePaintCalcOfficial(claim.id, actor.company_name, calcData, actor.id, actor.full_name);
    if (saved) {
      setSaveStatus('saved');
      setHistory(prev => [saved, ...prev]);
      setTimeout(() => setSaveStatus('idle'), 3000);
    } else {
      setSaveStatus('error');
    }
  };

  const handleApplyToQuote = async () => {
    if (!onApplyToQuote) return;
    const calcData = runCalculate();
    setSaveStatus('saving');
    const saved = await savePaintCalcOfficial(claim.id, actor.company_name, calcData, actor.id, actor.full_name);
    setSaveStatus(saved ? 'saved' : 'error');
    if (saved) setHistory(prev => [saved, ...prev]);
    onApplyToQuote(calcData, saved ? { id: saved.id, version: saved.version } : null);
  };

  const partsForGroup = Object.keys(PARTS_DATA[carGroup] || {});

  return (
    <div className="pc-root" dir="rtl">
      {/* HEADER */}
      <div className="pc-header">
        <div>
          <div className="pc-header-title">🎨 מחשבון עלות צבע לרכב — גרסה 2025-v9</div>
          <div className="pc-header-sub">
            משולב בתיק תביעה: {claim.claimNum || claim.id?.slice(0, 8)} | רכב: {carModel || claim.plate || '—'}
          </div>
        </div>
        {onClose && (
          <button className="pc-close-btn" onClick={onClose} type="button" title="סגור מחשבון">✕</button>
        )}
      </div>

      <div className="pc-layout">
        {/* LEFT COLUMN: FORM */}
        <div className="pc-form-col">
          {/* GENERAL DETAILS */}
          <div className="pc-section">
            <div className="pc-section-title">פרטי החישוב</div>
            <div className="pc-grid-2">
              <div className="pc-field">
                <label className="pc-label">שם לקוח</label>
                <input className="pc-input" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="לדוגמה: יוסי כהן" />
              </div>
              <div className="pc-field">
                <label className="pc-label">רכב</label>
                <input className="pc-input" value={carModel} onChange={e => setCarModel(e.target.value)} placeholder="לדוגמה: מאזדה 3 2022" />
              </div>
              <div className="pc-field">
                <label className="pc-label">קבוצת רכב</label>
                <select className="pc-input" value={carGroup} onChange={e => handleGroupChange(e.target.value as 'A'|'B'|'C'|'D')}>
                  <option value="A">A רכב קטן</option>
                  <option value="B">B משפחתית</option>
                  <option value="C">C סלון או פאר</option>
                  <option value="D">D מיניוואן או פנאי שטח</option>
                </select>
                <span className="pc-mini-label">לכל קבוצה יש זמני בסיס שונים</span>
              </div>
              <div className="pc-field">
                <label className="pc-label">סוג צבע</label>
                <select className="pc-input" value={paintType} onChange={e => handlePaintTypeChange(e.target.value as 'solid'|'baseclear'|'pearl')}>
                  <option value="solid">ברק ישיר</option>
                  <option value="baseclear">דו שכבתי</option>
                  <option value="pearl">תלת שכבתי או פנינה</option>
                </select>
                <span className="pc-mini-label">אחוז חומרים מתעדכן אוטומטית</span>
              </div>
              <div className="pc-field">
                <label className="pc-label">מחיר שעת עבודה (₪)</label>
                <input className="pc-input" type="number" min={0} step={1} value={hourRate} onChange={e => setHourRate(Number(e.target.value))} />
              </div>
              <div className="pc-field">
                <label className="pc-label">אחוז חומרים (%)</label>
                <input className="pc-input" type="number" min={0} max={200} step={1} value={materialPercent} onChange={e => setMaterialPercent(Number(e.target.value))} />
              </div>
              <div className="pc-field">
                <label className="pc-label">שעות עבודה כלליות</label>
                <input className="pc-input" type="number" min={0} step={0.5} value={generalHours} onChange={e => setGeneralHours(Number(e.target.value))} />
                {generalHours > 0 && <span className="pc-hint">{generalHours} × {formatCurrency(hourRate)} = {formatCurrency(generalHours * hourRate)}</span>}
              </div>
              <div className="pc-field">
                <label className="pc-label">מע״מ באחוזים (%)</label>
                <input className="pc-input" type="number" min={0} step={0.1} value={vatPercent} onChange={e => setVatPercent(Number(e.target.value))} />
              </div>
              <div className="pc-field pc-full">
                <label className="pc-label">פירוט עבודות כלליות</label>
                <textarea className="pc-input pc-textarea" rows={3} value={generalWorkNotes} onChange={e => setGeneralWorkNotes(e.target.value)} />
              </div>
              <div className="pc-field pc-full">
                <label className="pc-label">הערות</label>
                <textarea className="pc-input pc-textarea" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="הערות להצעה או לעבודה" />
              </div>
            </div>
          </div>

          {/* FAST WORK PANEL */}
          <div className="pc-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#f2f6ff' }}>⚡ עבודה מהירה</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="pc-btn-sec pc-btn-sm" onClick={fastWorkSelectAll}>סמן הכל</button>
                <button type="button" className="pc-btn-sec pc-btn-sm" onClick={fastWorkClearAll}>נקה הכל</button>
                <button type="button" className="pc-btn-pri pc-btn-sm" onClick={fastWorkCreate}>▶ צור עבודה</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {FAST_WORK_CATEGORIES.map((cat, ci) => {
                const isOpen = !!openFastCats[ci];
                return (
                  <div key={cat.label} style={{ background: '#101b2f', border: '1px solid #2b3a58', borderRadius: 10, overflow: 'hidden' }}>
                    <div
                      style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => setOpenFastCats(prev => ({ ...prev, [ci]: !prev[ci] }))}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#dfe8f8' }}>{cat.label}</span>
                      <span style={{ fontSize: 11, color: '#9fb0cf' }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                    {isOpen && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6, padding: '8px 10px', background: '#0c1524' }}>
                        {cat.items.map(item => (
                          <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: '#dfe8f8' }}>
                            <input
                              type="checkbox"
                              checked={selectedFastItems.includes(item.key)}
                              onChange={() => toggleFastItem(item.key)}
                            />
                            {item.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {selectedFastItems.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#56ccf2', fontWeight: 700 }}>
                נבחרו {selectedFastItems.length} פריטים
              </div>
            )}
          </div>

          {/* PARTS ROWS */}
          <div className="pc-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div className="pc-section-title" style={{ margin: 0, padding: 0, border: 'none' }}>חלקים לחישוב ({rows.length})</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="pc-mini-label">הוספה ידנית:</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={quickAddCount}
                  onChange={e => setQuickAddCount(Number(e.target.value))}
                  style={{ width: 50, background: '#0c1524', color: '#fff', border: '1px solid #2a3a59', borderRadius: 8, padding: '4px 6px', fontSize: 13 }}
                />
                <button type="button" className="pc-btn-sec pc-btn-sm" onClick={addMultipleRows}>צור שורות</button>
              </div>
            </div>

            <div className="pc-rows">
              {rows.map((row) => {
                const isCustom = row.partName === '__custom__';
                return (
                  <div key={row.id} className="pc-part-row">
                    <div className="pc-part-head">
                      <span className="pc-part-label">{row.customName || row.partName || 'חלק חדש לחישוב'}</span>
                      <button type="button" className="pc-del-btn" onClick={() => removePartRow(row.id)}>מחק חלק</button>
                    </div>

                    <div className="pc-part-grid">
                      <div className="pc-field">
                        <div className="pc-mini-label">שם החלק</div>
                        <select className="pc-input pc-sm" value={row.partName} onChange={e => updateRowField(row.id, { partName: e.target.value })}>
                          <option value="">בחר חלק</option>
                          {partsForGroup.map(n => <option key={n} value={n}>{n}</option>)}
                          <option value="__custom__">חלק ידני</option>
                        </select>
                      </div>

                      {isCustom && (
                        <div className="pc-field">
                          <div className="pc-mini-label">שם חלק ידני</div>
                          <input className="pc-input pc-sm" value={row.customName} onChange={e => updateRowField(row.id, { customName: e.target.value })} placeholder="לדוגמה: סף ימין" />
                        </div>
                      )}

                      <div className="pc-field">
                        <div className="pc-mini-label">סוג עבודה</div>
                        <select className="pc-input pc-sm" value={row.workMode} onChange={e => updateRowField(row.id, { workMode: e.target.value })}>
                          {Object.entries(WORK_MODES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>

                      <div className="pc-field">
                        <div className="pc-mini-label">זמן בסיס</div>
                        <input
                          className="pc-input pc-sm"
                          type="number"
                          min={0}
                          step={0.1}
                          value={row.baseHours}
                          readOnly={!isCustom}
                          onChange={e => isCustom && updateRowField(row.id, { baseHours: Number(e.target.value), customBaseHours: Number(e.target.value) })}
                        />
                      </div>

                      <div className="pc-field">
                        <div className="pc-mini-label">אחוז חיוב (%)</div>
                        <input className="pc-input pc-sm" type="number" min={0} step={1} value={row.percent} onChange={e => updateRowField(row.id, { percent: Number(e.target.value) })} />
                      </div>

                      <div className="pc-field">
                        <div className="pc-mini-label">תוספת שעות</div>
                        <input className="pc-input pc-sm" type="number" min={0} step={0.1} value={row.extraHours} onChange={e => updateRowField(row.id, { extraHours: Number(e.target.value) })} placeholder="ליטוש, הכנה" />
                      </div>

                      <div className="pc-field pc-full">
                        <div className="pc-mini-label">הסבר מקצועי</div>
                        <textarea className="pc-input pc-textarea pc-sm" rows={2} value={row.rowNote} onChange={e => updateRowField(row.id, { rowNote: e.target.value })} />
                      </div>
                    </div>

                    {result && (() => {
                      const p = result.parts.find((_, i) => rows[i]?.id === row.id);
                      if (!p) return null;
                      return (
                        <div className="pc-part-subs">
                          <div className="pc-sub-stat"><div className="pc-sub-k">שעות בסיס</div><div className="pc-sub-v">{round2(p.baseHours * (p.percent / 100)).toFixed(2)}</div></div>
                          <div className="pc-sub-stat"><div className="pc-sub-k">שעות סופיות</div><div className="pc-sub-v">{p.finalHours.toFixed(2)}</div></div>
                          <div className="pc-sub-stat"><div className="pc-sub-k">מחיר חלק</div><div className="pc-sub-v">{formatCurrency(p.rowPrice)}</div></div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>

            <div className="pc-row-actions">
              <button type="button" className="pc-btn-sec" onClick={() => addPartRow()}>+ הוסף חלק ידנית</button>
              <button type="button" className="pc-btn-pri" onClick={() => runCalculate()}>חשב עכשיו</button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: RESULTS & ACTIONS */}
        <div className="pc-results-col">
          <div className="pc-section">
            <div className="pc-section-title">תוצאה</div>
            {result ? (
              <>
                <div className="pc-stats-grid">
                  <div className="pc-stat"><div className="pc-stat-k">שעות בסיס</div><div className="pc-stat-v">{result.baseHours.toFixed(2)}</div></div>
                  <div className="pc-stat"><div className="pc-stat-k">שעות לחיוב</div><div className="pc-stat-v">{result.adjustedHours.toFixed(2)}</div></div>
                  <div className="pc-stat"><div className="pc-stat-k">עלות עבודה</div><div className="pc-stat-v">{formatCurrency(result.laborCost)}</div></div>
                  <div className="pc-stat"><div className="pc-stat-k">עלות חומרים</div><div className="pc-stat-v">{formatCurrency(result.materialsCost)}</div></div>
                  <div className="pc-stat"><div className="pc-stat-k">שעות עבודה כלליות</div><div className="pc-stat-v">{formatCurrency(result.generalHoursCost)}</div></div>
                  <div className="pc-stat"><div className="pc-stat-k">מע״מ</div><div className="pc-stat-v">{formatCurrency(result.vatAmount)}</div></div>
                  <div className="pc-stat pc-stat-big"><div className="pc-stat-k">סה״כ לתשלום</div><div className="pc-stat-v pc-stat-total">{formatCurrency(result.total)}</div></div>
                </div>

                <div className="pc-summary-box">
                  {buildSummaryDisplay(result)}
                </div>
              </>
            ) : (
              <div className="pc-summary-box pc-muted">בחר חלקים ולחץ על חישוב לקבלת פירוט.</div>
            )}
          </div>

          <div className="pc-section pc-actions">
            {onApplyToQuote && (
              <button type="button" className="pc-btn-pri pc-btn-lg" data-testid="pc-apply-to-quote" onClick={() => void handleApplyToQuote()} disabled={saveStatus === 'saving'}>
                ➜ העבר להצעת המחיר (עבודה + חומרי צבע)
              </button>
            )}
            <button
              type="button"
              className="pc-btn-pri pc-btn-lg"
              onClick={handleSaveOfficial}
              disabled={saveStatus === 'saving'}
            >
              {saveStatus === 'saving' ? 'שומר חישוב…' : saveStatus === 'saved' ? '✓ נשמר בהצלחה בהיסטוריה!' : saveStatus === 'error' ? '✗ שגיאה בשמירה' : '💾 שמור חישוב רשמי בתיק'}
            </button>
            <button type="button" className="pc-btn-sec" onClick={() => window.print()}>🖨️ הדפס / שמור כ-PDF</button>
            <button type="button" className="pc-btn-sec" onClick={() => setShowHistory(v => !v)}>
              📋 {showHistory ? 'סגור היסטוריה' : `היסטוריית חישובי צבע (${history.length})`}
            </button>
          </div>

          {showHistory && (
            <div className="pc-section">
              <div className="pc-section-title">היסטוריית חישובי צבע רשמיים</div>
              {history.length === 0 ? (
                <div className="pc-muted">אין חישובים רשמיים קודמים בתיק זה.</div>
              ) : (
                <div className="pc-hist-list">
                  {history.map(row => (
                    <div key={row.id} className="pc-hist-row">
                      <div>
                        <div className="pc-hist-ver">גרסה {row.version}</div>
                        <div className="pc-hist-meta">{row.created_by_name} · {new Date(row.created_at).toLocaleString('he-IL')}</div>
                        <div className="pc-hist-total">{formatCurrency(row.total_amount)}</div>
                      </div>
                      <button type="button" className="pc-btn-sec pc-btn-sm" onClick={() => loadFromRow(row)}>
                        טען גרסה זו
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="pc-note">
            המחשבון שומר על הבסיס המקצועי של גרסה 2025-v9.
            אפשר להפחית לחלק חדש, לתת אחוז טשטוש, להוסיף שעות ליטוש או הכנה מיוחדת, ולהכניס חלקים שלא קיימים בטבלה.
          </div>
        </div>
      </div>
    </div>
  );
};

function buildSummaryDisplay(d: PaintCalcData): string {
  const lines: string[] = [
    `שם לקוח: ${d.customerName || 'לא הוזן'}`,
    `רכב: ${d.carModel || 'לא הוזן'}`,
    `קבוצת רכב: ${d.carGroup} | סוג צבע: ${PAINT_RULES[d.paintType]?.name}`,
    `מחיר שעת עבודה: ${formatCurrency(d.hourRate)} | אחוז חומרים: ${d.materialPercent}%`,
  ];
  if (d.generalHours > 0) {
    lines.push(`שעות עבודה כלליות: ${d.generalHours.toFixed(2)} × ${formatCurrency(d.hourRate)} = ${formatCurrency(d.generalHoursCost)}`);
  }
  lines.push('', 'פירוט חלקים:');
  if (d.parts.length === 0) {
    lines.push('לא נבחרו חלקים');
  } else {
    d.parts.forEach((p, i) => {
      const name = p.customName || p.partName || 'לא נבחר חלק';
      lines.push(`${i + 1}. ${name}\nזמן בסיס: ${p.baseHours.toFixed(2)} שעות | אחוז חיוב: ${p.percent}%\nשעות לחיוב: ${p.finalHours.toFixed(2)} | מחיר: ${formatCurrency(p.rowPrice)}`);
      if (p.rowNote) lines.push(`הסבר: ${p.rowNote}`);
    });
  }
  lines.push(
    '',
    'סיכום:',
    `שעות בסיס כלליות: ${d.baseHours.toFixed(2)}`,
    `שעות לחיוב: ${d.adjustedHours.toFixed(2)}`,
    `עלות עבודה (כולל שעות כלליות): ${formatCurrency(d.laborCost)}`,
    `עלות חומרים: ${formatCurrency(d.materialsCost)}`,
    `סכום לפני מע״מ: ${formatCurrency(d.laborCost + d.materialsCost)}`,
    `מע״מ ${d.vatPercent}%: ${formatCurrency(d.vatAmount)}`,
    `סה״כ לתשלום: ${formatCurrency(d.total)}`
  );
  if (d.notes) lines.push(`\nהערות כלליות: ${d.notes}`);
  return lines.join('\n');
}

export default PaintCalculator;
