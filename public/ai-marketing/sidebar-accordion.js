/**
 * CO.CO — Mobile accordion sidebar + embedded mode (inside Dalia)
 */
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var fullscreen = params.get('fullscreen') === '1';
  var embedded = !fullscreen && (params.get('embedded') === '1' || window.self !== window.top);

  function applyEmbedded() {
    if (fullscreen) {
      document.documentElement.classList.add('fullscreen');
      document.body.classList.add('fullscreen');
      return;
    }
    if (!embedded) return;
    document.documentElement.classList.add('embedded');
    document.body.classList.add('embedded');
  }
  applyEmbedded();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyEmbedded);
  }

  function initSidebarAccordion() {
    var nav = document.querySelector('.sb-nav');
    if (!nav || nav.dataset.accReady || nav.dataset.v3Nav) return;

    var nodes = Array.from(nav.children);
    var groups = [];
    var current = null;

    nodes.forEach(function (node) {
      if (node.classList.contains('sb-sec')) {
        current = { title: node.textContent.trim(), items: [] };
        groups.push(current);
      } else if (node.classList.contains('sb-item') && current) {
        current.items.push(node);
      }
    });

    if (!groups.length) return;

    nav.innerHTML = '';
    groups.forEach(function (g, i) {
      var wrap = document.createElement('div');
      wrap.className = 'sb-acc-group' + (i === 0 ? ' open' : '');

      var hdr = document.createElement('button');
      hdr.type = 'button';
      hdr.className = 'sb-acc-hdr';
      hdr.setAttribute('aria-expanded', i === 0 ? 'true' : 'false');
      hdr.innerHTML = '<span class="sb-acc-title">' + g.title + '</span><span class="sb-acc-chevron" aria-hidden="true">▼</span>';
      hdr.addEventListener('click', function () {
        var open = wrap.classList.toggle('open');
        hdr.setAttribute('aria-expanded', open ? 'true' : 'false');
      });

      var body = document.createElement('div');
      body.className = 'sb-acc-body';
      g.items.forEach(function (item) { body.appendChild(item); });

      wrap.appendChild(hdr);
      wrap.appendChild(body);
      nav.appendChild(wrap);
    });

    nav.dataset.accReady = '1';
    document.body.classList.add('acc-nav-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebarAccordion);
  } else {
    initSidebarAccordion();
  }
})();
