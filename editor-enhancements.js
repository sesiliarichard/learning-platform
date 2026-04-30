/**
 * ============================================================
 * ASAI LMS — Word-Like Editor Enhancements
 * ============================================================
 * Drop this file into your project and add:
 *   <script src="editor-enhancements.js"></script>
 * in admin.html AFTER your existing scripts.
 *
 * Features added:
 *  1. Image resize handles (drag corner to resize, like Word)
 *  2. Image drag-to-reposition (move images anywhere in editor)
 *  3. Table column resize (drag column borders)
 *  4. Table row resize (drag row borders)
 *  5. Beautiful table insertion modal (grid picker)
 *  6. Inline toolbar on image/table select
 * ============================================================
 */

(function () {
  'use strict';

  /* ──────────────────────────────────────────────────────────
   * CONSTANTS & STATE
   * ────────────────────────────────────────────────────────── */
  const HANDLE_SIZE   = 10;   // px — resize handle square
  const MIN_IMG_SIZE  = 40;   // px — minimum image dimension
  const MIN_COL_WIDTH = 30;   // px — minimum table column width
  const MIN_ROW_HEIGHT = 20;  // px — minimum table row height

  let _activeImg      = null; // currently selected image element
  let _activeTable    = null; // currently selected table element
  let _resizing       = false;
  let _draggingImg    = false;

  /* ──────────────────────────────────────────────────────────
   * INJECT GLOBAL STYLES
   * ────────────────────────────────────────────────────────── */
  function injectStyles () {
    if (document.getElementById('wle-styles')) return;
    const style = document.createElement('style');
    style.id = 'wle-styles';
    style.textContent = `
      /* ── Image selection overlay ── */
      .wle-img-wrap {
        display: inline-block;
        position: relative;
        line-height: 0;
        user-select: none;
        cursor: grab;
        transition: outline 0.12s;
      }
      .wle-img-wrap.selected {
        outline: 2px solid #7c3aed;
        outline-offset: 1px;
      }
      .wle-img-wrap img {
        display: block;
        max-width: 100%;
        height: auto;
      }

      /* ── 8 resize handles on image ── */
      .wle-handle {
        position: absolute;
        width:  ${HANDLE_SIZE}px;
        height: ${HANDLE_SIZE}px;
        background: #7c3aed;
        border: 2px solid #fff;
        border-radius: 2px;
        z-index: 100;
        box-shadow: 0 1px 4px rgba(0,0,0,0.35);
        display: none;
      }
      .wle-img-wrap.selected .wle-handle { display: block; }

      .wle-handle[data-dir="nw"] { top:-5px;    left:-5px;   cursor: nw-resize; }
      .wle-handle[data-dir="n"]  { top:-5px;    left:calc(50% - 5px); cursor: n-resize; }
      .wle-handle[data-dir="ne"] { top:-5px;    right:-5px;  cursor: ne-resize; }
      .wle-handle[data-dir="e"]  { top:calc(50% - 5px); right:-5px; cursor: e-resize; }
      .wle-handle[data-dir="se"] { bottom:-5px; right:-5px;  cursor: se-resize; }
      .wle-handle[data-dir="s"]  { bottom:-5px; left:calc(50% - 5px); cursor: s-resize; }
      .wle-handle[data-dir="sw"] { bottom:-5px; left:-5px;   cursor: sw-resize; }
      .wle-handle[data-dir="w"]  { top:calc(50% - 5px); left:-5px;  cursor: w-resize; }

      /* ── Image inline toolbar ── */
      .wle-img-toolbar {
        position: absolute;
        top: -40px;
        left: 50%;
        transform: translateX(-50%);
        background: #1f2937;
        border-radius: 8px;
        padding: 5px 8px;
        display: none;
        gap: 4px;
        z-index: 200;
        white-space: nowrap;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      }
      .wle-img-wrap.selected .wle-img-toolbar { display: flex; }
      .wle-img-toolbar button {
        background: rgba(255,255,255,0.12);
        border: none;
        color: #fff;
        padding: 4px 9px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 700;
        font-family: 'Plus Jakarta Sans', sans-serif;
        transition: background 0.15s;
      }
      .wle-img-toolbar button:hover { background: #7c3aed; }
      .wle-img-toolbar .wle-size-label {
        color: #9ca3af;
        font-size: 10px;
        line-height: 1;
        align-self: center;
        padding: 0 4px;
      }

      /* ── Image drag ghost ── */
      .wle-drag-ghost {
        position: fixed;
        pointer-events: none;
        opacity: 0.55;
        border: 2px dashed #7c3aed;
        border-radius: 4px;
        z-index: 9999;
        background: rgba(124,58,237,0.08);
      }

      /* ── Table resize cursors ── */
      .wle-editor-table {
        border-collapse: collapse;
        width: 100%;
        table-layout: fixed;
      }
      .wle-editor-table td,
      .wle-editor-table th {
        border: 1.5px solid #374151;
        padding: 8px 10px;
        min-width: ${MIN_COL_WIDTH}px;
        min-height: ${MIN_ROW_HEIGHT}px;
        position: relative;
        vertical-align: top;
      }
      .wle-editor-table th {
        background: #f5f3ff;
        font-weight: 700;
      }
      /* Column resize dragger (right edge of each cell) */
      .wle-col-dragger {
        position: absolute;
        top: 0;
        right: -3px;
        width: 6px;
        height: 100%;
        cursor: col-resize;
        z-index: 10;
        background: transparent;
      }
      .wle-col-dragger:hover,
      .wle-col-dragger.active { background: rgba(124,58,237,0.35); }
      /* Row resize dragger (bottom edge) */
      .wle-row-dragger {
        position: absolute;
        bottom: -3px;
        left: 0;
        width: 100%;
        height: 6px;
        cursor: row-resize;
        z-index: 10;
        background: transparent;
      }
      .wle-row-dragger:hover,
      .wle-row-dragger.active { background: rgba(124,58,237,0.35); }

      /* ── Table selection highlight ── */
      .wle-editor-table.selected {
        outline: 2px solid #7c3aed;
        outline-offset: 2px;
      }

      /* ── Table inline toolbar ── */
      .wle-table-toolbar {
        display: none;
        position: absolute;
        top: -40px;
        left: 0;
        background: #1f2937;
        border-radius: 8px;
        padding: 5px 8px;
        gap: 4px;
        z-index: 200;
        white-space: nowrap;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      }
      .wle-table-wrap { position: relative; display: inline-block; width: 100%; }
      .wle-table-wrap.selected .wle-table-toolbar { display: flex; }
      .wle-table-toolbar button {
        background: rgba(255,255,255,0.12);
        border: none;
        color: #fff;
        padding: 4px 9px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 700;
        font-family: 'Plus Jakarta Sans', sans-serif;
        transition: background 0.15s;
      }
      .wle-table-toolbar button:hover { background: #7c3aed; }
      .wle-table-toolbar .danger:hover { background: #dc2626; }

      /* ── New table-insert modal ── */
      #wleTableModal {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.55);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(3px);
        animation: wleFadeIn 0.18s ease;
      }
      @keyframes wleFadeIn {
        from { opacity:0; transform:scale(0.95); }
        to   { opacity:1; transform:scale(1); }
      }
      #wleTableModal .wle-modal-box {
        background: #fff;
        border-radius: 18px;
        padding: 28px 28px 24px;
        width: 360px;
        box-shadow: 0 24px 60px rgba(0,0,0,0.28);
        font-family: 'Plus Jakarta Sans', sans-serif;
      }
      #wleTableModal h3 {
        margin: 0 0 18px;
        font-size: 16px;
        font-weight: 800;
        color: #1f2937;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #wleTableModal h3 i { color: #7c3aed; }
      /* Grid picker */
      #wleGridPicker {
        display: grid;
        grid-template-columns: repeat(8, 24px);
        gap: 3px;
        margin-bottom: 14px;
      }
      .wle-grid-cell {
        width: 24px;
        height: 24px;
        border: 1.5px solid #d1d5db;
        border-radius: 3px;
        cursor: pointer;
        transition: background 0.1s, border-color 0.1s;
        background: #fff;
      }
      .wle-grid-cell.hover {
        background: #ede9fe;
        border-color: #7c3aed;
      }
      #wleGridLabel {
        font-size: 13px;
        font-weight: 700;
        color: #7c3aed;
        text-align: center;
        margin-bottom: 14px;
        min-height: 20px;
      }
      .wle-manual-inputs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-bottom: 20px;
      }
      .wle-manual-inputs label {
        font-size: 12px;
        font-weight: 700;
        color: #374151;
        display: block;
        margin-bottom: 4px;
      }
      .wle-manual-inputs input {
        width: 100%;
        padding: 9px 12px;
        border: 2px solid #e5e7eb;
        border-radius: 9px;
        font-size: 14px;
        font-family: inherit;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.15s;
      }
      .wle-manual-inputs input:focus { border-color: #7c3aed; }
      .wle-modal-actions {
        display: flex;
        gap: 10px;
      }
      .wle-btn-cancel {
        flex: 1;
        padding: 11px;
        border: 2px solid #e5e7eb;
        border-radius: 10px;
        background: #fff;
        color: #6b7280;
        font-weight: 700;
        cursor: pointer;
        font-family: inherit;
        font-size: 14px;
        transition: border-color 0.15s;
      }
      .wle-btn-cancel:hover { border-color: #9ca3af; }
      .wle-btn-insert {
        flex: 2;
        padding: 11px;
        background: linear-gradient(135deg, #7c3aed, #6d28d9);
        border: none;
        border-radius: 10px;
        color: #fff;
        font-weight: 800;
        cursor: pointer;
        font-family: inherit;
        font-size: 14px;
        transition: opacity 0.15s;
      }
      .wle-btn-insert:hover { opacity: 0.9; }

      /* ── Drop-position indicator line ── */
      .wle-drop-line {
        position: absolute;
        left: 0;
        width: 100%;
        height: 3px;
        background: #7c3aed;
        border-radius: 2px;
        pointer-events: none;
        z-index: 500;
        display: none;
      }
    `;
    document.head.appendChild(style);
  }

  /* ──────────────────────────────────────────────────────────
   * UTILITY: get all active content-editable editors
   * ────────────────────────────────────────────────────────── */
  function getEditors () {
    return Array.from(document.querySelectorAll('.editor-content[contenteditable="true"]'));
  }

  /* ──────────────────────────────────────────────────────────
   * 1. IMAGE ENHANCEMENTS
   * ────────────────────────────────────────────────────────── */

  /** Wrap a raw <img> inside the editor with our resize/drag wrapper */
  function wrapImage (img) {
    if (img.closest('.wle-img-wrap')) return; // already wrapped

    const wrap = document.createElement('span');
    wrap.className = 'wle-img-wrap';
    wrap.contentEditable = 'false';

    // Copy current dimensions
    if (img.style.width)  wrap.style.width  = img.style.width;
    if (img.style.height) wrap.style.height = img.style.height;

    // Inline toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'wle-img-toolbar';
    toolbar.innerHTML = `
      <span class="wle-size-label" id="wle-size-label"></span>
      <button title="25%" onclick="window.wleSetImgSize(this,'25%')">25%</button>
      <button title="50%" onclick="window.wleSetImgSize(this,'50%')">50%</button>
      <button title="75%" onclick="window.wleSetImgSize(this,'75%')">75%</button>
      <button title="100%" onclick="window.wleSetImgSize(this,'100%')">100%</button>
      <button title="Float left"  onclick="window.wleFloatImg(this,'left')">◧ Left</button>
      <button title="Float right" onclick="window.wleFloatImg(this,'right')">◨ Right</button>
      <button title="Remove float" onclick="window.wleFloatImg(this,'none')">☰ Inline</button>
      <button title="Delete image" onclick="window.wleDeleteImg(this)" style="color:#f87171;">✕</button>
    `;
    wrap.appendChild(toolbar);

    // 8 resize handles
    ['nw','n','ne','e','se','s','sw','w'].forEach(dir => {
      const h = document.createElement('span');
      h.className   = 'wle-handle';
      h.dataset.dir = dir;
      attachHandleResize(h, img, wrap);
      wrap.appendChild(h);
    });

    // Move the img into wrap
    img.parentNode.insertBefore(wrap, img);
    wrap.appendChild(img);

    // Click to select
    wrap.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('wle-handle')) return;
      if (e.target.closest('.wle-img-toolbar')) return;
      e.stopPropagation();
      selectImage(wrap);
      if (!e.target.closest('.wle-img-toolbar')) {
        startImageDrag(e, wrap);
      }
    });
  }

  function selectImage (wrap) {
    deselectAll();
    _activeImg = wrap;
    wrap.classList.add('selected');
    updateSizeLabel(wrap);
  }

  function deselectAll () {
    document.querySelectorAll('.wle-img-wrap.selected').forEach(w => w.classList.remove('selected'));
    document.querySelectorAll('.wle-table-wrap.selected').forEach(w => w.classList.remove('selected'));
    _activeImg   = null;
    _activeTable = null;
  }

  function updateSizeLabel (wrap) {
    const img   = wrap.querySelector('img');
    const label = wrap.querySelector('#wle-size-label');
    if (img && label) {
      label.textContent = `${Math.round(img.offsetWidth)} × ${Math.round(img.offsetHeight)}`;
    }
  }

  /* Resize handle logic */
  function attachHandleResize (handle, img, wrap) {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      _resizing = true;

      const dir       = handle.dataset.dir;
      const startX    = e.clientX;
      const startY    = e.clientY;
      const startW    = img.offsetWidth;
      const startH    = img.offsetHeight;
      const ratio     = startH / startW;   // maintain aspect if corner

      function onMove (ev) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        let newW = startW;
        let newH = startH;

        if (dir.includes('e'))  newW = Math.max(MIN_IMG_SIZE, startW + dx);
        if (dir.includes('w'))  newW = Math.max(MIN_IMG_SIZE, startW - dx);
        if (dir.includes('s'))  newH = Math.max(MIN_IMG_SIZE, startH + dy);
        if (dir.includes('n'))  newH = Math.max(MIN_IMG_SIZE, startH - dy);

        // Corner: maintain aspect ratio
        if ((dir === 'se' || dir === 'nw') && dx !== 0) newH = Math.round(newW * ratio);
        if ((dir === 'ne' || dir === 'sw') && dx !== 0) newH = Math.round(newW * ratio);

        img.style.width  = newW + 'px';
        img.style.height = newH + 'px';
        img.removeAttribute('width');
        img.removeAttribute('height');
        wrap.style.width  = newW + 'px';
        updateSizeLabel(wrap);
      }

      function onUp () {
        _resizing = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  /* Drag image to reposition */
  function startImageDrag (e, wrap) {
    if (_resizing) return;

    const editor = wrap.closest('.editor-content');
    if (!editor) return;

    let dragging    = false;
    let ghost       = null;
    let startX      = e.clientX;
    let startY      = e.clientY;
    let dropTarget  = null;

    function onMove (ev) {
      const dx = Math.abs(ev.clientX - startX);
      const dy = Math.abs(ev.clientY - startY);
      if (!dragging && (dx > 6 || dy > 6)) {
        dragging = true;
        wrap.style.opacity = '0.4';

        ghost = document.createElement('div');
        ghost.className = 'wle-drag-ghost';
        const img = wrap.querySelector('img');
        ghost.style.width  = (img?.offsetWidth  || 120) + 'px';
        ghost.style.height = (img?.offsetHeight || 80)  + 'px';
        document.body.appendChild(ghost);
      }

      if (!dragging) return;

      ghost.style.left = (ev.clientX - 20) + 'px';
      ghost.style.top  = (ev.clientY - 20) + 'px';

      // Find insertion point inside editor
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (el && editor.contains(el) && el !== wrap && !wrap.contains(el)) {
        dropTarget = el;
      }
    }

    function onUp () {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);

      wrap.style.opacity = '';
      if (ghost) { ghost.remove(); ghost = null; }

      if (!dragging) return;

      // Insert wrap before the drop target element
      if (dropTarget && editor.contains(dropTarget) && dropTarget !== wrap) {
        const blockEl = dropTarget.closest('p, div, h1, h2, h3, li, br') || dropTarget;
        if (blockEl && editor.contains(blockEl)) {
          editor.insertBefore(wrap, blockEl);
        }
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  /* Public helpers used by toolbar buttons */
  window.wleSetImgSize = function (btn, size) {
    const wrap = btn.closest('.wle-img-wrap');
    const img  = wrap?.querySelector('img');
    if (!img) return;
    if (size.endsWith('%')) {
      const editorW = wrap.closest('.editor-content')?.offsetWidth || 600;
      const px = Math.round(editorW * parseFloat(size) / 100);
      img.style.width  = px + 'px';
      img.style.height = 'auto';
      wrap.style.width = px + 'px';
    } else {
      img.style.width  = size;
      img.style.height = 'auto';
      wrap.style.width = size;
    }
    updateSizeLabel(wrap);
  };

  window.wleFloatImg = function (btn, dir) {
    const wrap = btn.closest('.wle-img-wrap');
    if (!wrap) return;
    if (dir === 'left')  { wrap.style.float = 'left';  wrap.style.margin = '8px 16px 8px 0'; }
    if (dir === 'right') { wrap.style.float = 'right'; wrap.style.margin = '8px 0 8px 16px'; }
    if (dir === 'none')  { wrap.style.float = '';      wrap.style.margin = '8px 0'; }
  };

  window.wleDeleteImg = function (btn) {
    const wrap = btn.closest('.wle-img-wrap');
    if (wrap) wrap.remove();
  };

  /* ──────────────────────────────────────────────────────────
   * 2. TABLE ENHANCEMENTS
   * ────────────────────────────────────────────────────────── */

  function enhanceTable (table) {
    if (table.classList.contains('wle-enhanced')) return;
    table.classList.add('wle-enhanced', 'wle-editor-table');

    // Wrap in a positioned div for toolbar
    if (!table.closest('.wle-table-wrap')) {
      const wrap = document.createElement('div');
      wrap.className = 'wle-table-wrap';

      // Inline toolbar
      const tb = document.createElement('div');
      tb.className = 'wle-table-toolbar';
      tb.innerHTML = `
        <button onclick="window.wleAddRow(this)">＋ Row</button>
        <button onclick="window.wleAddCol(this)">＋ Col</button>
        <button onclick="window.wleDelRow(this)" class="danger">− Row</button>
        <button onclick="window.wleDelCol(this)" class="danger">− Col</button>
        <button onclick="window.wleDelTable(this)" class="danger">🗑 Delete Table</button>
      `;
      wrap.appendChild(tb);

      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);

      wrap.addEventListener('mousedown', (e) => {
        if (e.target.closest('.wle-table-toolbar')) return;
        if (e.target.classList.contains('wle-col-dragger')) return;
        if (e.target.classList.contains('wle-row-dragger')) return;
        deselectAll();
        _activeTable = wrap;
        wrap.classList.add('selected');
      });
    }

    // Add col & row draggers to every cell
    table.querySelectorAll('td, th').forEach(cell => {
      addCellDraggers(cell);
    });
  }

  function addCellDraggers (cell) {
    // Column dragger (right edge)
    if (!cell.querySelector('.wle-col-dragger')) {
      const cd = document.createElement('div');
      cd.className = 'wle-col-dragger';
      cell.appendChild(cd);
      cd.addEventListener('mousedown', (e) => startColResize(e, cell));
    }
    // Row dragger (bottom edge) — only on first cell per row
    if (cell.cellIndex === 0 && !cell.querySelector('.wle-row-dragger')) {
      const rd = document.createElement('div');
      rd.className = 'wle-row-dragger';
      cell.appendChild(rd);
      rd.addEventListener('mousedown', (e) => startRowResize(e, cell.closest('tr')));
    }
  }

  function startColResize (e, cell) {
    e.preventDefault();
    e.stopPropagation();

    const table    = cell.closest('table');
    const colIndex = cell.cellIndex;
    const startX   = e.clientX;
    const startW   = cell.offsetWidth;

    cell.querySelector('.wle-col-dragger').classList.add('active');

    function onMove (ev) {
      const newW = Math.max(MIN_COL_WIDTH, startW + (ev.clientX - startX));
      // Apply to all cells in that column
      Array.from(table.rows).forEach(row => {
        const c = row.cells[colIndex];
        if (c) { c.style.width = newW + 'px'; }
      });
    }

    function onUp () {
      cell.querySelector('.wle-col-dragger')?.classList.remove('active');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  function startRowResize (e, row) {
    e.preventDefault();
    e.stopPropagation();

    const startY  = e.clientY;
    const startH  = row.offsetHeight;

    const firstCell = row.cells[0];
    firstCell?.querySelector('.wle-row-dragger')?.classList.add('active');

    function onMove (ev) {
      const newH = Math.max(MIN_ROW_HEIGHT, startH + (ev.clientY - startY));
      Array.from(row.cells).forEach(c => { c.style.height = newH + 'px'; });
    }

    function onUp () {
      firstCell?.querySelector('.wle-row-dragger')?.classList.remove('active');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  /* Public table toolbar helpers */
  window.wleAddRow = function (btn) {
    const table = btn.closest('.wle-table-wrap')?.querySelector('table');
    if (!table) return;
    const lastRow  = table.rows[table.rows.length - 1];
    const newRow   = table.insertRow();
    for (let i = 0; i < lastRow.cells.length; i++) {
      const td = newRow.insertCell();
      td.contentEditable = 'true';
      td.style.cssText   = 'border:1.5px solid #374151;padding:8px 10px;';
      addCellDraggers(td);
    }
  };

  window.wleAddCol = function (btn) {
    const table = btn.closest('.wle-table-wrap')?.querySelector('table');
    if (!table) return;
    Array.from(table.rows).forEach((row, ri) => {
      const isHeader = ri === 0;
      const cell     = isHeader ? document.createElement('th') : document.createElement('td');
      cell.contentEditable = 'true';
      cell.style.cssText   = `border:1.5px solid #374151;padding:8px 10px;${isHeader ? 'background:#f5f3ff;font-weight:700;' : ''}`;
      row.appendChild(cell);
      addCellDraggers(cell);
    });
  };

  window.wleDelRow = function (btn) {
    const table = btn.closest('.wle-table-wrap')?.querySelector('table');
    if (!table || table.rows.length <= 1) return;
    table.deleteRow(table.rows.length - 1);
  };

  window.wleDelCol = function (btn) {
    const table = btn.closest('.wle-table-wrap')?.querySelector('table');
    if (!table || !table.rows[0] || table.rows[0].cells.length <= 1) return;
    const lastCol = table.rows[0].cells.length - 1;
    Array.from(table.rows).forEach(row => {
      if (row.cells[lastCol]) row.deleteCell(lastCol);
    });
  };

  window.wleDelTable = function (btn) {
    const wrap = btn.closest('.wle-table-wrap');
    if (wrap) wrap.remove();
  };

  /* ──────────────────────────────────────────────────────────
   * 3. BEAUTIFUL TABLE INSERT MODAL (replaces old insertTable)
   * ────────────────────────────────────────────────────────── */
  function openWleTableModal (editorIndex) {
    document.getElementById('wleTableModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'wleTableModal';

    let hoverR = 0, hoverC = 0;

    modal.innerHTML = `
      <div class="wle-modal-box">
        <h3><i class="fas fa-table"></i> Insert Table</h3>
        <div id="wleGridPicker"></div>
        <div id="wleGridLabel">Hover to select size</div>
        <div class="wle-manual-inputs">
          <div>
            <label>Rows</label>
            <input type="number" id="wleRowsIn" value="3" min="1" max="20">
          </div>
          <div>
            <label>Columns</label>
            <input type="number" id="wleColsIn" value="3" min="1" max="12">
          </div>
        </div>
        <div class="wle-modal-actions">
          <button class="wle-btn-cancel" id="wleCancelTable">Cancel</button>
          <button class="wle-btn-insert" id="wleInsertTable">
            <i class="fas fa-table"></i>&nbsp; Insert Table
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Build grid
    const picker = document.getElementById('wleGridPicker');
    const MAXR = 8, MAXC = 8;
    for (let r = 1; r <= MAXR; r++) {
      for (let c = 1; c <= MAXC; c++) {
        const cell = document.createElement('div');
        cell.className    = 'wle-grid-cell';
        cell.dataset.r    = r;
        cell.dataset.c    = c;
        cell.title        = `${r} × ${c}`;
        picker.appendChild(cell);

        cell.addEventListener('mouseenter', () => {
          hoverR = r; hoverC = c;
          document.getElementById('wleRowsIn').value = r;
          document.getElementById('wleColsIn').value = c;
          document.getElementById('wleGridLabel').textContent = `${r} rows × ${c} columns`;
          picker.querySelectorAll('.wle-grid-cell').forEach(cl => {
            const cr = parseInt(cl.dataset.r);
            const cc = parseInt(cl.dataset.c);
            cl.classList.toggle('hover', cr <= r && cc <= c);
          });
        });

        cell.addEventListener('click', () => doInsert());
      }
    }

    // Sync manual inputs → grid highlight
    ['wleRowsIn','wleColsIn'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => {
        const r = parseInt(document.getElementById('wleRowsIn').value) || 1;
        const c = parseInt(document.getElementById('wleColsIn').value) || 1;
        hoverR = r; hoverC = c;
        picker.querySelectorAll('.wle-grid-cell').forEach(cl => {
          cl.classList.toggle('hover',
            parseInt(cl.dataset.r) <= r && parseInt(cl.dataset.c) <= c);
        });
        document.getElementById('wleGridLabel').textContent = `${r} rows × ${c} columns`;
      });
    });

    document.getElementById('wleCancelTable').onclick = () => modal.remove();
    document.getElementById('wleInsertTable').onclick = () => doInsert();
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    function doInsert () {
      const rows = parseInt(document.getElementById('wleRowsIn').value) || 3;
      const cols = parseInt(document.getElementById('wleColsIn').value) || 3;
      modal.remove();
      insertEnhancedTable(editorIndex, rows, cols);
    }
  }

  /* Build and insert the actual table HTML */
  function insertEnhancedTable (editorIndex, rows, cols) {
    const editor = document.getElementById(`editor-${editorIndex}`)
                || document.getElementById(`editEditor_${editorIndex}`);
    if (!editor) return;

    const colW    = Math.floor(100 / cols);
    const cellBase = 'border:1.5px solid #374151;padding:8px 10px;min-width:60px;vertical-align:top;position:relative;';

    let html = `<br>
      <div class="wle-table-wrap" contenteditable="false">
        <div class="wle-table-toolbar">
          <button onclick="window.wleAddRow(this)">＋ Row</button>
          <button onclick="window.wleAddCol(this)">＋ Col</button>
          <button onclick="window.wleDelRow(this)" class="danger">− Row</button>
          <button onclick="window.wleDelCol(this)" class="danger">− Col</button>
          <button onclick="window.wleDelTable(this)" class="danger">🗑 Delete</button>
        </div>
        <table class="wle-editor-table wle-enhanced" style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <colgroup>${Array(cols).fill(`<col style="width:${colW}%">`).join('')}</colgroup>
          <thead>
            <tr style="background:#f5f3ff;">
              ${Array.from({length:cols}, (_,i) => `
                <th contenteditable="true"
                    style="${cellBase}background:#f5f3ff;font-weight:700;">
                  Header ${i+1}
                  <div class="wle-col-dragger"></div>
                  <div class="wle-row-dragger"></div>
                </th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${Array.from({length:rows-1}, () => `
              <tr>
                ${Array.from({length:cols}, (_,i) => `
                  <td contenteditable="true" style="${cellBase}">
                    ${i === 0 ? '<div class="wle-row-dragger"></div>' : ''}
                    <div class="wle-col-dragger"></div>
                  </td>`).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div><br>`;

    editor.focus();
    document.execCommand('insertHTML', false, html);

    // After insertion, wire up draggers that were just inserted
    setTimeout(() => {
      editor.querySelectorAll('.wle-editor-table:not(.wle-dragger-wired)').forEach(t => {
        t.classList.add('wle-dragger-wired');
        t.querySelectorAll('.wle-col-dragger').forEach(cd => {
          const cell = cd.closest('td, th');
          if (cell) cd.addEventListener('mousedown', (e) => startColResize(e, cell));
        });
        t.querySelectorAll('.wle-row-dragger').forEach(rd => {
          const row = rd.closest('tr');
          if (row) rd.addEventListener('mousedown', (e) => startRowResize(e, row));
        });
        t.querySelectorAll('td, th').forEach(cell => makeTableCellNavigable(cell, t));
      });
      // Toolbar wiring
      editor.querySelectorAll('.wle-table-wrap').forEach(wrap => {
        wrap.addEventListener('mousedown', (e) => {
          if (e.target.closest('.wle-table-toolbar')) return;
          deselectAll();
          _activeTable = wrap;
          wrap.classList.add('selected');
        });
      });
    }, 80);
  }

  /* Tab-navigation inside table cells */
  function makeTableCellNavigable (cell, table) {
    cell.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      const cells = Array.from(table.querySelectorAll('td, th'));
      const idx   = cells.indexOf(cell);
      if (idx < cells.length - 1) {
        cells[idx + 1].focus();
      } else {
        // Add new row
        const colCount = table.rows[0].cells.length;
        const newRow   = table.insertRow();
        for (let i = 0; i < colCount; i++) {
          const td = newRow.insertCell();
          td.contentEditable = 'true';
          td.style.cssText   = 'border:1.5px solid #374151;padding:8px 10px;position:relative;';
          const cd = document.createElement('div');
          cd.className = 'wle-col-dragger';
          cd.addEventListener('mousedown', (ev) => startColResize(ev, td));
          td.appendChild(cd);
          if (i === 0) {
            const rd = document.createElement('div');
            rd.className = 'wle-row-dragger';
            rd.addEventListener('mousedown', (ev) => startRowResize(ev, newRow));
            td.appendChild(rd);
          }
          makeTableCellNavigable(td, table);
        }
        newRow.cells[0].focus();
      }
    });
  }

  /* ──────────────────────────────────────────────────────────
   * 4. OVERRIDE insertTable function
   * ────────────────────────────────────────────────────────── */
  window.insertTable = function (editorIndex) {
    openWleTableModal(editorIndex);
  };

  /* ──────────────────────────────────────────────────────────
   * 5. MUTATION OBSERVER — auto-enhance newly inserted content
   * ────────────────────────────────────────────────────────── */
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        // Enhance images
        const imgs = node.tagName === 'IMG'
          ? [node]
          : Array.from(node.querySelectorAll('img'));
        imgs.forEach(img => {
          if (img.closest('.wle-img-toolbar')) return;
          if (img.closest('.editor-content')) wrapImage(img);
        });
        // Enhance tables
        const tables = node.tagName === 'TABLE'
          ? [node]
          : Array.from(node.querySelectorAll('table'));
        tables.forEach(t => {
          if (t.closest('.editor-content') && !t.closest('.wle-table-toolbar')) enhanceTable(t);
        });
      });
    });
  });

  /* ──────────────────────────────────────────────────────────
   * 6. INITIALISE on editors that already exist + new ones
   * ────────────────────────────────────────────────────────── */
  function initEditors () {
    getEditors().forEach(editor => {
      // Enhance existing images
      editor.querySelectorAll('img').forEach(img => {
        if (!img.closest('.wle-img-toolbar')) wrapImage(img);
      });
      // Enhance existing tables
      editor.querySelectorAll('table').forEach(t => {
        if (!t.closest('.wle-table-toolbar')) enhanceTable(t);
      });
      // Observe for future changes
      observer.observe(editor, { childList: true, subtree: true });
    });
  }

  /* ──────────────────────────────────────────────────────────
   * 7. CLICK-OUTSIDE to deselect
   * ────────────────────────────────────────────────────────── */
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.wle-img-wrap') &&
        !e.target.closest('.wle-table-wrap') &&
        !e.target.closest('.wle-img-toolbar') &&
        !e.target.closest('#wleTableModal')) {
      deselectAll();
    }
  });

  /* ──────────────────────────────────────────────────────────
   * 8. Re-run initEditors when modals open (they add new editors)
   * ────────────────────────────────────────────────────────── */
  const _origOpenCreate = window.openCreateChapterModal;
  window.openCreateChapterModal = function (...args) {
    _origOpenCreate?.apply(this, args);
    setTimeout(initEditors, 300);
  };

  const _origOpenEdit = window.openEditChapterModal;
  window.openEditChapterModal = function (...args) {
    _origOpenEdit?.apply(this, args);
    setTimeout(initEditors, 400);
  };

  /* Also re-init whenever addNewTopic / addEditTopic fires */
  const _origAddTopic = window.addNewTopic;
  window.addNewTopic = function (...args) {
    _origAddTopic?.apply(this, args);
    setTimeout(initEditors, 200);
  };

  const _origAddEditTopic = window.addEditTopic;
  window.addEditTopic = function (...args) {
    _origAddEditTopic?.apply(this, args);
    setTimeout(initEditors, 200);
  };

  /* ──────────────────────────────────────────────────────────
   * BOOT
   * ────────────────────────────────────────────────────────── */
  injectStyles();

  // Run after DOM + existing scripts have settled
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initEditors, 500));
  } else {
    setTimeout(initEditors, 500);
  }

  // Periodic sweep for lazily-rendered editors (e.g. tab switches)
  setInterval(initEditors, 2000);

  console.log('✅ ASAI Editor Enhancements loaded — Word-like image & table editing active');
})();