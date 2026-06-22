/* Project 001 — Interactive Mockup (demo data, localStorage memory) */
(function () {
  'use strict';

  const STORAGE_KEY = 'p001_mockup_v1';
  const MODULES = [
    { id: 'strategy', group: 'ליבה', label: 'מרכז האסטרטגיה', sub: 'המוח של המערכת', icon: '🧠' },
    { id: 'home', group: 'ליבה', label: 'דף הבית', sub: 'עבודה יומית', icon: '🏠' },
    { id: 'site', group: 'אתר', label: 'מרכז האתר', sub: 'ניהול האתר', icon: '🌍' },
    { id: 'keywords', group: 'אתר', label: 'מילות מפתח', sub: 'מודיעין חיפוש', icon: '🔑' },
    { id: 'seo', group: 'אתר', label: 'קידום אורגני', sub: 'SEO טכני', icon: '📈' },
    { id: 'content', group: 'אתר', label: 'ניהול תוכן', sub: 'יצירה ופרסום', icon: '✍️' },
    { id: 'competitors', group: 'מודיעין', label: 'מתחרים', sub: 'מחקר שוק', icon: '🏆' },
    { id: 'gbp', group: 'ערוצים', label: 'Google Business', sub: 'פרופיל עסקי', icon: '📍' },
    { id: 'ads', group: 'ערוצים', label: 'Google Ads', sub: 'קמפיינים', icon: '💰' },
    { id: 'ai-center', group: 'AI', label: 'מרכז ניתוח AI', sub: 'רב-מנועי', icon: '🤖' },
    { id: 'publishing', group: 'ערוצים', label: 'מרכז הפרסום', sub: 'רב-ערוצי', icon: '📢' },
    { id: 'reports', group: 'נתונים', label: 'דוחות', sub: 'ביצועים', icon: '📊' },
    { id: 'knowledge', group: 'זיכרון', label: 'מרכז ידע', sub: 'זיכרון ארגוני', icon: '📚' },
    { id: 'connections', group: 'מערכת', label: 'חיבורים', sub: 'אינטגרציות', icon: '🔌' },
    { id: 'tasks', group: 'עבודה', label: 'משימות', sub: 'AI מוביל', icon: '📋' },
    { id: 'chat', group: 'AI', label: "צ'אט AI", sub: 'שיחה מלאה', icon: '💬' },
    { id: 'settings', group: 'מערכת', label: 'הגדרות', sub: 'משתמשים ואבטחה', icon: '⚙️' },
  ];

  const BOTTOM_NAV = ['strategy', 'home', 'site', 'tasks', 'chat'];

  const TABS = {
    strategy: ['מצב היום', 'פוטנציאל שוק', 'יעדים', 'חסמים', 'תחזית AI', 'תוכנית עבודה'],
    home: ['סקירה', 'משימות היום', 'התראות', 'KPI', 'סיכום יומי'],
    site: ['כל העמודים', 'קטגוריות', 'תמונות', 'FAQ', 'טיוטות', 'אישורים'],
    keywords: ['כל המילים', 'דירוג', 'מגמות', 'הזדמנויות', 'תחרות'],
    seo: ['בריאות', 'CWV', '404/Redirect', 'Meta/H1', 'מהירות'],
    content: ['מאמרים', 'FAQ', 'רעיונות', 'טיוטות', 'תזמון'],
    competitors: ['מתחרים', 'השוואות', 'פערים', 'ניתוח URL'],
    gbp: ['ביקורות', 'פוסטים', 'תמונות', 'ביצועים'],
    ads: ['קמפיינים', 'מילים', 'המרות', 'ROI'],
    'ai-center': ['מנוע AI', 'השוואה', 'ניתוח', 'מסקנות'],
    publishing: ['ערוצים', 'עורך', 'תזמון'],
    reports: ['יומי', 'שבועי', 'חודשי', 'השוואות'],
    knowledge: ['הכל', 'ניתוחים', 'דוחות', 'החלטות', 'לקחים', 'זיכרון גלובלי'],
    connections: ['הכל', 'Google', 'WordPress', 'Meta'],
    tasks: ['היום', 'השבוע', 'מ-AI', 'הושלמו'],
    chat: ['שיחות', 'חיפוש'],
    settings: ['משתמשים', 'הרשאות', 'API', 'גיבויים'],
  };

  const STATUS = {
    strategy: { done: 12, open: 8, progress: 3, wait: 2, you: 1 },
    home: { done: 4, open: 5, progress: 2, wait: 3, you: 2 },
    site: { done: 142, open: 28, progress: 7, wait: 7, you: 4 },
    keywords: { done: 89, open: 34, progress: 5, wait: 0, you: 2 },
    seo: { done: 45, open: 12, progress: 9, wait: 3, you: 5 },
    content: { done: 23, open: 11, progress: 4, wait: 7, you: 3 },
    competitors: { done: 6, open: 4, progress: 1, wait: 0, you: 1 },
    gbp: { done: 18, open: 6, progress: 2, wait: 4, you: 2 },
    ads: { done: 8, open: 5, progress: 2, wait: 1, you: 1 },
    'ai-center': { done: 15, open: 3, progress: 1, wait: 0, you: 0 },
    publishing: { done: 10, open: 8, progress: 3, wait: 2, you: 2 },
    reports: { done: 30, open: 2, progress: 0, wait: 0, you: 0 },
    knowledge: { done: 156, open: 0, progress: 0, wait: 0, you: 0 },
    connections: { done: 6, open: 5, progress: 2, wait: 0, you: 1 },
    tasks: { done: 3, open: 5, progress: 2, wait: 2, you: 1 },
    chat: { done: 0, open: 0, progress: 0, wait: 0, you: 0 },
    settings: { done: 0, open: 2, progress: 0, wait: 0, you: 0 },
  };

  const BRAIN_Q = [
    { q: 'איפה אנחנו היום?', a: '34% מהיעד השנתי · מיקום ממוצע 8.3 · 3,842 קליקים השבוע' },
    { q: 'לאן אפשר להגיע?', a: 'מקום 1-3 ב-12 מילות מפתח מרכזיות · +180 לידים/חודש' },
    { q: 'מה פוטנציאל השוק?', a: 'שוק ניהול צי בישראל: ~₪2.4M/שנה בערוץ אורגני' },
    { q: 'כמה מחפשים כל שירות?', a: 'ניהול צי: 12,400 · GPS: 8,200 · דוח נסיעה: 5,100' },
    { q: 'כמה לידים אפשר להביא?', a: '420 לידים/חודש בפוטנציאל מלא · 145 ריאליים היום' },
    { q: 'כמה לקוחות אפשר להביא?', a: '28-35 לקוחות חדשים/חודש בשיעור המרה 6.5%' },
    { q: 'כמה הכנסות אפשר לייצר?', a: '₪180K-₪240K/חודש בפוטנציאל · ₪62K היום' },
    { q: 'מה מעכב אותנו?', a: '3 דפי שירות חסרים · Meta חלש ב-4 עמודים · GBP ממתין לאישור' },
    { q: 'מה המשימה החשובה ביותר?', a: 'פרסום דף /שירות-gps + אופטימיזציית Meta לניהול צי' },
    { q: 'מה הסיכוי להגיע ליעדים?', a: 'AI מעריך 72% בהנחת ביצוע 5 משימות השבוע' },
    { q: 'מה ה-AI ממליץ עכשיו?', a: 'התחל במשימה #1 → אשר 7 טיוטות → פרסם 3 דפים ביום ראשון' },
  ];

  const AI_RECOMMEND = {
    strategy: '1. פרסם דף GPS היום\n2. אשר 7 טיוטות ממתינות\n3. תקן Meta ב-3 עמודים חלשים\n4. ענה ל-2 ביקורות GBP\n\nסדר עדיפויות: השפעה על לידים → מהירות ביצוע',
    site: 'עמודים לשיפור: /ניהול-צי (Meta), /gps (ליצור), /דוח-נסיעה (H1)\nעמודים למחיקה: /ישן-2022 (404, 0 טראפיק)\nעמודים ליצירה: 3 דפי שירות חסרים',
    tasks: 'המשימה הבאה: אשר דף GPS\nאחר כך: תקן Meta\nאחר כך: ענה לביקורת AutoFleet',
    default: 'המלצה AI לפי נתוני המודול:\n• פעולה ראשונה עם ROI גבוה\n• משימה שניתנת לביצוע תוך 30 דקות\n• קישור ישיר לביצוע',
  };

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return {
      module: 'strategy',
      tab: 0,
      siteMode: 'list',
      chats: {},
      globalMemory: seedMemory(),
      tasks: seedTasks(),
    };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function seedMemory() {
    return [
      { when: 'מרץ 2026', mod: 'SEO', what: 'החלטה: לא למחוק /ישן-2022 — לעשות 301', why: 'עדיין 40 קליקים/חודש מקישורים חיצוניים', ok: true },
      { when: 'פברואר 2026', mod: 'אסטרטגיה', what: 'יעד: +30% לידים עד Q2', why: 'הרחבת שירותי GPS', ok: null },
      { when: 'ינואר 2026', mod: 'Ads', what: 'השהיית קמפיין Brand — ROI שלילי', why: 'CPA גבוה מ-₪400', ok: true },
      { when: 'דצמבר 2025', mod: 'תוכן', what: 'מאמר "ניהול צי" — הצלחה', why: '+340 קליקים/חודש, מיקום 4', ok: true },
    ];
  }

  function seedTasks() {
    return [
      { id: 1, title: 'פרסם דף /שירות-gps', src: 'אסטרטגיה', pri: 1, done: false },
      { id: 2, title: 'תקן Meta — /ניהול-צי-רכב', src: 'SEO', pri: 2, done: false },
      { id: 3, title: 'ענה לביקורת GBP — AutoFleet', src: 'GBP', pri: 3, done: false },
      { id: 4, title: 'אשר 7 טיוטות תוכן', src: 'אתר', pri: 4, done: false },
      { id: 5, title: 'הוסף Schema לדף שירות', src: 'SEO', pri: 5, done: false },
    ];
  }

  function $(id) { return document.getElementById(id); }

  function mod() { return MODULES.find((m) => m.id === state.module) || MODULES[0]; }

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2800);
  }

  function renderNav() {
    const nav = $('sbNav');
    let html = '';
    let g = '';
    MODULES.forEach((m) => {
      if (m.group !== g) {
        g = m.group;
        html += `<div class="sb-sec">${g}</div>`;
      }
      const active = m.id === state.module ? ' active' : '';
      const badge = m.id === 'tasks' ? '<span class="sb-badge">5</span>' : '';
      html += `<button type="button" class="sb-item${active}" data-mod="${m.id}"><span class="icon">${m.icon}</span>${m.label}${badge}</button>`;
    });
    nav.innerHTML = html;
    nav.querySelectorAll('[data-mod]').forEach((btn) => {
      btn.addEventListener('click', () => goModule(btn.dataset.mod));
    });

    const bn = $('bottomNav');
    bn.innerHTML = BOTTOM_NAV.map((id) => {
      const m = MODULES.find((x) => x.id === id);
      const active = id === state.module ? ' active' : '';
      return `<button type="button" class="bn-item${active}" data-mod="${id}"><span class="ico">${m.icon}</span>${m.label.split(' ')[0]}</button>`;
    }).join('');
    bn.querySelectorAll('[data-mod]').forEach((btn) => {
      btn.addEventListener('click', () => goModule(btn.dataset.mod));
    });
  }

  function goModule(id) {
    state.module = id;
    state.tab = 0;
    saveState();
    $('sidebar').classList.remove('open');
    $('overlayScrim')?.classList.remove('show');
    render();
    if (id === 'chat') openChat();
  }

  function renderHeader() {
    const m = mod();
    $('screenTitle').textContent = m.label;
    $('screenSub').textContent = m.sub;
  }

  function renderStatus() {
    const s = STATUS[state.module] || STATUS.home;
    const labels = [
      ['done', 'הושלם', s.done],
      ['open', 'פתוח', s.open],
      ['progress', 'בטיפול', s.progress],
      ['wait', 'ממתין לאישור', s.wait],
      ['you', 'דורש ממך', s.you],
    ];
    $('statusStrip').innerHTML = labels
      .map(
        ([k, lbl, n]) =>
          `<button type="button" class="status-pill" data-filter="${k}">${lbl}<span class="n">${n}</span></button>`
      )
      .join('');
    $('statusStrip').querySelectorAll('.status-pill').forEach((p) => {
      p.addEventListener('click', () => {
        toast(`סינון: ${p.textContent.trim()} (דמו)`);
      });
    });
  }

  function renderTabs() {
    const tabs = TABS[state.module] || [];
    $('tabRow').innerHTML = tabs
      .map((t, i) => `<button type="button" class="tab${i === state.tab ? ' active' : ''}" data-tab="${i}">${t}</button>`)
      .join('');
    $('tabRow').querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.tab = Number(btn.dataset.tab);
        saveState();
        renderBody();
      });
    });
  }

  function renderBody() {
    const body = $('screenBody');
    const fn = RENDERERS[state.module] || renderDefault;
    body.innerHTML = fn();
    bindBodyEvents();
  }

  function bindBodyEvents() {
    document.querySelectorAll('[data-action-btn]').forEach((btn) => {
      btn.addEventListener('click', () => toast(`פעולה: ${btn.dataset.actionBtn} (דמו)`));
    });
    document.querySelectorAll('[data-site-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.siteMode = btn.dataset.siteMode;
        saveState();
        renderBody();
      });
    });
    document.querySelectorAll('[data-complete-task]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.completeTask);
        const t = state.tasks.find((x) => x.id === id);
        if (t) {
          t.done = true;
          saveState();
          addMemory('משימות', `הושלם: ${t.title}`, 'בוצע מהמלצת AI');
          toast('משימה הושלמה — נשמר בזיכרון');
          renderBody();
        }
      });
    });
    document.querySelectorAll('.q-item').forEach((el, i) => {
      el.addEventListener('click', () => showModal(BRAIN_Q[i].q, `<p>${BRAIN_Q[i].a}</p>`));
    });
  }

  function renderStrategy() {
  return `
    <div class="brain-hero">
      <h2>המוח — משימה #1 להיום</h2>
      <p>פרסום דף /שירות-gps + אופטימיזציית Meta · ROI צפוי ₪4,200/חודש</p>
      <button type="button" class="btn btn-success btn-block" data-action-btn="start-mission">התחל משימה עכשיו</button>
    </div>
    <div class="stats-grid">
      <div class="stat"><div class="stat-lbl">השגנו מהיעד</div><div class="stat-val">34%</div></div>
      <div class="stat"><div class="stat-lbl">לידים פוטנציאל</div><div class="stat-val">420</div></div>
      <div class="stat"><div class="stat-lbl">הכנסה פוטנציאל</div><div class="stat-val">₪180K</div></div>
      <div class="stat"><div class="stat-lbl">סיכוי ליעד</div><div class="stat-val">72%</div></div>
    </div>
    <div class="card">
      <div class="card-hdr">11 שאלות יומיות — לחץ לפרטים</div>
      <div class="card-body q-grid">
        ${BRAIN_Q.map((x) => `<div class="q-item"><strong>${x.q}</strong><span>${x.a}</span></div>`).join('')}
      </div>
    </div>`;
  }

  function renderSite() {
    const mode = state.siteMode || 'list';
    return `
    <div class="mode-row">
      ${['list', 'editor', 'publish'].map((m, i) => {
        const labels = ['רשימה', 'עורך', 'פרסום'];
        return `<button type="button" class="mode-btn${mode === m ? ' active' : ''}" data-site-mode="${m}">${labels[i]}</button>`;
      }).join('')}
    </div>
    ${mode === 'list' ? `
    <div class="card">
      <div class="card-hdr"><span>198 עמודים</span><button type="button" class="btn btn-primary btn-sm" data-action-btn="new-page">+ עמוד חדש</button></div>
      ${pageRow('/ניהול-צי-רכב', 'פורסם · SEO 88', ['ערוך', 'SEO'])}
      ${pageRow('/שירות-gps', 'טיוטה · SEO 62', ['ערוך', 'פרסם'])}
      ${pageRow('/ישן-2022', 'למחיקה · 0 טראפיק', ['301', 'מחק'])}
    </div>` : ''}
    ${mode === 'editor' ? `
    <div class="card"><div class="card-hdr">עורך — /שירות-gps</div>
    <div class="card-body"><p>תוכן + SEO + AI באותו מסך (דסקטופ: 3 עמודות)</p>
    <button type="button" class="btn btn-ai" data-action-btn="ai-page">AI לעמוד</button></div></div>` : ''}
    ${mode === 'publish' ? `
    <div class="card"><div class="card-hdr">7 ממתינים לאישור</div>
    <div class="card-body">${pageRow('מאמר: ניהול צי', 'ממתין', ['אשר', 'דחה'])}</div></div>` : ''}`;
  }

  function pageRow(title, sub, actions) {
    return `<div class="list-row"><div class="meta"><div class="title">${title}</div><div class="sub">${sub}</div></div>
      ${actions.map((a) => `<button type="button" class="btn btn-ghost btn-sm" data-action-btn="${a}">${a}</button>`).join('')}</div>`;
  }

  function renderTasks() {
    const next = state.tasks.find((t) => !t.done);
    return `
    ${next ? `<div class="task-next"><h3>המשימה הבאה שלך</h3><p><strong>${next.title}</strong><br><span class="sub">מקור: ${next.src} · עדיפות ${next.pri}</span></p>
      <button type="button" class="btn btn-success btn-block" data-complete-task="${next.id}">סיימתי</button></div>` : '<p>כל המשימות הושלמו!</p>'}
    <div class="card"><div class="card-hdr">משימות (ממוין AI)</div>
    ${state.tasks.map((t) => `
      <div class="list-row">
        <div class="meta"><div class="title">${t.done ? '✓ ' : ''}${t.title}</div><div class="sub">${t.src}</div></div>
        ${t.done ? '<span class="chip ok">הושלם</span>' : `<button type="button" class="btn btn-outline btn-sm" data-complete-task="${t.id}">סיימתי</button>`}
      </div>`).join('')}
    </div>`;
  }

  function renderKnowledge() {
    const tab = (TABS.knowledge || [])[state.tab] || 'הכל';
    return `
    <div class="card"><div class="card-hdr">זיכרון ארגוני (Global Memory)</div>
    <div class="card-body">
      <p style="margin-bottom:12px;color:var(--text2)">כל הניתוחים, דוחות, החלטות, הצלחות, כישלונות ולקחים — זמינים ל-AI בכל מודול.</p>
      <div class="memory-timeline">
        ${state.globalMemory.map((m) => `
          <div class="memory-item">
            <div class="when">${m.when} · ${m.mod}</div>
            <div class="what">${m.what}</div>
            <div class="why">${m.why}</div>
            ${m.ok === true ? '<span class="chip ok">הצליח</span>' : m.ok === false ? '<span class="chip wait">נכשל</span>' : ''}
          </div>`).join('')}
      </div>
    </div></div>
    <p style="font-size:12px;color:var(--text3)">טאב נוכחי: ${tab} · היסטוריית שיחות AI נשמרת לפי מודול ב-localStorage</p>`;
  }

  function renderChatScreen() {
    return `<div class="card"><div class="card-body">
      <p>לחץ <strong>שאל AI</strong> בראש המסך לצ'אט מלא עם היסטוריה.</p>
      <button type="button" class="btn btn-primary btn-block" id="openChatFromScreen">פתח צ'אט AI</button>
    </div></div>`;
  }

  function renderDefault() {
    const tab = (TABS[state.module] || [])[state.tab] || '';
    return `<div class="card"><div class="card-hdr">${mod().label} — ${tab}</div>
    <div class="card-body"><p>תוכן דמו לטאב "${tab}". כל הכפתורים למעלה פעילים.</p>
    <button type="button" class="btn btn-ai" data-action-btn="demo">פעולת דמו</button></div></div>`;
  }

  const RENDERERS = {
    strategy: renderStrategy,
    site: renderSite,
    tasks: renderTasks,
    knowledge: renderKnowledge,
    chat: renderChatScreen,
    home: () => renderDefault() + `<div class="task-next"><h3>AI: מה לעשות עכשיו</h3><p>התחל במשימה #1 — פרסום דף GPS</p><button type="button" class="btn btn-primary btn-block" data-action-btn="go-task">עבור למשימה</button></div>`,
    competitors: () => `<div class="card"><div class="card-body"><input type="url" placeholder="הדבק קישור: אתר, GBP, FB, IG..." style="width:100%;min-height:48px;padding:12px;border-radius:10px;border:2px solid var(--blue);margin-bottom:10px;font-family:inherit" /><button type="button" class="btn btn-primary btn-block" data-action-btn="scan">סרוק ונתח</button></div></div>`,
    connections: () => `<div class="card">${['Analytics ✓', 'GSC ✓', 'Ads ⏳', 'GBP ⏳', 'WordPress ✗'].map((x) => `<div class="list-row"><div class="title">${x}</div></div>`).join('')}</div>`,
  };

  function render() {
    renderNav();
    renderHeader();
    renderStatus();
    renderTabs();
    renderBody();
    const chatBtn = $('openChatFromScreen');
    if (chatBtn) chatBtn.addEventListener('click', openChat);
  }

  function showModal(title, html, footerHtml) {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = html;
    $('modalFooter').innerHTML = footerHtml || '<button type="button" class="btn btn-primary" id="modalOk">הבנתי</button>';
    $('modalBackdrop').classList.remove('hidden');
    $('modalOk')?.addEventListener('click', closeModal);
    $('modalFooter').querySelectorAll('[data-modal]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.modal === 'tasks') createTasksFromAI();
        closeModal();
      });
    });
  }

  function closeModal() {
    $('modalBackdrop').classList.add('hidden');
  }

  function addMemory(modName, what, why) {
    state.globalMemory.unshift({ when: 'עכשיו', mod: modName, what, why, ok: null });
    if (state.globalMemory.length > 50) state.globalMemory.pop();
    saveState();
  }

  function getModuleChat() {
    const id = state.module;
    if (!state.chats[id]) {
      state.chats[id] = {
        threads: [{ id: 'default', title: 'שיחה ראשית', messages: [{ role: 'ai', text: `שלום! אני מכיר את כל ההיסטוריה של ${mod().label}. מה תרצה לדעת?` }] }],
        active: 'default',
      };
    }
    return state.chats[id];
  }

  function openChat() {
    $('chatOverlay').classList.remove('hidden');
    renderChat();
    $('chatHistoryList').classList.add('open');
  }

  function closeChat() {
    $('chatOverlay').classList.add('hidden');
    $('chatOverlay').classList.remove('fullscreen');
  }

  function renderChat() {
    const chat = getModuleChat();
    const thread = chat.threads.find((t) => t.id === chat.active) || chat.threads[0];
    $('chatHistoryList').innerHTML = chat.threads
      .map((t) => `<div class="chat-hist-item${t.id === chat.active ? ' active' : ''}" data-thread="${t.id}">${t.title}</div>`)
      .join('');
    $('chatHistoryList').querySelectorAll('[data-thread]').forEach((el) => {
      el.addEventListener('click', () => {
        chat.active = el.dataset.thread;
        saveState();
        renderChat();
      });
    });
    $('chatMessages').innerHTML = thread.messages
      .map((m) => `<div class="msg ${m.role}"><div class="msg-bubble">${escapeHtml(m.text)}</div></div>`)
      .join('');
    $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }

  function sendChat(text) {
    if (!text.trim()) return;
    const chat = getModuleChat();
    const thread = chat.threads.find((t) => t.id === chat.active);
    thread.messages.push({ role: 'user', text: text.trim() });
    const reply = demoAiReply(text.trim());
    thread.messages.push({ role: 'ai', text: reply });
    saveState();
    renderChat();
    addMemory(mod().label, `שאלה: ${text.slice(0, 60)}...`, reply.slice(0, 120));
  }

  function demoAiReply(q) {
    const low = q.toLowerCase();
    if (low.includes('אתר') || low.includes('עמוד')) return 'מצב האתר: 198 עמודים, 9 חלשים. ליצור: /gps. לשפר: /ניהול-צי. למחוק: /ישן-2022 (301). מבוסס על זיכרון ממרץ 2026.';
    if (low.includes('היום') || low.includes('חשוב')) return 'הכי חשוב היום: פרסום דף GPS. אחר כך: 7 טיוטות. זוכר שהחלטנו בפברואר על +30% לידים.';
    if (low.includes('גוגל') || low.includes('ירדנו')) return 'ירידה בדירוג: מתחרה AutoFleet עלה 4 מיקומים על "ניהול צי". ממליץ תוכן מעודכן + FAQ.';
    if (low.includes('מתחר')) return 'השבוע AutoFleet פרסם מאמר GPS וקיבל 3 ביקורות חדשות. פער: אין לנו דף GPS.';
    if (low.includes('קמפיין') || low.includes('מפסיד')) return 'קמפיין Brand מושהה מאז ינואר (ROI שלילי). Search מביא ROI 3.2x.';
    return `תשובה מ-${mod().label} עם זיכרון מלא: ניתחתי את הנתונים מכל המערכות. ההמלצה העיקרית: התחל במשימה #1. רוצה שאיצור משימות?`;
  }

  function createTasksFromAI() {
    const rec = AI_RECOMMEND[state.module] || AI_RECOMMEND.default;
    const lines = rec.split('\n').filter((l) => l.match(/^\d/));
    lines.forEach((line, i) => {
      state.tasks.push({
        id: Date.now() + i,
        title: line.replace(/^\d+\.\s*/, ''),
        src: mod().label,
        pri: state.tasks.length + 1,
        done: false,
      });
    });
    saveState();
    toast(`${lines.length} משימות נוצרו מ-AI`);
    goModule('tasks');
  }

  function handleAiAction(action) {
    const m = state.module;
    if (action === 'recommend') {
      const text = AI_RECOMMEND[m] || AI_RECOMMEND.default;
      showModal('מה ה-AI ממליץ לעשות?', `<pre style="white-space:pre-wrap;font-family:inherit">${text}</pre>`, '<button type="button" class="btn btn-primary" data-modal="tasks">צור משימות מההמלצות</button><button type="button" class="btn btn-ghost" id="modalOk">סגור</button>');
      return;
    }
    if (action === 'tasks') {
      createTasksFromAI();
      return;
    }
    if (action === 'summary') {
      showModal('סיכום מנהלים', `<p><strong>${mod().label}</strong></p><p>הושלם: ${STATUS[m]?.done || 0} · פתוח: ${STATUS[m]?.open || 0} · דורש ממך: ${STATUS[m]?.you || 0}</p><p>המלצת AI: התמקד במשימה #1 השבוע. סיכוי ליעד: 72%.</p>`);
      return;
    }
    if (action === 'export') {
      toast('ייצוא PDF (דמו) — בפיתוח סופי');
    }
  }

  function handleGlobalAsk() {
    const q = $('globalAskInput').value.trim();
    if (!q) return;
    openChat();
    sendChat(q);
    $('globalAskInput').value = '';
  }

  // Init overlay scrim for mobile menu
  const scrim = document.createElement('div');
  scrim.className = 'overlay-scrim';
  scrim.id = 'overlayScrim';
  document.body.appendChild(scrim);

  $('menuBtn').addEventListener('click', () => {
    $('sidebar').classList.toggle('open');
    scrim.classList.toggle('show');
  });
  scrim.addEventListener('click', () => {
    $('sidebar').classList.remove('open');
    scrim.classList.remove('show');
  });

  $('actionBar').querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleAiAction(btn.dataset.action));
  });

  $('modalClose').addEventListener('click', closeModal);
  $('modalBackdrop').addEventListener('click', (e) => {
    if (e.target === $('modalBackdrop')) closeModal();
  });

  $('openChatBtn').addEventListener('click', openChat);
  $('chatClose').addEventListener('click', closeChat);
  $('chatSend').addEventListener('click', () => {
    sendChat($('chatInput').value);
    $('chatInput').value = '';
  });
  $('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendChat($('chatInput').value);
      $('chatInput').value = '';
    }
  });
  $('chatNew').addEventListener('click', () => {
    const chat = getModuleChat();
    const id = 't' + Date.now();
    chat.threads.unshift({ id, title: 'שיחה חדשה', messages: [{ role: 'ai', text: 'שיחה חדשה — ההיסטוריה הישנה נשמרת.' }] });
    chat.active = id;
    saveState();
    renderChat();
  });
  $('chatFullscreen').addEventListener('click', () => $('chatOverlay').classList.toggle('fullscreen'));
  $('chatFile').addEventListener('click', () => toast('העלאת קובץ (דמו)'));
  $('chatImage').addEventListener('click', () => toast('העלאת תמונה (דמו)'));
  $('globalAskBtn').addEventListener('click', handleGlobalAsk);
  $('globalAskInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleGlobalAsk();
  });
  $('syncBtn').addEventListener('click', () => toast('סנכרון דמו הושלם'));

  render();
})();
