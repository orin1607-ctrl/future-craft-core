/* Shared client for the Marketing Center pages (social-center, media-library, outreach).
   Talks only to the STAGING edge functions; the owner key lives in this browser's localStorage. */
(function () {
  const BASE = 'https://usfeoerkpcafxxlyuldl.supabase.co/functions/v1/';
  const KEY_LS = 'socialCenter.key', BIZ_LS = 'socialCenter.biz';
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    del: k => { try { localStorage.removeItem(k); } catch (e) {} },
  };

  const Hub = {
    key: ls.get(KEY_LS) || '',
    biz: ls.get(BIZ_LS) || 'dalia',
    onAuthFail: null,
    setKey(k) { this.key = k; ls.set(KEY_LS, k); },
    clearKey() { this.key = ''; ls.del(KEY_LS); },
    setBiz(b) { this.biz = b; ls.set(BIZ_LS, b); },

    async call(fn, route, body) {
      const r = await fetch(BASE + fn + '/' + route, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-social-key': this.key },
        body: JSON.stringify({ business_id: this.biz, ...(body || {}) }),
      });
      const d = await r.json().catch(() => ({ error: 'תגובה לא תקינה מהשרת' }));
      if (r.status === 401) { if (this.onAuthFail) this.onAuthFail(); throw new Error(d.error || 'מפתח גישה שגוי'); }
      if (!r.ok || d.error) throw new Error(d.error || ('HTTP ' + r.status));
      return d;
    },
    hub(route, body) { return this.call('marketing-hub', route, body); },
    social(route, body) { return this.call('social-meta', route, body); },
    async businesses() { return (await this.social('businesses')).businesses; },
  };

  /* ---------- sign-in gate (shared by every Marketing Center page) ---------- */
  // Phones often paste extra text (the file's title line, spaces, invisible characters): keep only the key.
  Hub.normalizeKey = function (raw) {
    const s = String(raw || '').replace(/[​-‏‪-‮⁦-⁩﻿]/g, '');
    const tokens = s.match(/[A-Za-z0-9_-]{16,}/g);
    return tokens ? tokens[tokens.length - 1] : s.trim();
  };
  // Returns '' on success, otherwise a message the person can act on.
  Hub.verifyKey = async function (key) {
    let r;
    try {
      r = await fetch(BASE + 'marketing-hub/ping', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-social-key': key }, body: '{}',
      });
    } catch (e) {
      return 'אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב.';
    }
    if (r.status === 401) return 'מפתח הגישה שגוי. העתיקו רק את השורה השנייה בקובץ המפתח (בלי הכותרת) ונסו שוב.';
    if (!r.ok) return 'השרת לא זמין כרגע (' + r.status + '). נסו שוב בעוד דקה.';
    return '';
  };
  const deviceName = () => {
    const ua = navigator.userAgent;
    const kind = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'מכשיר';
    return kind + ' · ' + new Date().toLocaleDateString('he-IL');
  };
  /* Phone pairing: the 6-digit one-time code from a signed-in computer is exchanged for this
     device's own token. The owner key never reaches the phone. */
  Hub.pairWithCode = async function (code) {
    let r;
    try {
      r = await fetch(BASE + 'marketing-hub/auth/pair-complete', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, device_name: deviceName() }),
      });
    } catch (e) { return { error: 'אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב.' }; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.token) return { error: d.error || 'החיבור נכשל (' + r.status + ')' };
    return { token: d.token };
  };

  /* Wires a gate: Enter or button → (6-digit pairing code | owner key) → verify → onSuccess().
     Errors are shown inline next to the field (a toast can hide behind a phone keyboard). */
  Hub.mountGate = function ({ input, button, error, onSuccess }) {
    const show = msg => {
      error.textContent = msg; error.hidden = !msg;
      if (msg) error.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    input.type = 'text';
    input.setAttribute('autocomplete', 'one-time-code');
    input.setAttribute('autocapitalize', 'off'); input.setAttribute('autocorrect', 'off'); input.setAttribute('spellcheck', 'false');
    input.setAttribute('enterkeyhint', 'go');
    input.placeholder = 'קוד בן 6 ספרות מהמחשב';
    input.style.letterSpacing = '2px';
    const label = button.textContent;
    const submit = async ev => {
      if (ev) ev.preventDefault();
      const raw = String(input.value || '');
      const digits = raw.replace(/[\s​-‏﻿-]/g, '');
      let key;
      if (/^\d{6}$/.test(digits)) {
        button.disabled = true; button.textContent = 'מחבר…'; show('');
        const p = await Hub.pairWithCode(digits);
        if (p.error) { button.disabled = false; button.textContent = label; return show(p.error); }
        key = p.token;
      } else {
        key = Hub.normalizeKey(raw);
        if (!key) return show('הזינו את הקוד בן 6 הספרות שמופיע במחשב (חיבור טלפון).');
        if (/^\d+$/.test(digits)) return show('הקוד צריך להיות בן 6 ספרות בדיוק.');
        button.disabled = true; button.textContent = 'בודק…'; show('');
        const msg = await Hub.verifyKey(key);
        if (msg) { button.disabled = false; button.textContent = label; return show(msg); }
      }
      input.value = '';
      Hub.setKey(key);
      try { input.blur(); await onSuccess(); show(''); }
      catch (e) { show('הכניסה הצליחה אבל טעינת הנתונים נכשלה: ' + (e.message || e) + '. רעננו את העמוד.'); }
      finally { button.disabled = false; button.textContent = label; }
    };
    const form = input.closest('form');
    if (form) form.addEventListener('submit', submit);   // button is type=submit: covers tap and Enter/"Go"
    else {
      input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(e); });
      button.addEventListener('click', submit);
    }
    return { show };
  };

  /* ---------- "connect phone" dialog (shown on a signed-in computer) ---------- */
  const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  const loadQrLib = () => window.QRCode ? Promise.resolve() : new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = QR_LIB; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
  Hub.openPairDialog = async function () {
    let dlg = document.getElementById('hubPairDlg');
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.id = 'hubPairDlg';
      dlg.style.cssText = 'border:1px solid var(--line,#ccd);border-radius:14px;background:var(--surface,#fff);color:var(--ink,#111);padding:0;width:min(520px,94vw);font:inherit';
      dlg.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--line,#ccd)">
          <b>📱 חיבור טלפון למרכז השיווק</b><button type="button" data-x style="border:1px solid var(--line,#ccd);background:transparent;color:inherit;border-radius:8px;padding:4px 10px;cursor:pointer;font:inherit">סגירה</button></div>
        <div style="padding:14px">
          <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;justify-content:center">
            <div data-qr style="background:#fff;padding:8px;border-radius:10px;width:176px;height:176px"></div>
            <div style="text-align:center">
              <div style="font-size:13px;opacity:.75">1. סרקו במצלמת הטלפון</div>
              <div style="font-size:13px;opacity:.75;margin-top:6px">2. הקלידו בטלפון את הקוד:</div>
              <div data-code style="font-size:38px;font-weight:800;letter-spacing:6px;direction:ltr;margin:4px 0">······</div>
              <div data-left style="font-size:12.5px;opacity:.75"></div>
              <button type="button" data-new style="margin-top:6px;border:1px solid var(--line,#ccd);background:transparent;color:inherit;border-radius:8px;padding:4px 10px;cursor:pointer;font:inherit">קוד חדש</button>
            </div>
          </div>
          <div data-ok style="display:none;margin-top:12px;padding:10px;border-radius:10px;background:var(--ok-soft,#e3f4ec);color:var(--ok,#17875a);font-weight:700;text-align:center">✅ הטלפון חובר! אפשר לסגור את החלון.</div>
          <div style="font-size:12.5px;opacity:.75;margin-top:12px">הקוד חד-פעמי, תקף ל-10 דקות וננעל אחרי 5 טעויות. הטלפון נשאר מחובר עד שתנתקו אותו כאן. המפתח הראשי לא עובר לטלפון.</div>
          <b style="display:block;margin-top:14px">מכשירים מחוברים</b>
          <div data-devs style="font-size:13px;margin-top:4px">טוען…</div>
        </div>`;
      document.body.appendChild(dlg);
      dlg.querySelector('[data-x]').onclick = () => dlg.close();
      dlg.addEventListener('close', () => { clearInterval(dlg._tick); clearInterval(dlg._poll); });
      dlg.querySelector('[data-devs]').onclick = async e => {
        const b = e.target.closest('[data-revoke]'); if (!b) return;
        if (!confirm('לנתק את המכשיר? הוא יצטרך קוד חדש כדי להיכנס.')) return;
        try { await Hub.hub('auth/revoke', { id: b.dataset.revoke }); renderDevs(); } catch (err) { alert(err.message); }
      };
      dlg.querySelector('[data-new]').onclick = () => newCode();
    }
    const $d = s => dlg.querySelector(s);
    let known = null;
    async function renderDevs() {
      try {
        const d = await Hub.hub('auth/devices');
        const ids = d.devices.map(x => x.id);
        if (known && ids.some(id => !known.includes(id))) { $d('[data-ok]').style.display = 'block'; $d('[data-code]').textContent = '✓'; clearInterval(dlg._tick); $d('[data-left]').textContent = ''; }
        known = ids;
        $d('[data-devs]').innerHTML = d.devices.length ? d.devices.map(x => `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line,#eee)">
          <span>${Hub.esc(x.name)}${x.id === d.current ? ' <b>(המכשיר הזה)</b>' : ''}<br><span style="opacity:.7">פעיל לאחרונה: ${x.last_seen_at ? new Date(x.last_seen_at).toLocaleString('he-IL') : '—'}</span></span>
          <button type="button" data-revoke="${x.id}" style="border:1px solid var(--line,#ccd);background:transparent;color:var(--bad,#c23b3b);border-radius:8px;padding:3px 9px;cursor:pointer;font:inherit">ניתוק</button></div>`).join('')
          : '<span style="opacity:.7">אין עדיין טלפונים מחוברים.</span>';
      } catch (e) { $d('[data-devs]').textContent = e.message; }
    }
    async function newCode() {
      $d('[data-ok]').style.display = 'none'; $d('[data-code]').textContent = '······';
      try {
        const { code, expires_at } = await Hub.hub('auth/pair-start');
        $d('[data-code]').textContent = code.slice(0, 3) + ' ' + code.slice(3);
        clearInterval(dlg._tick);
        const end = new Date(expires_at).getTime();
        const tick = () => {
          const s = Math.max(0, Math.round((end - Date.now()) / 1000));
          $d('[data-left]').textContent = s ? `בתוקף עוד ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'פג תוקף – לחצו "קוד חדש"';
          if (!s) { clearInterval(dlg._tick); $d('[data-code]').textContent = '······'; }
        };
        tick(); dlg._tick = setInterval(tick, 1000);
      } catch (e) { $d('[data-code]').textContent = '—'; $d('[data-left]').textContent = e.message; }
    }
    dlg.showModal();
    const url = new URL('./m.html', location.href).href.split('?')[0];
    try {
      await loadQrLib(); $d('[data-qr]').innerHTML = '';
      new window.QRCode($d('[data-qr]'), { text: url, width: 160, height: 160, correctLevel: window.QRCode.CorrectLevel.M });
    } catch (e) { $d('[data-qr]').innerHTML = `<div style="font-size:12px;color:#333;padding:8px">פתחו בטלפון:<br><b style="direction:ltr;display:block;word-break:break-all">${Hub.esc(url)}</b></div>`; }
    known = null; await renderDevs(); await newCode();
    clearInterval(dlg._poll); dlg._poll = setInterval(renderDevs, 4000);
  };
  // Adds the "connect phone" button to a page header.
  Hub.mountPhoneButton = function (container) {
    if (!container || container.querySelector('[data-hub-phone]')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.hubPhone = '1'; b.textContent = '📱 חיבור טלפון';
    b.style.cssText = 'border:1px solid rgba(255,255,255,.45);background:rgba(255,255,255,.12);color:#fff;border-radius:999px;padding:5px 12px;cursor:pointer;font:inherit;font-weight:600';
    b.onclick = () => Hub.openPairDialog();
    container.appendChild(b);
  };

  /* ---------- images ---------- */
  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('לא ניתן לקרוא את התמונה'));
      img.src = src;
    });
  }
  function canvasToBlob(c, type = 'image/jpeg', q = 0.9) {
    return new Promise(res => c.toBlob(res, type, q));
  }
  // Downscaled JPEG used for grids (keeps the gallery fast and storage-light).
  async function makeThumb(img, max = 480) {
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(img, 0, 0, c.width, c.height);
    return canvasToBlob(c, 'image/jpeg', 0.8);
  }
  async function putSigned(url, blob, type) {
    const r = await fetch(url, { method: 'PUT', headers: { 'content-type': type, 'x-upsert': 'false' }, body: blob });
    if (!r.ok) throw new Error('העלאה נכשלה (' + r.status + ')');
  }

  /* Upload many files: originals kept as-is, a thumbnail is generated for each.
     opts: {category, tags, parent_id, preset, title, concurrency, onProgress(done,total,name)} */
  Hub.uploadFiles = async function (files, opts = {}) {
    files = [...files].filter(f => /^image\/(jpeg|png|webp|gif)$/.test(f.type));
    if (!files.length) throw new Error('לא נבחרו קבצי תמונה נתמכים (JPG, PNG, WEBP, GIF)');
    const total = files.length; let done = 0; const out = []; const errors = [];
    for (let i = 0; i < files.length; i += 20) {
      const chunk = files.slice(i, i + 20);
      const { uploads } = await this.hub('media/sign', {
        files: chunk.map((f, k) => ({ key: k, name: f.name, mime: f.type, bytes: f.size })),
      });
      const items = [];
      let next = 0;
      const worker = async () => {
        while (next < chunk.length) {
          const k = next++; const f = chunk[k]; const u = uploads.find(x => x.key === k);
          try {
            const url = URL.createObjectURL(f);
            const img = await loadImage(url);
            const thumb = await makeThumb(img);
            URL.revokeObjectURL(url);
            await putSigned(u.uploadUrl, f, f.type);
            await putSigned(u.thumbUploadUrl, thumb, 'image/jpeg');
            items.push({
              path: u.path, thumb_path: u.thumbPath, mime: f.type, bytes: f.size,
              width: img.naturalWidth, height: img.naturalHeight,
              title: opts.title || f.name.replace(/\.[^.]+$/, ''), category: opts.category || 'כללי',
              tags: opts.tags || [], parent_id: opts.parent_id || null, preset: opts.preset || null,
            });
          } catch (e) { errors.push(f.name + ': ' + e.message); }
          done++; opts.onProgress && opts.onProgress(done, total, f.name);
        }
      };
      await Promise.all(Array.from({ length: Math.min(opts.concurrency || 4, chunk.length) }, worker));
      if (items.length) out.push(...(await this.hub('media/register', { items })).assets);
    }
    return { assets: out, errors };
  };

  /* Instagram's API accepts JPEG only, aspect 4:5 … 1.91:1. Returns the asset itself when it already
     fits, otherwise creates (once) a padded JPEG version linked to the original. */
  Hub.igCompatible = async function (asset) {
    const r = asset.width / asset.height;
    if (asset.mime === 'image/jpeg' && r >= 0.8 && r <= 1.91) return asset;
    const img = await loadImage(asset.url);
    let w = img.naturalWidth, h = img.naturalHeight; const sc = Math.min(1, 1440 / Math.max(w, h));
    w = Math.round(w * sc); h = Math.round(h * sc);
    let cw = w, ch = h; const rr = w / h;
    if (rr < 0.8) cw = Math.ceil(h * 0.8); else if (rr > 1.91) ch = Math.ceil(w / 1.91);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cw, ch);
    x.drawImage(img, Math.round((cw - w) / 2), Math.round((ch - h) / 2), w, h);
    const blob = await canvasToBlob(c, 'image/jpeg', 0.9);
    const file = new File([blob], (asset.title || 'image') + '-ig.jpg', { type: 'image/jpeg' });
    const { assets } = await this.uploadFiles([file], {
      parent_id: asset.parent_id || asset.id, preset: 'ig_auto', category: asset.category,
      title: (asset.title || 'תמונה') + ' (מותאם אינסטגרם)',
    });
    return assets[0];
  };

  Hub.loadImage = loadImage;
  Hub.canvasToBlob = canvasToBlob;
  Hub.fmtBytes = n => n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.round(n / 1024) + 'KB';
  Hub.esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  window.Hub = Hub;
})();
