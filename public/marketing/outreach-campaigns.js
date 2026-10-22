/* Campaigns + channel registry for outreach.html (uses that page's globals: Hub, S, CH, $, $$, esc, toast,
   VARS, STATUS, openQueueBuilder, pickImage, loadQueue, loadContacts). One message → many companies, in the
   owner's order, released by the server at the chosen cadence / days / hours. Sending is manual unless a
   channel has an approved automatic connector (none yet). */
(function () {
  const QST = { queued: 'ממתין', ready: 'מוכן לשליחה', sent: 'נשלח', failed: 'נכשל', replied: 'נענה', attention: 'דורש טיפול', skipped: 'דולג', cancelled: 'בוטל' };
  const CST = { draft: ['טיוטה', 'q-queued'], running: ['פעיל', 'q-sent'], paused: ['מושהה', 'q-attention'], cancelled: ['בוטל', 'q-cancelled'], completed: ['הסתיים', 'q-replied'] };
  const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
  const CADENCES = [[15, 'כל 15 דקות'], [30, 'כל 30 דקות'], [60, 'כל שעה'], [120, 'כל שעתיים'], [240, 'כל 4 שעות'], [1440, 'פעם ביום']];
  const C = { list: [], cur: null, channels: null };
  const fmt = d => d ? new Date(d).toLocaleString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  async function load() {
    try {
      C.list = (await Hub.hub('campaigns/list')).campaigns;
      $('#cCamps').textContent = C.list.filter(c => ['running', 'paused', 'draft'].includes(c.status)).length;
      renderList();
      if (C.cur) open(C.cur.campaign.id, true);
    } catch (e) { toast(e.message); }
  }
  function renderList() {
    $('#campList').innerHTML = C.list.length ? C.list.map(c => {
      const [l, cls] = CST[c.status] || [c.status, ''];
      const left = (c.counts.queued || 0) + (c.counts.ready || 0);
      return `<div class="camp-card ${C.cur && C.cur.campaign.id === c.id ? 'on' : ''}" data-camp="${c.id}">
        <div class="row" style="justify-content:space-between"><b>${esc(c.name)}</b><span class="chip ${cls}">${l}</span></div>
        <div class="muted">${CH[c.channel].he} · ${c.total} חברות · נותרו ${left} · נשלחו ${(c.counts.sent || 0) + (c.counts.replied || 0)}</div>
        ${c.status === 'running' ? `<div class="muted">הבא: ${fmt(c.next_at)}</div>` : ''}</div>`;
    }).join('') : '<div class="muted">אין קמפיינים עדיין.</div>';
  }
  $('#campList').onclick = e => { const c = e.target.closest('[data-camp]'); if (c) open(c.dataset.camp); };

  /* ---------- create ---------- */
  $('#bulkCamp').onclick = () => createDialog([...S.sel]);
  $('#campNew').onclick = () => {
    if (S.sel.size) return createDialog([...S.sel]);
    toast('בחרו חברות בלשונית "לקוחות" (או ייבאו מדליה איתור לידים) ואז "קמפיין מהנבחרים"');
    document.querySelector('[data-tab=contacts]').click();
  };
  function ensureDialog() {
    let d = document.getElementById('campDlg');
    if (d) return d;
    d = document.createElement('dialog'); d.id = 'campDlg';
    d.innerHTML = `<div class="dlg-h"><b>קמפיין חדש</b><button class="btn sm" data-close>סגירה</button></div>
      <div class="dlg-b">
        <div class="form">
          <label class="full">שם הקמפיין<input type="text" id="cmName" placeholder="למשל: פנייה לחברות הובלה – אוקטובר"></label>
          <label>ערוץ<select id="cmChannel"></select></label>
          <label>קצב<select id="cmCad">${CADENCES.map(([v, l]) => `<option value="${v}" ${v === 30 ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="full" id="cmSubjWrap" hidden>נושא (אימייל)<input type="text" id="cmSubject"></label>
          <label class="full">ההודעה הכללית<textarea id="cmBody" rows="6">שלום {{איש_קשר}},\nראינו את {{שם_העסק}} ורצינו להציע…\n\n{{העסק_שלנו}}</textarea></label>
        </div>
        <div class="vars row" style="margin-top:4px">${VARS.map(x => `<button type="button" data-var="${x}">{{${x}}}</button>`).join('')}</div>
        <div class="muted" style="margin-top:8px">ימי פעילות</div>
        <div class="days" id="cmDays">${DAYS.map((d, i) => `<label><input type="checkbox" value="${i}" ${i <= 4 ? 'checked' : ''}>${d}</label>`).join('')}</div>
        <div class="row" style="margin-top:8px"><label class="muted">משעה <input type="time" id="cmFrom" value="09:00"></label><label class="muted">עד <input type="time" id="cmTo" value="17:00"></label></div>
        <div class="policy" id="cmPolicy" style="margin-top:10px"></div>
        <div class="muted" id="cmCount" style="margin-top:8px"></div>
      </div>
      <div class="dlg-f"><button class="btn" data-close>ביטול</button><button class="btn pri" id="cmCreate">יצירת קמפיין (טיוטה)</button></div>`;
    document.body.appendChild(d);
    d.querySelectorAll('[data-close]').forEach(b => b.onclick = () => d.close());
    d.querySelector('.vars').onclick = e => { const b = e.target.closest('[data-var]'); if (!b) return; const ta = $('#cmBody'); const p = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, p) + `{{${b.dataset.var}}}` + ta.value.slice(p); ta.focus(); };
    return d;
  }
  async function createDialog(ids) {
    const d = ensureDialog();
    if (!C.channels) await loadChannels(true);
    const cs = ids.map(id => S.contacts.find(c => c.id === id)).filter(Boolean);
    const count = k => cs.filter(c => has(c, k) && !c.do_not_contact).length;
    const best = Object.keys(CH).sort((a, b) => count(b) - count(a))[0];
    $('#cmChannel').innerHTML = Object.keys(CH).map(k => `<option value="${k}" ${k === best ? 'selected' : ''}>${CH[k].he} (${count(k)} עם פרטי קשר)</option>`).join('');
    const sync = () => {
      const k = $('#cmChannel').value, info = C.channels.find(x => x.id === k) || {};
      $('#cmSubjWrap').hidden = k !== 'email';
      $('#cmPolicy').className = 'policy' + (info.phase === 'future' ? ' future' : '');
      $('#cmPolicy').innerHTML = `<b>${info.he}:</b> ${esc(info.autoRule || '')}<br><b>במערכת:</b> ${info.connector && info.auto_allowed ? 'שליחה אוטומטית פעילה' : 'הפנייה תוכן ותופיע בתור לשליחה ידנית בלחיצה – ' + esc(info.manualHow || '')}`;
      $('#cmCount').textContent = `${count(k)} מתוך ${cs.length} חברות שנבחרו מתאימות לערוץ (השאר ידולגו עם הסבר).`;
    };
    $('#cmChannel').onchange = sync; sync();
    $('#cmName').value = '';
    $('#cmCreate').onclick = async () => {
      const name = $('#cmName').value.trim(); if (!name) return toast('תנו שם לקמפיין');
      try {
        const r = await Hub.hub('campaigns/create', {
          name, channel: $('#cmChannel').value, body: $('#cmBody').value, subject: $('#cmSubject').value || null,
          cadence_minutes: +$('#cmCad').value, active_from: $('#cmFrom').value, active_to: $('#cmTo').value,
          active_days: [...$$('#cmDays input:checked')].map(i => +i.value), contact_ids: ids,
        });
        d.close(); S.sel.clear(); renderContacts();
        toast(`הקמפיין נוצר עם ${r.added} חברות` + (r.skipped.length ? ` · ${r.skipped.length} דולגו` : ''));
        if (r.skipped.length) alert('דולגו:\n' + r.skipped.map(x => `${x.name} – ${x.why}`).join('\n'));
        document.querySelector('[data-tab=campaigns]').click();
        await load(); open(r.campaign.id);
      } catch (e) { toast(e.message); }
    };
    d.showModal();
  }

  /* ---------- detail ---------- */
  async function open(id, silent) {
    try {
      C.cur = await Hub.hub('campaigns/get', { id });
      renderList(); renderDetail();
    } catch (e) { if (!silent) toast(e.message); }
  }
  function renderDetail() {
    const { campaign: c, items, channel } = C.cur;
    const [l, cls] = CST[c.status] || [c.status, ''];
    const editable = ['draft', 'paused'].includes(c.status);
    const counts = {}; items.forEach(i => counts[i.status] = (counts[i.status] || 0) + 1);
    const nextItem = items.find(i => i.status === 'ready') || items.find(i => i.status === 'queued');
    $('#campDetail').innerHTML = `
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <div><h2 style="margin:0">${esc(c.name)} <span class="chip ${cls}">${l}</span></h2>
            <div class="muted">${CH[c.channel].he} · ${(CADENCES.find(x => x[0] === c.cadence_minutes) || [0, 'כל ' + c.cadence_minutes + ' דקות'])[1]} · ימים ${c.active_days.map(d => DAYS[d]).join(',')} · ${c.active_from.slice(0, 5)}–${c.active_to.slice(0, 5)}</div></div>
          <div class="row">
            ${c.status === 'draft' ? `<button class="btn go" data-cc="start">▶ התחלה</button>` : ''}
            ${c.status === 'running' ? `<button class="btn" data-cc="pause">⏸ השהיה</button>` : ''}
            ${c.status === 'paused' ? `<button class="btn go" data-cc="resume">▶ המשך</button>` : ''}
            ${['draft', 'running', 'paused'].includes(c.status) ? `<button class="btn bad" data-cc="cancel">ביטול</button>` : ''}
          </div>
        </div>
        <div class="kpis" style="margin-top:10px">
          ${[['בתור', (counts.queued || 0)], ['מוכנים לשליחה', counts.ready || 0], ['נשלחו', (counts.sent || 0) + (counts.replied || 0)], ['נענו', counts.replied || 0], ['דורשים טיפול', (counts.attention || 0) + (counts.failed || 0)]]
            .map(([k, v]) => `<div class="kpi"><span class="muted">${k}</span><b>${v}</b></div>`).join('')}
        </div>
        ${c.status === 'running' ? `<div class="note info">הבא בתור: <b>${nextItem ? esc(nextItem.contact.company_name) : '—'}</b> · ${nextItem && nextItem.status === 'ready' ? 'מוכן עכשיו – בלשונית "תור עבודה"' : 'ישוחרר ב-' + fmt(c.next_at)}</div>` : ''}
        <div class="policy ${channel.phase === 'future' ? 'future' : ''}"><b>${esc(channel.he)}:</b> ${esc(channel.autoRule)}<br><b>במערכת:</b> ${channel.connector && channel.row && channel.row.auto_allowed ? 'שליחה אוטומטית' : 'שליחה ידנית מהתור – ' + esc(channel.manualHow)}</div>
      </div>

      <div class="card">
        <h2>ההודעה הכללית והגדרות ${editable ? '' : '<span class="muted" style="font-weight:400">(לעריכה – השהו את הקמפיין)</span>'}</h2>
        <div class="form">
          ${c.channel === 'email' ? `<label class="full">נושא<input type="text" id="cdSubject" value="${esc(c.subject || '')}" ${editable ? '' : 'disabled'}></label>` : ''}
          <label class="full">הודעה<textarea id="cdBody" rows="5" ${editable ? '' : 'disabled'}>${esc(c.body)}</textarea></label>
          <label>קצב<select id="cdCad" ${editable ? '' : 'disabled'}>${CADENCES.map(([v, t]) => `<option value="${v}" ${v === c.cadence_minutes ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label>מקסימום ממתינים לשליחה ידנית<input type="number" id="cdMax" min="1" max="50" value="${c.max_ready}" ${editable ? '' : 'disabled'}></label>
        </div>
        <div class="days" id="cdDays" style="margin-top:8px">${DAYS.map((d, i) => `<label><input type="checkbox" value="${i}" ${c.active_days.includes(i) ? 'checked' : ''} ${editable ? '' : 'disabled'}>${d}</label>`).join('')}</div>
        <div class="row" style="margin-top:8px"><label class="muted">משעה <input type="time" id="cdFrom" value="${c.active_from.slice(0, 5)}" ${editable ? '' : 'disabled'}></label><label class="muted">עד <input type="time" id="cdTo" value="${c.active_to.slice(0, 5)}" ${editable ? '' : 'disabled'}></label>
          <button class="btn sm" id="cdImg" ${editable ? '' : 'disabled'}>🖼️ ${c.media_asset_id ? 'החלפת תמונה' : 'צירוף תמונה'}</button>
          ${editable ? '<button class="btn pri" id="cdSave">שמירה</button>' : ''}</div>
        <div class="muted" style="margin-top:6px">שינוי ההודעה הכללית מעדכן את כל הפניות שעדיין לא נשלחו, חוץ מפניות שערכתם ידנית.</div>
      </div>

      <div class="card">
        <div class="row" style="justify-content:space-between"><h2 style="margin:0">סדר הפניות</h2><span class="muted">גררו שורה או השתמשו בחצים כדי לשנות סדר</span></div>
        <div style="overflow-x:auto"><table id="cdItems"><thead><tr><th></th><th>#</th><th>חברה</th><th>סטטוס</th><th>הודעה</th><th></th></tr></thead><tbody>
        ${items.map((it, i) => {
          const movable = ['queued'].includes(it.status);
          return `<tr data-it="${it.id}" draggable="${movable}">
            <td>${movable ? '<span class="handle" title="גרירה">⠿</span>' : ''}</td><td>${i + 1}</td>
            <td><b>${esc(it.contact.company_name)}</b>${it.contact.contact_name ? `<div class="muted">${esc(it.contact.contact_name)}</div>` : ''}</td>
            <td><span class="chip q-${it.status}">${QST[it.status] || it.status}</span>${it.error ? `<div class="muted">${esc(it.error)}</div>` : ''}</td>
            <td style="max-width:340px"><div class="muted" style="white-space:pre-wrap">${esc(it.body.slice(0, 120))}${it.body.length > 120 ? '…' : ''}</div>${it.custom_body ? '<span class="chip">✏️ מותאם אישית</span>' : ''}</td>
            <td style="white-space:nowrap">
              ${movable ? `<button class="btn sm" data-up="${it.id}" title="למעלה">▲</button><button class="btn sm" data-down="${it.id}" title="למטה">▼</button>` : ''}
              <button class="btn sm" data-pv="${it.id}">תצוגה</button>
              ${['queued', 'ready', 'attention', 'failed'].includes(it.status) ? `<button class="btn sm" data-ed="${it.id}">עריכה</button>` : ''}
              ${it.custom_body && ['queued', 'ready'].includes(it.status) ? `<button class="btn sm" data-rs="${it.id}">חזרה לכללית</button>` : ''}
              ${['attention', 'failed'].includes(it.status) ? `<button class="btn sm" data-rq="${it.id}">חזרה לתור</button>` : ''}
              ${it.status === 'sent' ? `<button class="btn sm" data-rp="${it.id}">נענה</button>` : ''}
              ${['queued', 'ready'].includes(it.status) ? `<button class="btn sm" data-sk="${it.id}">הוצאה</button>` : ''}
            </td></tr>`;
        }).join('') || '<tr><td colspan="6" class="muted">אין חברות בקמפיין</td></tr>'}
        </tbody></table></div>
        ${['draft', 'running', 'paused'].includes(c.status) ? '<button class="btn sm" id="cdAdd" style="margin-top:8px">+ הוספת חברות נבחרות מלשונית "לקוחות"</button>' : ''}
      </div>`;
    bindDetail();
  }

  function bindDetail() {
    const c = C.cur.campaign;
    $('#campDetail').querySelectorAll('[data-cc]').forEach(b => b.onclick = async () => {
      const a = b.dataset.cc;
      if (a === 'cancel' && !confirm('לבטל את הקמפיין? פניות שלא נשלחו יבוטלו.')) return;
      if (a === 'start' && !confirm(`להפעיל את "${c.name}"? המערכת תשחרר חברה אחת בכל ${c.cadence_minutes} דקות בימים ובשעות שנקבעו. כל חברה שמשוחררת מופיעה בתור העבודה לשליחה ידנית (לא נשלח דבר אוטומטית).`)) return;
      try { C.cur = await Hub.hub('campaigns/control', { id: c.id, action: a }); toast({ start: 'הקמפיין הופעל', pause: 'הקמפיין הושהה', resume: 'הקמפיין ממשיך', cancel: 'הקמפיין בוטל' }[a]); renderDetail(); load(); loadQueue(); }
      catch (e) { toast(e.message); }
    });
    const save = $('#cdSave');
    if (save) save.onclick = async () => {
      try {
        C.cur = await Hub.hub('campaigns/update', {
          id: c.id, body: $('#cdBody').value, subject: $('#cdSubject') ? $('#cdSubject').value : undefined,
          cadence_minutes: +$('#cdCad').value, max_ready: +$('#cdMax').value, active_from: $('#cdFrom').value, active_to: $('#cdTo').value,
          active_days: [...$$('#cdDays input:checked')].map(i => +i.value),
        });
        toast('נשמר'); renderDetail(); load();
      } catch (e) { toast(e.message); }
    };
    const img = $('#cdImg');
    if (img) img.onclick = () => pickImage(async a => { try { C.cur = await Hub.hub('campaigns/update', { id: c.id, media_asset_id: a.id }); renderDetail(); toast('התמונה צורפה'); } catch (e) { toast(e.message); } });
    const add = $('#cdAdd');
    if (add) add.onclick = async () => {
      if (!S.sel.size) { toast('בחרו חברות בלשונית "לקוחות" ואז חזרו לכאן'); return; }
      try { const r = await Hub.hub('campaigns/add', { id: c.id, contact_ids: [...S.sel] }); S.sel.clear(); toast(`נוספו ${r.added}` + (r.skipped.length ? ` · ${r.skipped.length} דולגו` : '')); open(c.id); }
      catch (e) { toast(e.message); }
    };
    const tb = $('#cdItems');
    tb.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      const ids = C.cur.items.map(i => i.id);
      try {
        if (b.dataset.up || b.dataset.down) {
          const id = b.dataset.up || b.dataset.down, i = ids.indexOf(id), j = b.dataset.up ? i - 1 : i + 1;
          if (j < 0 || j >= ids.length || !['queued'].includes(C.cur.items[j].status)) return;
          [ids[i], ids[j]] = [ids[j], ids[i]];
          await Hub.hub('campaigns/reorder', { id: c.id, item_ids: ids }); return open(c.id);
        }
        if (b.dataset.pv) return preview(b.dataset.pv);
        if (b.dataset.ed) return editItem(C.cur.items.find(i => i.id === b.dataset.ed));
        if (b.dataset.rs) { await Hub.hub('items/edit', { id: b.dataset.rs, reset: true }); toast('חזרה להודעה הכללית'); return open(c.id); }
        if (b.dataset.rq) { await Hub.hub('items/outcome', { id: b.dataset.rq, result: 'queued' }); return open(c.id); }
        if (b.dataset.rp) { await Hub.hub('items/outcome', { id: b.dataset.rp, result: 'replied' }); toast('סומן כנענה'); return open(c.id); }
        if (b.dataset.sk) { if (!confirm('להוציא את החברה מהקמפיין?')) return; await Hub.hub('items/outcome', { id: b.dataset.sk, result: 'skipped', note: 'הוצא ידנית' }); return open(c.id); }
      } catch (err) { toast(err.message); }
    };
    // drag & drop reorder (waiting items only)
    let drag = null;
    tb.ondragstart = e => { const tr = e.target.closest('tr[data-it]'); if (!tr || tr.getAttribute('draggable') !== 'true') return; drag = tr.dataset.it; tr.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; };
    tb.ondragover = e => { if (!drag) return; e.preventDefault(); tb.querySelectorAll('tr').forEach(r => r.classList.remove('over')); const tr = e.target.closest('tr[data-it]'); if (tr) tr.classList.add('over'); };
    tb.ondragend = () => { drag = null; tb.querySelectorAll('tr').forEach(r => r.classList.remove('over', 'dragging')); };
    tb.ondrop = async e => {
      const tr = e.target.closest('tr[data-it]'); if (!drag || !tr || tr.dataset.it === drag) return;
      e.preventDefault();
      const target = C.cur.items.find(i => i.id === tr.dataset.it);
      if (target.status !== 'queued') return toast('אפשר לסדר רק חברות שממתינות בתור');
      const ids = C.cur.items.map(i => i.id); const from = ids.indexOf(drag), to = ids.indexOf(tr.dataset.it);
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      try { await Hub.hub('campaigns/reorder', { id: c.id, item_ids: ids }); open(c.id); toast('הסדר עודכן'); } catch (err) { toast(err.message); }
    };
  }

  function sheet(title, html, actions) {
    let d = document.getElementById('campSheet');
    if (!d) { d = document.createElement('dialog'); d.id = 'campSheet'; document.body.appendChild(d); }
    d.innerHTML = `<div class="dlg-h"><b>${title}</b><button class="btn sm" data-close>סגירה</button></div><div class="dlg-b">${html}</div><div class="dlg-f">${actions || ''}<button class="btn" data-close>סגירה</button></div>`;
    d.querySelectorAll('[data-close]').forEach(b => b.onclick = () => d.close());
    d.showModal(); return d;
  }
  async function preview(id) {
    try {
      const p = await Hub.hub('items/preview', { id });
      const it = C.cur.items.find(i => i.id === id);
      sheet(`תצוגה מקדימה – ${esc(p.contact.company_name)} · ${CH[p.item.channel].he}`,
        `${p.subject !== null ? `<div class="muted">נושא: <b>${esc(p.subject || '—')}</b></div>` : ''}
         <div class="msg" style="white-space:pre-wrap;background:var(--bg);border-radius:10px;padding:12px;margin:8px 0">${esc(p.body)}</div>
         <div class="muted">${p.length} / ${p.maxLen} תווים</div>
         ${p.warnings.length ? `<div class="note">${p.warnings.map(esc).join('<br>')}</div>` : '<div class="note ok">✓ ההודעה מתאימה לערוץ</div>'}
         <div class="policy">${p.auto.auto ? 'תישלח אוטומטית בתורה' : '✋ ' + esc(p.auto.reason)}</div>`,
        it && it.status === 'ready' ? `<a class="btn pri" href="${esc(channelLink(p.contact, p.item.channel, p.body, p.subject) || '#')}" target="_blank" rel="noopener">פתיחת שיחה</a>` : '');
    } catch (e) { toast(e.message); }
  }
  function editItem(it) {
    const d = sheet(`עריכת ההודעה ל${esc(it.contact.company_name)}`,
      `${it.channel === 'email' ? `<label class="muted">נושא</label><input type="text" id="ieSubj" style="width:100%" value="${esc(it.subject || '')}">` : ''}
       <label class="muted">הודעה (משפיעה רק על החברה הזו)</label><textarea id="ieBody" rows="7">${esc(it.body)}</textarea>`,
      `<button class="btn pri" id="ieSave">שמירה</button>`);
    d.querySelector('#ieSave').onclick = async () => {
      try { await Hub.hub('items/edit', { id: it.id, body: d.querySelector('#ieBody').value, subject: d.querySelector('#ieSubj') ? d.querySelector('#ieSubj').value : undefined }); d.close(); toast('נשמר – ההודעה הכללית לא השתנתה'); open(C.cur.campaign.id); }
      catch (e) { toast(e.message); }
    };
  }

  /* ---------- channels tab ---------- */
  async function loadChannels(quiet) {
    try {
      C.channels = (await Hub.hub('channels/list')).channels;
      if (quiet) return;
      $('#chList').innerHTML = C.channels.map(ch => `<div class="qitem">
        <div>
          <div class="row"><span class="ch ${CH[ch.id].cls}">${CH[ch.id].s}</span><b>${esc(ch.he)}</b>
            <span class="chip ${ch.phase === 'active' ? 'q-sent' : 'q-replied'}">${ch.phase === 'active' ? 'פעיל – שליחה ידנית מהתור' : 'תשתית מוכנה לחיבור עתידי'}</span>
            <span class="chip ${ch.connector && ch.auto_allowed ? 'q-sent' : 'q-queued'}">${ch.connector && ch.auto_allowed ? 'שליחה אוטומטית פעילה' : 'שליחה אוטומטית: לא זמינה'}</span></div>
          <div class="muted" style="margin-top:6px"><b>מתי מותר אוטומטית:</b> ${esc(ch.autoRule)}</div>
          <div class="muted"><b>איך שולחים עכשיו:</b> ${esc(ch.manualHow)}</div>
          ${ch.needs.length ? `<div class="muted"><b>מה נדרש לחיבור:</b> ${ch.needs.map(esc).join(' · ')}</div>` : ''}
          ${ch.id === 'email' ? `<div class="form" style="margin-top:8px">
              <label>חתימה<input type="text" data-set="signature" value="${esc(ch.settings.signature || '')}" placeholder="שם, תפקיד, טלפון"></label>
              <label>שורת הסרה<input type="text" data-set="unsubscribe_text" value="${esc(ch.settings.unsubscribe_text || '')}" placeholder="השיבו &quot;הסר&quot; ונסיר אתכם"></label></div>
              <button class="btn sm" data-chsave="email" style="margin-top:6px">שמירת הגדרות אימייל</button>` : ''}
        </div>
        <div class="qside"><label class="muted"><input type="checkbox" data-chen="${ch.id}" ${ch.enabled ? 'checked' : ''}> הערוץ זמין בקמפיינים</label></div></div>`).join('');
      $('#chList').onchange = async e => { const k = e.target.dataset.chen; if (!k) return; try { await Hub.hub('channels/update', { channel: k, enabled: e.target.checked }); toast('עודכן'); } catch (err) { toast(err.message); } };
      $('#chList').onclick = async e => {
        const b = e.target.closest('[data-chsave]'); if (!b) return;
        const box = b.closest('.qitem'); const settings = {};
        box.querySelectorAll('[data-set]').forEach(i => settings[i.dataset.set] = i.value.trim());
        try { await Hub.hub('channels/update', { channel: b.dataset.chsave, settings }); toast('נשמר'); } catch (err) { toast(err.message); }
      };
    } catch (e) { toast(e.message); }
  }

  window.Camp = { load, loadChannels, open };
  if (Hub.key) load();
})();
