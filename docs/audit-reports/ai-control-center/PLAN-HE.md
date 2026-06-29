# תוכנית עבודה — AI Control Center (Mission 24)

**תאריך:** 2026-06-29  
**סטטוס:** תכנון בלבד — ללא יישום  
**תלות:** Mission 23 infrastructure (v3-multi-ai-1)  
**Staging:** https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html?v=v3-multi-ai-1

---

## 24.1 — איך מרכז הבקרה עובד

### חזון
מרכז בקרה AI מרכזי — נקודת כניסה אחת לשאילתות, סינונים, המלצות multi-AI, אישורים ו-Preview — **מבלי לשנות** מסכים קיימים.

### ארכיטקטורה (מוצעת)

```
┌─────────────────────────────────────────────────────────┐
│              AI Control Center (Panel/Drawer)            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ NL Input    │  │ Smart Filters│  │ Multi-AI Results│ │
│  └──────┬──────┘  └──────┬───────┘  └────────┬────────┘ │
└─────────┼────────────────┼───────────────────┼──────────┘
          │                │                   │
          ▼                ▼                   ▼
   AiQuestionEngine   GlobalFilterContext   MultiAiOrchestrator
          │                │                   │
          └────────────────┼───────────────────┘
                           ▼
              ┌────────────────────────┐
              │   Data Aggregation Layer│
              │ DailyEngine · CocoData  │
              │ GSC/GA4 · CRM · History │
              └────────────────────────┘
```

### שלבי עבודה (runtime)
1. **Input** — שאלה טבעית או בחירת filter chips
2. **Parse** — `AiQuestionEngine.parseQuestion()`
3. **Scope** — `GlobalFilterContext.set()` + `FilterEngine.filter()`
4. **Fetch** — aggregation מכל מקורות הנתונים
5. **Analyze** — local summary + optional `MultiAiOrchestrator.execute()`
6. **Present** — תשובה + links + preview actions + disagreement panel
7. **Log** — history (LS → Supabase → Sheets)

### מצבי הפעלה
| מצב | תיאור |
|-----|--------|
| **Local** | Staging/GH Pages — rule-based, LS |
| **Hybrid** | Dalia auth — Edge AI + local filters |
| **Full** | Supabase + live Google + multi-AI |

---

## 24.2 — אינטגרציה עם כל מסכי השיווק

| מסך | screenId | נתונים זמינים | Control Center hook |
|-----|----------|---------------|---------------------|
| Hub | screen-hub | KPI, counts | "מה דחוף?" → actions pending |
| Status | screen-status | connections | "מה לא מחובר?" |
| Clients | screen-clients | customers | "משימות ללקוח X" |
| Agents | screen-agents | 12 assistants | "סטטוס Website AI" |
| Goals | screen-goals | work-plan pages | "עמודים pending" |
| Actions | screen-actions | actions + drafts | "פעולות באיחור" + Preview |
| History | screen-history | timeline | "שינויים בשבוע" |
| Assets | screen-assets | sites/domains | "נכסים לפי אתר" |
| AI Center | screen-ai-center | decisions | "החלטות ממתינות" |
| Reports | screen-reports | KPI boxes | "סיכום חודשי" |
| CRM | screen-crm | leads/tasks | "משימות CRM פתוחות" |

**מימוש:** `FilterScreenRegistry.register()` + context hash — כבר קיים. Control Center יקרא `FilterEngine.scopeQuery()` וינהל deep links `[[nav:screen-actions]]`.

---

## 24.3 — נתונים ממנוע יומי (Daily Engine)

| מקור | מפתח LS / path | שימוש ב-Control Center |
|------|----------------|------------------------|
| ריצות | `dalia-daily-engine-runs-v1` | "מתי רצה מנוע?" |
| טיוטות | `dalia-daily-engine-draft-actions-v1` | "פעולות חדשות מהמנוע" |
| keywords | `dalia-daily-engine-keywords-v1` | "מילות מפתח לפי לקוח" |
| history-lite | `dalia-daily-engine-history-lite-v1` | "מה השתנה?" |
| Node reports | `docs/audit-reports/daily-engine/report.json` | audit offline |

