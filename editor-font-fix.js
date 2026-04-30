/**
 * ============================================================
 * ASAI LMS — Editor Font & Size Fix
 * ============================================================
 * Fixes:
 *  - Font family not applying  (execCommand fontName quirks)
 *  - Font size not responding  (execCommand fontSize only does 1-7)
 *  - Selections lost on dropdown click
 *  - Adds 20+ Google Fonts loaded on demand
 *  - Replaces ALL font/size selects in every editor toolbar
 * ============================================================
 * Add ONE line before </body> in admin.html:
 *   <script src="editor-font-fix.js"></script>
 * ============================================================
 */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────
   * FONT CATALOGUE  (name shown in UI → CSS font-family)
   * ───────────────────────────────────────────────────────── */
  const FONTS = [
    // Sans-serif
    { label: 'Plus Jakarta Sans',  value: "'Plus Jakarta Sans', sans-serif",  google: 'Plus+Jakarta+Sans' },
    { label: 'Inter',              value: "'Inter', sans-serif",               google: 'Inter' },
    { label: 'Poppins',            value: "'Poppins', sans-serif",             google: 'Poppins' },
    { label: 'Nunito',             value: "'Nunito', sans-serif",              google: 'Nunito' },
    { label: 'Raleway',            value: "'Raleway', sans-serif",             google: 'Raleway' },
    { label: 'Lato',               value: "'Lato', sans-serif",                google: 'Lato' },
    { label: 'Montserrat',         value: "'Montserrat', sans-serif",          google: 'Montserrat' },
    { label: 'Open Sans',          value: "'Open Sans', sans-serif",           google: 'Open+Sans' },
    { label: 'Roboto',             value: "'Roboto', sans-serif",              google: 'Roboto' },
    { label: 'Oswald',             value: "'Oswald', sans-serif",              google: 'Oswald' },
    { label: 'DM Sans',            value: "'DM Sans', sans-serif",             google: 'DM+Sans' },
    { label: 'Outfit',             value: "'Outfit', sans-serif",              google: 'Outfit' },
    // Serif
    { label: 'Georgia',            value: 'Georgia, serif',                   google: null },
    { label: 'Merriweather',       value: "'Merriweather', serif",             google: 'Merriweather' },
    { label: 'Playfair Display',   value: "'Playfair Display', serif",         google: 'Playfair+Display' },
    { label: 'Lora',               value: "'Lora', serif",                     google: 'Lora' },
    { label: 'EB Garamond',        value: "'EB Garamond', serif",              google: 'EB+Garamond' },
    { label: 'Times New Roman',    value: "'Times New Roman', Times, serif",   google: null },
    // Mono
    { label: 'Courier New',        value: "'Courier New', Courier, monospace", google: null },
    { label: 'JetBrains Mono',     value: "'JetBrains Mono', monospace",       google: 'JetBrains+Mono' },
    { label: 'Fira Code',          value: "'Fira Code', monospace",            google: 'Fira+Code' },
    { label: 'Source Code Pro',    value: "'Source Code Pro', monospace",      google: 'Source+Code+Pro' },
    // Display
    { label: 'Pacifico',           value: "'Pacifico', cursive",               google: 'Pacifico' },
    { label: 'Lobster',            value: "'Lobster', cursive",                google: 'Lobster' },
    { label: 'Dancing Script',     value: "'Dancing Script', cursive",         google: 'Dancing+Script' },
    { label: 'Caveat',             value: "'Caveat', cursive",                 google: 'Caveat' },
  ];

  /* ─────────────────────────────────────────────────────────
   * SIZE OPTIONS  (px values — displayed as pt-like labels)
   * ───────────────────────────────────────────────────────── */
  const SIZES = [
    { label: '8',  px: '8px'  },
    { label: '9',  px: '9px'  },
    { label: '10', px: '10px' },
    { label: '11', px: '11px' },
    { label: '12', px: '12px' },
    { label: '14', px: '14px' },
    { label: '16', px: '16px' },
    { label: '18', px: '18px' },
    { label: '20', px: '20px' },
    { label: '22', px: '22px' },
    { label: '24', px: '24px' },
    { label: '28', px: '28px' },
    { label: '32', px: '32px' },
    { label: '36', px: '36px' },
    { label: '42', px: '42px' },
    { label: '48', px: '48px' },
    { label: '56', px: '56px' },
    { label: '64', px: '64px' },
    { label: '72', px: '72px' },
  ];

  /* ─────────────────────────────────────────────────────────
   * GOOGLE FONTS LOADER  (loads only when font is first used)
   * ───────────────────────────────────────────────────────── */
  const _loadedFonts = new Set();
  function loadGoogleFont (googleKey) {
    if (!googleKey || _loadedFonts.has(googleKey)) return;
    _loadedFonts.add(googleKey);
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${googleKey}:wght@400;600;700&display=swap`;
    document.head.appendChild(link);
  }
  // Pre-load all Google fonts listed
  FONTS.forEach(f => f.google && loadGoogleFont(f.google));

  /* ─────────────────────────────────────────────────────────
   * SAVED SELECTION HELPERS
   * The key problem: clicking a <select> or <button> in the
   * toolbar blurs the editor and loses the selection.
   * We save it on editor blur and restore before applying.
   * ───────────────────────────────────────────────────────── */
  let _savedRange = null;   // saved Selection Range
  let _savedEditor = null;  // the editor element the range is in

  function saveSelection () {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      _savedRange  = sel.getRangeAt(0).cloneRange();
      // find which editor contains this range
      let node = _savedRange.commonAncestorContainer;
      while (node && node !== document.body) {
        if (node.classList && node.classList.contains('editor-content')) {
          _savedEditor = node;
          break;
        }
        node = node.parentNode;
      }
    }
  }

  function restoreSelection () {
    if (!_savedRange) return false;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(_savedRange);
    return true;
  }

  /** Ensure the editor is focused and selection is restored, then run fn */
  function withRestoredSelection (editorEl, fn) {
    if (editorEl) editorEl.focus();
    if (_savedRange) {
      restoreSelection();
    } else {
      // No saved range → select all content as fallback so font applies
      // Actually: do nothing — user hasn't selected text yet
    }
    fn();
  }

  /* ─────────────────────────────────────────────────────────
   * APPLY FONT FAMILY  (wraps selection in <span>)
   * ───────────────────────────────────────────────────────── */
  function applyFontFamily (cssValue, editorEl) {
    withRestoredSelection(editorEl, () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        // No selection: set a data attribute on the editor so next
        // typed chars use this font (via CSS variable trick)
        if (editorEl) {
          editorEl.style.fontFamily = cssValue;
          editorEl.dataset.pendingFont = cssValue;
        }
        return;
      }
      // Wrap the selected text in a span with the font
      wrapSelectionWithStyle({ fontFamily: cssValue });
    });
  }

  /* ─────────────────────────────────────────────────────────
   * APPLY FONT SIZE  (wraps selection in <span> with font-size px)
   * ───────────────────────────────────────────────────────── */
  function applyFontSize (pxValue, editorEl) {
    withRestoredSelection(editorEl, () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        if (editorEl) {
          editorEl.style.fontSize = pxValue;
          editorEl.dataset.pendingSize = pxValue;
        }
        return;
      }
      wrapSelectionWithStyle({ fontSize: pxValue });
    });
  }

  /* ─────────────────────────────────────────────────────────
   * CORE: wrap current selection with an inline <span>
   * Merges with existing spans to avoid deep nesting
   * ───────────────────────────────────────────────────────── */
  function wrapSelectionWithStyle (styles) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);

    // Extract the selected content
    const fragment = range.extractContents();

    // Create wrapper span
    const span = document.createElement('span');
    Object.assign(span.style, styles);

    // Flatten: if fragment has only one child that is also a span,
    // merge styles rather than nesting
    if (
      fragment.childNodes.length === 1 &&
      fragment.childNodes[0].nodeType === 1 &&
      fragment.childNodes[0].tagName === 'SPAN'
    ) {
      const child = fragment.childNodes[0];
      Object.assign(child.style, styles);
      range.insertNode(child);
      // Re-select
      sel.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(child);
      sel.addRange(newRange);
      _savedRange = newRange.cloneRange();
      return;
    }

    span.appendChild(fragment);
    range.insertNode(span);

    // Re-select the span contents
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.addRange(newRange);
    _savedRange = newRange.cloneRange();
  }

  /* ─────────────────────────────────────────────────────────
   * DETECT FONT & SIZE AT CURSOR  (to update dropdowns)
   * ───────────────────────────────────────────────────────── */
  function getStyleAtCursor (prop) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const node = sel.getRangeAt(0).startContainer;
    const el   = node.nodeType === 3 ? node.parentElement : node;
    if (!el) return null;
    return window.getComputedStyle(el)[prop];
  }

  /* ─────────────────────────────────────────────────────────
   * INJECT STYLES for the custom dropdowns
   * ───────────────────────────────────────────────────────── */
  function injectStyles () {
    if (document.getElementById('asai-font-fix-styles')) return;
    const s = document.createElement('style');
    s.id = 'asai-font-fix-styles';
    s.textContent = `
      /* Hide original broken selects */
      .editor-toolbar .editor-select-font,
      .editor-toolbar .editor-select-size {
        display: none !important;
      }

      /* Custom dropdown container */
      .asai-dd-wrap {
        position: relative;
        display: inline-block;
      }

      /* Trigger button */
      .asai-dd-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 9px;
        border: 1.5px solid #d1d5db;
        border-radius: 7px;
        background: #fff;
        font-size: 12.5px;
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-weight: 600;
        color: #374151;
        cursor: pointer;
        min-width: 90px;
        max-width: 160px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: border-color 0.15s, box-shadow 0.15s;
        user-select: none;
      }
      .asai-dd-btn.size-btn { min-width: 54px; max-width: 70px; }
      .asai-dd-btn:hover {
        border-color: #7c3aed;
        box-shadow: 0 0 0 3px rgba(124,58,237,0.12);
      }
      .asai-dd-btn svg {
        flex-shrink: 0;
        margin-left: auto;
        opacity: 0.5;
      }

      /* Dropdown panel */
      .asai-dd-panel {
        position: fixed;
        background: #fff;
        border: 1.5px solid #e5e7eb;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.18);
        z-index: 999999;
        min-width: 200px;
        max-height: 300px;
        overflow-y: auto;
        padding: 6px 0;
        display: none;
        animation: asaiDDIn 0.12s ease;
      }
      .asai-dd-panel.size-panel {
        min-width: 100px;
        max-height: 280px;
      }
      .asai-dd-panel.open { display: block; }
      @keyframes asaiDDIn {
        from { opacity:0; transform:translateY(-6px) scale(0.97); }
        to   { opacity:1; transform:translateY(0)   scale(1); }
      }

      /* Scrollbar */
      .asai-dd-panel::-webkit-scrollbar { width: 5px; }
      .asai-dd-panel::-webkit-scrollbar-thumb {
        background: #d1d5db;
        border-radius: 4px;
      }

      /* Section header in font dropdown */
      .asai-dd-section {
        font-size: 10px;
        font-weight: 800;
        color: #9ca3af;
        text-transform: uppercase;
        letter-spacing: 1px;
        padding: 8px 14px 4px;
      }

      /* Option row */
      .asai-dd-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 14px;
        cursor: pointer;
        font-size: 13px;
        color: #1f2937;
        transition: background 0.1s;
        white-space: nowrap;
      }
      .asai-dd-item:hover { background: #f5f3ff; color: #7c3aed; }
      .asai-dd-item.active {
        background: #ede9fe;
        color: #6d28d9;
        font-weight: 700;
      }
      .asai-dd-item .asai-font-preview {
        font-size: 15px;
        line-height: 1;
        min-width: 24px;
        text-align: center;
        opacity: 0.7;
      }

      /* Size item — bigger number on left */
      .asai-size-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 14px;
        cursor: pointer;
        font-size: 13px;
        color: #1f2937;
        transition: background 0.1s;
        gap: 8px;
      }
      .asai-size-item:hover { background: #f5f3ff; color: #7c3aed; }
      .asai-size-item.active { background: #ede9fe; color: #6d28d9; font-weight: 700; }
      .asai-size-number { font-weight: 700; min-width: 28px; }
      .asai-size-bar {
        height: 3px;
        border-radius: 2px;
        background: currentColor;
        opacity: 0.4;
        flex: 1;
      }

      /* Search box inside font dropdown */
      .asai-dd-search {
        padding: 8px 10px 4px;
        position: sticky;
        top: 0;
        background: #fff;
        z-index: 1;
        border-bottom: 1px solid #f3f4f6;
      }
      .asai-dd-search input {
        width: 100%;
        padding: 6px 10px;
        border: 1.5px solid #e5e7eb;
        border-radius: 8px;
        font-size: 12px;
        font-family: inherit;
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.15s;
      }
      .asai-dd-search input:focus { border-color: #7c3aed; }
    `;
    document.head.appendChild(s);
  }

  /* ─────────────────────────────────────────────────────────
   * BUILD FONT DROPDOWN
   * ───────────────────────────────────────────────────────── */
  function buildFontDropdown (editorEl, toolbar) {
    const wrap = document.createElement('div');
    wrap.className = 'asai-dd-wrap asai-font-dd-wrap';

    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'asai-dd-btn font-btn';
    btn.title     = 'Font family';
    btn.innerHTML = `<span class="asai-dd-label">Font</span>
      <svg width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;

    const panel = document.createElement('div');
    panel.className = 'asai-dd-panel font-panel';

    // Search
    const searchWrap = document.createElement('div');
    searchWrap.className = 'asai-dd-search';
    searchWrap.innerHTML = `<input type="text" placeholder="Search fonts…" autocomplete="off">`;
    panel.appendChild(searchWrap);

    const searchInput = searchWrap.querySelector('input');

    // Group fonts by category
    const categories = [
      { label: 'Sans-Serif',  fonts: FONTS.filter(f => f.value.includes('sans-serif')) },
      { label: 'Serif',       fonts: FONTS.filter(f => f.value.includes('serif') && !f.value.includes('sans')) },
      { label: 'Monospace',   fonts: FONTS.filter(f => f.value.includes('monospace')) },
      { label: 'Display',     fonts: FONTS.filter(f => f.value.includes('cursive')) },
    ];

    const itemsContainer = document.createElement('div');

    function renderItems (filter) {
      itemsContainer.innerHTML = '';
      let anyShown = false;
      categories.forEach(cat => {
        const matching = cat.fonts.filter(f =>
          !filter || f.label.toLowerCase().includes(filter.toLowerCase())
        );
        if (matching.length === 0) return;
        anyShown = true;
        const sec = document.createElement('div');
        sec.className   = 'asai-dd-section';
        sec.textContent = cat.label;
        itemsContainer.appendChild(sec);
        matching.forEach(font => {
          const item = document.createElement('div');
          item.className = 'asai-dd-item';
          item.dataset.value = font.value;
          item.innerHTML = `
            <span class="asai-font-preview" style="font-family:${font.value}">Aa</span>
            <span style="font-family:${font.value}">${font.label}</span>`;
          item.addEventListener('mousedown', (e) => {
            e.preventDefault(); // don't blur editor
            panel.classList.remove('open');
            btn.querySelector('.asai-dd-label').textContent = font.label;
            btn.querySelector('.asai-dd-label').style.fontFamily = font.value;
            loadGoogleFont(font.google);
            applyFontFamily(font.value, editorEl);
            itemsContainer.querySelectorAll('.asai-dd-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
          });
          itemsContainer.appendChild(item);
        });
      });
      if (!anyShown) {
        itemsContainer.innerHTML = '<div style="padding:14px;color:#9ca3af;font-size:13px;">No fonts match</div>';
      }
    }

    renderItems('');
    panel.appendChild(itemsContainer);
    wrap.appendChild(btn);
    wrap.appendChild(panel);

    // Search filter
    searchInput.addEventListener('input', () => renderItems(searchInput.value));
    searchInput.addEventListener('mousedown', e => e.stopPropagation());

    // Toggle open/close
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      saveSelection();
      const isOpen = panel.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) {
        panel.classList.add('open');
        positionPanel(btn, panel);
        searchInput.value = '';
        renderItems('');
        setTimeout(() => searchInput.focus(), 50);
      }
    });

    return wrap;
  }

  /* ─────────────────────────────────────────────────────────
   * BUILD SIZE DROPDOWN
   * ───────────────────────────────────────────────────────── */
  function buildSizeDropdown (editorEl) {
    const wrap = document.createElement('div');
    wrap.className = 'asai-dd-wrap asai-size-dd-wrap';

    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'asai-dd-btn size-btn';
    btn.title     = 'Font size';
    btn.innerHTML = `<span class="asai-dd-label">12</span>
      <svg width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;

    const panel = document.createElement('div');
    panel.className = 'asai-dd-panel size-panel';

    const maxBarW = 60; // px

    SIZES.forEach(size => {
      const item = document.createElement('div');
      item.className = 'asai-size-item';
      item.dataset.px = size.px;
      const barW = Math.round((parseInt(size.px) / 72) * maxBarW);
      item.innerHTML = `
        <span class="asai-size-number">${size.label}</span>
        <span class="asai-size-bar" style="width:${barW}px;"></span>`;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        panel.classList.remove('open');
        btn.querySelector('.asai-dd-label').textContent = size.label;
        applyFontSize(size.px, editorEl);
        panel.querySelectorAll('.asai-size-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
      });
      panel.appendChild(item);
    });

    wrap.appendChild(btn);
    wrap.appendChild(panel);

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      saveSelection();
      const isOpen = panel.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) {
        panel.classList.add('open');
        positionPanel(btn, panel);
        // Highlight current size
        const curSize = getStyleAtCursor('fontSize') || '12px';
        panel.querySelectorAll('.asai-size-item').forEach(i => {
          i.classList.toggle('active', i.dataset.px === curSize);
        });
      }
    });

    return wrap;
  }

  /* ─────────────────────────────────────────────────────────
   * POSITION panel relative to button (accounts for scroll)
   * ───────────────────────────────────────────────────────── */
  function positionPanel (btn, panel) {
    const rect = btn.getBoundingClientRect();
    panel.style.top  = (rect.bottom + 4) + 'px';
    panel.style.left = rect.left + 'px';

    // Flip up if too close to bottom
    setTimeout(() => {
      const panelRect = panel.getBoundingClientRect();
      if (panelRect.bottom > window.innerHeight - 10) {
        panel.style.top = (rect.top - panelRect.height - 4) + 'px';
      }
      // Flip left if overflowing right
      if (panelRect.right > window.innerWidth - 10) {
        panel.style.left = (rect.right - panelRect.width) + 'px';
      }
    }, 0);
  }

  function closeAllDropdowns () {
    document.querySelectorAll('.asai-dd-panel.open').forEach(p => p.classList.remove('open'));
  }

  // Close on click outside
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.asai-dd-wrap')) closeAllDropdowns();
  });

  // Close on scroll
  document.addEventListener('scroll', closeAllDropdowns, true);

  /* ─────────────────────────────────────────────────────────
   * SAVE SELECTION whenever editor loses focus
   * (fires before toolbar button click blurs it)
   * ───────────────────────────────────────────────────────── */
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node = sel.getRangeAt(0).commonAncestorContainer;
    let el = node.nodeType === 3 ? node.parentElement : node;
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains('editor-content')) {
        saveSelection();
        break;
      }
      el = el.parentElement;
    }
  });

  /* ─────────────────────────────────────────────────────────
   * INJECT custom dropdowns into a toolbar
   * ───────────────────────────────────────────────────────── */
  function upgradeToolbar (toolbar) {
    if (toolbar.dataset.fontFixed) return;
    toolbar.dataset.fontFixed = '1';

    // Find the editor this toolbar controls
    // The toolbar is inside a .form-group whose next sibling has the editor
    const formGroup = toolbar.closest('.form-group') || toolbar.parentElement;
    let editorEl = formGroup?.querySelector('.editor-content[contenteditable]');
    if (!editorEl) {
      // Try sibling
      let sibling = formGroup?.nextElementSibling;
      while (sibling) {
        editorEl = sibling.querySelector?.('.editor-content[contenteditable]');
        if (editorEl) break;
        sibling = sibling.nextElementSibling;
      }
    }
    if (!editorEl) return; // can't find editor, skip

    // Save selection whenever user types in this editor
    editorEl.addEventListener('keyup', saveSelection);
    editorEl.addEventListener('mouseup', saveSelection);

    // Find existing broken font & size selects
    const fontSelect = toolbar.querySelector('.editor-select-font');
    const sizeSelect = toolbar.querySelector('.editor-select-size');

    // Build replacements
    const fontDD = buildFontDropdown(editorEl, toolbar);
    const sizeDD = buildSizeDropdown(editorEl);

    // Insert AFTER the broken selects (or at start of toolbar)
    if (fontSelect) {
      fontSelect.insertAdjacentElement('afterend', fontDD);
    } else {
      toolbar.insertBefore(fontDD, toolbar.firstChild);
    }

    if (sizeSelect) {
      sizeSelect.insertAdjacentElement('afterend', sizeDD);
    } else {
      // Insert after fontDD
      fontDD.insertAdjacentElement('afterend', sizeDD);
    }
  }

  /* ─────────────────────────────────────────────────────────
   * OVERRIDE existing setEditorFontFamily / setEditorFontSize
   * so that calls from other places also use the new system
   * ───────────────────────────────────────────────────────── */
  window.setEditorFontFamily = function (editorIndex, selectOrValue) {
    const val  = typeof selectOrValue === 'string'
      ? selectOrValue
      : selectOrValue?.value;
    if (!val || val === 'inherit') return;
    const font = FONTS.find(f => f.value === val || f.label === val);
    if (font?.google) loadGoogleFont(font.google);
    const editor = document.getElementById('editor-' + editorIndex)
                || document.getElementById('editEditor_' + editorIndex);
    applyFontFamily(val, editor);
  };

  window.setEditorFontSize = function (editorIndex, selectOrValue) {
    const raw = typeof selectOrValue === 'string'
      ? selectOrValue
      : selectOrValue?.value;
    if (!raw) return;
    // Accept either "14px" or a number 1-7 (old API) or plain "14"
    let pxVal;
    if (raw.endsWith('px')) {
      pxVal = raw;
    } else {
      // Map old 1-7 scale or plain number
      const n = parseInt(raw);
      const oldMap = { 1:'8px', 2:'10px', 3:'12px', 4:'14px', 5:'18px', 6:'24px', 7:'36px' };
      pxVal = oldMap[n] || (n + 'px');
    }
    const editor = document.getElementById('editor-' + editorIndex)
                || document.getElementById('editEditor_' + editorIndex);
    applyFontSize(pxVal, editor);
  };

  /* ─────────────────────────────────────────────────────────
   * SCAN & UPGRADE ALL TOOLBARS
   * ───────────────────────────────────────────────────────── */
  function upgradeAllToolbars () {
    document.querySelectorAll('.editor-toolbar:not([data-font-fixed])').forEach(upgradeToolbar);
  }

  /* ─────────────────────────────────────────────────────────
   * OBSERVE DOM for new toolbars (modal opens, new topic added)
   * ───────────────────────────────────────────────────────── */
  const obs = new MutationObserver(() => {
    upgradeAllToolbars();
  });
  obs.observe(document.body, { childList: true, subtree: true });

  /* ─────────────────────────────────────────────────────────
   * BOOT
   * ───────────────────────────────────────────────────────── */
  injectStyles();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(upgradeAllToolbars, 400));
  } else {
    setTimeout(upgradeAllToolbars, 400);
  }

  console.log('✅ ASAI Font Fix loaded — custom font & size dropdowns active');
})();