/**
 * leviYitzhakParser.ts
 *
 * חילוץ ופענוח חכם של נתוני מחירון לוי יצחק מטקסט (OCR / PDF).
 * מחשבון סכום תיקון לפי אחוז משווי הרכב (פוליסה וצד ג').
 */

export interface LeviYitzhakExtractedData {
  plate?: string;
  carMake?: string;
  carModel?: string;
  carYear?: string;
  ramatGimur?: string;
  roadDate?: string;
  ownershipType?: string;
  mileage?: string;
  prevOwners?: string;
  basicPrice?: string;
  additionsDeductions?: string;
  weightedPrice?: string;
  valuationDate?: string;
  valuationSource?: string;
  rawText?: string;
}

export interface RepairPercentageCalc {
  policyPct: number;
  policyAmount: number;
  thirdPct: number;
  thirdAmount: number;
  showInQuote: boolean;
  quoteRoute: 'policy' | 'third_party';
}

/**
 * מנקה ומנרמל מספר רישוי להשוואה
 */
export function normalizePlate(plate: string | undefined | null): string {
  if (!plate) return '';
  return String(plate).replace(/[^0-9]/g, '');
}

/**
 * בודק התאמה בין מספר רישוי שחולץ למספר הרישוי בתיק
 */
export function checkPlateMatch(extractedPlate?: string, claimPlate?: string): {
  match: boolean;
  warning?: string;
} {
  const normExtracted = normalizePlate(extractedPlate);
  const normClaim = normalizePlate(claimPlate);

  if (!normExtracted || !normClaim) {
    return { match: true }; // לא מציגים אזהרה אם אחד מהם חסר
  }

  if (normExtracted !== normClaim) {
    return {
      match: false,
      warning: `שים לב: מספר הרישוי במסמך (${extractedPlate}) אינו תואם למספר הרכב בתיק (${claimPlate})!`,
    };
  }

  return { match: true };
}

/**
 * מחלץ מספר מנוקה ממחרוזת (למשל: "₪ 85,000" -> 85000)
 */
export function parseCleanNumber(val: string | number | undefined | null): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * מחשב סכום תיקון בשקלים מתוך שווי משוקלל ואחוז
 */
export function calculateRepairAmount(weightedPrice: number | string, percentage: number | string): number {
  const price = parseCleanNumber(weightedPrice);
  const pct = parseCleanNumber(percentage);
  if (price <= 0 || pct <= 0) return 0;
  return Math.round(price * (pct / 100));
}

/**
 * מפענח טקסט מתוך צילום / מסמך מחירון לוי יצחק
 */
