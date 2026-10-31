import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import './SystemOpsCenterView.css';

export interface ServiceItem {
  id: string;
  name: string;
  nameHe: string;
  category: 'comms' | 'ai' | 'claims' | 'infra' | 'providers';
  roleHe: string;
  status: 'healthy' | 'warning' | 'error' | 'paused' | 'unknown';
  lastCheckedAt: string;
  lastSuccessAt: string | null;
  successCount24h: number | null;
  failureCount24h: number | null;
  latencyMs: number | null;
  lastError: string | null;
  lastErrorAt: string | null;
  requiresManualIntervention: boolean;
  manualActionHe: string | null;
  externalConsoleUrl: string | null;
  details?: Record<string, unknown>;
}

export interface HealthSummary {
  total: number;
  healthy: number;
  warning: number;
  error: number;
  paused: number;
  unknown: number;
  requiresAttention: number;
}

interface Props {
  onBack: () => void;
  userRole?: string;
}

const CATEGORY_TABS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'כל המערכות' },
  { key: 'comms', label: 'תקשורת ודואר' },
  { key: 'ai', label: 'בינה מלאכותית ו-OCR' },
  { key: 'infra', label: 'תשתיות וענן' },
  { key: 'providers', label: 'ספקים ושירותים חיצוניים' },
];

