/* Publishing calendar + post series for social-center.html (uses that page's globals: api, S, esc, toast, $,
   ST, openPost, loadPosts). A series publishes on its own only after the owner approves it once; every post can
   still be paused, rescheduled or cancelled. Test-mode series run the full Meta check and publish nothing. */
(function () {
  const SST = { draft: ['ממתינה לאישור', 'warn'], approved: ['מאושרת – מתפרסמת אוטומטית', 'ok'], paused: ['מושהית', 'mute'], cancelled: ['בוטלה', 'mute'], completed: ['הסתיימה', 'ok'] };
  const K = { month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), posts: [], series: [] };
  const fmt = d => new Date(d).toLocaleString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };

  async function load() {
    if (!S.key) return;
    try {
      const from = new Date(K.month.getFullYear(), K.month.getMonth(), 1 - 7).toISOString();
      const to = new Date(K.month.getFullYear(), K.month.getMonth() + 1, 7).toISOString();
      const [cal, ser] = await Promise.all([api('posts/calendar', { from, to }), api('series/list')]);
      K.posts = cal.posts; K.series = ser.series;
      const upcoming = (await api('posts/calendar', { from: new Date(Date.now() - 864e5).toISOString(), to: new Date(Date.now() + 90 * 864e5).toISOString() })).posts;
      renderSeriesSelect(); renderGrid(); renderSeries(); renderQueue(upcoming);
    } catch (e) { toast(e.message); }
  }

  function renderSeriesSelect() {
    const sel = $('#seriesSel'); if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">פוסט בודד</option>' + K.series.filter(s => ['draft', 'approved', 'paused'].includes(s.status))
      .map(s => `<option value="${s.id}">סדרה: ${esc(s.name)}${s.test_mode ? ' (בדיקה)' : ''}</option>`).join('');
    sel.value = cur;
  }

  function renderGrid() {
    const m = K.month, first = new Date(m.getFullYear(), m.getMonth(), 1), days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    $('#calTitle').textContent = m.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
    const by = {};
    K.posts.forEach(p => { const d = p.status === 'published' || p.status === 'partial' ? p.published_at || p.scheduled_at : p.scheduled_at; if (d) (by[dayKey(d)] ||= []).push({ ...p, _at: d }); });
    const cells = [];
    for (let i = 0; i < first.getDay(); i++) cells.push('<div class="cal-cell empty"></div>');
    const today = dayKey(new Date());
    for (let d = 1; d <= days; d++) {
      const k = dayKey(new Date(m.getFullYear(), m.getMonth(), d));
      const items = (by[k] || []).sort((a, b) => new Date(a._at) - new Date(b._at));
      cells.push(`<div class="cal-cell ${k === today ? 'today' : ''}"><div class="cal-d">${d}</div>${items.map(p => {
        const [l, tone] = ST[p.status] || [p.status, 'mute'];
        return `<div class="cal-post chip ${tone}" data-cp="${p.id}" title="${esc(l)} · ${esc((p.body || '').slice(0, 80))}">${new Date(p._at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })} ${p.targets.map(t => t === 'facebook' ? 'f' : 'IG').join('+')}${p.test_mode || p.results?.facebook?.dry ? ' 🧪' : ''}</div>`;
      }).join('')}</div>`);
    }
    $('#calGrid').innerHTML = `<div class="cal-head">${['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map(x => `<div>${x}</div>`).join('')}</div><div class="cal">${cells.join('')}</div>`;
  }

  function renderSeries() {
    $('#seriesList').innerHTML = K.series.length ? K.series.map(s => {
      const [l, tone] = SST[s.status] || [s.status, 'mute'];
      const sched = s.counts.scheduled || 0;
      return `<div class="series-row">
        <div><b>${esc(s.name)}</b> <span class="chip ${tone}">${l}</span>${s.test_mode ? ' <span class="chip warn">🧪 מצב בדיקה – לא מפרסם בפועל</span>' : ''}
          <div class="muted">${s.total} פוסטים · ${sched} מתוזמנים · ${s.counts.published || 0} פורסמו${s.next_at ? ` · הבא: ${fmt(s.next_at)}` : ''}${s.last_at && s.last_at !== s.next_at ? ` · אחרון: ${fmt(s.last_at)}` : ''}</div></div>
        <div class="row">
          ${['draft', 'paused'].includes(s.status) ? `<button class="btn sm go" data-sa="approve" data-s="${s.id}" ${sched ? '' : 'disabled title="אין פוסטים מתוזמנים בסדרה"'}>${s.status === 'paused' ? '▶ המשך' : '✓ אישור והפעלה'}</button>` : ''}
          ${s.status === 'approved' ? `<button class="btn sm" data-sa="pause" data-s="${s.id}">⏸ השהיה</button>` : ''}
          ${['draft', 'paused'].includes(s.status) ? `<button class="btn sm" data-sa="test" data-s="${s.id}" data-on="${s.test_mode ? '0' : '1'}">${s.test_mode ? 'כיבוי מצב בדיקה' : '🧪 מצב בדיקה'}</button>` : ''}
          ${['draft', 'approved', 'paused'].includes(s.status) ? `<button class="btn sm" data-sa="cancel" data-s="${s.id}">ביטול</button>` : ''}
        </div></div>`;
    }).join('') : '<div class="muted">אין סדרות. צרו סדרה בכפתור "+ סדרה חדשה" בתזמון הפוסט, והוסיפו לה פוסטים עם מועדים.</div>';
  }

  function renderQueue(upcoming) {
    const list = upcoming.filter(p => ['scheduled', 'paused', 'publishing', 'attention', 'failed'].includes(p.status)).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
    const sName = id => (K.series.find(s => s.id === id) || {}).name;
    $('#calQueue').innerHTML = list.length ? `<table><thead><tr><th>מועד</th><th>טקסט</th><th>ערוצים</th><th>סטטוס</th><th></th></tr></thead><tbody>${list.map(p => {
      const [l, tone] = ST[p.status] || [p.status, 'mute'];
      const ser = p.series_id ? sName(p.series_id) : null;
      const serSt = p.series_id ? (K.series.find(s => s.id === p.series_id) || {}).status : null;
      return `<tr><td class="muted" style="white-space:nowrap">${p.scheduled_at ? fmt(p.scheduled_at) : '—'}</td>
        <td style="max-width:320px">${esc((p.body || '').slice(0, 90))}${ser ? `<div class="muted">סדרה: ${esc(ser)}${serSt === 'draft' ? ' · <b>ממתינה לאישור</b>' : serSt === 'paused' ? ' · מושהית' : ''}</div>` : '<div class="muted">פוסט בודד</div>'}</td>
        <td>${p.targets.map(t => t === 'facebook' ? 'פייסבוק' : 'אינסטגרם').join(', ')}${(p.image_urls || []).length > 1 ? `<div class="muted">${p.image_urls.length} תמונות</div>` : ''}</td>
        <td><span class="chip ${tone}">${l}</span>${p.status === 'attention' ? `<div class="muted">${esc(p.results?.error || '')}</div>` : ''}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-pa="open" data-p="${p.id}">פתיחה</button>
          ${p.status === 'scheduled' ? `<button class="btn sm" data-pa="pause" data-p="${p.id}">השהיה</button>` : ''}
          ${p.status === 'paused' ? `<button class="btn sm" data-pa="resume" data-p="${p.id}">המשך</button>` : ''}
          ${['scheduled', 'paused', 'failed'].includes(p.status) ? `<button class="btn sm" data-pa="reschedule" data-p="${p.id}">מועד חדש</button>` : ''}
          ${p.status === 'attention' ? `<button class="btn sm" data-pa="review" data-p="${p.id}">בדקתי – לא עלה</button>` : ''}
          ${['scheduled', 'paused', 'failed', 'attention'].includes(p.status) ? `<button class="btn sm" data-pa="cancel" data-p="${p.id}">ביטול</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table>` : '<div class="muted">אין פוסטים מתוזמנים.</div>';
    K.upcoming = upcoming;
  }

  /* ---------- actions ---------- */
  $('#calPrev').onclick = () => { K.month = new Date(K.month.getFullYear(), K.month.getMonth() - 1, 1); load(); };
  $('#calNext').onclick = () => { K.month = new Date(K.month.getFullYear(), K.month.getMonth() + 1, 1); load(); };
  $('#calReload').onclick = load;
  $('#calGrid').onclick = e => { const c = e.target.closest('[data-cp]'); if (!c) return; const p = K.posts.find(x => x.id === c.dataset.cp); if (p) openPost(p); };
  $('#seriesNewBtn').onclick = async () => {
    const name = prompt('שם הסדרה (למשל: פוסטים לחודש נובמבר):'); if (!name) return;
    const test = confirm('להפעיל את הסדרה במצב בדיקה?\n\nבמצב בדיקה המערכת עוברת את כל שלבי הפרסום מול Meta בלי לפרסם בפועל.\nאישור = מצב בדיקה · ביטול = סדרה רגילה');
    try { const r = await api('series/create', { name, test_mode: test }); await load(); $('#seriesSel').value = r.series.id; document.querySelector('#when').closest('details').open = true; toast('הסדרה נוצרה – הוסיפו לה פוסטים עם מועד ולחצו "תזמון"'); }
    catch (e) { toast(e.message); }
  };
  $('#seriesList').onclick = async e => {
    const b = e.target.closest('[data-sa]'); if (!b) return;
    const s = K.series.find(x => x.id === b.dataset.s), a = b.dataset.sa;
    try {
      if (a === 'approve') {
        const posts = (await api('posts/calendar', { from: new Date(Date.now() - 864e5).toISOString(), to: new Date(Date.now() + 365 * 864e5).toISOString() })).posts.filter(p => p.series_id === s.id && p.status === 'scheduled');
        const lines = posts.map(p => `• ${fmt(p.scheduled_at)} – ${p.targets.map(t => t === 'facebook' ? 'פייסבוק' : 'אינסטגרם').join('+')} – ${(p.body || '').slice(0, 40)}`).join('\n');
        if (!confirm(`אישור סדרה "${s.name}"${s.test_mode ? ' (מצב בדיקה – לא יפורסם בפועל)' : ''}\n\n${lines}\n\n${s.test_mode ? 'המערכת תריץ בדיקה מלאה במועדים האלה.' : `${posts.length} פוסטים יפורסמו אוטומטית ובאופן ציבורי במועדים האלה, בלי לבקש אישור נוסף לכל פוסט.`}\nאפשר להשהות או לבטל בכל רגע. לאשר?`)) return;
        await api('series/control', { id: s.id, action: 'approve', confirm: 'מאשר' }); toast('הסדרה אושרה ופעילה');
      } else if (a === 'cancel') {
        if (!confirm(`לבטל את הסדרה "${s.name}"? פוסטים שלא פורסמו יבוטלו.`)) return;
        await api('series/control', { id: s.id, action: 'cancel' }); toast('הסדרה בוטלה');
      } else if (a === 'test') {
        await api('series/control', { id: s.id, action: 'test', on: b.dataset.on === '1' }); toast('עודכן');
      } else {
        await api('series/control', { id: s.id, action: a }); toast('הסדרה הושהתה');
      }
      load(); loadPosts();
    } catch (err) { toast(err.message); }
  };
  $('#calQueue').onclick = async e => {
    const b = e.target.closest('[data-pa]'); if (!b) return;
    const p = (K.upcoming || []).find(x => x.id === b.dataset.p), a = b.dataset.pa;
    if (a === 'open') return openPost(p);
    try {
      let extra = {};
      if (a === 'reschedule') {
        const v = prompt('מועד חדש (YYYY-MM-DD HH:MM):', new Date(Date.now() + 864e5).toISOString().slice(0, 16).replace('T', ' '));
        if (!v) return; const at = new Date(v.replace(' ', 'T'));
        if (isNaN(at)) return toast('מועד לא תקין');
        extra = { scheduled_at: at.toISOString() };
      }
      if (a === 'cancel' && !confirm('לבטל את הפוסט המתוזמן?')) return;
      if (a === 'review' && !confirm('בדקתם בעמוד שהפוסט לא עלה? הוא יסומן כ"נכשל" ותוכלו לפרסם אותו מחדש.')) return;
      await api('posts/control', { id: p.id, action: a, ...extra });
      toast('עודכן'); load(); loadPosts();
    } catch (err) { toast(err.message); }
  };

  const css = document.createElement('style');
  css.textContent = `.cal-head,.cal{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.cal-head div{text-align:center;font-size:12px;color:var(--muted)}
    .cal-cell{min-height:74px;border:1px solid var(--line);border-radius:8px;padding:4px;background:var(--surface);overflow:hidden}.cal-cell.empty{border:0;background:transparent}
    .cal-cell.today{border-color:var(--blue);box-shadow:0 0 0 1px var(--blue)}.cal-d{font-size:12px;font-weight:700;color:var(--muted)}
    .cal-post{display:block;margin-top:3px;cursor:pointer;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .series-row{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:8px}
    @media (max-width:600px){.cal-cell{min-height:52px}.cal-post{font-size:10px}}`;
  document.head.appendChild(css);
  window.Cal = { load };
  load();
})();
