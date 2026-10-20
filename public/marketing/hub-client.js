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
  /* Wires a gate: Enter or button → clean key → verify → onSuccess(). Errors are shown inline next to
     the field (a toast can hide behind a phone keyboard), and the button shows progress. */
  Hub.mountGate = function ({ input, button, error, onSuccess }) {
    const show = msg => {
      error.textContent = msg; error.hidden = !msg;
      if (msg) error.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    input.setAttribute('autocomplete', 'current-password');
    input.setAttribute('autocapitalize', 'off'); input.setAttribute('autocorrect', 'off'); input.setAttribute('spellcheck', 'false');
    input.setAttribute('enterkeyhint', 'go');
    const label = button.textContent;
    const submit = async ev => {
      if (ev) ev.preventDefault();
      const key = Hub.normalizeKey(input.value);
      if (!key) return show('הזינו את מפתח הגישה.');
      button.disabled = true; button.textContent = 'בודק…'; show('');
      const msg = await Hub.verifyKey(key);
      if (msg) { button.disabled = false; button.textContent = label; return show(msg); }
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
