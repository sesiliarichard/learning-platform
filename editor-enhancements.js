/**
 * ============================================================
 * ASAI LMS — Word-Like Editor Enhancements  (patched build)
 * ============================================================
 * HOW TO USE:
 *   In admin.html, AFTER all other <script> tags:
 *   <script src="editor-enhancements.js"></script>
 *
 * FIXES IN THIS BUILD:
 *   • MutationObserver TypeError (editor-font-fix.js:715)
 *     → SafeMutationObserver wrapper guards every .observe() call
 *
 * FEATURES:
 *   1. Image resize handles (8-point, corner keeps aspect ratio)
 *   2. Image float toolbar (Left / Inline / Right + %-size buttons)
 *   3. Image drag-to-reposition inside editor
 *   4. Table column resize (drag right edge of any cell)
 *   5. Table row resize (drag bottom edge of any row)
 *   6. Table inline toolbar (Add/Delete row, col, whole table)
 *   7. Beautiful Insert-Table modal with grid picker
 *   8. Tab-key navigation between cells (auto-adds row at end)
 *   9. Auto-enhances editors opened via chapter / topic modals
 * ============================================================
 */

(function () {
  'use strict';

  /* ============================================================
   * 0.  PATCH MutationObserver
   *     editor-font-fix.js:715 calls .observe() with a non-Node
   *     (often a plain object or null). This wrapper silently
   *     skips those bad calls instead of throwing.
   * ============================================================ */
  (function patchMutationObserver () {
    const Native = window.MutationObserver;
    if (Native.__asai_patched) return;

    class SafeMutationObserver extends Native {
      observe (target, options) {
        if (!(target instanceof Node)) {
          console.warn(
            '[ASAI] MutationObserver.observe() skipped — target is not a Node:',
            target
          );
          return;          // ← this is the fix for editor-font-fix.js:715
        }
        super.observe(target, options);
      }
    }
    SafeMutationObserver.__asai_patched = true;
    window.MutationObserver = SafeMutationObserver;
  })();


  /* ============================================================
   * CONSTANTS & SHARED STATE
   * ============================================================ */
  const HANDLE_SIZE    = 10;
  const MIN_IMG_SIZE   = 40;
  const MIN_COL_WIDTH  = 30;
  const MIN_ROW_HEIGHT = 20;

  let _activeImg   = null;
  let _activeTable = null;
  let _resizing    = false;


  /* ============================================================
   * STYLES
   * ============================================================ */
  function injectStyles () {
    if (document.getElementById('wle-styles')) return;
    const s = document.createElement('style');
    s.id = 'wle-styles';
    s.textContent = `
      /* ── image wrapper ── */
      .wle-img-wrap {
        display: inline-block;
        position: relative;
        line-height: 0;
        user-select: none;
        cursor: grab;
        transition: outline 0.12s;
        max-width: 100%;
      }
      .wle-img-wrap.selected { outline: 2px solid #7c3aed; outline-offset: 1px; }
      .wle-img-wrap img      { display: block; max-width: 100%; height: auto; }

      /* ── 8 resize handles ── */
      .wle-handle {
        position: absolute;
        width: ${HANDLE_SIZE}px; height: ${HANDLE_SIZE}px;
        background: #7c3aed;
        border: 2px solid #fff;
        border-radius: 2px;
        z-index: 100;
        box-shadow: 0 1px 4px rgba(0,0,0,.35);
        display: none;
      }
      .wle-img-wrap.selected .wle-handle { display: block; }
      .wle-handle[data-dir="nw"] { top:-5px;left:-5px;cursor:nw-resize; }
      .wle-handle[data-dir="n"]  { top:-5px;left:calc(50% - 5px);cursor:n-resize; }
      .wle-handle[data-dir="ne"] { top:-5px;right:-5px;cursor:ne-resize; }
      .wle-handle[data-dir="e"]  { top:calc(50% - 5px);right:-5px;cursor:e-resize; }
      .wle-handle[data-dir="se"] { bottom:-5px;right:-5px;cursor:se-resize; }
      .wle-handle[data-dir="s"]  { bottom:-5px;left:calc(50% - 5px);cursor:s-resize; }
      .wle-handle[data-dir="sw"] { bottom:-5px;left:-5px;cursor:sw-resize; }
      .wle-handle[data-dir="w"]  { top:calc(50% - 5px);left:-5px;cursor:w-resize; }

      /* ── image floating toolbar ── */
      .wle-img-toolbar {
        position: absolute;
        top: -44px; left: 50%;
        transform: translateX(-50%);
        background: #1f2937;
        border-radius: 8px;
        padding: 5px 8px;
        display: none; gap: 4px;
        z-index: 200;
        white-space: nowrap;
        box-shadow: 0 4px 16px rgba(0,0,0,.4);
      }
      .wle-img-wrap.selected .wle-img-toolbar { display: flex; }
      .wle-img-toolbar button {
        background: rgba(255,255,255,.12);
        border: none; color: #fff;
        padding: 4px 9px; border-radius: 5px;
        cursor: pointer; font-size: 11px; font-weight: 700;
        font-family: 'Plus Jakarta Sans', sans-serif;
        transition: background 0.15s;
      }
      .wle-img-toolbar button:hover { background: #7c3aed; }
      .wle-img-toolbar .wle-size-label {
        color: #9ca3af; font-size: 10px;
        line-height: 1; align-self: center; padding: 0 4px;
      }

      /* ── drag ghost ── */
      .wle-drag-ghost {
        position: fixed; pointer-events: none; opacity: .55;
        border: 2px dashed #7c3aed; border-radius: 4px; z-index: 9999;
        background: rgba(124,58,237,.08);
      }

      /* ── table base ── */
      .wle-editor-table {
        border-collapse: collapse; width: 100%; table-layout: fixed;
      }
      .wle-editor-table td,
      .wle-editor-table th {
        border: 1.5px solid #374151;
        padding: 8px 10px;
        min-width: ${MIN_COL_WIDTH}px;
        position: relative; vertical-align: top;
      }
      .wle-editor-table th {
        background: #f5f3ff; font-weight: 700;
      }

      /* ── column / row draggers ── */
      .wle-col-dragger {
        position: absolute; top: 0; right: -3px;
        width: 6px; height: 100%; cursor: col-resize; z-index: 10;
        background: transparent;
      }
      .wle-col-dragger:hover, .wle-col-dragger.active { background: rgba(124,58,237,.35); }
      .wle-row-dragger {
        position: absolute; bottom: -3px; left: 0;
        width: 100%; height: 6px; cursor: row-resize; z-index: 10;
        background: transparent;
      }
      .wle-row-dragger:hover, .wle-row-dragger.active { background: rgba(124,58,237,.35); }

      /* ── table wrapper / toolbar ── */
      .wle-table-wrap { position: relative; display: inline-block; width: 100%; }
      .wle-table-wrap.selected .wle-editor-table { outline: 2px solid #7c3aed; outline-offset: 2px; }
      .wle-table-toolbar {
        display: none; position: absolute;
        top: -40px; left: 0;
        background: #1f2937; border-radius: 8px;
        padding: 5px 8px; gap: 4px; z-index: 200;
        white-space: nowrap; box-shadow: 0 4px 16px rgba(0,0,0,.4);
      }
      .wle-table-wrap.selected .wle-table-toolbar { display: flex; }
      .wle-table-toolbar button {
        background: rgba(255,255,255,.12); border: none; color: #fff;
        padding: 4px 9px; border-radius: 5px; cursor: pointer;
        font-size: 11px; font-weight: 700;
        font-family: 'Plus Jakarta Sans', sans-serif; transition: background .15s;
      }
      .wle-table-toolbar button:hover        { background: #7c3aed; }
      .wle-table-toolbar button.danger:hover { background: #dc2626; }

      /* ── Insert Table modal ── */
      #wleTableModal {
        position: fixed; inset: 0;
        background: rgba(0,0,0,.55); z-index: 99999;
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(3px);
        animation: wleFadeIn .18s ease;
      }
      @keyframes wleFadeIn {
        from { opacity:0; transform:scale(.95); }
        to   { opacity:1; transform:scale(1);   }
      }
      #wleTableModal .wle-modal-box {
        background: #fff; border-radius: 18px;
        padding: 28px 28px 24px; width: 360px;
        box-shadow: 0 24px 60px rgba(0,0,0,.28);
        font-family: 'Plus Jakarta Sans', sans-serif;
      }
      #wleTableModal h3 {
        margin: 0 0 18px; font-size: 16px; font-weight: 800;
        color: #1f2937; display: flex; align-items: center; gap: 8px;
      }
      #wleGridPicker {
        display: grid; grid-template-columns: repeat(8, 24px);
        gap: 3px; margin-bottom: 14px;
      }
      .wle-grid-cell {
        width: 24px; height: 24px;
        border: 1.5px solid #d1d5db; border-radius: 3px;
        cursor: pointer; transition: background .1s, border-color .1s;
        background: #fff;
      }
      .wle-grid-cell.hover { background: #ede9fe; border-color: #7c3aed; }
      #wleGridLabel {
        font-size: 13px; font-weight: 700; color: #7c3aed;
        text-align: center; margin-bottom: 14px; min-height: 20px;
      }
      .wle-manual-inputs {
        display: grid; grid-template-columns: 1fr 1fr;
        gap: 10px; margin-bottom: 20px;
      }
      .wle-manual-inputs label {
        font-size: 12px; font-weight: 700;
        color: #374151; display: block; margin-bottom: 4px;
      }
      .wle-manual-inputs input {
        width: 100%; padding: 9px 12px;
        border: 2px solid #e5e7eb; border-radius: 9px;
        font-size: 14px; font-family: inherit; outline: none;
        box-sizing: border-box; transition: border-color .15s;
      }
      .wle-manual-inputs input:focus { border-color: #7c3aed; }
      .wle-modal-actions { display: flex; gap: 10px; }
      .wle-btn-cancel {
        flex: 1; padding: 11px;
        border: 2px solid #e5e7eb; border-radius: 10px;
        background: #fff; color: #6b7280; font-weight: 700;
        cursor: pointer; font-family: inherit; font-size: 14px;
        transition: border-color .15s;
      }
      .wle-btn-cancel:hover { border-color: #9ca3af; }
      .wle-btn-insert {
        flex: 2; padding: 11px;
        background: linear-gradient(135deg, #7c3aed, #6d28d9);
        border: none; border-radius: 10px; color: #fff;
        font-weight: 800; cursor: pointer; font-family: inherit;
        font-size: 14px; transition: opacity .15s;
      }
      .wle-btn-insert:hover { opacity: .9; }
    `;
    document.head.appendChild(s);
  }


  /* ============================================================
   * UTILITIES
   * ============================================================ */
  function getEditors () {
    return Array.from(
      document.querySelectorAll('.editor-content[contenteditable="true"]')
    );
  }

  function deselectAll () {
    document.querySelectorAll('.wle-img-wrap.selected, .wle-table-wrap.selected')
            .forEach(el => el.classList.remove('selected'));
    _activeImg   = null;
    _activeTable = null;
  }

  function updateSizeLabel (wrap) {
    const img   = wrap.querySelector('img');
    const label = wrap.querySelector('.wle-size-label');
    if (img && label) {
      label.textContent =
        `${Math.round(img.offsetWidth)} × ${Math.round(img.offsetHeight)}`;
    }
  }


  /* ============================================================
   * 1.  IMAGE — wrap, resize, drag
   * ============================================================ */
  function wrapImage (img) {
    if (img.closest('.wle-img-wrap')) return;

    const wrap = document.createElement('span');
    wrap.className       = 'wle-img-wrap';
    wrap.contentEditable = 'false';
    if (img.style.width)  wrap.style.width  = img.style.width;
    if (img.style.height) wrap.style.height = img.style.height;

    /* floating toolbar */
    const toolbar = document.createElement('div');
    toolbar.className = 'wle-img-toolbar';
    toolbar.innerHTML = `
      <span class="wle-size-label"></span>
      <button data-size="25%">25%</button>
      <button data-size="50%">50%</button>
      <button data-size="75%">75%</button>
      <button data-size="100%">100%</button>
      <button data-float="left">◧ Left</button>
      <button data-float="none">☰ Inline</button>
      <button data-float="right">◨ Right</button>
      <button data-del style="color:#f87171;">✕ Delete</button>
    `;
    wrap.appendChild(toolbar);

    toolbar.addEventListener('mousedown', e => e.stopPropagation());
    toolbar.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.size)  { setImgSize(wrap, btn.dataset.size); }
      if (btn.dataset.float) { setImgFloat(wrap, btn.dataset.float); }
      if ('del' in btn.dataset) { wrap.remove(); }
    });

    /* 8 resize handles */
    ['nw','n','ne','e','se','s','sw','w'].forEach(dir => {
      const h = document.createElement('span');
      h.className   = 'wle-handle';
      h.dataset.dir = dir;
      attachHandleResize(h, img, wrap);
      wrap.appendChild(h);
    });

    img.parentNode.insertBefore(wrap, img);
    wrap.appendChild(img);

    /* select + drag */
    wrap.addEventListener('mousedown', e => {
      if (e.target.classList.contains('wle-handle')) return;
      e.stopPropagation();
      deselectAll();
      _activeImg = wrap;
      wrap.classList.add('selected');
      updateSizeLabel(wrap);
      startImageDrag(e, wrap);
    });
  }

  function setImgSize (wrap, pct) {
    const img     = wrap.querySelector('img');
    const editorW = wrap.closest('.editor-content')?.offsetWidth || 600;
    const px      = Math.round(editorW * parseFloat(pct) / 100);
    img.style.width  = px + 'px';
    img.style.height = 'auto';
    wrap.style.width = px + 'px';
    updateSizeLabel(wrap);
  }

  function setImgFloat (wrap, dir) {
    const map = {
      left:  { float: 'left',  margin: '8px 16px 8px 0' },
      right: { float: 'right', margin: '8px 0 8px 16px' },
      none:  { float: '',      margin: '8px 0' },
    };
    Object.assign(wrap.style, map[dir]);
  }

  /* Resize handle */
  function attachHandleResize (handle, img, wrap) {
    handle.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      _resizing = true;

      const dir    = handle.dataset.dir;
      const startX = e.clientX, startY = e.clientY;
      const startW = img.offsetWidth, startH = img.offsetHeight;
      const ratio  = startH / startW;

      const onMove = ev => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        let newW = startW, newH = startH;

        if (dir.includes('e')) newW = Math.max(MIN_IMG_SIZE, startW + dx);
        if (dir.includes('w')) newW = Math.max(MIN_IMG_SIZE, startW - dx);
        if (dir.includes('s')) newH = Math.max(MIN_IMG_SIZE, startH + dy);
        if (dir.includes('n')) newH = Math.max(MIN_IMG_SIZE, startH - dy);

        /* corners keep aspect ratio */
        if ((dir === 'se' || dir === 'nw' || dir === 'ne' || dir === 'sw') && dx !== 0) {
          newH = Math.round(newW * ratio);
        }

        img.style.width  = newW + 'px';
        img.style.height = newH + 'px';
        img.removeAttribute('width');
        img.removeAttribute('height');
        wrap.style.width = newW + 'px';
        updateSizeLabel(wrap);
      };

      const onUp = () => {
        _resizing = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  /* Drag image to new position */
  function startImageDrag (e, wrap) {
    if (_resizing) return;
    const editor = wrap.closest('.editor-content');
    if (!editor) return;

    let dragging = false, ghost = null, dropTarget = null;
    const startX = e.clientX, startY = e.clientY;

    const onMove = ev => {
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

      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (el && editor.contains(el) && !wrap.contains(el)) dropTarget = el;
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      wrap.style.opacity = '';
      ghost?.remove(); ghost = null;
      if (!dragging) return;

      if (dropTarget && editor.contains(dropTarget) && dropTarget !== wrap) {
        const block = dropTarget.closest('p,div,h1,h2,h3,li') || dropTarget;
        if (block && editor.contains(block)) editor.insertBefore(wrap, block);
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }


  /* ============================================================
   * 2.  TABLE — wrap, col resize, row resize, toolbar
   * ============================================================ */
  function enhanceTable (table) {
    if (table.classList.contains('wle-enhanced')) return;
    table.classList.add('wle-enhanced', 'wle-editor-table');

    if (!table.closest('.wle-table-wrap')) {
      const wrap = document.createElement('div');
      wrap.className = 'wle-table-wrap';

      const tb = document.createElement('div');
      tb.className = 'wle-table-toolbar';
      tb.innerHTML = `
        <button data-act="addRow">＋ Row</button>
        <button data-act="addCol">＋ Col</button>
        <button data-act="delRow" class="danger">− Row</button>
        <button data-act="delCol" class="danger">− Col</button>
        <button data-act="delTable" class="danger">🗑 Delete</button>
      `;
      tb.addEventListener('click', e => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const tbl = wrap.querySelector('table');
        tableAct(btn.dataset.act, tbl, wrap);
      });

      wrap.appendChild(tb);
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);

      wrap.addEventListener('mousedown', e => {
        if (e.target.closest('.wle-table-toolbar, .wle-col-dragger, .wle-row-dragger')) return;
        deselectAll();
        _activeTable = wrap;
        wrap.classList.add('selected');
      });
    }

    table.querySelectorAll('td, th').forEach(addCellDraggers);
  }

  function tableAct (act, table, wrap) {
    if (!table) return;
    switch (act) {
      case 'addRow': {
        const last   = table.rows[table.rows.length - 1];
        const newRow = table.insertRow();
        for (let i = 0; i < last.cells.length; i++) {
          const td = newRow.insertCell();
          td.contentEditable = 'true';
          td.style.cssText   = 'border:1.5px solid #374151;padding:8px 10px;position:relative;';
          addCellDraggers(td);
          makeNavCell(td, table);
        }
        break;
      }
      case 'addCol': {
        Array.from(table.rows).forEach((row, ri) => {
          const isH  = ri === 0;
          const cell = document.createElement(isH ? 'th' : 'td');
          cell.contentEditable = 'true';
          cell.style.cssText   = `border:1.5px solid #374151;padding:8px 10px;position:relative;${isH ? 'background:#f5f3ff;font-weight:700;' : ''}`;
          row.appendChild(cell);
          addCellDraggers(cell);
          makeNavCell(cell, table);
        });
        break;
      }
      case 'delRow':
        if (table.rows.length > 1) table.deleteRow(table.rows.length - 1);
        break;
      case 'delCol': {
        const last = table.rows[0]?.cells.length - 1;
        if (last >= 1) Array.from(table.rows).forEach(r => r.cells[last] && r.deleteCell(last));
        break;
      }
      case 'delTable':
        wrap?.remove();
        break;
    }
  }

  function addCellDraggers (cell) {
    if (!cell.querySelector('.wle-col-dragger')) {
      const cd = document.createElement('div');
      cd.className = 'wle-col-dragger';
      cell.appendChild(cd);
      cd.addEventListener('mousedown', e => startColResize(e, cell));
    }
    if (cell.cellIndex === 0 && !cell.querySelector('.wle-row-dragger')) {
      const rd = document.createElement('div');
      rd.className = 'wle-row-dragger';
      cell.appendChild(rd);
      rd.addEventListener('mousedown', e => startRowResize(e, cell.closest('tr')));
    }
  }

  function startColResize (e, cell) {
    e.preventDefault(); e.stopPropagation();
    const table    = cell.closest('table');
    const colIndex = cell.cellIndex;
    const startX   = e.clientX, startW = cell.offsetWidth;
    const grip     = cell.querySelector('.wle-col-dragger');
    grip?.classList.add('active');

    const onMove = ev => {
      const newW = Math.max(MIN_COL_WIDTH, startW + ev.clientX - startX);
      Array.from(table.rows).forEach(row => {
        const c = row.cells[colIndex];
        if (c) c.style.width = newW + 'px';
      });
    };
    const onUp = () => {
      grip?.classList.remove('active');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  function startRowResize (e, row) {
    e.preventDefault(); e.stopPropagation();
    const startY = e.clientY, startH = row.offsetHeight;
    const grip   = row.cells[0]?.querySelector('.wle-row-dragger');
    grip?.classList.add('active');

    const onMove = ev => {
      const newH = Math.max(MIN_ROW_HEIGHT, startH + ev.clientY - startY);
      Array.from(row.cells).forEach(c => { c.style.height = newH + 'px'; });
    };
    const onUp = () => {
      grip?.classList.remove('active');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  /* Tab navigation between cells */
  function makeNavCell (cell, table) {
    cell.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      const cells = Array.from(table.querySelectorAll('td, th'));
      const idx   = cells.indexOf(cell);
      if (idx < cells.length - 1) {
        cells[idx + 1].focus();
      } else {
        /* append a new row */
        tableAct('addRow', table, table.closest('.wle-table-wrap'));
        table.querySelectorAll('td, th')[cells.length]?.focus();
      }
    });
  }


  /* ============================================================
   * 3.  INSERT TABLE — modal + grid picker
   * ============================================================ */
  function openInsertTableModal (editorTarget) {
    document.getElementById('wleTableModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'wleTableModal';

    let hoverR = 3, hoverC = 3;

    modal.innerHTML = `
      <div class="wle-modal-box">
        <h3>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
          </svg>
          Insert Table
        </h3>
        <div id="wleGridPicker"></div>
        <div id="wleGridLabel">3 rows × 3 columns</div>
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
          <button class="wle-btn-cancel" id="wleCancelBtn">Cancel</button>
          <button class="wle-btn-insert" id="wleInsertBtn">Insert Table</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const picker  = modal.querySelector('#wleGridPicker');
    const label   = modal.querySelector('#wleGridLabel');
    const rowsIn  = modal.querySelector('#wleRowsIn');
    const colsIn  = modal.querySelector('#wleColsIn');

    /* build 8 × 8 grid */
    for (let r = 1; r <= 8; r++) {
      for (let c = 1; c <= 8; c++) {
        const cell = document.createElement('div');
        cell.className    = 'wle-grid-cell';
        cell.dataset.r    = r;
        cell.dataset.c    = c;
        picker.appendChild(cell);

        cell.addEventListener('mouseenter', () => {
          hoverR = r; hoverC = c;
          rowsIn.value = r; colsIn.value = c;
          label.textContent = `${r} rows × ${c} columns`;
          picker.querySelectorAll('.wle-grid-cell').forEach(cl => {
            cl.classList.toggle('hover', +cl.dataset.r <= r && +cl.dataset.c <= c);
          });
        });
        cell.addEventListener('click', doInsert);
      }
    }

    /* pre-highlight 3×3 */
    picker.querySelectorAll('.wle-grid-cell').forEach(cl => {
      cl.classList.toggle('hover', +cl.dataset.r <= 3 && +cl.dataset.c <= 3);
    });

    /* sync manual inputs */
    [rowsIn, colsIn].forEach(inp => inp.addEventListener('input', () => {
      hoverR = +rowsIn.value || 1;
      hoverC = +colsIn.value || 1;
      label.textContent = `${hoverR} rows × ${hoverC} columns`;
      picker.querySelectorAll('.wle-grid-cell').forEach(cl => {
        cl.classList.toggle('hover', +cl.dataset.r <= hoverR && +cl.dataset.c <= hoverC);
      });
    }));

    modal.querySelector('#wleCancelBtn').onclick = () => modal.remove();
    modal.querySelector('#wleInsertBtn').onclick  = doInsert;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    function doInsert () {
      const rows = +rowsIn.value || 3;
      const cols = +colsIn.value || 3;
      modal.remove();
      insertEnhancedTable(editorTarget, rows, cols);
    }
  }

  /* Build & inject the table HTML */
  function insertEnhancedTable (editor, rows, cols) {
    if (!editor) return;
    const colW  = Math.floor(100 / cols);
    const base  = 'border:1.5px solid #374151;padding:8px 10px;min-width:60px;vertical-align:top;position:relative;';
    const colTags = Array(cols).fill(`<col style="width:${colW}%">`).join('');

    const headerCells = Array.from({ length: cols }, (_, i) => `
      <th contenteditable="true"
          style="${base}background:#f5f3ff;font-weight:700;">
        Header ${i + 1}
        <div class="wle-col-dragger"></div>
        ${i === 0 ? '<div class="wle-row-dragger"></div>' : ''}
      </th>`).join('');

    const bodyRows = Array.from({ length: rows - 1 }, () => {
      const cells = Array.from({ length: cols }, (_, i) => `
        <td contenteditable="true" style="${base}">
          <div class="wle-col-dragger"></div>
          ${i === 0 ? '<div class="wle-row-dragger"></div>' : ''}
        </td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    const html = `<br>
      <div class="wle-table-wrap" contenteditable="false">
        <div class="wle-table-toolbar">
          <button data-act="addRow">＋ Row</button>
          <button data-act="addCol">＋ Col</button>
          <button data-act="delRow" class="danger">− Row</button>
          <button data-act="delCol" class="danger">− Col</button>
          <button data-act="delTable" class="danger">🗑 Delete</button>
        </div>
        <table class="wle-editor-table wle-enhanced" style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <colgroup>${colTags}</colgroup>
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div><br>`;

    editor.focus();
    document.execCommand('insertHTML', false, html);

    /* wire up after insertion */
    setTimeout(() => wireInsertedContent(editor), 80);
  }

  function wireInsertedContent (editor) {
    editor.querySelectorAll('.wle-editor-table:not(.wle-dragger-wired)').forEach(t => {
      t.classList.add('wle-dragger-wired');
      t.querySelectorAll('.wle-col-dragger').forEach(cd => {
        const cell = cd.closest('td, th');
        if (cell) cd.addEventListener('mousedown', e => startColResize(e, cell));
      });
      t.querySelectorAll('.wle-row-dragger').forEach(rd => {
        const row = rd.closest('tr');
        if (row) rd.addEventListener('mousedown', e => startRowResize(e, row));
      });
      t.querySelectorAll('td, th').forEach(cell => makeNavCell(cell, t));
    });

    editor.querySelectorAll('.wle-table-wrap:not(.wle-toolbar-wired)').forEach(wrap => {
      wrap.classList.add('wle-toolbar-wired');
      wrap.querySelector('.wle-table-toolbar')?.addEventListener('click', e => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        tableAct(btn.dataset.act, wrap.querySelector('table'), wrap);
      });
      wrap.addEventListener('mousedown', e => {
        if (e.target.closest('.wle-table-toolbar, .wle-col-dragger, .wle-row-dragger')) return;
        deselectAll();
        _activeTable = wrap;
        wrap.classList.add('selected');
      });
    });
  }

  /* Override the global insertTable() called by your toolbar buttons */
  window.insertTable = function (editorIndex) {
    /* Try both naming conventions used in admin.html */
    const editor =
      document.getElementById(`editor-${editorIndex}`) ||
      document.getElementById(`editEditor_${editorIndex}`) ||
      document.querySelector('.editor-content[contenteditable="true"]');
    openInsertTableModal(editor);
  };


  /* ============================================================
   * 4.  MUTATION OBSERVER — auto-enhance newly inserted content
   * ============================================================ */
  const contentObserver = new MutationObserver(mutations => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        /* SafeMutationObserver above already handles bad targets,
           but we double-check here for absolute safety */
        if (!(node instanceof Node) || node.nodeType !== 1) return;

        const imgs   = node.tagName === 'IMG'   ? [node] : Array.from(node.querySelectorAll?.('img')   || []);
        const tables = node.tagName === 'TABLE' ? [node] : Array.from(node.querySelectorAll?.('table') || []);

        imgs.forEach(img => {
          if (!img.closest('.wle-img-toolbar') && img.closest('.editor-content')) {
            wrapImage(img);
          }
        });
        tables.forEach(t => {
          if (!t.closest('.wle-table-toolbar') && t.closest('.editor-content')) {
            enhanceTable(t);
          }
        });
      });
    });
  });


  /* ============================================================
   * 5.  INIT — scan existing editors, observe for future ones
   * ============================================================ */
  function initEditors () {
    getEditors().forEach(editor => {
      editor.querySelectorAll('img').forEach(img => {
        if (!img.closest('.wle-img-toolbar')) wrapImage(img);
      });
      editor.querySelectorAll('table').forEach(t => {
        if (!t.closest('.wle-table-toolbar')) enhanceTable(t);
      });
      /* Observe with our safe wrapper — no more TypeError at :715 */
      try { contentObserver.observe(editor, { childList: true, subtree: true }); }
      catch (_) { /* editor not yet in DOM, will retry */ }
    });
  }


  /* ============================================================
   * 6.  HOOK into chapter / topic modal openers
   * ============================================================ */
  function hookModal (name, delay) {
    const orig = window[name];
    window[name] = function (...args) {
      orig?.apply(this, args);
      setTimeout(initEditors, delay);
    };
  }

  hookModal('openCreateChapterModal', 300);
  hookModal('openEditChapterModal',   400);
  hookModal('addNewTopic',            200);
  hookModal('addEditTopic',           200);


  /* ============================================================
   * 7.  CLICK-OUTSIDE deselects everything
   * ============================================================ */
  document.addEventListener('mousedown', e => {
    if (!e.target.closest('.wle-img-wrap, .wle-table-wrap, .wle-img-toolbar, #wleTableModal')) {
      deselectAll();
    }
  });


  /* ============================================================
   * BOOT
   * ============================================================ */
  injectStyles();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initEditors, 500));
  } else {
    setTimeout(initEditors, 500);
  }

  /* Catch editors that open after tab-switches or lazy renders */
  setInterval(initEditors, 2000);

  console.log(
    '%c✅ ASAI Editor Enhancements loaded — Word-like image & table editing active',
    'color:#22c55e;font-weight:bold;'
  );
})();