export function SystemOpsCenterView({ onBack, userRole }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [lastCheckTime, setLastCheckTime] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: funcError } = await supabase.functions.invoke('system-health-check', {
        method: 'POST',
      });

      if (funcError) {
        throw new Error(funcError.message || 'שגיאה בפנייה למנוע בדיקות הבריאות');
      }

      if (data?.success) {
        setServices(data.services || []);
        setSummary(data.summary || null);
        setLastCheckTime(new Date(data.checkedAt || Date.now()).toLocaleTimeString('he-IL'));
      } else {
        throw new Error(data?.error || 'התקבלה תשובה לא תקינה מהשרת');
      }
    } catch (err) {
      console.error('SystemOpsCenter fetch failed', err);
      setError((err as Error).message || 'שגיאה בטעינת נתוני מרכז הבקרה');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchHealth();
  }, []);

  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.nameHe.toLowerCase().includes(q) ||
          s.roleHe.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [services, categoryFilter, statusFilter, searchQuery]);

  const getStatusBadge = (status: ServiceItem['status']) => {
    switch (status) {
      case 'healthy':
        return <span className="ops-badge ops-badge-healthy">🟢 תקין ומאומת</span>;
      case 'warning':
        return <span className="ops-badge ops-badge-warning">🟡 אזהרה / התקרבות לתקלה</span>;
      case 'error':
        return <span className="ops-badge ops-badge-error">🔴 תקלה מאומתת</span>;
      case 'paused':
        return <span className="ops-badge ops-badge-paused">⚪ מושהה במכוון</span>;
      default:
        return <span className="ops-badge ops-badge-unknown">⚪ לא נבדק / מצב לא ידוע</span>;
    }
  };

  return (
    <div className="ops-container" dir="rtl">
      {/* Top Header */}
      <div className="ops-header">
        <div className="ops-header-right">
          <button type="button" className="ops-back-btn" onClick={onBack} title="חזרה לניהול תביעות">
            ➔ חזרה
          </button>
          <div>
            <h1 className="ops-title">מרכז בקרה ותפעול המערכת</h1>
            <p className="ops-subtitle">
              מפת הבריאות, החיבורים, הסנכרונים והתשתיות של מערכת דליה (אורן קר)
            </p>
          </div>
        </div>
        <div className="ops-header-left">
          <span className="ops-last-check">
            בדיקה אחרונה: <b>{lastCheckTime || '—'}</b>
          </span>
          <button
            type="button"
            className="ops-refresh-btn"
            onClick={fetchHealth}
            disabled={loading}
          >
            {loading ? 'מרענן...' : '🔄 בדיקת דופק שקטה'}
          </button>
        </div>
      </div>

      {/* Summary Row */}
      {summary && (
        <div className="ops-summary-row">
          <div className="ops-summary-card ops-summary-healthy" onClick={() => setStatusFilter('healthy')}>
            <div className="ops-summary-num">{summary.healthy}</div>
            <div className="ops-summary-label">תקין ופעיל</div>
          </div>
          <div className="ops-summary-card ops-summary-warning" onClick={() => setStatusFilter('warning')}>
            <div className="ops-summary-num">{summary.warning}</div>
            <div className="ops-summary-label">אזהרות / דורש מעקב</div>
          </div>
          <div className="ops-summary-card ops-summary-error" onClick={() => setStatusFilter('error')}>
            <div className="ops-summary-num">{summary.error}</div>
            <div className="ops-summary-label">תקלות מאומתות</div>
          </div>
          <div className="ops-summary-card ops-summary-paused" onClick={() => setStatusFilter('paused')}>
            <div className="ops-summary-num">{summary.paused}</div>
            <div className="ops-summary-label">מושהה במכוון</div>
          </div>
          {summary.requiresAttention > 0 && (
            <div className="ops-summary-card ops-summary-attention" onClick={() => setStatusFilter('error')}>
              <div className="ops-summary-num">{summary.requiresAttention}</div>
              <div className="ops-summary-label">פעולות ידניות נדרשות</div>
            </div>
          )}
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="ops-error-banner">
          ⚠️ <b>שגיאת מערכת:</b> {error}
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="ops-filters-toolbar">
        <div className="ops-category-tabs">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`ops-tab-btn ${categoryFilter === tab.key ? 'active' : ''}`}
              onClick={() => setCategoryFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="ops-filter-inputs">
          <select
            className="ops-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">כל הסטטוסים</option>
            <option value="healthy">תקין 🟢</option>
            <option value="warning">אזהרה 🟡</option>
            <option value="error">תקלה 🔴</option>
            <option value="paused">מושהה ⚪</option>
          </select>
          <input
            type="text"
            className="ops-search-input"
            placeholder="חיפוש שירות או רכיב..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Services Grid */}
      <div className="ops-grid">
        {filteredServices.map((service) => (
          <div
            key={service.id}
            className={`ops-card ops-card-${service.status}`}
            onClick={() => setSelectedService(service)}
          >
            <div className="ops-card-header">
              <div>
                <h3 className="ops-card-title">{service.nameHe}</h3>
                <span className="ops-card-name-en">{service.name}</span>
              </div>
              {getStatusBadge(service.status)}
            </div>

            <p className="ops-card-role">{service.roleHe}</p>

            <div className="ops-card-stats">
              {service.latencyMs !== null && (
                <div className="ops-stat-item">
                  <span className="ops-stat-lbl">זמן תגובה:</span>
                  <span className="ops-stat-val">{service.latencyMs} ms</span>
                </div>
              )}
              {service.successCount24h !== null && (
                <div className="ops-stat-item">
                  <span className="ops-stat-lbl">הצלחות 24 שעות:</span>
                  <span className="ops-stat-val text-green">{service.successCount24h}</span>
                </div>
              )}
              {service.failureCount24h !== null && (
                <div className="ops-stat-item">
                  <span className="ops-stat-lbl">כשלים 24 שעות:</span>
                  <span className={`ops-stat-val ${service.failureCount24h > 0 ? 'text-red' : ''}`}>
                    {service.failureCount24h}
                  </span>
                </div>
              )}
            </div>

            {service.lastError && (
              <div className="ops-card-error">
                <b>שגיאה:</b> {service.lastError}
              </div>
            )}

            {service.manualActionHe && (
              <div className="ops-card-action">
                <b>נדרש טיפול:</b> {service.manualActionHe}
              </div>
            )}

            <div className="ops-card-footer">
              <span className="ops-card-date">
                בדיקה: {new Date(service.lastCheckedAt).toLocaleTimeString('he-IL')}
              </span>
              {service.externalConsoleUrl && (
                <a
                  href={service.externalConsoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ops-card-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  מסוף ניהול ↗
                </a>
              )}
            </div>
          </div>
        ))}

        {filteredServices.length === 0 && !loading && (
          <div className="ops-empty-state">
            לא נמצאו שירותים התואמים את הסינון הנוכחי.
          </div>
        )}
      </div>

      {/* Modal for Service Deep Dive */}
      {selectedService && (
        <div className="ops-modal-backdrop" onClick={() => setSelectedService(null)}>
          <div className="ops-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="ops-modal-header">
              <div>
                <h2>{selectedService.nameHe}</h2>
                <span className="ops-card-name-en">{selectedService.name}</span>
              </div>
              <button
                type="button"
                className="ops-modal-close"
                onClick={() => setSelectedService(null)}
              >
                ✕
              </button>
            </div>
            <div className="ops-modal-body">
              <div className="ops-modal-section">
                <b>תפקיד במערכת:</b>
                <p>{selectedService.roleHe}</p>
              </div>
              <div className="ops-modal-section">
                <b>סטטוס:</b>
                <div style={{ marginTop: 6 }}>{getStatusBadge(selectedService.status)}</div>
              </div>
              {selectedService.lastError && (
                <div className="ops-modal-section ops-error-box">
                  <b>פירוט השגיאה האחרונה:</b>
                  <p>{selectedService.lastError}</p>
                  {selectedService.lastErrorAt && (
                    <small>מועד: {new Date(selectedService.lastErrorAt).toLocaleString('he-IL')}</small>
                  )}
                </div>
              )}
              {selectedService.manualActionHe && (
                <div className="ops-modal-section ops-action-box">
                  <b>הנחיות לפתרון:</b>
                  <p>{selectedService.manualActionHe}</p>
                </div>
              )}
              {selectedService.details && (
                <div className="ops-modal-section">
                  <b>נתונים טכניים נוספים:</b>
                  <pre className="ops-code-block">
                    {JSON.stringify(selectedService.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <div className="ops-modal-footer">
              {selectedService.externalConsoleUrl && (
                <a
                  href={selectedService.externalConsoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ops-modal-primary-btn"
                >
                  פתח אתר ניהול רשמי של הספק ↗
                </a>
              )}
              <button
                type="button"
                className="ops-modal-sec-btn"
                onClick={() => setSelectedService(null)}
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
