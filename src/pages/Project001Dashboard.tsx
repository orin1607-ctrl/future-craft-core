import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import '@/styles/project001-dashboard.css';

type Conn = {
  status: string;
  ok: boolean;
  note?: string | null;
};

type DashboardStats = {
  avgPosition: number | null;
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number | null;
  activeKeywords: number;
  opportunities: number;
  weakPages: number;
  pendingDrafts: number;
  ga4Sessions: number | null;
  ga4PageViews?: number | null;
};

type KeywordRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type GscPage = {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type Ga4Page = {
  pagePath: string;
  sessions: number;
  screenPageViews: number;
  activeUsers?: number;
};

type MergedPage = {
  path: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
  sessions: number | null;
  source: 'gsc' | 'ga4' | 'both';
};

type AiSuggestion = {
  priority: string;
  title: string;
  detail: string;
};

type Draft = {
  id: string;
  type: string;
  title: string;
  detail?: string;
  status: string;
  createdAt?: string;
  published: boolean;
  note?: string;
  sourceId?: string;
};

type DailyReport = {
  date: string;
  label: string;
  whatUp?: string;
  whatDown?: string;
  created?: string;
  pending?: string;
  tomorrow?: string;
  sessions?: number;
  pageViews?: number;
  gscQueries?: number;
  range?: { start: string; end: string };
};

type DashboardData = {
  version: number;
  generatedAt: string;
  project: {
    id: string;
    name: string;
    account: string | null;
    site: string;
    ga4Property: string;
  };
  token?: { ok: boolean; scopeCount?: number; hasRefresh?: boolean };
  connections: Record<string, Conn>;
  gbp: {
    ok: boolean;
    status?: string;
    pendingApproval?: boolean;
    matchedBusiness?: { title?: string } | null;
    locations: number;
    hint: string;
    lastError?: string | null;
  };
  stats?: DashboardStats;
  searchConsole: {
    keywords: KeywordRow[];
    pages: GscPage[];
    dateRange: { start: string; end: string } | null;
  };
  analytics4: {
    summary: {
      totalSessions: number | null;
      totalUsers?: number | null;
      totalPageViews?: number | null;
      days?: number;
      note?: string;
    } | null;
    daily: Array<{ date: string; sessions: number; screenPageViews: number }>;
    topPages: Ga4Page[];
  };
  pagesNeedingImprovement: Array<{
    page: string;
    impressions: number;
    ctr: number;
    position: number;
    reason: string;
  }>;
  aiSeoSuggestions: AiSuggestion[];
  drafts?: Draft[];
  history?: {
    sync: unknown[];
    ai: unknown[];
    drafts: unknown[];
  };
  activityLog: Array<{ timestamp: string; action: string; status: string; detail?: string; source?: string }>;
  dailyReports: DailyReport[];
  lastSync?: { timestamp?: string; spreadsheet_url?: string } | null;
  sync: { command: string; spreadsheetUrl?: string | null; apiDev?: string };
  dataSource: string;
  policies?: {
    publishRequiresApproval: boolean;
    aiRecommendationsOnly: boolean;
    noAutoPublish: boolean;
  };
};

const CONN_LABELS: Record<string, string> = {
  searchConsole: 'Search Console',
  analytics4: 'Google Analytics 4',
  businessProfile: 'Google Business Profile',
  drive: 'Google Drive',
  sheets: 'Google Sheets',
  docs: 'Google Docs',
  gmail: 'Gmail',
  appsScript: 'Apps Script',
};

const DRAFT_ICONS: Record<string, { emoji: string; cls: string }> = {
  article: { emoji: '📝', cls: 'article' },
  faq: { emoji: '❓', cls: 'faq' },
  landing: { emoji: '🚀', cls: 'landing' },
  meta: { emoji: '🏷️', cls: 'meta' },
  video: { emoji: '🎬', cls: 'video' },
  gbp: { emoji: '📍', cls: 'gbp' },
  improve: { emoji: '⚡', cls: 'improve' },
  recommendation: { emoji: '💡', cls: 'recommendation' },
};

function priorityScore(priority: string): number {
  if (priority === 'high') return 94;
  if (priority === 'medium') return 76;
  return 58;
}

function scoreClass(priority: string): 'high' | 'mid' | 'low' {
  if (priority === 'high') return 'high';
  if (priority === 'medium') return 'mid';
  return 'low';
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('he-IL');
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toFixed(1)}%`;
}

function fmtCtr(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname || url;
  } catch {
    return url.replace(/^https?:\/\/[^/]+/, '') || url;
  }
}

function resolveStats(data: DashboardData): DashboardStats {
  if (data.stats) return data.stats;
  const keywords = data.searchConsole.keywords;
  const pages = data.searchConsole.pages;
  const totalClicks = keywords.reduce((s, k) => s + k.clicks, 0);
  const totalImpressions = keywords.reduce((s, k) => s + k.impressions, 0);
  const avgPosition =
    keywords.length > 0
      ? keywords.reduce((s, k) => s + k.position, 0) / keywords.length
      : pages.length > 0
        ? pages.reduce((s, p) => s + p.position, 0) / pages.length
        : null;
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null;
  const pendingDrafts = (data.drafts || []).filter((d) => d.status === 'pending_approval').length;
  return {
    avgPosition: avgPosition != null ? Number(avgPosition.toFixed(1)) : null,
    totalClicks,
    totalImpressions,
    avgCtr: avgCtr != null ? Number(avgCtr.toFixed(2)) : null,
    activeKeywords: keywords.length,
    opportunities: data.aiSeoSuggestions.length,
    weakPages: data.pagesNeedingImprovement.length,
    pendingDrafts,
    ga4Sessions: data.analytics4.summary?.totalSessions ?? null,
    ga4PageViews: data.analytics4.summary?.totalPageViews ?? null,
  };
}

function mergePages(gscPages: GscPage[], ga4Pages: Ga4Page[]): MergedPage[] {
  const map = new Map<string, MergedPage>();

  for (const p of gscPages) {
    const path = shortPath(p.page);
    map.set(path, {
      path,
      clicks: p.clicks,
      impressions: p.impressions,
      ctr: p.ctr,
      position: p.position,
      sessions: null,
      source: 'gsc',
    });
  }

  for (const p of ga4Pages) {
    const path = p.pagePath;
    const existing = map.get(path);
    if (existing) {
      existing.sessions = p.sessions;
      existing.source = 'both';
    } else {
      map.set(path, {
        path,
        clicks: 0,
        impressions: 0,
        ctr: null,
        position: null,
        sessions: p.sessions,
        source: 'ga4',
      });
    }
  }

  return [...map.values()].sort((a, b) => {
    const scoreA = a.clicks + (a.sessions || 0);
    const scoreB = b.clicks + (b.sessions || 0);
    return scoreB - scoreA;
  });
}

function pageStatus(
  path: string,
  weakPages: DashboardData['pagesNeedingImprovement'],
): 'strong' | 'weak' | 'improve' {
  const weak = weakPages.find((p) => shortPath(p.page) === path || p.page.includes(path));
  if (!weak) return 'strong';
  if (weak.ctr < 0.02 && weak.position > 15) return 'weak';
  return 'improve';
}

function pageStatusLabel(status: 'strong' | 'weak' | 'improve'): string {
  if (status === 'strong') return '● חזק';
  if (status === 'weak') return '● חלש';
  return '● דורש שיפור';
}

function connStatusPill(conn: Conn): { cls: string; label: string } {
  if (conn.status === 'pending_google_api_approval') {
    return { cls: 'pending', label: 'Pending Google API Approval' };
  }
  if (conn.ok || conn.status === 'connected') {
    return { cls: 'connected', label: '● מחובר' };
  }
  return { cls: 'disconnected', label: '● מנותק' };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דקות`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} שעות`;
  return new Date(iso).toLocaleString('he-IL');
}

function resolveLogSource(entry: { action: string; source?: string }): string {
  if (entry.source) return entry.source;
  if (entry.action === 'Sync' || entry.action === 'Data sync') return 'Project001 Sync → Google Sheets';
  if (entry.action === 'Connections probe') return 'GCP / OAuth';
  if (entry.action === 'Data probe') return 'Search Console + GA4';
  if (entry.action === 'GBP probe') return 'Google Business Profile API';
  return 'System';
}

function draftStatusLabel(status: string): string {
  if (status === 'pending_approval') return 'ממתין לאישור';
  if (status === 'approved') return 'אושר (לא פורסם)';
  if (status === 'rejected') return 'נדחה';
  return status;
}

function draftTypeLabel(type: string): string {
  const map: Record<string, string> = {
    article: 'מאמר',
    faq: 'FAQ',
    landing: 'עמוד נחיתה',
    meta: 'Meta SEO',
    video: 'וידאו',
    gbp: 'Google Business',
    improve: 'שיפור עמוד',
    recommendation: 'המלצת AI',
  };
  return map[type] || type;
}

function dateRangeLabel(range: { start: string; end: string } | null): string {
  if (!range) return '';
  return `${range.start} → ${range.end}`;
}

export default function Project001Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'kw' | 'pages'>('kw');
  const [activeNav, setActiveNav] = useState('dashboard');
  const [kwSearch, setKwSearch] = useState('');
  const [pageSearch, setPageSearch] = useState('');
  const [modalKw, setModalKw] = useState<KeywordRow | null>(null);
  const [modalDraft, setModalDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}project-001/dashboard.json?t=${Date.now()}`);
      if (!res.ok) throw new Error('dashboard.json not found');
      setData(await res.json());
    } catch {
      toast.error('לא נמצא dashboard.json — הרץ npm run project-001:export-dashboard');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  const stats = useMemo(() => (data ? resolveStats(data) : null), [data]);

  const mergedPages = useMemo(
    () => (data ? mergePages(data.searchConsole.pages, data.analytics4.topPages) : []),
    [data],
  );

  const filteredKeywords = useMemo(() => {
    if (!data) return [];
    const q = kwSearch.trim().toLowerCase();
    if (!q) return data.searchConsole.keywords;
    return data.searchConsole.keywords.filter((k) => k.query.toLowerCase().includes(q));
  }, [data, kwSearch]);

  const filteredPages = useMemo(() => {
    const q = pageSearch.trim().toLowerCase();
    if (!q) return mergedPages;
    return mergedPages.filter((p) => p.path.toLowerCase().includes(q));
  }, [mergedPages, pageSearch]);

  const pendingDrafts = useMemo(
    () => (data?.drafts || []).filter((d) => d.status === 'pending_approval'),
    [data],
  );

  const dailyReport = data?.dailyReports?.[0];

  const scrollTo = (id: string, navKey: string) => {
    setActiveNav(navKey);
    setSidebarOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSyncNow = async () => {
    if (!data) return;
    setSyncing(true);
    if (import.meta.env.DEV) {
      try {
        const res = await fetch('/api/project-001/sync', { method: 'POST' });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Sync failed');
        toast.success('סנכרון הושלם');
        await load();
      } catch (e) {
        toast.error('שגיאת סנכרון', {
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setSyncing(false);
      }
    } else {
      const cmd = data.sync.command || 'npm run project-001:sync-and-export';
      try {
        await navigator.clipboard.writeText(cmd);
      } catch {
        /* ignore */
      }
      toast.info('הרץ בטרמינל:', { description: cmd, duration: 8000 });
      setTimeout(() => setSyncing(false), 1200);
    }
  };

  const handleDraftAction = async (draftId: string, status: 'approved' | 'rejected') => {
    if (import.meta.env.DEV) {
      try {
        const res = await fetch('/api/project-001/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draftId, status }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Draft update failed');
        toast.success(status === 'approved' ? 'טיוטה אושרה (לא פורסם)' : 'טיוטה נדחתה');
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'שגיאה בעדכון טיוטה');
      }
    } else {
      toast.info('אישור טיוטות זמין ב-dev בלבד', {
        description: 'המלצה בלבד — לא פורסם',
      });
    }
  };

  const openModal = (kw: KeywordRow) => setModalKw(kw);
  const closeModal = () => setModalKw(null);

  if (loading) {
    return (
      <div className="p001-dash loading-screen" dir="rtl">
        טוען Project001 Dashboard…
      </div>
    );
  }

  if (!data || !stats) {
    return (
      <div className="p001-dash" dir="rtl">
        <div className="content">
          <div className="card">
            <div className="card-header">Project001 — AI Marketing Dashboard</div>
            <div className="card-body">
              <p>לא נמצא dashboard.json</p>
              <p className="text-muted mt-8">הרץ: npm run project-001:export-dashboard</p>
              <button type="button" className="btn btn-primary mt-8" onClick={load}>
                נסה שוב
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const connectedCount = Object.values(data.connections).filter((c) => c.ok).length;
  const oppCount = data.aiSeoSuggestions.length;
  const accountInitial = (data.project.account || data.project.name || 'P').charAt(0).toUpperCase();
  const gbpPending =
    data.gbp.pendingApproval ??
    data.connections.businessProfile?.status === 'pending_google_api_approval';

  return (
    <div className="p001-dash" dir="rtl">
      <div
        className={`sidebar-overlay${sidebarOpen ? ' open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        onKeyDown={() => {}}
        role="presentation"
      />

      <div className="app">
        <aside className={`sidebar${sidebarOpen ? ' open' : ''}`} id="sidebar">
          <div className="sidebar-logo">
            <span className="logo-text">🚀 AI Organic</span>
            <span className="logo-sub">Marketing Platform</span>
          </div>

          <nav className="sidebar-nav">
            <span className="nav-section-title">ראשי</span>
            <button
              type="button"
              className={`nav-item${activeNav === 'dashboard' ? ' active' : ''}`}
              onClick={() => scrollTo('section-stats', 'dashboard')}
            >
              <span className="nav-icon">📊</span> דשבורד ראשי
            </button>
            <button
              type="button"
              className={`nav-item${activeNav === 'keywords' ? ' active' : ''}`}
              onClick={() => scrollTo('section-keywords', 'keywords')}
            >
              <span className="nav-icon">🔑</span> מילות מפתח
            </button>
            <button
              type="button"
              className={`nav-item${activeNav === 'pages' ? ' active' : ''}`}
              onClick={() => {
                setActiveTab('pages');
                scrollTo('section-keywords', 'pages');
              }}
            >
              <span className="nav-icon">📄</span> עמודים באתר
            </button>

            <span className="nav-section-title">ניתוח</span>
            <button
              type="button"
              className={`nav-item${activeNav === 'opportunities' ? ' active' : ''}`}
              onClick={() => scrollTo('section-opportunities', 'opportunities')}
            >
              <span className="nav-icon">💡</span> הזדמנויות AI
              {oppCount > 0 && <span className="nav-badge">{oppCount}</span>}
            </button>
            <button
              type="button"
              className={`nav-item${activeNav === 'competitors' ? ' active' : ''}`}
              onClick={() => scrollTo('section-competitors', 'competitors')}
            >
              <span className="nav-icon">🏆</span> מתחרים
            </button>
            <button
              type="button"
              className={`nav-item${activeNav === 'gbp' ? ' active' : ''}`}
              onClick={() => scrollTo('section-gbp', 'gbp')}
            >
              <span className="nav-icon">📍</span> Google Business
            </button>

            <span className="nav-section-title">תוכן</span>
            <button
              type="button"
              className={`nav-item${activeNav === 'drafts' ? ' active' : ''}`}
              onClick={() => scrollTo('section-drafts', 'drafts')}
            >
              <span className="nav-icon">✍️</span> טיוטות
              {pendingDrafts.length > 0 && <span className="nav-badge">{pendingDrafts.length}</span>}
            </button>
            <button
              type="button"
              className={`nav-item${activeNav === 'ai' ? ' active' : ''}`}
              onClick={() => scrollTo('section-ai', 'ai')}
            >
              <span className="nav-icon">🤖</span> AI Assistant
            </button>
            <button
              type="button"
              className={`nav-item${activeNav === 'daily' ? ' active' : ''}`}
              onClick={() => scrollTo('section-daily', 'daily')}
            >
              <span className="nav-icon">📅</span> דוח יומי
            </button>

            <button
              type="button"
              className={`nav-item${activeNav === 'activity' ? ' active' : ''}`}
              onClick={() => scrollTo('section-activity', 'activity')}
            >
              <span className="nav-icon">📋</span> יומן פעולות
            </button>

            <span className="nav-section-title">הגדרות</span>
            <button
              type="button"
              className={`nav-item${activeNav === 'connections' ? ' active' : ''}`}
              onClick={() => scrollTo('connections', 'connections')}
            >
              <span className="nav-icon">🔌</span> חיבורים
            </button>
          </nav>

          <div className="sidebar-footer">
            גרסה {data.version} · {data.dataSource}
          </div>
        </aside>

        <div className="main">
          <header className="topbar">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen((o) => !o)}
              aria-label="תפריט"
              aria-expanded={sidebarOpen}
            >
              ☰
            </button>
            <div className="topbar-title-block">
              <div className="topbar-title">דשבורד ראשי</div>
              <div className="topbar-subtitle">
                {data.project.name} · עודכן {timeAgo(data.generatedAt)}
              </div>
            </div>
            <div className="topbar-badge-row">
              <span className="topbar-badge">
                {connectedCount > 0 ? '🟢 פעיל' : '🟡 ממתין לחיבור'}
              </span>
              <div className="topbar-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSyncNow}
                disabled={syncing}
              >
                {syncing ? '⏳ מסנכרן…' : '🔄 Sync Now'}
              </button>
              <button
                type="button"
                className="btn-icon btn-icon-disabled"
                aria-label="התראות — Coming Soon"
                disabled
                title="Coming Soon — מערכת התראות בפיתוח"
              >
                🔔
                <span className="coming-soon-tag">Soon</span>
              </button>
              <div className="user-avatar" title={data.project.account || undefined}>
                {accountInitial}
              </div>
              </div>
            </div>
          </header>

          <main className="content">
            {(!data.policies || data.policies.noAutoPublish) && (
              <div className="policy-banner">
                🔒 המלצות AI וטיוטות — <strong>המלצה בלבד, לא פורסם</strong>. כל פרסום דורש אישור מפורש.
              </div>
            )}

            {/* STATS */}
            <section className="section" id="section-stats">
              <div className="section-header">
                <h2 className="section-title">
                  <span className="icon">📈</span> סטטוס שבועי
                </h2>
                <span className="text-muted">{dateRangeLabel(data.searchConsole.dateRange)}</span>
              </div>

              <div className="stats-grid">
                <div className="stat-card blue">
                  <div className="stat-label">מיקום ממוצע בגוגל</div>
                  <div className="stat-value">{stats.avgPosition ?? '—'}</div>
                  <span className="stat-change neutral">GSC</span>
                </div>
                <div className="stat-card green">
                  <div className="stat-label">סך קליקים</div>
                  <div className="stat-value">{fmtNum(stats.totalClicks)}</div>
                  <span className="stat-change neutral">Search Console</span>
                </div>
                <div className="stat-card blue">
                  <div className="stat-label">סך חשיפות</div>
                  <div className="stat-value sm">{fmtNum(stats.totalImpressions)}</div>
                  <span className="stat-change neutral">GSC</span>
                </div>
                <div className="stat-card yellow">
                  <div className="stat-label">CTR ממוצע</div>
                  <div className="stat-value">{stats.avgCtr != null ? `${stats.avgCtr}%` : '—'}</div>
                  <span className="stat-change neutral">GSC</span>
                </div>
                <div className="stat-card green">
                  <div className="stat-label">מילות מפתח פעילות</div>
                  <div className="stat-value">{stats.activeKeywords}</div>
                  <span className="stat-change neutral">GSC</span>
                </div>
                <div className="stat-card orange">
                  <div className="stat-label">הזדמנויות חדשות</div>
                  <div className="stat-value">{stats.opportunities}</div>
                  <span className="stat-change neutral">AI זיהה</span>
                </div>
                <div className="stat-card red">
                  <div className="stat-label">עמודים חלשים</div>
                  <div className="stat-value">{stats.weakPages}</div>
                  <span className="stat-change down">דורשים תשומת לב</span>
                </div>
                <div className="stat-card orange">
                  <div className="stat-label">טיוטות ממתינות</div>
                  <div className="stat-value">{stats.pendingDrafts}</div>
                  <span className="stat-change neutral">לאישורך</span>
                </div>
              </div>

              {stats.ga4Sessions != null && (
                <div className="stats-grid mt-8" style={{ marginTop: 14 }}>
                  <div className="stat-card green">
                    <div className="stat-label">GA4 Sessions</div>
                    <div className="stat-value">{fmtNum(stats.ga4Sessions)}</div>
                    <span className="stat-change neutral">Analytics 4</span>
                  </div>
                </div>
              )}
            </section>

            {/* KEYWORDS & PAGES */}
            <section className="section" id="section-keywords">
              <div className="tabs">
                <button
                  type="button"
                  className={`tab${activeTab === 'kw' ? ' active' : ''}`}
                  onClick={() => setActiveTab('kw')}
                >
                  🔑 מילות מפתח
                </button>
                <button
                  type="button"
                  className={`tab${activeTab === 'pages' ? ' active' : ''}`}
                  onClick={() => setActiveTab('pages')}
                >
                  📄 עמודים
                </button>
              </div>

              <div className={`tab-content${activeTab === 'kw' ? ' active' : ''}`} id="tab-kw">
                <div className="table-wrap">
                  <div className="table-toolbar">
                    <input
                      className="search-input"
                      type="text"
                      placeholder="חיפוש מילת מפתח..."
                      value={kwSearch}
                      onChange={(e) => setKwSearch(e.target.value)}
                    />
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>מילת מפתח</th>
                          <th>מיקום</th>
                          <th>קליקים</th>
                          <th>חשיפות</th>
                          <th>CTR</th>
                          <th>פעולה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredKeywords.length === 0 ? (
                          <tr>
                            <td colSpan={6}>
                              <div className="empty-state">אין נתוני מילות מפתח — הרץ Sync לאחר חיבור GSC</div>
                            </td>
                          </tr>
                        ) : (
                          filteredKeywords.map((k) => (
                            <tr key={k.query}>
                              <td>
                                <span className="kw-text">{k.query}</span>
                              </td>
                              <td>
                                <span
                                  className={`rank-val${k.position <= 10 ? ' rank-up' : k.position > 15 ? ' rank-down' : ' rank-same'}`}
                                >
                                  {k.position.toFixed(1)}
                                </span>
                              </td>
                              <td>{k.clicks}</td>
                              <td>{k.impressions.toLocaleString('he-IL')}</td>
                              <td>{fmtCtr(k.ctr)}</td>
                              <td>
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  onClick={() => openModal(k)}
                                >
                                  פתח ניתוח
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className={`tab-content${activeTab === 'pages' ? ' active' : ''}`} id="tab-pages">
                <div className="table-wrap">
                  <div className="table-toolbar">
                    <input
                      className="search-input"
                      type="text"
                      placeholder="חיפוש עמוד..."
                      value={pageSearch}
                      onChange={(e) => setPageSearch(e.target.value)}
                    />
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>עמוד</th>
                          <th>קליקים (GSC)</th>
                          <th>חשיפות</th>
                          <th>Sessions (GA4)</th>
                          <th>CTR</th>
                          <th>מיקום</th>
                          <th>סטטוס</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPages.length === 0 ? (
                          <tr>
                            <td colSpan={7}>
                              <div className="empty-state">אין נתוני עמודים — הרץ Sync</div>
                            </td>
                          </tr>
                        ) : (
                          filteredPages.map((p) => {
                            const status = pageStatus(p.path, data.pagesNeedingImprovement);
                            return (
                              <tr key={p.path}>
                                <td>
                                  <span className="url-text fw-700">{p.path}</span>
                                </td>
                                <td>{p.clicks || '—'}</td>
                                <td>{p.impressions ? p.impressions.toLocaleString('he-IL') : '—'}</td>
                                <td>{p.sessions ?? '—'}</td>
                                <td>{p.ctr != null ? fmtCtr(p.ctr) : '—'}</td>
                                <td>{p.position != null ? p.position.toFixed(1) : '—'}</td>
                                <td>
                                  <span className={`status-pill ${status}`}>{pageStatusLabel(status)}</span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>

            {/* OPPORTUNITIES + COMPETITORS */}
            <div className="two-col">
              <section className="section" id="section-opportunities">
                <div className="section-header">
                  <h2 className="section-title">
                    <span className="icon">💡</span> הזדמנויות AI
                  </h2>
                </div>
                <div className="card">
                  <div className="card-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
                    {data.aiSeoSuggestions.length === 0 ? (
                      <div className="empty-state">אין המלצות AI כרגע</div>
                    ) : (
                      data.aiSeoSuggestions.map((s, i) => (
                        <div className="opp-item" key={`${s.title}-${i}`}>
                          <div className={`opp-score ${scoreClass(s.priority)}`}>
                            {priorityScore(s.priority)}
                          </div>
                          <div className="opp-info">
                            <div className="opp-title">{s.title}</div>
                            <div className="opp-desc">{s.detail}</div>
                          </div>
                          <span className="opp-type-tag">💡 המלצה</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>

              <section className="section" id="section-competitors">
                <div className="section-header">
                  <h2 className="section-title">
                    <span className="icon">🏆</span> מתחרים
                  </h2>
                </div>
                <div className="empty-state card" style={{ borderRadius: 12 }}>
                  אין נתוני מתחרים — יתווסף בהמשך
                </div>
              </section>
            </div>

            {/* GBP */}
            <section className="section" id="section-gbp">
              <div className="section-header">
                <h2 className="section-title">
                  <span className="icon">📍</span> Google Business Profile
                </h2>
              </div>

              <div className="card">
                <div className="card-header">
                  <span>מצב הפרופיל</span>
                  {gbpPending ? (
                    <span className="status-pill pending">Pending Google API Approval</span>
                  ) : data.gbp.ok ? (
                    <span className="status-pill strong">● מחובר</span>
                  ) : (
                    <span className="status-pill improve">⚠️ דורש הגדרה</span>
                  )}
                </div>
                <div className="card-body">
                  {gbpPending && (
                    <p className="text-muted" style={{ marginBottom: 14 }}>
                      Google Business Profile ממתין לאישור Google API (quota=0). זה לא חוסם את שאר
                      הדשבורד.
                    </p>
                  )}

                  <div className="gbp-grid">
                    <div className="gbp-item">
                      <div className="gbp-item-icon">🏢</div>
                      <div className="gbp-item-label">עסק</div>
                      <div className="gbp-item-val" style={{ fontSize: 14 }}>
                        {data.gbp.matchedBusiness?.title || data.gbp.hint || '—'}
                      </div>
                    </div>
                    <div className="gbp-item">
                      <div className="gbp-item-icon">📍</div>
                      <div className="gbp-item-label">מיקומים</div>
                      <div className="gbp-item-val">{data.gbp.locations}</div>
                    </div>
                    <div className="gbp-item">
                      <div className="gbp-item-icon">🔗</div>
                      <div className="gbp-item-label">סטטוס API</div>
                      <div className="gbp-item-val" style={{ fontSize: 13 }}>
                        {gbpPending ? 'ממתין' : data.gbp.ok ? 'פעיל' : 'לא מחובר'}
                      </div>
                    </div>
                  </div>

                  {data.gbp.lastError && !gbpPending && (
                    <p className="text-muted mt-8">{data.gbp.lastError}</p>
                  )}
                </div>
              </div>
            </section>

            {/* DRAFTS */}
            <section className="section" id="section-drafts">
              <div className="section-header">
                <h2 className="section-title">
                  <span className="icon">✍️</span> טיוטות ממתינות לאישור
                </h2>
                {pendingDrafts.length > 0 && (
                  <span className="chip chip-orange">{pendingDrafts.length} ממתינות</span>
                )}
              </div>

              <div className="card">
                <div className="card-body" style={{ padding: '0 18px' }}>
                  {pendingDrafts.length === 0 ? (
                    <div className="empty-state">אין טיוטות ממתינות</div>
                  ) : (
                    pendingDrafts.map((d) => {
                      const icon = DRAFT_ICONS[d.type] || DRAFT_ICONS.recommendation;
                      return (
                        <div className="draft-item" key={d.id}>
                          <div className={`draft-type-icon ${icon.cls}`}>{icon.emoji}</div>
                          <div className="draft-info">
                            <div className="draft-title">{d.title}</div>
                            <div className="draft-meta">
                              {d.detail ? `${d.detail.slice(0, 80)} · ` : ''}
                              המלצה בלבד — לא פורסם
                            </div>
                          </div>
                          <div className="draft-actions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => setModalDraft(d)}
                            >
                              👁 צפייה
                            </button>
                            <button
                              type="button"
                              className="btn btn-success btn-sm"
                              onClick={() => handleDraftAction(d.id, 'approved')}
                            >
                              ✓ אישור
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDraftAction(d.id, 'rejected')}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>

            {/* AI + DAILY REPORT */}
            <div className="two-col">
              <section className="section" id="section-ai">
                <div className="section-header">
                  <h2 className="section-title">
                    <span className="icon">🤖</span> AI Assistant
                  </h2>
                </div>

                <div className="ai-panel">
                  <div className="ai-panel-title">🧠 מה זיהיתי היום</div>

                  {data.aiSeoSuggestions.length === 0 ? (
                    <div className="ai-insight">
                      <div className="ai-insight-label">ממתין</div>
                      <div className="ai-insight-text">אין המלצות AI — הרץ Sync לאחר חיבור GSC</div>
                    </div>
                  ) : (
                    data.aiSeoSuggestions.slice(0, 4).map((s, i) => (
                      <div className="ai-insight" key={`${s.title}-${i}`}>
                        <div className="ai-insight-label">
                          {s.priority === 'high' ? 'דחוף' : s.priority === 'medium' ? 'המלצה' : 'מידע'}
                        </div>
                        <div className="ai-insight-text">
                          <strong>{s.title}</strong> — {s.detail}
                        </div>
                      </div>
                    ))
                  )}

                  <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={handleSyncNow}>
                      ✨ הרץ סנכרון
                    </button>
                  </div>
                </div>
              </section>

              <section className="section" id="section-daily">
                <div className="section-header">
                  <h2 className="section-title">
                    <span className="icon">📅</span> דוח יומי
                  </h2>
                  {dailyReport && (
                    <span className="text-muted">
                      {dailyReport.label} · {dailyReport.date}
                    </span>
                  )}
                </div>

                <div className="card">
                  <div className="card-body" style={{ padding: '8px 18px' }}>
                    {!dailyReport ? (
                      <div className="empty-state">אין דוח יומי עדיין</div>
                    ) : (
                      <>
                        {dailyReport.whatUp && (
                          <div className="report-row">
                            <div className="report-row-icon rr-up">📈</div>
                            <div>
                              <div className="report-row-label">מה עלה</div>
                              <div className="report-row-text">{dailyReport.whatUp}</div>
                            </div>
                          </div>
                        )}
                        {dailyReport.whatDown && (
                          <div className="report-row">
                            <div className="report-row-icon rr-down">📉</div>
                            <div>
                              <div className="report-row-label">מה ירד</div>
                              <div className="report-row-text">{dailyReport.whatDown}</div>
                            </div>
                          </div>
                        )}
                        {dailyReport.created && (
                          <div className="report-row">
                            <div className="report-row-icon rr-new">✨</div>
                            <div>
                              <div className="report-row-label">מה נוצר</div>
                              <div className="report-row-text">{dailyReport.created}</div>
                            </div>
                          </div>
                        )}
                        {dailyReport.pending && (
                          <div className="report-row">
                            <div className="report-row-icon rr-wait">⏳</div>
                            <div>
                              <div className="report-row-label">ממתין לאישור</div>
                              <div className="report-row-text">{dailyReport.pending}</div>
                            </div>
                          </div>
                        )}
                        {dailyReport.tomorrow && (
                          <div className="report-row">
                            <div className="report-row-icon rr-todo">🎯</div>
                            <div>
                              <div className="report-row-label">מה כדאי מחר</div>
                              <div className="report-row-text">{dailyReport.tomorrow}</div>
                            </div>
                          </div>
                        )}
                        {!dailyReport.whatUp &&
                          !dailyReport.whatDown &&
                          !dailyReport.created &&
                          !dailyReport.pending &&
                          !dailyReport.tomorrow && (
                            <div className="report-row">
                              <div className="report-row-icon rr-new">📊</div>
                              <div>
                                <div className="report-row-label">{dailyReport.label}</div>
                                <div className="report-row-text">
                                  Sessions: {dailyReport.sessions ?? '—'} · PageViews:{' '}
                                  {dailyReport.pageViews ?? '—'} · GSC queries:{' '}
                                  {dailyReport.gscQueries ?? '—'}
                                </div>
                              </div>
                            </div>
                          )}
                      </>
                    )}
                  </div>
                </div>
              </section>
            </div>

            {/* ACTIVITY LOG */}
            <section className="section" id="section-activity">
              <div className="section-header">
                <h2 className="section-title">
                  <span className="icon">📋</span> יומן פעולות וסנכרונים
                </h2>
                <span className="text-muted">{data.activityLog.length} רשומות</span>
              </div>

              <div className="table-wrap">
              <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>תאריך / שעה</th>
                        <th>סוג פעולה</th>
                        <th>סטטוס</th>
                        <th>מקור</th>
                        <th>הודעה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.activityLog.length === 0 ? (
                        <tr>
                          <td colSpan={5}>
                            <div className="empty-state">אין רשומות — הרץ Sync Now</div>
                          </td>
                        </tr>
                      ) : (
                        data.activityLog.map((e, i) => (
                          <tr key={`${e.timestamp}-${i}`}>
                            <td>{new Date(e.timestamp).toLocaleString('he-IL')}</td>
                            <td>{e.action}</td>
                            <td>
                              <span className={`status-pill ${e.status === 'success' ? 'strong' : e.status === 'error' ? 'weak' : 'improve'}`}>
                                {e.status}
                              </span>
                            </td>
                            <td className="text-muted" style={{ fontSize: 12 }}>
                              {resolveLogSource(e)}
                            </td>
                            <td className="text-muted log-detail-cell">
                              {e.detail || '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* CONNECTIONS */}
            <section className="section" id="connections">
              <div className="section-header">
                <h2 className="section-title">
                  <span className="icon">🔌</span> חיבורים
                </h2>
                <span className="text-muted">
                  {connectedCount}/{Object.keys(data.connections).length} פעילים · מקור: {data.dataSource}
                </span>
              </div>

              <div className="card">
                <div className="card-body">
                  <div className="conn-grid">
                    {Object.entries(data.connections).map(([key, conn]) => {
                      const pill = connStatusPill(conn);
                      return (
                        <div className="conn-item" key={key}>
                          <div className="conn-item-name">{CONN_LABELS[key] || key}</div>
                          <span className={`status-pill ${pill.cls}`}>{pill.label}</span>
                          {conn.note && <div className="conn-item-note">{conn.note}</div>}
                        </div>
                      );
                    })}
                  </div>

                  {data.sync.spreadsheetUrl && (
                    <p className="text-muted mt-8">
                      Google Sheet:{' '}
                      <a href={data.sync.spreadsheetUrl} target="_blank" rel="noreferrer">
                        {data.sync.spreadsheetUrl}
                      </a>
                    </p>
                  )}
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>

      {/* DRAFT MODAL */}
      <div
        className={`modal-overlay${modalDraft ? ' open' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModalDraft(null);
        }}
        onKeyDown={() => {}}
        role="presentation"
      >
        <div className="modal">
          <div className="modal-header">
            <span className="modal-title">✍️ צפייה בטיוטה</span>
            <button type="button" className="modal-close" onClick={() => setModalDraft(null)}>
              ✕
            </button>
          </div>
          {modalDraft && (
            <div className="modal-body">
              <div className="modal-section">
                <div className="modal-section-title">כותרת</div>
                <div className="modal-section-text">{modalDraft.title}</div>
              </div>
              <div className="modal-section">
                <div className="modal-section-title">פרטים</div>
                <div className="modal-section-text">
                  <strong>סוג:</strong> {draftTypeLabel(modalDraft.type)}
                  <br />
                  <strong>סטטוס:</strong> {draftStatusLabel(modalDraft.status)}
                  <br />
                  <strong>מקור:</strong> המלצת AI / Sync ({modalDraft.sourceId || 'export'})
                  <br />
                  <strong>נוצר:</strong>{' '}
                  {modalDraft.createdAt
                    ? new Date(modalDraft.createdAt).toLocaleString('he-IL')
                    : '—'}
                </div>
              </div>
              <div className="modal-section">
                <div className="modal-section-title">תקציר / תוכן</div>
                <div className="modal-section-text">{modalDraft.detail || '—'}</div>
              </div>
              <div className="modal-section">
                <div className="modal-section-text text-muted">
                  🔒 {modalDraft.note || 'המלצה בלבד — לא פורסם'}. אישור לא מפרסם תוכן.
                </div>
              </div>
              {modalDraft.status === 'pending_approval' && (
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    onClick={() => {
                      handleDraftAction(modalDraft.id, 'approved');
                      setModalDraft(null);
                    }}
                  >
                    ✓ אישור (לא פרסום)
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      handleDraftAction(modalDraft.id, 'rejected');
                      setModalDraft(null);
                    }}
                  >
                    ✕ דחייה
                  </button>
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setModalDraft(null)}>
                  סגור
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* KEYWORD MODAL */}
      <div
        className={`modal-overlay${modalKw ? ' open' : ''}`}
        id="kwModal"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
        onKeyDown={() => {}}
        role="presentation"
      >
        <div className="modal">
          <div className="modal-header">
            <span className="modal-title">
              🔍 ניתוח מילת מפתח: {modalKw?.query}
            </span>
            <button type="button" className="modal-close" onClick={closeModal}>
              ✕
            </button>
          </div>
          {modalKw && (
            <div className="modal-body">
              <div className="modal-stat-row">
                <div
                  className="modal-stat-box"
                  style={{ background: 'var(--blue-light)' }}
                >
                  <div style={{ fontSize: 11, color: 'var(--blue)', fontWeight: 600 }}>מיקום</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)' }}>
                    {modalKw.position.toFixed(1)}
                  </div>
                </div>
                <div
                  className="modal-stat-box"
                  style={{ background: 'var(--green-light)' }}
                >
                  <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>קליקים</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)' }}>
                    {modalKw.clicks.toLocaleString('he-IL')}
                  </div>
                </div>
                <div
                  className="modal-stat-box"
                  style={{ background: 'var(--orange-light)' }}
                >
                  <div style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 600 }}>חשיפות</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)' }}>
                    {modalKw.impressions.toLocaleString('he-IL')}
                  </div>
                </div>
                <div
                  className="modal-stat-box"
                  style={{ background: 'var(--yellow-light)' }}
                >
                  <div style={{ fontSize: 11, color: 'var(--yellow)', fontWeight: 600 }}>CTR</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--navy)' }}>
                    {fmtCtr(modalKw.ctr)}
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <div className="modal-section-title">🎯 ניתוח</div>
                <div className="modal-section-text">
                  {modalKw.impressions >= 100 && modalKw.ctr < 0.03
                    ? 'חשיפות גבוהות עם CTR נמוך — בדוק intent, כותרת ו-meta description.'
                    : modalKw.position <= 10
                      ? 'מיקום טוב — שמור על התוכן ועקוב אחרי מתחרים.'
                      : 'פוטנציאל לשיפור — שקול תוכן ממוקד וקישורים פנימיים.'}
                </div>
              </div>

              <div className="modal-section">
                <div className="modal-section-title">🚀 המלצת פעולה</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className="chip chip-blue">📝 תוכן ממוקד</span>
                  <span className="chip chip-green">❓ FAQ</span>
                  <span className="chip chip-orange">🔗 קישורים פנימיים</span>
                </div>
                <p className="text-muted mt-8">המלצה בלבד — לא פורסם</p>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  marginTop: 18,
                  paddingTop: 16,
                  borderTop: '1px solid var(--border)',
                }}
              >
                <button type="button" className="btn btn-ghost" onClick={closeModal}>
                  סגור
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
