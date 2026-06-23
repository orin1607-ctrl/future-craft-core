/**
 * Project 001 — PRD DataGrid (חיפוש, מיון, סינון עמודות, סדר והצגה)
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getHeaders(table) {
    var ths = table.querySelectorAll('thead th');
    if (!ths.length) {
      var first = table.querySelector('tr');
      if (!first) return [];
      return Array.from(first.children).map(function (cell, i) {
        return { idx: i, text: cell.textContent.trim(), el: null };
      });
    }
    return Array.from(ths).map(function (th, i) {
      return { idx: i, text: th.textContent.trim(), el: th };
    });
  }

  function getRows(table) {
    var tbody = table.querySelector('tbody');
    if (tbody) return Array.from(tbody.querySelectorAll('tr'));
    var all = Array.from(table.querySelectorAll('tr'));
    return all.slice(1);
  }

  function enhanceWrap(wrap) {
    if (!wrap || wrap.dataset.prdGrid === '1') return;
    var table = wrap.querySelector('table');
    if (!table) return;
    wrap.dataset.prdGrid = '1';

    var headers = getHeaders(table);
    if (!headers.length) return;

    var state = {
      search: '',
      sortCol: -1,
      sortDir: 1,
      colFilters: {},
      hidden: {},
      order: headers.map(function (_, i) { return i; }),
    };

    var toolbar = wrap.querySelector('.tbl-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'tbl-toolbar prd-dg-toolbar';
      wrap.insertBefore(toolbar, table);
    } else {
      toolbar.classList.add('prd-dg-toolbar');
    }

    toolbar.innerHTML =
      '<div class="prd-dg-search-row">' +
      '<input type="search" class="srch prd-dg-search" placeholder="חיפוש בטבלה…" aria-label="חיפוש">' +
      '<button type="button" class="btn btn-ghost btn-sm prd-dg-cols-btn">עמודות ▾</button>' +
      '<button type="button" class="btn btn-ghost btn-sm prd-dg-filter-btn">סינון עמודות ▾</button>' +
      '</div>' +
      '<div class="prd-dg-panel prd-dg-cols-panel" hidden></div>' +
      '<div class="prd-dg-panel prd-dg-filters-panel" hidden></div>';

    var colsPanel = toolbar.querySelector('.prd-dg-cols-panel');
    var filtPanel = toolbar.querySelector('.prd-dg-filters-panel');

    function renderColsPanel() {
      colsPanel.innerHTML = '<div class="prd-dg-panel-title">בחירת עמודות וסדר</div>' +
        state.order.map(function (colIdx, pos) {
          var h = headers[colIdx];
          if (!h) return '';
          var hid = state.hidden[colIdx] ? '' : ' checked';
          return '<div class="prd-dg-col-row" data-col="' + colIdx + '">' +
            '<label><input type="checkbox" class="prd-dg-vis" data-col="' + colIdx + '"' + hid + '> ' + esc(h.text || ('עמודה ' + (colIdx + 1))) + '</label>' +
            '<span class="prd-dg-col-move">' +
            '<button type="button" class="prd-dg-up" data-col="' + colIdx + '" title="הזז למעלה">▲</button>' +
            '<button type="button" class="prd-dg-down" data-col="' + colIdx + '" title="הזז למטה">▼</button>' +
            '</span></div>';
        }).join('');
      bindColsPanel();
    }

    function renderFiltersPanel() {
      filtPanel.innerHTML = '<div class="prd-dg-panel-title">סינון לפי עמודה</div>' +
        '<div class="prd-dg-filter-grid">' +
        state.order.filter(function (ci) { return !state.hidden[ci]; }).map(function (colIdx) {
          var h = headers[colIdx];
          var val = state.colFilters[colIdx] || '';
          return '<div class="prd-dg-filter-cell"><label>' + esc(h.text || '') +
            '</label><input type="text" class="srch prd-dg-col-filter" data-col="' + colIdx + '" value="' + esc(val) + '" placeholder="סינון…"></div>';
        }).join('') + '</div>';
      filtPanel.querySelectorAll('.prd-dg-col-filter').forEach(function (inp) {
        inp.addEventListener('input', function () {
          state.colFilters[inp.dataset.col] = inp.value;
          applyFilters();
        });
      });
    }

    function bindColsPanel() {
      colsPanel.querySelectorAll('.prd-dg-vis').forEach(function (cb) {
        cb.addEventListener('change', function () {
          state.hidden[cb.dataset.col] = !cb.checked;
          applyColumnVisibility();
          renderFiltersPanel();
        });
      });
      colsPanel.querySelectorAll('.prd-dg-up').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var ci = Number(btn.dataset.col);
          var pos = state.order.indexOf(ci);
          if (pos > 0) {
            var tmp = state.order[pos - 1];
            state.order[pos - 1] = state.order[pos];
            state.order[pos] = tmp;
            reorderDom();
            renderColsPanel();
          }
        });
      });
      colsPanel.querySelectorAll('.prd-dg-down').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var ci = Number(btn.dataset.col);
          var pos = state.order.indexOf(ci);
          if (pos < state.order.length - 1) {
            var tmp = state.order[pos + 1];
            state.order[pos + 1] = state.order[pos];
            state.order[pos] = tmp;
            reorderDom();
            renderColsPanel();
          }
        });
      });
    }

    function reorderDom() {
      var rows = table.querySelectorAll('tr');
      rows.forEach(function (row) {
        var cells = Array.from(row.children);
        if (!cells.length) return;
        var frag = document.createDocumentFragment();
        state.order.forEach(function (ci) {
          if (cells[ci] && !state.hidden[ci]) frag.appendChild(cells[ci]);
        });
        cells.forEach(function (c) { if (c.parentNode === row) row.removeChild(c); });
        row.appendChild(frag);
      });
      headers = getHeaders(table);
      bindSortHeaders();
    }

    function applyColumnVisibility() {
      var rows = table.querySelectorAll('tr');
      rows.forEach(function (row) {
        Array.from(row.children).forEach(function (cell, i) {
          var orig = cell.dataset.prdOrigCol != null ? cell.dataset.prdOrigCol : i;
          if (cell.dataset.prdOrigCol == null) cell.dataset.prdOrigCol = String(
            headers.findIndex(function (h) { return h.el === cell || h.idx === i; }) >= 0 ? i : i
          );
        });
      });
      reorderDom();
    }

    function bindSortHeaders() {
      var ths = table.querySelectorAll('thead th, tr:first-child th, tr:first-child td');
      ths.forEach(function (th, visIdx) {
        th.style.cursor = 'pointer';
        th.title = 'לחץ למיון';
        th.onclick = function () {
          var colIdx = state.order[visIdx];
          if (state.sortCol === colIdx) state.sortDir *= -1;
          else { state.sortCol = colIdx; state.sortDir = 1; }
          sortRows();
          ths.forEach(function (t) { t.classList.remove('prd-sorted-asc', 'prd-sorted-desc'); });
          th.classList.add(state.sortDir > 0 ? 'prd-sorted-asc' : 'prd-sorted-desc');
        };
      });
    }

    function sortRows() {
      var tbody = table.querySelector('tbody') || table;
      var rows = getRows(table);
      var col = state.sortCol;
      if (col < 0) return;
      rows.sort(function (a, b) {
        var av = (a.children[col] || {}).textContent || '';
        var bv = (b.children[col] || {}).textContent || '';
        var an = parseFloat(av.replace(/[^\d.-]/g, ''));
        var bn = parseFloat(bv.replace(/[^\d.-]/g, ''));
        if (!isNaN(an) && !isNaN(bn)) return (an - bn) * state.sortDir;
        return av.localeCompare(bv, 'he') * state.sortDir;
      });
      rows.forEach(function (r) { tbody.appendChild(r); });
    }

    function applyFilters() {
      var q = state.search.toLowerCase();
      getRows(table).forEach(function (row) {
        var text = row.textContent.toLowerCase();
        var show = !q || text.indexOf(q) >= 0;
        if (show) {
          Object.keys(state.colFilters).forEach(function (ci) {
            var f = (state.colFilters[ci] || '').toLowerCase();
            if (!f) return;
            var cell = row.children[ci];
            if (cell && cell.textContent.toLowerCase().indexOf(f) < 0) show = false;
          });
        }
        row.style.display = show ? '' : 'none';
      });
    }

    toolbar.querySelector('.prd-dg-search').addEventListener('input', function (e) {
      state.search = e.target.value;
      applyFilters();
    });

    toolbar.querySelector('.prd-dg-cols-btn').addEventListener('click', function () {
      var h = colsPanel.hasAttribute('hidden');
      colsPanel.toggleAttribute('hidden', !h);
      if (h) { renderColsPanel(); filtPanel.setAttribute('hidden', ''); }
    });

    toolbar.querySelector('.prd-dg-filter-btn').addEventListener('click', function () {
      var h = filtPanel.hasAttribute('hidden');
      filtPanel.toggleAttribute('hidden', !h);
      if (h) { renderFiltersPanel(); colsPanel.setAttribute('hidden', ''); }
    });

    renderColsPanel();
    bindSortHeaders();
  }

  function enhanceAll() {
    document.querySelectorAll('.tbl-wrap').forEach(enhanceWrap);
  }

  function init() {
    enhanceAll();
    window.addEventListener('prd-filter-change', enhanceAll);
  }

  window.PrdDataGrid = { init: init, enhanceAll: enhanceAll };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
