import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { createClaimsApi } from '@/features/claims/claimsService';
import { garageShareIdsAllowed, garageStatusLabel, garageWorkerReviewLabel, type GarageAssignment } from '@/features/claims/claimGarage';
import GaragePhotosGallery from '@/features/claims/GaragePhotosGallery';
import { sharePublicUrl } from '@/features/claims/claimSecureShare';
import { downloadRemoteFile } from '@/features/claims/claimFileDownload';
import '@/features/claims/claims.css';

type Job = GarageAssignment & {
  claim?: {
    id: string;
    client_name?: string;
    plate?: string;
    car_model?: string;
    garage_name?: string;
    event_date?: string;
  };
};

type Photo = { id: string; original_name: string; mime_type?: string; created_at?: string; url?: string };

export default function GarageJobsPage() {
  const { user, realUser } = useAuth();
  const [searchParams] = useSearchParams();
  const previewWorkerId = (searchParams.get('worker') || '').trim();
  const isAdminPreview = Boolean(previewWorkerId);
  const api = useMemo(() => createClaimsApi({
    id: user?.id || '',
    full_name: user?.full_name || '',
    email: user?.email || '',
    role: user?.role || 'driver',
    hasClaimsAccess: false,
  }), [user?.id, user?.full_name, user?.email, user?.role]);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [progress, setProgress] = useState('');
  const [pending, setPending] = useState<Array<{ name: string; file: File; preview: string }>>([]);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState<Photo | null>(null);

  const loadJobs = useCallback(async () => {
    setErr('');
    const r = await api.invokeDocs('garage_list_jobs', previewWorkerId ? { worker_id: previewWorkerId } : {});
    if (r.success === false) { setErr(String(r.error || 'טעינה נכשלה')); setJobs([]); setReady(true); return; }
    setJobs((r.jobs as Job[]) || []);
    setReady(true);
  }, [api, previewWorkerId]);

  useEffect(() => { void loadJobs(); }, [loadJobs]);

  const filtered = jobs.filter((j) => {
    if (status && j.status !== status) return false;
    const hay = `${j.claim?.id || j.claim_id} ${j.claim?.client_name || ''} ${j.claim?.plate || ''} ${j.assigned_at || ''}`.toLowerCase();
    return !q.trim() || hay.includes(q.trim().toLowerCase());
  });

  const openJob = async (claimId: string) => {
    setBusy('load');
    setErr('');
    const r = await api.invokeDocs('garage_get_job', {
      claim_id: claimId,
      ...(previewWorkerId ? { worker_id: previewWorkerId } : {}),
    });
    setBusy('');
    if (r.success === false) { setErr(String(r.error || 'אין גישה לתיק')); return; }
    setOpenId(claimId);
    setJob({ ...(r.job as Job), claim: r.claim as Job['claim'] });
    const rows = ((r.photos as Photo[]) || []);
    setPhotos(rows);
    const u = await api.invokeDocs('garage_signed_urls', {
      claim_id: claimId,
      file_ids: rows.map((p) => p.id),
      ...(previewWorkerId ? { worker_id: previewWorkerId } : {}),
    });
    const urls = (u.urls && typeof u.urls === 'object') ? u.urls as Record<string, string> : {};
    if (Object.keys(urls).length) {
      setPhotos((cur) => cur.map((x) => urls[x.id] ? { ...x, url: urls[x.id] } : x));
    }
  };

  const addFiles = (list: FileList | File[]) => {
    const next: Array<{ name: string; file: File; preview: string }> = [];
    for (const file of Array.from(list)) {
      if (!file.type.startsWith('image/')) continue;
      next.push({ name: file.name, file, preview: URL.createObjectURL(file) });
    }
    setPending((p) => [...p, ...next]);
  };

  const uploadPending = async () => {
    if (!openId || !pending.length) return;
    setBusy('up');
    setErr('');
    let ok = 0;
    for (let i = 0; i < pending.length; i++) {
      setProgress(`מעלה ${i + 1} מתוך ${pending.length}`);
      const form = new FormData();
      form.set('action', 'garage_upload');
      form.set('claim_id', openId);
      form.set('file', pending[i].file, pending[i].name);
      const r = await api.invokeDocsForm(form);
      if (r.success === false) { setErr(String(r.error || 'העלאה נכשלה')); break; }
      ok += 1;
    }
    pending.forEach((p) => URL.revokeObjectURL(p.preview));
    setPending((p) => p.slice(ok));
    setProgress('');
    setBusy('');
    await openJob(openId);
    await loadJobs();
  };

  const complete = async () => {
    if (!openId) return;
    setBusy('done');
    const r = await api.invokeDocs('garage_complete', { claim_id: openId });
    setBusy('');
    if (r.success === false) { setErr(String(r.error || 'לא ניתן לסיים')); return; }
    await openJob(openId);
    await loadJobs();
  };

  return (
    <div className="claims-root garage-portal" data-testid="garage-portal" dir="rtl">
      <div className="garage-head">
        <h1>צילומי מוסך</h1>
        {isAdminPreview ? (
          <div className="garage-admin-preview" data-testid="garage-admin-preview">
            <b>תצוגת פורטל עובד</b>
            <p>מחוברים כמנהל ({realUser?.full_name || user?.full_name || 'מנהל'}) — בלי החלפת משתמש.</p>
            <p>מוצגים רק התיקים ששויכו לעובד זה. העלאה וסיום צילום נשארים אצל העובד.</p>
          </div>
        ) : (
          <p>רק התיקים ששויכו אליך. בלי תביעות אחרות.</p>
        )}
      </div>
      {!openId ? (
        <>
          <div className="garage-filters">
            <input className="fi" data-testid="garage-search" placeholder="חיפוש לפי שם לקוח / מספר רכב / מספר תביעה" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="fse fi" data-testid="garage-status-filter" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">כל הסטטוסים</option>
              <option value="pending">ממתין לצילום</option>
              <option value="in_progress">צילום בתהליך</option>
              <option value="completed">צילום הושלם</option>
            </select>
          </div>
          {err ? <div className="garage-err">{err}</div> : null}
          {!ready ? <div className="garage-empty" data-testid="garage-loading">טוען תיקים…</div> : null}
          {ready && !filtered.length ? <div className="garage-empty" data-testid="garage-empty">אין תיקים משויכים</div> : null}
          {ready && filtered.length ? (
            <div className="garage-list" data-testid="garage-job-list">
              {filtered.map((j) => (
                <button type="button" key={j.id} className="garage-card" data-testid={`garage-job-${j.claim_id}`} onClick={() => void openJob(j.claim_id)}>
                  <b>{j.claim?.id || j.claim_id}</b>
                  <span>{j.claim?.client_name || '—'}</span>
                  <span>{j.claim?.plate || '—'}</span>
                  <span>{garageStatusLabel(j.status)} · {j.photo_count || 0} תמונות</span>
                  {j.review_status === 'needs_update' ? (
                    <span className="garage-review-banner wait" data-testid={`garage-job-needs-${j.claim_id}`}>נדרש להשלים{j.review_note ? ` · ${j.review_note}` : ''}</span>
                  ) : null}
                  {j.review_status === 'awaiting_review' ? (
                    <span className="garage-review-banner need" data-testid={`garage-job-awaiting-${j.claim_id}`}>{garageWorkerReviewLabel(j.review_status)}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div data-testid="garage-job-open">
          <button type="button" className="btn btn-g" data-testid="garage-back" onClick={() => { setOpenId(''); setJob(null); setPhotos([]); setPending([]); }}>חזרה לרשימה</button>
          <div className="garage-detail">
            <h2>{job?.claim?.id || openId}</h2>
            <div>לקוח: {job?.claim?.client_name || '—'}</div>
            <div>רכב: {job?.claim?.plate || '—'} {job?.claim?.car_model ? `· ${job.claim.car_model}` : ''}</div>
            <div>מוסך: {job?.claim?.garage_name || '—'}</div>
            <div>תאריך אירוע: {job?.claim?.event_date || '—'}</div>
            <div>סטטוס: {garageStatusLabel(job?.status)}</div>
            {job?.worker_note ? <div>הערה: {job.worker_note}</div> : null}
            {job?.review_status === 'needs_update' ? (
              <div className="garage-review-banner wait" data-testid="garage-needs-update">
                נדרש להשלים{job.review_note ? ` — ${job.review_note}` : ''}
              </div>
            ) : null}
            {job?.review_status === 'awaiting_review' ? (
              <div className="garage-review-banner need" data-testid="garage-awaiting-review">
                {garageWorkerReviewLabel(job.review_status)}
              </div>
            ) : null}
            {job?.review_status === 'approved' ? (
              <div className="garage-review-banner ok" data-testid="garage-approved">
                {garageWorkerReviewLabel(job.review_status)}
              </div>
            ) : null}
          </div>
          {err ? <div className="garage-err">{err}</div> : null}
          {progress ? <div className="garage-progress" data-testid="garage-progress">{progress}</div> : null}
          {isAdminPreview ? null : <div className="garage-acts">
            <label className="btn btn-p garage-cam">
              📷 צלם תמונה
              <input hidden type="file" accept="image/*" capture="environment" multiple data-testid="garage-camera" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
            </label>
            <label className="btn btn-g">
              העלה תמונות
              <input hidden type="file" accept="image/*" multiple data-testid="garage-pick" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
            </label>
          </div>}
          {!isAdminPreview && pending.length ? (
            <div data-testid="garage-pending">
              <div>מוכנות לשליחה: {pending.length}</div>
              <div className="garage-thumbs">
                {pending.map((p, i) => (
                  <div key={`${p.name}-${i}`} className="garage-thumb">
                    <img src={p.preview} alt={p.name} />
                    <button type="button" className="btn btn-sm" onClick={() => setPending((cur) => cur.filter((_, idx) => idx !== i))}>הסר לפני שליחה</button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-p" data-testid="garage-send" disabled={busy === 'up'} onClick={() => void uploadPending()}>
                {busy === 'up' ? 'מעלה…' : `שלח ${pending.length} תמונות`}
              </button>
            </div>
          ) : null}
          <GaragePhotosGallery
            photos={photos}
            canShare={!isAdminPreview}
            busy={Boolean(busy)}
            onPreview={setPreview}
            onDownload={(p) => { if (p.url) void downloadRemoteFile(p.url, p.original_name); }}
            onCreateShare={async (fileIds, recipientName) => {
              const allowed = garageShareIdsAllowed(fileIds, photos.map((p) => ({ id: p.id, claim_id: openId })), openId);
              if (!allowed.ok) { setErr(allowed.error); return null; }
              const r = await api.invokeDocs('garage_create_share', {
                claim_id: openId,
                recipient_name: recipientName,
                recipient_kind: 'surveyor',
                file_ids: allowed.ids,
                ttl_hours: 48,
              });
              if (!r.success || !r.token) { setErr(String(r.error || 'יצירת הקישור נכשלה')); return null; }
              setErr('');
              return { url: sharePublicUrl(String(r.token)), expiresAt: String(r.expiresAt || '') };
            }}
          />
          {isAdminPreview ? null : (
            <button type="button" className="btn btn-p" data-testid="garage-complete" disabled={busy === 'done'} onClick={() => void complete()}>סיימתי צילום</button>
          )}
        </div>
      )}
      {preview?.url ? (
        <div className="garage-preview-overlay" data-testid="garage-preview-overlay" onClick={() => setPreview(null)}>
          <div className="garage-preview-card" onClick={(e) => e.stopPropagation()}>
            <img src={preview.url} alt={preview.original_name} />
            <div className="garage-preview-acts">
              <button type="button" className="btn btn-g" data-testid="garage-preview-download" onClick={() => { void downloadRemoteFile(preview.url || '', preview.original_name); }}>הורדה</button>
              <button type="button" className="btn btn-p" data-testid="garage-preview-close" onClick={() => setPreview(null)}>סגור</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
