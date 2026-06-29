const navItems = [
  { href: "/", label: "דף הבית" },
  { href: "/חבילות-ניהול-צי/", label: "חבילות" },
  { href: "/צור-קשר/", label: "צור קשר" }
];

const path = window.location.pathname.endsWith("/")
  ? window.location.pathname
  : `${window.location.pathname}/`;

const headerTarget = document.querySelector("[data-site-header]");
const footerTarget = document.querySelector("[data-site-footer]");

if (headerTarget) {
  headerTarget.innerHTML = `
    <header class="site-header">
      <div class="container header-inner">
        <a class="brand" href="/">
          דליה פתרונות מימון ותחזוקה לרכב
          <span class="brand-sub">ניהול צי ותפעול רכבים לעסקים</span>
        </a>
        <nav class="nav" aria-label="ניווט ראשי">
          ${navItems
            .map((item) => {
              const isCurrent = path === item.href;
              return `<a href="${item.href}" ${isCurrent ? 'aria-current="page"' : ""}>${item.label}</a>`;
            })
            .join("")}
          <a href="/צור-קשר/" class="btn btn-primary">שיחת ייעוץ</a>
        </nav>
      </div>
    </header>
  `;
}

if (footerTarget) {
  footerTarget.innerHTML = `
    <footer class="site-footer">
      <div class="container footer-grid">
        <div>
          <strong>דליה פתרונות מימון ותחזוקה לרכב</strong>
          <div class="lead">פתרונות B2B לניהול צי חכם, תחזוקה ותפעול שוטף.</div>
        </div>
        <div class="footer-links" aria-label="קישורי תחתית">
          ${navItems.map((item) => `<a href="${item.href}">${item.label}</a>`).join("")}
          <a href="tel:+972-3-555-0119">03-5550119</a>
        </div>
      </div>
    </footer>
  `;
}