**תוכנית:** adapter `DailyEngineAdapter.getSnapshot(clientId)` — קריאה מאוחדת ל-LS + optional Supabase sync.

---

## 24.4 — נתונים מעוזרי AI (Assistants)

| Assistant | Feeds | Control Center query |
|-----------|-------|---------------------|
| Website AI | site_crawl, gsc_pages | "בעיות אתר" |
| SEO AI | gsc_queries, indexing | "ירידות דירוג" |
| Analytics AI | ga4 | "ירידת תנועה" |
| Content AI | gsc_pages, ga4 | "תוכן לכתוב" |
| Campaign AI | google_ads, ga4 | "ROI קמפיין" |
| Manager AI | all_modules | "סיכום מנהל" |

**תוכנית:** `AssistantDataAdapter` — map מ-`CocoIntegrationHub.ASSISTANTS` + `getAgentData()`.

---

## 24.5 — נתונים ממערכות Google

| מערכת | מקור Staging | מקור Live | Control Center |
|-------|-------------|-----------|----------------|
| GSC | dashboard.json snapshot | Edge sync | queries, pages, indexing |
| GA4 | dashboard.json | Edge sync | sessions, top pages |
| GBP | not_connected | OAuth | reviews, posts |
| Google Ads | not_connected | OAuth | campaigns, spend |
| GTM | probe only | OAuth | tags status |

**תוכנית:** `GoogleDataAdapter` — unified interface; cache TTL 1h; fallback snapshot.

---

## 24.6 — נתונים מ-CRM

| ישות | מקור | שאילתות |
|------|------|---------|
| Customers | MarketingApi / DaliaCrm | "לקוחות פעילים" |
| Leads | CRM counts | "לידים חדשים" |
| Tasks | CRM open tasks | "משימות פתוחות" |

**תוכנית:** הרחבת `coco-marketing-crm-bridge.js` — `CrmDataAdapter.forControlCenter()`.

---

## 24.7 — אישורים מצ'אט (Chat Approvals)

### Flow מוצע
```
User: "אשר פעולה #123"
  → AiQuestionEngine identifies action
  → MultiAiOrchestrator (approval task → Claude)
  → rationale displayed
  → [[action:approve:123]] marker
  → ActionsWorkbench.approve(123)
  → log to history + optional Gmail notify
```

### דרישות
- אימות הרשאה (Super Admin / marketing manager role)
- audit trail — מי אישר, מתי, rationale
- rollback — דחייה עם סיבה

---

## 24.8 — Preview והשוואות מצ'אט

| פקודה | פעולה |
|-------|--------|
| "הראה preview לפעולה X" | `AiQuestionEngine.openPreview(id)` |
| "השווה לגרסה קודמת" | diff מ-history-lite / Supabase versions |
| "מה השתנה בעמוד /services" | crawl diff + work-plan status |

**תוכנית:** `PreviewAdapter` — reuse `ActionsWorkbench` preview modal; version store ב-Supabase.

---

## 24.9 — סינונים חכמים וחיפושים

**קיים (Mission 23):** `AiQuestionEngine` + `FilterEngine` + 15 dimensions.

**הרחבות מתוכננות:**
- Filter chips UI במרכז הבקרה (לא ב-global bar)
- Saved searches per user
- Query templates: "דוח שבועי", "פעולות דחופות"
- Fuzzy match לשמות לקוחות/קמפיינים (`FilterEntityIndex`)

---

## 24.10 — מנגנון Multi-AI

**קיים:** `MultiAiOrchestrator` — routing, comparison, registry.

**הרחבות:**
- UI panel "חילוקי דעות" — side-by-side recommendations
- Voting / confidence weighting per task type
- Cost tracking per engine per client
- A/B — which engine approval rate higher

