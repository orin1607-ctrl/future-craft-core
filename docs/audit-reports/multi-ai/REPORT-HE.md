# דוח Mission 23 — Multi-AI + Smart Filters & AI Question Engine

**תאריך:** 2026-06-29  
**גרסה:** v3-multi-ai-1 · Orchestrator 1.0.0 · Question Engine 1.0.0  
**Staging URL:** https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-multi-ai-1  
**סביבה:** Orin Staging בלבד · GH Pages סטטי · localStorage

---

## 23.11 — Multi AI (Professional AI Team)

### מה נבנה

| רכיב | קובץ | תפקיד |
|------|------|--------|
| **Multi-AI Orchestrator** | `multi-ai-orchestrator.js` | רouting אוטומטי, registry, השוואת מנועים, stub/live |
| **AI Control Center Bridge** | `ai-control-center-bridge.js` | חיבור ל-COCO_AI_CONTROL + CocoIntegrationHub |
| **Verify Script** | `scripts/verify-multi-ai-staging.mjs` | בדיקת deploy Staging |

### מנועי AI — תמיכה מלאה (Primary)

#### ChatGPT (OpenAI)
| ממד | פירוט |
|-----|--------|
| **יתרונות** | כתיבת תוכן, סיכום, תרגום, קוד, כללי |
| **חסרונות** | עלות scale, אין web realtime, hallucination |
| **משימות מומלצות** | content, summary, general, translation, code |
| **Free vs Paid** | Free tier מוגבל · GPT-4o בתשלום |
| **לחבר?** | ✅ כן — primary default |
| **ערך vs כפילות** | ערך גבוה · כפילות נמוכה |

#### Claude (Anthropic)
| ממד | פירוט |
|-----|--------|
| **יתרונות** | ניתוח ארוך, הוראות מורכבות, reasoning, קוד |
| **חסרונות** | דורש ANTHROPIC_API_KEY, אין web search |
| **משימות מומלצות** | analysis, strategy, review, approval, code |
| **Free vs Paid** | API בלבד |
| **לחבר?** | ✅ כן — primary ל-strategy/approval |
| **ערך vs כפילות** | ערך גבוה · כפילות בינונית עם ChatGPT |

#### Gemini (Google)
| ממד | פירוט |
|-----|--------|
| **יתרונות** | Google ecosystem, SEO/GSC context, multimodal, מהיר |
| **חסרונות** | פחות יציב בטקסט ארוך |
| **משימות מומלצות** | seo, google_data, analytics, summary |
| **Free vs Paid** | Free tier נדיב (Flash) |
| **לחבר?** | ✅ כן — primary ל-Google data |
| **ערך vs כפילות** | ערך גבוה · כפילות נמוכה |

### מנועים מוערכים (Evaluated)

#### Perplexity
| ממד | פירוט |
|-----|--------|
| **יתרונות** | חיפוש web realtime, מקורות, מחקר מתחרים |
| **חסרונות** | עלות API, פחות כתיבה ארוכה |
| **משימות** | research, competitors, trends, fact_check |
| **Free vs Paid** | Free מוגבל · Pro ~$20/חודש |
| **לחבר?** | 🟡 Phase 2 — מומלץ |
| **המלצה** | **ממלא פער חיפוש web** — ערך ייחודי |

#### Grok (xAI)
| ממד | פירוט |
|-----|--------|
| **יתרונות** | X/Twitter realtime, חדשות |
| **חסרונות** | API מוגבל, פחות SEO B2B |
| **לחבר?** | ⚪ אופציונלי — social/trends בלבד |
| **המלצה** | כפילות גבוהה — לא core |

#### DeepSeek
| ממד | פירוט |
|-----|--------|
| **יתרונות** | עלות נמוכה, קוד, reasoning |
| **חסרונות** | privacy, עברית חלשה |
| **לחבר?** | ⚪ fallback זול ל-batch/code |
| **המלצה** | כפילות גבוהה — לא primary |

#### GitHub Copilot
| ממד | פירוט |
|-----|--------|
| **יתרונות** | IDE integration, קוד |
| **לחבר?** | ❌ לא — dev tool בלבד |
| **המלצה** | אין ערך ל-AI Team שיווק |

#### Mistral
| ממד | פירוט |
|-----|--------|
| **יתרונות** | EU privacy, מהיר |
| **לחבר?** | ⚪ EU clients בלבד |
| **המלצה** | אופציונלי |

### מנגנון Routing אוטומטי

```
שאלה/משימה → classifyTask() → TASK_ROUTING → selectEngine()
  → primary (אם API live) → fallback → stub (Staging)
```

**דוגמאות routing:**
- SEO / keywords → Gemini → OpenAI
- תוכן → OpenAI → Claude
- אסטרטגיה → Claude → OpenAI
- מחקר → Perplexity (phase 2) → Gemini
- אישורים → Claude → OpenAI

### מנגנון Disagreement

כאשר `multiEngine: true`:
1. הרצה מקבילית על מנועים נבחרים
2. `compareResponses()` — זיהוי הסכמה/חילוקי דעות
3. פלט: `allRecommendations`, `differences`, `finalRecommendation` (confidence גבוה)
4. שמירה ב-`coco-multi-ai-runs-v1` (localStorage, max 50)

### API ציבורי

```javascript
// Console Staging
MultiAiOrchestrator.execute({ prompt: 'סכם SEO', taskType: 'seo' })
MultiAiOrchestrator.execute({ prompt: '...', multiEngine: true, engines: ['openai','gemini'] })
MultiAiOrchestrator.getRegistry()
COCO_AI_CONTROL.execute({ prompt: '...' })
```

