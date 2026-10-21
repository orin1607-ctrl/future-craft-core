/* Facebook / Instagram finder for the companies selected in outreach.html (uses that page's globals:
   Hub, S, $, esc, toast, loadContacts, updateSel). Runs one company per request so the progress is visible and
   the owner can close the window and return to the results later. Nothing is saved without approval, nothing
   is sent or published. */
(function () {
  const CONF = { existing: ['קיים בכרטיס', 'q-sent'], high: ['ודאי', 'q-sent'], medium: ['סביר – לבדוק', 'q-attention'], none: ['לא נמצא', 'q-queued'] };
  const STAT = { existing: 'קיים', suggested: 'ממתין לאישור', approved: '✓ אושר ונשמר', rejected: 'נדחה', not_found: 'לא נמצא' };
  const SRC = { card: 'כרטיס החברה', openprospector: 'OpenProspector', website: 'אתר החברה', wikidata: 'Wikidata', manual: 'תיקון ידני' };
  const F = { run: null, data: null, busy: false, stop: false };

  // toolbar button next to the existing bulk actions
  const bar = $('#bulkCamp') && $('#bulkCamp').parentElement;
  if (bar) {
    const b = document.createElement('button');
    b.className = 'btn sm'; b.id = 'bulkFind'; b.disabled = true; b.textContent = '🔎 אתר פייסבוק ואינסטגרם לנבחרים';
    bar.insertBefore(b, $('#bulkCamp'));
    b.onclick = () => start([...S.sel]);
    const h = document.createElement('button');
    h.className = 'btn sm'; h.id = 'findHistory'; h.textContent = 'תוצאות איתור קודמות';
    bar.insertBefore(h, $('#bulkCamp'));
    h.onclick = history;
    const orig = window.updateSel;
    window.updateSel = function () { orig(); b.disabled = !S.sel.size; };
  }

  function dialog() {
    let d = document.getElementById('findDlg');
    if (d) return d;
    d = document.createElement('dialog'); d.id = 'findDlg'; d.style.width = 'min(1100px,96vw)';
    d.innerHTML = `<div class="dlg-h"><b>איתור פייסבוק ואינסטגרם</b><button class="btn sm" data-x>סגירה</button></div>
      <div class="dlg-b" style="max-height:78vh">
        <div class="note info">החיפוש רץ רק על החברות שבחרתם, וממקורות מותרים: הכרטיס עצמו, OpenProspector, האתר הרשמי של החברה (לפי robots.txt) ו-Wikidata.
          לא נשמר שום קישור בלי האישור שלכם, ולא נוגעים בקישורים שכבר קיימים בכרטיס. כשלא נמצא מקור ודאי – מוצג "לא נמצא", ואפשר לחפש ידנית ולהדביק קישור.</div>
        <div id="fdProg"></div>
        <div class="row" style="margin:8px 0" id="fdActions"></div>
        <div style="overflow-x:auto"><table><thead><tr><th>חברה</th><th>פייסבוק</th><th>אינסטגרם</th></tr></thead><tbody id="fdBody"></tbody></table></div>
      </div>`;
    document.body.appendChild(d);
    d.querySelector('[data-x]').onclick = () => d.close();
    d.addEventListener('close', () => { F.stop = true; loadContacts(); });
    d.querySelector('#fdBody').onclick = onCell;
    d.querySelector('#fdActions').onclick = onAction;
    return d;
  }

  async function start(ids) {
    if (!ids.length) return;
    try {
      const { run } = await Hub.hub('social-find/start', { contact_ids: ids });
      S.sel.clear(); window.updateSel(); if (window.renderContacts) renderContacts();
      open(run.id, true);
    } catch (e) { toast(e.message); }
  }

  async function open(runId, autorun) {
    dialog().showModal();
    F.stop = false;
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

  async function refresh(runId, current) {
    F.data = await Hub.hub('social-find/run', { run_id: runId });
    const { run, findings, contacts } = F.data;
    const total = run.contact_ids.length, done = run.done_ids.length;
    const sug = findings.filter(f => f.status === 'suggested');
    const high = sug.filter(f => f.confidence === 'high').length;
    $('#fdProg').innerHTML = `<div class="row" style="justify-content:space-between"><b>${run.status === 'running' ? `בודק ${done}/${total}${current ? ' · ' + esc(current) : ''}…` : run.status === 'stopped' ? `נעצר אחרי ${done}/${total}` : `הסתיים – נבדקו ${total} חברות`}</b>
        <span class="muted">${findings.filter(f => f.status === 'approved').length} אושרו · ${sug.length} ממתינים לאישור · ${findings.filter(f => f.status === 'not_found').length} לא נמצאו · ${findings.filter(f => f.status === 'existing').length} כבר היו בכרטיס</span></div>
      <div class="progress" style="height:8px;background:var(--bg);border-radius:99px;overflow:hidden;margin-top:6px"><i style="display:block;height:100%;width:${total ? done / total * 100 : 0}%;background:var(--blue)"></i></div>`;
    $('#fdActions').innerHTML = `${high ? `<button class="btn go" data-act="high">✓ אישור כל ${high} ההתאמות הוודאיות</button>` : ''}
      ${run.status === 'running' ? '<button class="btn" data-act="stop">עצירה</button>' : ''}
      ${run.status === 'stopped' && done < total ? '<button class="btn pri" data-act="resume">המשך בדיקה</button>' : ''}`;
    const order = run.contact_ids.map(id => contacts.find(c => c.id === id)).filter(Boolean);
    $('#fdBody').innerHTML = order.map(c => {
      const checked = run.done_ids.includes(c.id);
      const cell = p => {
        if (!checked) return '<span class="muted">ממתין…</span>';
        const f = findings.filter(x => x.contact_id === c.id && x.platform === p).sort((a, b) => (b.status === 'approved') - (a.status === 'approved'))[0];
        if (!f) return '—';
        const [cl, ccls] = CONF[f.confidence] || [f.confidence, ''];
        const q = encodeURIComponent(`"${c.company_name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/בע["~״]?מ/g, '').trim()}" ${c.city || ''} ${p === 'facebook' ? 'facebook' : 'instagram'}`);
        const search = `<a class="btn sm" href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener" title="חיפוש ידני בגוגל – בדפדפן שלכם">🔍 חיפוש</a>`;
        return `<div>${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener" dir="ltr" style="word-break:break-all">${esc(f.url.replace(/^https?:\/\/(www\.)?/, ''))}</a>` : '<span class="muted">—</span>'}</div>
          <div style="margin:3px 0"><span class="chip ${ccls}">${cl}</span> <span class="muted">${STAT[f.status] || f.status}${f.source && SRC[f.source] ? ' · ' + SRC[f.source] : ''}</span></div>
          <div class="muted" style="max-width:340px">${esc(f.evidence || '')}</div>
          <div class="row" style="margin-top:4px">
            ${f.status === 'suggested' ? `<button class="btn sm go" data-ok="${f.id}">אישור</button><button class="btn sm" data-no="${f.id}">דחייה</button>` : ''}
            ${['suggested', 'not_found', 'rejected'].includes(f.status) ? `<button class="btn sm" data-fix="${f.id}">${f.url ? 'תיקון קישור' : 'הדבקת קישור'}</button>${search}` : ''}
          </div>`;
      };
      return `<tr><td><b>${esc(c.company_name)}</b><div class="muted">${esc(c.city || '')}${c.website ? ` · <a href="${esc(/^https?:/.test(c.website) ? c.website : 'https://' + c.website)}" target="_blank" rel="noopener">${esc(c.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>` : ''}</div></td>
        <td style="min-width:260px">${cell('facebook')}</td><td style="min-width:260px">${cell('instagram')}</td></tr>`;
    }).join('');
  }

  async function onCell(e) {
    const b = e.target.closest('button'); if (!b) return;
    const runId = F.data.run.id;
    try {
      if (b.dataset.ok) { await Hub.hub('social-find/decide', { id: b.dataset.ok, action: 'approve' }); toast('אושר ונשמר בכרטיס החברה'); }
      if (b.dataset.no) { await Hub.hub('social-find/decide', { id: b.dataset.no, action: 'reject' }); toast('נדחה – לא יוצע שוב'); }
      if (b.dataset.fix) {
        const f = F.data.findings.find(x => x.id === b.dataset.fix);
        const url = prompt(`הדביקו את הקישור הנכון ל${f.platform === 'facebook' ? 'עמוד הפייסבוק' : 'חשבון האינסטגרם'} של החברה:`, f.url || '');
        if (!url) return;
        await Hub.hub('social-find/decide', { id: f.id, action: 'approve', url }); toast('הקישור אושר ונשמר בכרטיס');
      }
      await refresh(runId);
    } catch (err) { toast(err.message); }
  }
  async function onAction(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const runId = F.data.run.id;
    try {
      if (b.dataset.act === 'high') {
        if (!confirm('לאשר ולשמור בכרטיסים את כל הקישורים שסומנו "ודאי"? (קישורים קיימים לא ישתנו)')) return;
        const r = await Hub.hub('social-find/approve-high', { run_id: runId });
        toast(`אושרו ${r.approved}` + (r.errors.length ? ` · ${r.errors.length} לא נשמרו` : ''));
        if (r.errors.length) alert(r.errors.join('\n'));
      }
      if (b.dataset.act === 'stop') { F.stop = true; await Hub.hub('social-find/stop', { run_id: runId }); }
      if (b.dataset.act === 'resume') {
        // a stopped run continues as a new run over the companies that were not checked yet
        const left = F.data.run.contact_ids.filter(id => !F.data.run.done_ids.includes(id));
        const { run } = await Hub.hub('social-find/start', { contact_ids: left });
        return open(run.id, true);
      }
      await refresh(runId);
    } catch (err) { toast(err.message); }
  }

  async function history() {
    try {
      const { runs } = await Hub.hub('social-find/runs');
      const d = dialog(); d.showModal();
      $('#fdProg').innerHTML = '<b>איתורים קודמים</b>';
      $('#fdActions').innerHTML = '';
      $('#fdBody').innerHTML = runs.length ? runs.map(r => `<tr><td colspan="3"><div class="row" style="justify-content:space-between">
          <span>${new Date(r.created_at).toLocaleString('he-IL')} · ${r.total} חברות · ${r.status === 'done' ? 'הסתיים' : r.status === 'stopped' ? `נעצר (${r.done}/${r.total})` : `בתהליך (${r.done}/${r.total})`}</span>
          <button class="btn sm pri" data-open="${r.id}">פתיחת התוצאות</button></div></td></tr>`).join('') : '<tr><td colspan="3" class="muted">אין איתורים קודמים</td></tr>';
      $('#fdBody').onclick = e => { const b = e.target.closest('[data-open]'); if (b) { $('#fdBody').onclick = onCell; open(b.dataset.open, false); } };
    } catch (e) { toast(e.message); }
  }

  window.SocialFinder = { start, open, history };
})();