---

## 24.11 — ביצועים עם אלפי לקוחות/אתרים

| אתגר | פתרון |
|------|--------|
| LS overflow | IndexedDB + pagination |
| Filter on 10K items | Web Worker + entity index |
| Multi-AI latency | Queue + streaming responses |
| Memory | Lazy load per screen; virtual scroll |
| Multi-tenant | `clientId` shard בכל adapter |

**יעדי SLA:** parse < 50ms · filter 1K items < 100ms · AI response < 5s (streaming)

---

## 24.12 — מודולריות ל-AI/כלים עתידיים

```javascript
// Plugin registry (מוצע)
AiControlCenter.registerAdapter('daily-engine', DailyEngineAdapter);
AiControlCenter.registerAdapter('google', GoogleDataAdapter);
AiControlCenter.registerEngine('perplexity', PerplexityEngine);
```

**עקרונות:**
- Interface `DataAdapter { query(filters), summarize() }`
- Interface `AiEngine { execute(prompt, context), capabilities }`
- No hard dependency — graceful degradation

---

## 24.13 — Gmail והתראות

### מודל התראות

| סוג | תדירות | תוכן | קישור |
|-----|---------|------|-------|
| **Daily Digest** | 07:00 | סיכום: pending actions, AI decisions, KPI delta | Staging/Dalia link |
| **Immediate Alert** | realtime | אישור נדרש, action overdue, AI disagreement | approval deep link |
| **Weekly Report** | ראשון | דוח מלא + multi-AI insights | PDF/HTML attach |

### Gmail integration
- **Phase 1:** Supabase Edge + Resend (קיים) — email HTML
- **Phase 2:** Gmail API — send as user, thread tracking
- **Phase 3:** Inbound — reply "אשר 123" → webhook parser

### Approval links
```
https://orin1607-ctrl.github.io/future-craft-core/ai-marketing-platform.html
  ?v=v3-multi-ai-1&action=approve&id=123&token=SIGNED
```

### History logging
- כל התראה → `notification-log` (Supabase)
- כל אישור מצ'אט → `approval-audit`
- Sheets mirror (optional webhook)

---

## לוח זמנים מוצע

### חודש 1 (יישום Control Center Core)
| שבוע | משימה |
|------|--------|
| 1 | UI drawer/panel + NL input (ללא שינוי מסכים קיימים) |
| 2 | חיבור ai-assistant → COCO_AI_CONTROL.ask |
| 3 | Data adapters: DailyEngine + CocoData |
| 4 | Claude API + approval flow stub |

### 3 חודשים (Full Control Center)
| חודש | משימה |
|------|--------|
| 1 | Core UI + local/hybrid |
| 2 | Google live adapters + CRM + Preview/compare |
| 3 | Gmail digest + immediate alerts + Supabase persistence |

### Scale (6+ חודשים)
- IndexedDB migration
- Perplexity integration
- Multi-tenant UI (client picker)
- Worker-based filter engine
- Cost dashboard per AI engine

---

## כלים ואוטומציות מומלצים

| כלי | שימוש |
|-----|--------|
| **GitHub Actions** | daily digest trigger, deploy staging |
| **Supabase Edge** | AI chat, notifications, webhooks |
| **Google Sheets** | audit export, client reports |
| **Resend/Gmail** | email notifications |
| **Playwright** | E2E Control Center QA |
| **verify-multi-ai-staging.mjs** | post-deploy check |

---

## סיכום

Mission 24 מגדיר **מרכז בקרה AI** שמאחד:
- שאילתות טבעית + סינונים (23.12 ✅ infrastructure)
- צוות AI מקצועי (23.11 ✅ infrastructure)
- נתונים מכל המערכת (תוכנית adapters)
- אישורים, Preview, Gmail (תוכנית phases)

**הצעד הבא:** UI panel minimal + hook ל-ai-assistant — **בלי** שינוי עיצוב/UX במסכים קיימים.
