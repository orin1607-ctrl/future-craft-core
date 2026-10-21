/* Smart contact finder for the companies selected in outreach.html (uses that page's globals: Hub, S, $, esc,
   toast, loadContacts, openContact). One company per request: live progress, stop / continue, earlier runs can
   be reopened, a rerun can cover only what was not found. Nothing is saved without approval, nothing is sent. */
(function () {
  const CONF = { existing: ['קיים', 'q-sent'], high: ['גבוהה', 'q-sent'], medium: ['בינונית', 'q-attention'], low: ['נמוכה', 'q-queued'], none: ['לא אותר', 'q-queued'] };
  const SRC = { card: 'כרטיס', openprospector: 'OpenProspector', website: 'אתר החברה', wikidata: 'Wikidata', search: 'חיפוש Brave', manual: 'תיקון ידני', email_domain: 'דומיין האימייל', domain_check: 'אימות אתר' };
  const COLS = [['facebook', 'פייסבוק'], ['instagram', 'אינסטגרם'], ['email', 'אימייל'], ['phone', 'טלפון'], ['linkedin', 'לינקדאין'], ['more', 'אתר · טופס · וואטסאפ']];
  const MORE = [['website', 'אתר'], ['contact_form', 'טופס'], ['whatsapp', 'וואטסאפ']];
  const F = { data: null, busy: false, stop: false, open: new Set(), search: null };

  const bar = $('#bulkCamp') && $('#bulkCamp').parentElement;
  if (bar) {
    const b = document.createElement('button');
    b.className = 'btn sm pri'; b.id = 'bulkFind'; b.disabled = true; b.textContent = '🔎 איתור חכם של דרכי התקשרות לנבחרים';
    bar.insertBefore(b, $('#bulkCamp'));
    b.onclick = () => start([...S.sel], 'full');
    const h = document.createElement('button');
    h.className = 'btn sm'; h.id = 'findHistory'; h.textContent = 'היסטוריית איתורים';
    bar.insertBefore(h, $('#bulkCamp'));
    h.onclick = history;
    const orig = window.updateSel;
    window.updateSel = function () { orig(); b.disabled = !S.sel.size; };
  }

  function dialog() {
    let d = document.getElementById('findDlg');
    if (d) return d;
    d = document.createElement('dialog'); d.id = 'findDlg'; d.style.width = 'min(1280px,98vw)';
    d.innerHTML = `<div class="dlg-h"><b>איתור חכם של דרכי התקשרות</b><button class="btn sm" data-x>סגירה</button></div>
      <div class="dlg-b" style="max-height:80vh">
        <div class="note info" id="fdInfo"></div>
        <div id="fdProg"></div>
        <div class="row" style="margin:8px 0" id="fdActions"></div>
        <div style="overflow-x:auto"><table><thead><tr><th>חברה</th>${COLS.map(([, l]) => `<th>${l}</th>`).join('')}<th>ביטחון</th><th>סטטוס</th><th></th></tr></thead><tbody id="fdBody"></tbody></table></div>
      </div>`;
    document.body.appendChild(d);
    d.querySelector('[data-x]').onclick = () => d.close();
    d.addEventListener('close', () => { F.stop = true; loadContacts(); });
    d.querySelector('#fdBody').onclick = onCell;
    d.querySelector('#fdActions').onclick = onAction;
    return d;
  }

  async function searchInfo() {
    try { F.search = await Hub.hub('social-find/search-status'); } catch (e) { F.search = null; }
    const s = F.search;
    $('#fdInfo').innerHTML = `<b>איך המנוע עובד:</b> רק על החברות שבחרתם. בודק את הכרטיס ואת OpenProspector, מאמת את אתר החברה, סורק את דף הבית ועמודי צור קשר / אודות / צוות (לפי robots.txt),
      בודק Wikidata${s && s.configured ? `, ומבצע חיפוש אינטרנט מורשה (Brave Search) – ${s.used_today}/${s.daily_limit} חיפושים היום` : ''}. כל ממצא מגיע עם מקור והסבר. שום דבר לא נשמר בלי אישור, ושום הודעה לא נשלחת.
      ${s && !s.configured ? `<div style="margin-top:6px"><b>⚠️ חיפוש אינטרנט כבוי:</b> כדי שהמנוע יחפש גם בגוגל-סטייל (פייסבוק / אינסטגרם / לינקדאין שאינם מקושרים מהאתר) צריך מפתח Brave Search API. זה חשבון שאתם פותחים (כולל כרטיס אשראי, כ-1,000 חיפושים בחודש בקרדיט החינמי). אחרי שהמפתח נשמר בשרת – המנוע מפעיל את החיפוש אוטומטית, עם מכסה יומית.</div>` : ''}
      <div class="muted" style="margin-top:6px">איתור כתובת אימייל אינו הרשאה לשלוח אליה פרסומת: לפי חוק התקשורת (סעיף 30א) דיוור פרסומי דורש הסכמה מראש. ההסכמה נשמרת בנפרד בכרטיס.</div>`;
  }

  async function start(ids, mode) {
    if (!ids.length) return;
    try {
      const { run } = await Hub.hub('social-find/start', { contact_ids: ids, mode });
      S.sel.clear(); window.updateSel(); if (window.renderContacts) renderContacts();
      open(run.id, true);
    } catch (e) { toast(e.message); }
  }

  async function open(runId, autorun) {
    dialog().showModal();
    F.stop = false; F.open.clear();
    searchInfo();
    await refresh(runId);
    if (autorun || F.data.run.status === 'running') loop(runId);
  }

  async function loop(runId) {
    if (F.busy) return;
    F.busy = true;
    try {
      while (!F.stop) {
        const r = await Hub.hub('social-find/next', { run_id: runId });
        await refresh(runId, r.contact && r.contact.company_name);
        if (r.done) break;
      }
    } catch (e) { toast(e.message); }
    F.busy = false;
    await refresh(runId);
  }

  const best = arr => arr.sort((a, b) => ['existing', 'high', 'medium', 'low', 'none'].indexOf(a.confidence) - ['existing', 'high', 'medium', 'low', 'none'].indexOf(b.confidence));
  function cellHtml(c, list, p, label) {
    if (!list.length) return '<span class="muted">—</span>';
    const live = list.filter(f => f.status !== 'not_found');
    if (!live.length) {
      const f = list[0];
      return `<div><span class="chip q-queued">לא אותר</span></div><div class="row" style="margin-top:3px"><button class="btn sm" data-fix="${f.id}">הוספה ידנית</button></div>`;
    }
    return best(live).slice(0, 3).map(f => {
      const [cl, ccls] = CONF[f.confidence] || [f.confidence, ''];
      const isUrl = /^https?:/.test(f.url || '');
      const shown = isUrl ? f.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : f.url;
      const kind = f.detail && f.detail.kind === 'role' ? ` · ${esc(f.detail.role || 'בעל תפקיד')}` : f.detail && f.detail.kind === 'personal' ? ' · אישי' : '';
      return `<div style="margin-bottom:6px;${f.status === 'rejected' ? 'opacity:.5;text-decoration:line-through' : ''}">
        <div>${label ? `<b>${label}:</b> ` : ''}${isUrl ? `<a href="${esc(f.url)}" target="_blank" rel="noopener" dir="ltr" style="word-break:break-all">${esc(shown)}</a>` : `<span dir="ltr">${esc(shown)}</span>`}</div>
        <div><span class="chip ${ccls}">${cl}</span> <span class="muted">${f.status === 'approved' ? '✓ נשמר' : f.status === 'existing' ? 'בכרטיס' : f.status === 'rejected' ? 'נדחה' : ''}${f.source && SRC[f.source] ? ' · ' + SRC[f.source] : ''}${kind}</span></div>
        <div class="muted" style="max-width:260px">${esc(f.evidence || '')}</div>
        ${f.status === 'suggested' ? `<div class="row" style="margin-top:2px"><button class="btn sm go" data-ok="${f.id}">אישור</button><button class="btn sm" data-no="${f.id}">דחייה</button><button class="btn sm" data-fix="${f.id}">תיקון</button></div>` : ''}
      </div>`;
    }).join('');
  }

  async function refresh(runId, current) {
    F.data = await Hub.hub('social-find/run', { run_id: runId });
    const { run, findings, contacts, checks } = F.data;
    const total = run.contact_ids.length, done = run.done_ids.length;
    const sug = findings.filter(f => f.status === 'suggested');
    const high = sug.filter(f => f.confidence === 'high').length;
    const missingIds = run.done_ids.filter(id => findings.some(f => f.contact_id === id && f.status === 'not_found' && ['facebook', 'instagram', 'email', 'linkedin'].includes(f.platform)));
    $('#fdProg').innerHTML = `<div class="row" style="justify-content:space-between"><b>${run.status === 'running' ? `חוקר ${done}/${total}${current ? ' · ' + esc(current) : ''}…` : run.status === 'stopped' ? `נעצר אחרי ${done}/${total}` : `הסתיים – נחקרו ${total} חברות`}${run.mode === 'missing' ? ' (רק מה שחסר)' : ''}</b>
        <span class="muted">${findings.filter(f => f.status === 'approved').length} אושרו · ${sug.length} ממתינים לאישור (${high} בביטחון גבוה)</span></div>
      <div style="height:8px;background:var(--bg);border-radius:99px;overflow:hidden;margin-top:6px"><i style="display:block;height:100%;width:${total ? done / total * 100 : 0}%;background:var(--blue)"></i></div>`;
    $('#fdActions').innerHTML = `${high ? `<button class="btn go" data-act="high">✓ אישור כל ${high} הממצאים בביטחון גבוה</button>` : ''}
      ${run.status === 'running' ? '<button class="btn" data-act="stop">עצירה</button>' : ''}
      ${run.status === 'stopped' && done < total ? '<button class="btn pri" data-act="resume">המשך</button>' : ''}
      ${run.status !== 'running' && missingIds.length ? `<button class="btn" data-act="missing">🔁 חיפוש חוזר רק במה שלא אותר (${missingIds.length} חברות)</button>` : ''}`;
    const order = run.contact_ids.map(id => contacts.find(c => c.id === id)).filter(Boolean);
    $('#fdBody').innerHTML = order.map(c => {
      const checked = run.done_ids.includes(c.id);
      if (!checked) return `<tr><td><b>${esc(c.company_name)}</b></td><td colspan="${COLS.length + 3}" class="muted">ממתין…</td></tr>`;
      const mine = findings.filter(f => f.contact_id === c.id);
      const by = p => mine.filter(f => f.platform === p);
      const fresh = mine.filter(f => !['existing', 'not_found'].includes(f.status));
      const top = fresh.length ? best(fresh)[0].confidence : 'none';
      const pend = mine.filter(f => f.status === 'suggested').length, appr = mine.filter(f => f.status === 'approved').length;
      const status = pend ? `${pend} ממתינים` : appr ? `✓ ${appr} אושרו` : fresh.length ? 'טופל' : 'לא אותרו ממצאים חדשים';
      const ck = (checks.find(k => k.contact_id === c.id) || {}).steps || [];
      return `<tr>
        <td><b>${esc(c.company_name)}</b><div class="muted">${esc(c.city || '')}</div></td>
        ${COLS.map(([p]) => `<td style="min-width:170px">${p === 'more' ? MORE.map(([q, l]) => cellHtml(c, by(q), q, l)).join('') : cellHtml(c, by(p), p)}</td>`).join('')}
        <td><span class="chip ${(CONF[top] || CONF.none)[1]}">${top === 'none' ? '—' : (CONF[top] || [''])[0]}</span></td>
        <td class="muted">${status}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-card="${c.id}">פתיחת כרטיס</button>
          ${ck.length ? `<details style="margin-top:4px"><summary class="muted" style="cursor:pointer">מקורות שנבדקו</summary>${ck.map(s => `<div class="muted">${s.ok ? '✓' : '·'} <b>${esc(s.step)}</b>: ${esc(s.note)}</div>`).join('')}</details>` : ''}</td></tr>`;
    }).join('');
  }

  async function onCell(e) {
    const b = e.target.closest('button'); if (!b) return;
    const runId = F.data.run.id;
    try {
      if (b.dataset.card) { const c = S.contacts.find(x => x.id === b.dataset.card) || (await Hub.hub('contacts/list', {})).contacts.find(x => x.id === b.dataset.card); if (c) openContact(c); return; }
      if (b.dataset.ok) { await Hub.hub('social-find/decide', { id: b.dataset.ok, action: 'approve' }); toast('אושר ונשמר בכרטיס'); }
      if (b.dataset.no) { await Hub.hub('social-find/decide', { id: b.dataset.no, action: 'reject' }); toast('נדחה – לא יוצע שוב'); }
      if (b.dataset.fix) {
        const f = F.data.findings.find(x => x.id === b.dataset.fix);
        const he = { facebook: 'קישור לעמוד הפייסבוק', instagram: 'קישור לאינסטגרם', linkedin: 'קישור ללינקדאין', email: 'כתובת אימייל', phone: 'מספר טלפון', website: 'כתובת האתר', contact_form: 'קישור לטופס יצירת קשר', whatsapp: 'מספר וואטסאפ' }[f.platform];
        const v = prompt(`הזינו ${he} של החברה:`, f.url || '');
        if (!v) return;
        await Hub.hub('social-find/decide', { id: f.id, action: 'approve', url: v }); toast('נשמר בכרטיס');
      }
      await refresh(runId);
    } catch (err) { toast(err.message); }
  }
  async function onAction(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const runId = F.data.run.id;
    try {
      if (b.dataset.act === 'high') {
        if (!confirm('לאשר ולשמור בכרטיסים את כל הממצאים בביטחון גבוה? נתונים קיימים לא ישתנו; פרטים נוספים יישמרו כפרטי קשר נוספים.')) return;
        const r = await Hub.hub('social-find/approve-high', { run_id: runId });
        toast(`אושרו ${r.approved}` + (r.errors.length ? ` · ${r.errors.length} לא נשמרו` : ''));
        if (r.errors.length) alert(r.errors.join('\n'));
      }
      if (b.dataset.act === 'stop') { F.stop = true; await Hub.hub('social-find/stop', { run_id: runId }); }
      if (b.dataset.act === 'resume') {
        const left = F.data.run.contact_ids.filter(id => !F.data.run.done_ids.includes(id));
        const { run } = await Hub.hub('social-find/start', { contact_ids: left, mode: F.data.run.mode });
        return open(run.id, true);
      }
      if (b.dataset.act === 'missing') {
        const ids = F.data.run.done_ids.filter(id => F.data.findings.some(f => f.contact_id === id && f.status === 'not_found'));
        const { run } = await Hub.hub('social-find/start', { contact_ids: ids, mode: 'missing' });
        return open(run.id, true);
      }
      await refresh(runId);
    } catch (err) { toast(err.message); }
  }

  async function history() {
    try {
      const { runs } = await Hub.hub('social-find/runs');
      const d = dialog(); d.showModal(); searchInfo();
      $('#fdProg').innerHTML = '<b>היסטוריית איתורים</b>';
      $('#fdActions').innerHTML = '';
      $('#fdBody').innerHTML = runs.length ? runs.map(r => `<tr><td colspan="${COLS.length + 4}"><div class="row" style="justify-content:space-between">
          <span>${new Date(r.created_at).toLocaleString('he-IL')} · ${r.total} חברות${r.mode === 'missing' ? ' · רק מה שחסר' : ''} · ${r.engine === 'v1' ? 'מנוע ישן' : 'מנוע חכם'} · ${r.status === 'done' ? 'הסתיים' : r.status === 'stopped' ? `נעצר (${r.done}/${r.total})` : `בתהליך (${r.done}/${r.total})`}</span>
          <button class="btn sm pri" data-open="${r.id}">פתיחת התוצאות</button></div></td></tr>`).join('') : `<tr><td colspan="${COLS.length + 4}" class="muted">אין איתורים קודמים</td></tr>`;
      $('#fdBody').onclick = e => { const b = e.target.closest('[data-open]'); if (b) { $('#fdBody').onclick = onCell; open(b.dataset.open, false); } };
    } catch (e) { toast(e.message); }
  }

  window.SocialFinder = { start, open, history };
})();
