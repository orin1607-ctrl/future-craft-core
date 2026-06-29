# השוואת Probe — v8 (לפני) vs v9 (אחרי)

**תאריך v9:** 2026-06-29  
**Staging URL:** `https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-final-strict-9`  
**Commit:** `045b635` — `fix(actions): mobile scroll container v9 — constrain screen to 100dvh`

---

## לפני (v8 baseline)

| מדד | ערך |
|-----|-----|
| `scrollHeight` / `clientHeight` (.content) | 2014 / 2014 — **אין overflow** |
| `finalScrollTop` אחרי scroll | **0** |
| `contentScrollTop` | 0 |
| `bodyScrollTop` / `docScrollTop` | 0 / 0 |
| גובה `#screen-actions` | **2265px** (> viewport) |
| `contentContain` | `layout style` |
| `screenActionsDom` | 195 |

---

## אחרי (v9 live)

| מדד | ערך |
|-----|-----|
| `scrollHeight` / `clientHeight` (.content) | **2014 / 413** — scrollable ✓ |
| `finalScrollTop` אחרי scroll | **1601** ✓ |
| `contentScrollTop` | **1601** ✓ |
| `bodyScrollTop` / `docScrollTop` | **0 / 0** ✓ |
| גובה `#screen-actions` | **664px** (= viewport) ✓ |
| `contentContain` | **none** (הוסר `contain: layout style`) ✓ |
| `screenActionsDom` | 195 (ללא שינוי) |
| `consoleErrors` | 0 |

---

## verify-actions-scroll-fix (v9)

| בדיקה | תוצאה |
|-------|--------|
| hub buttons | **19** (≥ 10) ✓ |
| preview on click | modal + iframe ✓ |
| console errors | **0** ✓ |
| lazy workbench | ✓ |
| scroll perf | maxMs ~0.4 |

---

## מסקנה

הגלילה עברה מ-body ל-`#screen-actions .content`. v9 עומד בקריטריוני ה-probe.

**בדיקה:** Playwright iPhone 13 — לא מכשיר פיזי.