export function parseLeviYitzhakText(text: string): LeviYitzhakExtractedData {
  const result: LeviYitzhakExtractedData = {
    valuationSource: 'מחירון לוי יצחק',
    rawText: text,
  };

  if (!text || typeof text !== 'string') {
    return result;
  }

  const cleanText = text.replace(/\r/g, '\n');
  const lines = cleanText.split('\n').map((l) => l.trim()).filter(Boolean);

  // 1. תאריך הפקה / בדיקה
  const dateMatch = cleanText.match(/(?:תאריך(?: הפקה| בדיקה)?|הופק ב|תאריך)[\s:]*(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/);
  if (dateMatch) {
    result.valuationDate = dateMatch[1];
  } else {
    const genericDate = cleanText.match(/(\b\d{1,2}[\/\.-]\d{1,2}[\/\.-](?:20\d{2}|19\d{2})\b)/);
    if (genericDate) {
      result.valuationDate = genericDate[1];
    }
  }

  // 2. מספר רישוי (7 או 8 ספרות: 12-345-67 או 123-45-678 או רצף ספרות)
  const plateWithLabel = cleanText.match(/(?:מספר\s*(?:ה)?(?:רישוי|רכב)|רישוי|רכב\s*מס(?:פר)?|מ\.ר|לוחית)[\s:]*([0-9]{2,3}[-\s]?[0-9]{2,3}[-\s]?[0-9]{2,3})/i)
    || cleanText.match(/(?:מספר\s*(?:ה)?(?:רישוי|רכב)|רישוי|רכב\s*מס(?:פר)?|מ\.ר|לוחית)[\s:]*([0-9]{7,8})/i);

  if (plateWithLabel) {
    const rawPl = plateWithLabel[1].replace(/\s+/g, '-');
    result.plate = rawPl;
  } else {
    // חיפוש חופשי של מספר רישוי בפורמט 12-345-67 או 123-45-678
    const freePlate = cleanText.match(/\b([0-9]{2}-[0-9]{3}-[0-9]{2}|[0-9]{3}-[0-9]{2}-[0-9]{3})\b/);
    if (freePlate) {
      result.plate = freePlate[1];
    }
  }

  // 3. שנת ייצור
  const yearMatch = cleanText.match(/(?:שנת ייצור|שנה|שנת)[\s:]*(\b(?:19\d{2}|20\d{2})\b)/)
    || cleanText.match(/\b(20[12]\d)\b/);
  if (yearMatch) {
    result.carYear = yearMatch[1];
  }

  // 4. מועד עלייה לכביש
  const roadDateMatch = cleanText.match(/(?:עלייה לכביש|מועד עלייה|תאריך עלייה|חודש עלייה)[\s:]*(\d{1,2}[\/\.-](?:20\d{2}|\d{2}))/);
  if (roadDateMatch) {
    result.roadDate = roadDateMatch[1];
  }

  // 5. יצרן ודגם
  const makeModelMatch = cleanText.match(/(?:תוצר ודגם|יצרן ודגם|יצרן\/דגם|תוצר\/דגם|דגם)[\s:]*([^\n\r,]+)/);
  if (makeModelMatch) {
    const full = makeModelMatch[1].trim();
    const parts = full.split(/\s+/);
    if (parts.length > 1) {
      result.carMake = parts[0];
      result.carModel = parts.slice(1).join(' ');
    } else {
      result.carModel = full;
    }
  }

  // 6. רמת גימור
  const ramatMatch = cleanText.match(/(?:רמת גימור|גימור|תת דגם)[\s:]*([^\n\r,]+)/);
  if (ramatMatch) {
    result.ramatGimur = ramatMatch[1].trim();
  }

  // 7. סוג בעלות / מקוריות
  const ownershipMatch = cleanText.match(/(?:סוג בעלות|בעלות|מקוריות)[\s:]*([^\n\r,]+)/);
  if (ownershipMatch) {
    const rawOw = ownershipMatch[1].trim();
    if (/פרטי/i.test(rawOw)) result.ownershipType = 'פרטית';
    else if (/ליסינג/i.test(rawOw)) result.ownershipType = 'ליסינג';
    else if (/השכרה/i.test(rawOw)) result.ownershipType = 'השכרה';
    else if (/חברה/i.test(rawOw)) result.ownershipType = 'חברה';
    else if (/ממשלת/i.test(rawOw)) result.ownershipType = 'ממשלתי';
    else result.ownershipType = rawOw;
  } else {
    if (cleanText.includes('פרטית') || cleanText.includes('פרטי')) result.ownershipType = 'פרטית';
    else if (cleanText.includes('ליסינג')) result.ownershipType = 'ליסינג';
    else if (cleanText.includes('השכרה')) result.ownershipType = 'השכרה';
  }

  // 8. קילומטראז'
  const kmMatch = cleanText.match(/(?:קילומטראז['׳]?|ק"מ|מד אוץ|נסועה)[\s:]*([0-9,.]+)/);
  if (kmMatch) {
    result.mileage = kmMatch[1].replace(/[,.]/g, '');
  }

  // 9. בעלויות קודמות / יד
  const ownersMatch = cleanText.match(/(?:בעלויות קודמות|מספר בעלויות|מספר ידיים|יד)[\s:]*([0-9]{1,2})/);
  if (ownersMatch) {
    result.prevOwners = ownersMatch[1];
  }

  // 10. מחיר מחירון בסיסי
  const basicMatch = cleanText.match(/(?:מחיר מחירון בסיסי|מחיר בסיס|מחירון בסיס|שווי בסיסי|בסיס)[\s:]*[₪]?[\s]*([0-9,]{3,9})/);
  if (basicMatch) {
    result.basicPrice = basicMatch[1].replace(/,/g, '');
  }

  // 11. שווי רכב משוקלל סופי
  const weightedMatch = cleanText.match(/(?:שווי(?: רכב)? משוקלל(?: סופי)?|מחיר משוקלל|סה"כ משוקלל|שווי סופי|מחיר סופי|שקלול סופי|שווי שוק)[\s:]*[₪]?[\s]*([0-9,]{3,9})/);
  if (weightedMatch) {
    result.weightedPrice = weightedMatch[1].replace(/,/g, '');
  }

  // 12. תוספות והפחתות
  const addDeductLines: string[] = [];
  lines.forEach((line) => {
    if (/([+-]?\d+(?:\.\d+)?%|[+-]\s*₪?\s*\d+)/.test(line) && (line.includes('קילומטר') || line.includes('ק"מ') || line.includes('בעלות') || line.includes('יד') || line.includes('עלייה') || line.includes('הפחת') || line.includes('תוספ'))) {
      addDeductLines.push(line);
    }
  });
  if (addDeductLines.length > 0) {
    result.additionsDeductions = addDeductLines.join(' · ');
  }

  return result;
}
