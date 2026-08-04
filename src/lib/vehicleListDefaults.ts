/** Default treatment sub-types (category טיפול) — used when company has no custom list. */
export const DEFAULT_TREATMENT_ITEMS = [
  'החלפת שמן',
  'צמיגים',
  'מסנן',
  'מניעתי',
  'מזגן',
  'פנצ׳ר',
  'מצבר',
  'גרר',
  'אחר',
] as const;

/** Default תלת/חצי inspection checklist — used when company has no custom list. */
export const DEFAULT_INSPECTION_CHECKLIST = [
  'תוקף רישיון',
  'תוקף ביטוח',
  'בדיקה חזותית לרכב',
  'צמיגים',
  'גלגל רזרבי',
  'אורות לסוגיהן',
  'מגבים',
  'שמשות',
  'מראות',
  'בלמים',
  'דוושת בלם',
  'חגורות בטיחות',
  'נזילות שמן מנוע',
  'נזילות גלגל חילוף',
  'נזילות ושלמות פנסים',
  'רעש כללי',
  'נורות שעונים ונוריות',
  'אחר',
] as const;