---

## 23.12 — Smart Filters & AI Question Engine

### מה נבנה

| רכיב | קובץ | תפקיד |
|------|------|--------|
| **AI Question Engine** | `ai-question-engine.js` | NL parsing, FilterEngine integration, תשובות מקומיות |
| **Bridge** | `ai-control-center-bridge.js` | `COCO_AI_CONTROL.ask()` |

### ממדי סינון נתמכים

`company`, `client`, `site`, `campaign`, `page`, `keyword`, `manager`, `goal`, `action`, `status`, `date`, `period`, `ai_assistant`, `reports`, `history`

### שילוב מסננים מרובים

- `parseQuestion()` מחלץ entities מעברית/אנגלית
- `applyFiltersToContext()` → `GlobalFilterContext.set()`
- `FilterEngine.filter()` + `FilterMeta.*` — SSOT קיים
- `extraFilter()` — overdue, keyword blob, ai_assistant

### דוגמאות שאילתות

| שאילתה | Intent | תוצאה |
|--------|--------|--------|
| כל הפעולות לקמפיין X | list_actions + campaign | פעולות מסוננות + links |
| עמודים ממתינים לאישור | pending_approval + list_pages | עמודים pending |
| פעולות באיחור | overdue | dueDate < now |
| המלצות Claude+Gemini לעמוד | compare_ai | multiEngine comparison |
| פעולות לפי מילת מפתח | keyword filter | blob match |
| סיכום / ניתוח / המלצה | summary/analyze/recommend | local + MultiAi enrich |

### יכולות AI

| יכולת | מצב Staging | מצב Live (עם auth) |
|--------|-------------|-------------------|
| סיכום | ✅ local rule-based | ✅ + API |
| הסבר | ✅ summary text | ✅ API |
| ניתוח | ✅ + stub AI | ✅ API |
| המלצה | ✅ + stub | ✅ API |
| קישורים ישירים | ✅ `links[]` + navigate actions | ✅ |
| Preview | ✅ `openPreview()` hook | ✅ |
| השוואת גרסאות | 🟡 history-lite LS | דורש Supabase |
| approve/reject rationale | 🟡 stub | ✅ Claude approval task |

### API ציבורי

```javascript
AiQuestionEngine.ask('כל הפעולות הממתינות לאישור')
AiQuestionEngine.ask('פעולות באיחור לקמפיין dalia', { enrichAi: true })
COCO_AI_CONTROL.ask('מה מצב SEO?')
AiQuestionEngine.getHistory()
```

---

## סטטוס לפי קטגוריה

### מה עובד עכשיו (Staging)
- ✅ טעינת 3 מודולים חדשים ב-chain async
- ✅ Registry 3 primary + 5 evaluated engines
- ✅ Task routing + classification
- ✅ Multi-engine comparison infrastructure
- ✅ NL question parsing (HE/EN)
- ✅ Filter integration (GFC + FilterEngine)
- ✅ Local data answers (actions, pages, keywords, history)
- ✅ COCO_AI_CONTROL global API
- ✅ Event `coco:ai-control-ready`
- ✅ verify script

### תשתית (infrastructure — דורש UI/API הבא)
- 🟡 Perplexity/Grok/DeepSeek connectors
- 🟡 UI Control Center panel (Mission 24)
- 🟡 Chat integration ב-ai-assistant (hook קיים, לא מחובר ל-UI)

### דורש API
- OpenAI live — Edge `marketing-ai-chat` + Dalia auth
- Gemini live — Edge `marketing-gemini-chat`
- Claude live — `ANTHROPIC_API_KEY` בשרת
- Perplexity — API key + Edge function חדש

### דורש Google Sheets
- ייצוא multi-ai runs ל-Sheets
- webhook history (קיים ב-daily-engine, לא ב-multi-ai)

### דורש Supabase
- persistence cross-device ל-runs/questions
- RLS per clientId
- Edge functions auth (קיים חלקית)

---

## קבצים שהשתנו

| קובץ | סוג |
|------|-----|
| `public/ai-marketing/multi-ai-orchestrator.js` | חדש |
| `public/ai-marketing/ai-question-engine.js` | חדש |
| `public/ai-marketing/ai-control-center-bridge.js` | חדש |
| `public/ai-marketing-platform.html` | גרסה + script chain |
| `.github/workflows/deploy-staging-pages.yml` | RUN_VER v3-multi-ai-1 |
| `scripts/verify-multi-ai-staging.mjs` | חדש |
| `docs/audit-reports/multi-ai/meta.json` | חדש |
| `docs/audit-reports/multi-ai/REPORT-HE.md` | חדש |
| `docs/audit-reports/ai-control-center/PLAN-HE.md` | חדש (Mission 24) |

---

## המלצות מקצועיות

1. **Perplexity Phase 2** — ערך ייחודי למחקר מתחרים
2. **אל תחבר Copilot/Grok/DeepSeek** כ-primary — כפילות
3. **Claude ל-approval reasoning** — הפרדה מ-ChatGPT content
4. **Gemini ל-Google stack** — GSC/GA4 context
5. **IndexedDB** במקום LS ל-scale אלפי לקוחות
6. **Worker thread** ל-NL parsing ב-volume גבוה

## סדר עדיפויות פיתוח

1. UI Control Center (Mission 24 implementation)
2. חיבור ai-assistant → COCO_AI_CONTROL.ask
3. Claude API key ב-Supabase
4. Perplexity Edge function
5. Supabase persistence
6. Sheets export ל-multi-ai runs
