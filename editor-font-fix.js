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
 *
 * CHANGES FROM PREVIOUS VERSION (3 exact fixes):
 *  FIX 1 — upgradeToolbar: was searching for .editor-content
 *           inside .form-group (wrong). Now looks at
 *           toolbar.nextElementSibling (correct).
 *  FIX 2 — addNewTopic patch: admin.html hardcodes index 0
 *           for all topics. We re-run upgradeAllToolbars after
 *           each new topic so dropdowns bind to the right editor.
 *  FIX 3 — addEditTopic patch: same fix for edit modal.
 * ============================================================
 */

(function () {
  'use strict';

  function runFontFix() {
    const isAdmin = document.querySelector('body');
    if (!isAdmin) return;
  /* ─────────────────────────────────────────────────────────
   * FONT CATALOGUE
   * ───────────────────────────────────────────────────────── */
 const FONTS = [
    // Sans-serif
    { label: 'Plus Jakarta Sans',   value: "'Plus Jakarta Sans', sans-serif",   google: 'Plus+Jakarta+Sans' },
    { label: 'Inter',               value: "'Inter', sans-serif",               google: 'Inter' },
    { label: 'Poppins',             value: "'Poppins', sans-serif",             google: 'Poppins' },
    { label: 'Nunito',              value: "'Nunito', sans-serif",              google: 'Nunito' },
    { label: 'Raleway',             value: "'Raleway', sans-serif",             google: 'Raleway' },
    { label: 'Lato',                value: "'Lato', sans-serif",                google: 'Lato' },
    { label: 'Montserrat',          value: "'Montserrat', sans-serif",          google: 'Montserrat' },
    { label: 'Open Sans',           value: "'Open Sans', sans-serif",           google: 'Open+Sans' },
    { label: 'Roboto',              value: "'Roboto', sans-serif",              google: 'Roboto' },
    { label: 'Oswald',              value: "'Oswald', sans-serif",              google: 'Oswald' },
    { label: 'DM Sans',             value: "'DM Sans', sans-serif",             google: 'DM+Sans' },
    { label: 'Outfit',              value: "'Outfit', sans-serif",              google: 'Outfit' },
    { label: 'Andika',              value: "'Andika', sans-serif",              google: 'Andika' },
    { label: 'Figtree',             value: "'Figtree', sans-serif",             google: 'Figtree' },
    { label: 'Urbanist',            value: "'Urbanist', sans-serif",            google: 'Urbanist' },
    { label: 'Manrope',             value: "'Manrope', sans-serif",             google: 'Manrope' },
    { label: 'Quicksand',           value: "'Quicksand', sans-serif",           google: 'Quicksand' },
    { label: 'Barlow',              value: "'Barlow', sans-serif",              google: 'Barlow' },
    { label: 'Exo 2',               value: "'Exo 2', sans-serif",               google: 'Exo+2' },
    { label: 'Karla',               value: "'Karla', sans-serif",               google: 'Karla' },
    { label: 'Rubik',               value: "'Rubik', sans-serif",               google: 'Rubik' },
    { label: 'Work Sans',           value: "'Work Sans', sans-serif",           google: 'Work+Sans' },
    { label: 'Noto Sans',           value: "'Noto Sans', sans-serif",           google: 'Noto+Sans' },
    { label: 'Source Sans 3',       value: "'Source Sans 3', sans-serif",       google: 'Source+Sans+3' },
    { label: 'Lexend',              value: "'Lexend', sans-serif",              google: 'Lexend' },
    { label: 'Cabin',               value: "'Cabin', sans-serif",               google: 'Cabin' },
    { label: 'Varela Round',        value: "'Varela Round', sans-serif",        google: 'Varela+Round' },
    { label: 'Titillium Web',       value: "'Titillium Web', sans-serif",       google: 'Titillium+Web' },
    { label: 'Mulish',              value: "'Mulish', sans-serif",              google: 'Mulish' },
    { label: 'Hind',                value: "'Hind', sans-serif",                google: 'Hind' },
    { label: 'Jost',                value: "'Jost', sans-serif",                google: 'Jost' },
    { label: 'Ubuntu',              value: "'Ubuntu', sans-serif",              google: 'Ubuntu' },
    { label: 'Heebo',               value: "'Heebo', sans-serif",               google: 'Heebo' },
    { label: 'Kanit',               value: "'Kanit', sans-serif",               google: 'Kanit' },
    // Serif
    { label: 'Georgia',             value: 'Georgia, serif',                    google: null },
    { label: 'Times New Roman',     value: "'Times New Roman', Times, serif",   google: null },
    { label: 'Merriweather',        value: "'Merriweather', serif",             google: 'Merriweather' },
    { label: 'Playfair Display',    value: "'Playfair Display', serif",         google: 'Playfair+Display' },
    { label: 'Lora',                value: "'Lora', serif",                     google: 'Lora' },
    { label: 'EB Garamond',         value: "'EB Garamond', serif",              google: 'EB+Garamond' },
    { label: 'Libre Baskerville',   value: "'Libre Baskerville', serif",        google: 'Libre+Baskerville' },
    { label: 'Crimson Text',        value: "'Crimson Text', serif",             google: 'Crimson+Text' },
    { label: 'Cormorant Garamond',  value: "'Cormorant Garamond', serif",       google: 'Cormorant+Garamond' },
    { label: 'Bitter',              value: "'Bitter', serif",                   google: 'Bitter' },
    { label: 'Noto Serif',          value: "'Noto Serif', serif",               google: 'Noto+Serif' },
    { label: 'PT Serif',            value: "'PT Serif', serif",                 google: 'PT+Serif' },
    { label: 'Spectral',            value: "'Spectral', serif",                 google: 'Spectral' },
    { label: 'Zilla Slab',          value: "'Zilla Slab', serif",               google: 'Zilla+Slab' },
    // Monospace
    { label: 'Courier New',         value: "'Courier New', Courier, monospace", google: null },
    { label: 'JetBrains Mono',      value: "'JetBrains Mono', monospace",       google: 'JetBrains+Mono' },
    { label: 'Fira Code',           value: "'Fira Code', monospace",            google: 'Fira+Code' },
    { label: 'Source Code Pro',     value: "'Source Code Pro', monospace",      google: 'Source+Code+Pro' },
    { label: 'Space Mono',          value: "'Space Mono', monospace",           google: 'Space+Mono' },
    { label: 'Inconsolata',         value: "'Inconsolata', monospace",          google: 'Inconsolata' },
    { label: 'Roboto Mono',         value: "'Roboto Mono', monospace",          google: 'Roboto+Mono' },
    // Display / Decorative
    { label: 'Pacifico',            value: "'Pacifico', cursive",               google: 'Pacifico' },
    { label: 'Lobster',             value: "'Lobster', cursive",                google: 'Lobster' },
    { label: 'Dancing Script',      value: "'Dancing Script', cursive",         google: 'Dancing+Script' },
    { label: 'Caveat',              value: "'Caveat', cursive",                 google: 'Caveat' },
    { label: 'Satisfy',             value: "'Satisfy', cursive",                google: 'Satisfy' },
    { label: 'Great Vibes',         value: "'Great Vibes', cursive",            google: 'Great+Vibes' },
    { label: 'Kaushan Script',      value: "'Kaushan Script', cursive",         google: 'Kaushan+Script' },
    { label: 'Righteous',           value: "'Righteous', cursive",              google: 'Righteous' },
    { label: 'Fredoka One',         value: "'Fredoka One', cursive",            google: 'Fredoka+One' },
    { label: 'Permanent Marker',    value: "'Permanent Marker', cursive",       google: 'Permanent+Marker' },
    { label: 'Bangers',             value: "'Bangers', cursive",                google: 'Bangers' },
    { label: 'Bebas Neue',          value: "'Bebas Neue', cursive",             google: 'Bebas+Neue' },
    { label: 'Anton',               value: "'Anton', sans-serif",               google: 'Anton' },
  ];
  /* ─────────────────────────────────────────────────────────
   * SIZE OPTIONS
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
   * GOOGLE FONTS LOADER
   * ───────────────────────────────────────────────────────── */
  const _loadedFonts = new Set();
  function loadGoogleFont(googleKey) {
    if (!googleKey || _loadedFonts.has(googleKey)) return;
    _loadedFonts.add(googleKey);
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${googleKey}:wght@400;600;700&display=swap`;
    document.head.appendChild(link);
  }
  FONTS.forEach(f => f.google && loadGoogleFont(f.google));

  /* ─────────────────────────────────────────────────────────
   * SAVED SELECTION HELPERS
   * ───────────────────────────────────────────────────────── */
  let _savedRange  = null;
  let _savedEditor = null;

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      _savedRange = sel.getRangeAt(0).cloneRange();
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

  function restoreSelection() {
    if (!_savedRange) return false;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(_savedRange);
    return true;
  }

  function withRestoredSelection(editorEl, fn) {
    if (editorEl) editorEl.focus();
    if (_savedRange) restoreSelection();
    fn();
  }

  /* ─────────────────────────────────────────────────────────
   * APPLY FONT FAMILY
   * ───────────────────────────────────────────────────────── */
function applyFontFamily(cssValue, editorEl) {
    if (!editorEl) return;
    
    // Keep editor-enhancements.js's font-persistence logic in sync —
    // otherwise it reapplies its own stale cached font on every keystroke
    // and silently undoes whatever font was just picked here.
    editorEl.setAttribute('data-stored-font', cssValue);
    
    const sel = window.getSelection();
    const isCollapsed = !sel || sel.isCollapsed || sel.rangeCount === 0;
    
    if (isCollapsed) {
        // No selection - apply to entire editor
        editorEl.style.fontFamily = cssValue;
        editorEl.dataset.pendingFont = cssValue;
        
        // Apply to all content
        const allElements = editorEl.querySelectorAll('*');
        allElements.forEach(el => {
            el.style.fontFamily = cssValue;
        });
        
        // Wrap text nodes
        const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);
        
        textNodes.forEach(node => {
            if (node.textContent.trim() && node.parentElement === editorEl) {
                const span = document.createElement('span');
                span.style.fontFamily = cssValue;
                node.parentNode.insertBefore(span, node);
                span.appendChild(node);
            } else if (node.parentElement && node.parentElement !== editorEl) {
                node.parentElement.style.fontFamily = cssValue;
            }
        });
    } else {
        // Has selection - apply only to selection
        withRestoredSelection(editorEl, () => {
            wrapSelectionWithStyle({ fontFamily: cssValue });
        });
    }
}

  /* ─────────────────────────────────────────────────────────
   * APPLY FONT SIZE
   * ───────────────────────────────────────────────────────── */
 function applyFontSize(pxValue, editorEl) {
    if (!editorEl) return;
    
    const sel = window.getSelection();
    const isCollapsed = !sel || sel.isCollapsed || sel.rangeCount === 0;
    
    if (isCollapsed) {
        // No selection - apply to entire editor
        editorEl.style.fontSize = pxValue;
        editorEl.dataset.pendingSize = pxValue;
        
        // Apply to all elements
        const allElements = editorEl.querySelectorAll('*');
        allElements.forEach(el => {
            el.style.fontSize = pxValue;
        });
        
        // Wrap text nodes
        const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);
        
        textNodes.forEach(node => {
            if (node.textContent.trim() && node.parentElement === editorEl) {
                const span = document.createElement('span');
                span.style.fontSize = pxValue;
                node.parentNode.insertBefore(span, node);
                span.appendChild(node);
            } else if (node.parentElement && node.parentElement !== editorEl) {
                node.parentElement.style.fontSize = pxValue;
            }
        });
    } else {
        // Has selection - apply only to selection
        withRestoredSelection(editorEl, () => {
            wrapSelectionWithStyle({ fontSize: pxValue });
        });
    }
}

  /* ─────────────────────────────────────────────────────────
   * WRAP SELECTION WITH SPAN
   * ───────────────────────────────────────────────────────── */
  function wrapSelectionWithStyle(styles) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range    = sel.getRangeAt(0);
    const fragment = range.extractContents();
    const span     = document.createElement('span');
    Object.assign(span.style, styles);

    // Merge with existing span to avoid deep nesting
    if (
      fragment.childNodes.length === 1 &&
      fragment.childNodes[0].nodeType === 1 &&
      fragment.childNodes[0].tagName === 'SPAN'
    ) {
      const child = fragment.childNodes[0];
      Object.assign(child.style, styles);
      range.insertNode(child);
      sel.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(child);
      sel.addRange(newRange);
      _savedRange = newRange.cloneRange();
      return;
    }

    span.appendChild(fragment);
    range.insertNode(span);
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.addRange(newRange);
    _savedRange = newRange.cloneRange();
  }

 /* ─────────────────────────────────────────────────────────
   * APPLY STYLE TO ALL CONTENT IN EDITOR
   * Used when no text is selected — wraps everything so
   * the style is saved in the HTML, not just on the container
   * ───────────────────────────────────────────────────────── */
  function applyStyleToAllContent(editorEl, styleProp, styleVal) {
    if (!editorEl) return;

    // Walk all child nodes and apply style
    // to block-level elements and text nodes
    const children = Array.from(editorEl.childNodes);

    children.forEach(node => {
      // Skip non-content elements
      if (node.nodeType === 1) {
        const tag = node.tagName?.toLowerCase();
        // Skip editor UI elements
        if (node.classList?.contains('wle-table-toolbar') ||
            node.classList?.contains('tbl-ui-overlay') ||
            node.dataset?.nonContent) return;

        // Apply to block elements directly
        if (['p','div','h1','h2','h3','h4','h5','li','td','th','span'].includes(tag)) {
          node.style[styleProp] = styleVal;
        }

        // Recurse into children
        if (node.childNodes.length > 0) {
          applyStyleToChildren(node, styleProp, styleVal);
        }
      } else if (node.nodeType === 3 && node.textContent.trim()) {
        // Bare text node — wrap it in a span
        const span = document.createElement('span');
        span.style[styleProp] = styleVal;
        node.parentNode.insertBefore(span, node);
        span.appendChild(node);
      }
    });
  }

  function applyStyleToChildren(parent, styleProp, styleVal) {
    Array.from(parent.childNodes).forEach(node => {
      if (node.nodeType === 1) {
        const tag = node.tagName?.toLowerCase();
        if (node.classList?.contains('wle-table-toolbar') ||
            node.classList?.contains('tbl-ui-overlay') ||
            node.dataset?.nonContent) return;
        if (['p','div','h1','h2','h3','h4','h5','li','span'].includes(tag)) {
          node.style[styleProp] = styleVal;
        }
        if (node.childNodes.length > 0) {
          applyStyleToChildren(node, styleProp, styleVal);
        }
      } else if (node.nodeType === 3 && node.textContent.trim()) {
        const span = document.createElement('span');
        span.style[styleProp] = styleVal;
        node.parentNode.insertBefore(span, node);
        span.appendChild(node);
      }
    });
  }

  /* ─────────────────────────────────────────────────────────
   * DETECT STYLE AT CURSOR
   * ───────────────────────────────────────────────────────── */
  function getStyleAtCursor(prop) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const node = sel.getRangeAt(0).startContainer;
    const el   = node.nodeType === 3 ? node.parentElement : node;
    if (!el) return null;
    return window.getComputedStyle(el)[prop];
  }

  /* ─────────────────────────────────────────────────────────
   * INJECT STYLES
   * ───────────────────────────────────────────────────────── */
 function injectStyles() {
    if (document.getElementById('asai-font-fix-styles')) return;
    const s = document.createElement('style');
    s.id = 'asai-font-fix-styles';
    s.textContent = `
      /* FORCE HIDE original dropdowns */
      .editor-toolbar .editor-select-font,
      .editor-toolbar .editor-select-size,
      select.editor-select-font,
      select.editor-select-size,
      .editor-select-font,
      .editor-select-size {
        display: none !important;
        visibility: hidden !important;
        width: 0 !important;
        height: 0 !important;
        min-width: 0 !important;
        max-width: 0 !important;
        opacity: 0 !important;
        position: absolute !important;
        pointer-events: none !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
      }

      .asai-dd-wrap { position: relative; display: inline-block; }

      .asai-dd-btn {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 4px 9px; border: 1.5px solid #d1d5db; border-radius: 7px;
        background: #fff; font-size: 12.5px;
        font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 600;
        color: #374151; cursor: pointer; min-width: 90px; max-width: 160px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        transition: border-color 0.15s, box-shadow 0.15s; user-select: none;
      }
      .asai-dd-btn.size-btn { min-width: 54px; max-width: 70px; }
      .asai-dd-btn:hover {
        border-color: #7c3aed;
        box-shadow: 0 0 0 3px rgba(124,58,237,0.12);
      }
      .asai-dd-btn svg { flex-shrink: 0; margin-left: auto; opacity: 0.5; }

      .asai-dd-panel {
        position: fixed; background: #fff; border: 1.5px solid #e5e7eb;
        border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.18);
        z-index: 999999; min-width: 200px; max-height: 300px;
        overflow-y: auto; padding: 6px 0; display: none;
        animation: asaiDDIn 0.12s ease;
      }
      .asai-dd-panel.size-panel { min-width: 100px; max-height: 280px; }
      .asai-dd-panel.open { display: block; }
      @keyframes asaiDDIn {
        from { opacity:0; transform:translateY(-6px) scale(0.97); }
        to   { opacity:1; transform:translateY(0)   scale(1); }
      }
      .asai-dd-panel::-webkit-scrollbar { width: 5px; }
      .asai-dd-panel::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }

      .asai-dd-section {
        font-size: 10px; font-weight: 800; color: #9ca3af;
        text-transform: uppercase; letter-spacing: 1px; padding: 8px 14px 4px;
      }
      .asai-dd-item {
        display: flex; align-items: center; gap: 10px; padding: 7px 14px;
        cursor: pointer; font-size: 13px; color: #1f2937;
        transition: background 0.1s; white-space: nowrap;
      }
      .asai-dd-item:hover { background: #f5f3ff; color: #7c3aed; }
      .asai-dd-item.active { background: #ede9fe; color: #6d28d9; font-weight: 700; }
      .asai-dd-item .asai-font-preview {
        font-size: 15px; line-height: 1; min-width: 24px;
        text-align: center; opacity: 0.7;
      }
      .asai-size-item {
        display: flex; align-items: center; justify-content: space-between;
        padding: 6px 14px; cursor: pointer; font-size: 13px; color: #1f2937;
        transition: background 0.1s; gap: 8px;
      }
      .asai-size-item:hover { background: #f5f3ff; color: #7c3aed; }
      .asai-size-item.active { background: #ede9fe; color: #6d28d9; font-weight: 700; }
      .asai-size-number { font-weight: 700; min-width: 28px; }
      .asai-size-bar {
        height: 3px; border-radius: 2px; background: currentColor;
        opacity: 0.4; flex: 1;
      }
      .asai-dd-search {
        padding: 8px 10px 4px; position: sticky; top: 0;
        background: #fff; z-index: 1; border-bottom: 1px solid #f3f4f6;
      }
      .asai-dd-search input {
        width: 100%; padding: 6px 10px; border: 1.5px solid #e5e7eb;
        border-radius: 8px; font-size: 12px; font-family: inherit;
        outline: none; box-sizing: border-box; transition: border-color 0.15s;
      }
      .asai-dd-search input:focus { border-color: #7c3aed; }
    `;
    document.head.appendChild(s);
}
  /* ─────────────────────────────────────────────────────────
   * BUILD FONT DROPDOWN
   * ───────────────────────────────────────────────────────── */
  function buildFontDropdown(editorEl) {
    const wrap = document.createElement('div');
    wrap.className = 'asai-dd-wrap asai-font-dd-wrap';

    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'asai-dd-btn font-btn';
    btn.title     = 'Font family';
    btn.innerHTML = `<span class="asai-dd-label">Font</span>
      <svg width="10" height="6" viewBox="0 0 10 6">
        <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      </svg>`;

    const panel = document.createElement('div');
    panel.className = 'asai-dd-panel font-panel';

    const searchWrap = document.createElement('div');
    searchWrap.className = 'asai-dd-search';
    searchWrap.innerHTML = `<input type="text" placeholder="Search fonts…" autocomplete="off">`;
    panel.appendChild(searchWrap);
    const searchInput = searchWrap.querySelector('input');

    const categories = [
      { label: 'Sans-Serif', fonts: FONTS.filter(f => f.value.includes('sans-serif')) },
      { label: 'Serif',      fonts: FONTS.filter(f => f.value.includes('serif') && !f.value.includes('sans')) },
      { label: 'Monospace',  fonts: FONTS.filter(f => f.value.includes('monospace')) },
      { label: 'Display',    fonts: FONTS.filter(f => f.value.includes('cursive')) },
    ];

    const itemsContainer = document.createElement('div');

    function renderItems(filter) {
      itemsContainer.innerHTML = '';
      let anyShown = false;
      categories.forEach(cat => {
        const matching = cat.fonts.filter(f =>
          !filter || f.label.toLowerCase().includes(filter.toLowerCase())
        );
        if (!matching.length) return;
        anyShown = true;
        const sec = document.createElement('div');
        sec.className   = 'asai-dd-section';
        sec.textContent = cat.label;
        itemsContainer.appendChild(sec);
        matching.forEach(font => {
          const item = document.createElement('div');
          item.className    = 'asai-dd-item';
          item.dataset.value = font.value;
          item.innerHTML = `
            <span class="asai-font-preview" style="font-family:${font.value}">Aa</span>
            <span style="font-family:${font.value}">${font.label}</span>`;
          item.addEventListener('mousedown', e => {
            e.preventDefault();
            panel.classList.remove('open');
            btn.querySelector('.asai-dd-label').textContent       = font.label;
            btn.querySelector('.asai-dd-label').style.fontFamily  = font.value;
            loadGoogleFont(font.google);
            applyFontFamily(font.value, editorEl);
            itemsContainer.querySelectorAll('.asai-dd-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
          });
          itemsContainer.appendChild(item);
        });
      });
      if (!anyShown) {
        itemsContainer.innerHTML =
          '<div style="padding:14px;color:#9ca3af;font-size:13px;">No fonts match</div>';
      }
    }

    renderItems('');
    panel.appendChild(itemsContainer);
    wrap.appendChild(btn);
    wrap.appendChild(panel);

    searchInput.addEventListener('input',     () => renderItems(searchInput.value));
    searchInput.addEventListener('mousedown', e => e.stopPropagation());

    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      saveSelection();
      const isOpen = panel.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) {
       panel.classList.add('open');
        positionPanel(btn, panel);
        searchInput.value = '';
        renderItems('');
        setTimeout(() => searchInput.focus({ preventScroll: true }), 50);
      }
    });

    return wrap;
  }

  /* ─────────────────────────────────────────────────────────
   * BUILD SIZE DROPDOWN
   * ───────────────────────────────────────────────────────── */
  function buildSizeDropdown(editorEl) {
    const wrap = document.createElement('div');
    wrap.className = 'asai-dd-wrap asai-size-dd-wrap';

    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'asai-dd-btn size-btn';
    btn.title     = 'Font size';
    btn.innerHTML = `<span class="asai-dd-label">12</span>
      <svg width="10" height="6" viewBox="0 0 10 6">
        <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      </svg>`;

    const panel = document.createElement('div');
    panel.className = 'asai-dd-panel size-panel';

    SIZES.forEach(size => {
      const item = document.createElement('div');
      item.className  = 'asai-size-item';
      item.dataset.px = size.px;
      const barW = Math.round((parseInt(size.px) / 72) * 60);
      item.innerHTML = `
        <span class="asai-size-number">${size.label}</span>
        <span class="asai-size-bar" style="width:${barW}px;"></span>`;
      item.addEventListener('mousedown', e => {
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

       btn.addEventListener('mousedown', e => {
      e.preventDefault();
      saveSelection();
      const isOpen = panel.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) {
        panel.classList.add('open');
        positionPanel(btn, panel);
        // Get current size from the editor directly
        let curSize = '12px';
        if (editorEl) {
          curSize = window.getComputedStyle(editorEl).fontSize || '12px';
          // Also check if there's a selection with different size
          const sel = window.getSelection();
          if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
            let node = sel.getRangeAt(0).startContainer;
            let el = node.nodeType === 3 ? node.parentElement : node;
            if (el) curSize = window.getComputedStyle(el).fontSize || curSize;
          }
        }
        panel.querySelectorAll('.asai-size-item').forEach(i => {
          i.classList.toggle('active', i.dataset.px === curSize);
        });
      }
    });

    return wrap;
  }

  /* ─────────────────────────────────────────────────────────
   * PANEL POSITIONING
   * ───────────────────────────────────────────────────────── */
function positionPanel(btn, panel) {
    const rect = btn.getBoundingClientRect();
    panel.style.top  = (rect.bottom + 4) + 'px';
    panel.style.left = rect.left + 'px';
    setTimeout(() => {
      const pr = panel.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      if (pr.bottom > window.innerHeight - 10) {
        if (spaceAbove >= pr.height + 4) {
          // Enough room above — flip up normally
          panel.style.top = (rect.top - pr.height - 4) + 'px';
        } else if (spaceAbove > spaceBelow) {
          // Not quite enough room above, but more than below —
          // clamp to viewport top instead of going negative/off-screen
          panel.style.top = '10px';
          panel.style.maxHeight = (spaceAbove - 14) + 'px';
        } else {
          // Stay below the button and let it scroll within available space
          panel.style.top = (rect.bottom + 4) + 'px';
          panel.style.maxHeight = (spaceBelow - 14) + 'px';
        }
      }
      if (pr.right > window.innerWidth - 10)
        panel.style.left = (rect.right - pr.width) + 'px';
    }, 0);
  }

 function closeAllDropdowns() {
    document.querySelectorAll('.asai-dd-panel.open').forEach(p => {
      p.classList.remove('open');
    });
  }
  document.addEventListener('mousedown', e => {
    if (!e.target.closest('.asai-dd-wrap')) closeAllDropdowns();
  });
   
  
  // Keep dropdowns open when scrolling inside them
  document.addEventListener('scroll', function(e) {
    // e.target may be the panel itself or a child element inside it
    // Use closest() to robustly detect scroll inside any open panel
    if (e.target && typeof e.target.closest === 'function' &&
        e.target.closest('.asai-dd-panel')) {
      return; // scrolling inside a dropdown — keep it open
    }
    closeAllDropdowns();
  }, true);

  /* ─────────────────────────────────────────────────────────
   * SAVE SELECTION on any change inside an editor
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
   * FIX 1 — UPGRADE A SINGLE TOOLBAR
   *
   * OLD CODE (broken):
   *   const formGroup = toolbar.closest('.form-group') || toolbar.parentElement;
   *   let editorEl = formGroup?.querySelector('.editor-content[contenteditable]');
   *   if (!editorEl) {
   *     let sibling = formGroup?.nextElementSibling; ...
   *   }
   *
   * WHY IT WAS BROKEN:
   *   The toolbar sits inside .form-group, but .editor-content
   *   is a direct next sibling of the toolbar itself — NOT a
   *   child of .form-group. So querySelector never found it.
   *
   * NEW CODE:
   *   Check toolbar.nextElementSibling directly.
   * ───────────────────────────────────────────────────────── */
  function findEditorForToolbar(toolbar) {
    // Extract N and find editor-N or editEditor_N or courseDescriptionEditor
    const onclickAttr = toolbar.innerHTML;
    const idxMatch = onclickAttr.match(/(?:formatText|setEditorFontSize|setEditorColor)\((\d+)[^)]*\)/);
    if (idxMatch) {
      const idx = idxMatch[1];
      const byId = document.getElementById('editor-' + idx)
                || document.getElementById('editEditor_' + idx)
                || document.getElementById('courseDescriptionEditor');
      if (byId) return byId;
    }

    // Method B: direct next sibling
    const next = toolbar.nextElementSibling;
    if (next?.classList?.contains('editor-content')) return next;
    if (next) {
      const inside = next.querySelector('.editor-content[contenteditable]');
      if (inside) return inside;
    }

    // Method C: walk siblings forward
    let sib = toolbar.nextElementSibling;
    while (sib) {
      if (sib.classList?.contains('editor-content')) return sib;
      const f = sib.querySelector?.('.editor-content[contenteditable]');
      if (f) return f;
      sib = sib.nextElementSibling;
    }

    // Method D: data-topic-index on ancestor
    const topicWrap = toolbar.closest('[data-topic-index]');
    if (topicWrap) {
      const idx = topicWrap.dataset.topicIndex;
      return document.getElementById('editor-' + idx)
          || document.getElementById('editEditor_' + idx)
          || topicWrap.querySelector('.editor-content[contenteditable]');
    }

    // Method E: card/topic-card ancestor
    const card = toolbar.closest('.topic-card, .topic-editor, .card');
    if (card) {
      const e = card.querySelector('.editor-content[contenteditable]');
      if (e) return e;
    }

    // Method F: form-group ancestor
    const fg = toolbar.closest('.form-group');
    if (fg) {
      const e = fg.querySelector('.editor-content[contenteditable]');
      if (e) return e;
    }

    // Method G: closest modal/form, pick nearest by Y distance
    const modal = toolbar.closest('.modal-content, .modal, form, .dashboard-section');
    if (modal) {
      const all = Array.from(
        modal.querySelectorAll('.editor-content[contenteditable="true"]')
      );
      if (all.length === 1) return all[0];
      if (all.length > 1) {
        const tRect = toolbar.getBoundingClientRect();
        let best = Infinity, bestEl = null;
        all.forEach(ed => {
          const r = ed.getBoundingClientRect();
          // prefer editor BELOW toolbar
          const dist = r.top >= tRect.bottom
            ? r.top - tRect.bottom
            : Math.abs(r.top - tRect.bottom) + 9999;
          if (dist < best) { best = dist; bestEl = ed; }
        });
        if (bestEl) return bestEl;
      }
    }

    // Method H: last resort — any visible editor on the page
    const anyEditor = document.querySelector('.editor-content[contenteditable="true"]');
    if (anyEditor) return anyEditor;

    return null;
  }

  function upgradeToolbar(toolbar) {
    if (toolbar.dataset.fontFixed) return;

    const editorEl = findEditorForToolbar(toolbar);

    // Not found yet — don't mark, retry next scan
    if (!editorEl) return;

    // Mark AFTER confirmed success
    toolbar.dataset.fontFixed = '1';

    editorEl.addEventListener('keyup',   saveSelection);
    editorEl.addEventListener('mouseup', saveSelection);

    // Remove any previously injected dropdowns to avoid duplicates
    toolbar.querySelectorAll('.asai-dd-wrap').forEach(el => el.remove());

    const fontSelect = toolbar.querySelector('.editor-select-font');
    const sizeSelect = toolbar.querySelector('.editor-select-size');

    const fontDD = buildFontDropdown(editorEl);
    const sizeDD = buildSizeDropdown(editorEl);

    if (fontSelect) {
      fontSelect.insertAdjacentElement('afterend', fontDD);
    } else {
      toolbar.insertBefore(fontDD, toolbar.firstChild);
    }

    if (sizeSelect) {
      sizeSelect.insertAdjacentElement('afterend', sizeDD);
    } else {
      fontDD.insertAdjacentElement('afterend', sizeDD);
    }
  }
  /* ─────────────────────────────────────────────────────────
   * OVERRIDE setEditorFontFamily / setEditorFontSize
   * ───────────────────────────────────────────────────────── */
  window.setEditorFontFamily = function(editorIndex, selectOrValue) {
  const val = typeof selectOrValue === 'string'
    ? selectOrValue
    : selectOrValue?.value;
  if (!val || val === 'inherit') return;
  
  const font = FONTS.find(f => f.value === val || f.label === val);
  if (font?.google) loadGoogleFont(font.google);
  
  let editor = document.getElementById('editor-' + editorIndex)
            || document.getElementById('editEditor_' + editorIndex);
  
  // Fallback to active editor
  if (!editor) {
    const active = document.activeElement;
    if (active && active.classList && active.classList.contains('editor-content')) {
      editor = active;
    } else {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        let node = sel.getRangeAt(0).commonAncestorContainer;
        while (node && node !== document.body) {
          if (node.classList && node.classList.contains('editor-content')) {
            editor = node;
            break;
          }
          node = node.parentNode;
        }
      }
    }
  }
  
  if (!editor) {
    console.warn('Editor not found for font change');
    return;
  }
  
  if (typeof applyFontFamily === 'function') {
    applyFontFamily(val, editor);
  } else if (window.getSelection && !window.getSelection().isCollapsed) {
    document.execCommand('fontName', false, val);
  } else {
    editor.style.fontFamily = val;
  }
};
  /* ─────────────────────────────────────────────────────────
   * OVERRIDE setEditorFontSize (MISSING! This was the problem)
   * ───────────────────────────────────────────────────────── */
  window.setEditorFontSize = function(editorIndex, selectOrValue) {
    const raw = typeof selectOrValue === 'string'
      ? selectOrValue
      : selectOrValue?.value;
    if (!raw) return;
    
    let pxVal;
    if (String(raw).endsWith('px')) {
      pxVal = raw;
    } else if (String(raw).endsWith('pt')) {
      pxVal = Math.round(parseInt(raw) * 1.333) + 'px';
    } else {
      // Handle old 1-7 scale or plain numbers
      const n = parseInt(raw);
      const oldMap = { 
        1: '8px', 
        2: '10px', 
        3: '12px', 
        4: '14px', 
        5: '18px', 
        6: '24px', 
        7: '36px' 
      };
      pxVal = oldMap[n] || (n + 'px');
    }
    
    // Find the editor (try multiple methods)
    let editor = document.getElementById('editor-' + editorIndex)
              || document.getElementById('editEditor_' + editorIndex);
    
    // If not found by index, try to find the currently focused/active editor
    if (!editor) {
      const active = document.activeElement;
      if (active && active.classList && active.classList.contains('editor-content')) {
        editor = active;
      } else {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          let node = sel.getRangeAt(0).commonAncestorContainer;
          while (node && node !== document.body) {
            if (node.classList && node.classList.contains('editor-content')) {
              editor = node;
              break;
            }
            node = node.parentNode;
          }
        }
      }
    }
    
    if (!editor) {
      console.warn('Editor not found for fontSize change, index:', editorIndex);
      return;
    }
    
    // Apply the font size
    if (typeof applyFontSize === 'function') {
      applyFontSize(pxVal, editor);
    } else {
      // Fallback if applyFontSize doesn't exist
      const sel = window.getSelection();
      editor.focus();
      if (sel && !sel.isCollapsed) {
        try {
          document.execCommand('fontSize', false, raw);
        } catch(e) {
          const range = sel.getRangeAt(0);
          const span = document.createElement('span');
          span.style.fontSize = pxVal;
          range.surroundContents(span);
        }
      } else {
        editor.style.fontSize = pxVal;
      }
    }
  };
  /* ─────────────────────────────────────────────────────────
   * SCAN & UPGRADE ALL TOOLBARS
   * ───────────────────────────────────────────────────────── */
  function upgradeAllToolbars() {
    document.querySelectorAll('.editor-toolbar:not([data-font-fixed])').forEach(upgradeToolbar);
  }

  /* ─────────────────────────────────────────────────────────
   * OBSERVE DOM for new toolbars (modal opens / new topic)
   * ───────────────────────────────────────────────────────── */
  const obs = new MutationObserver(mutations => {
    const hasNewToolbar = mutations.some(m =>
      Array.from(m.addedNodes).some(n =>
        n.nodeType === 1 && (
          n.classList?.contains('editor-toolbar') ||
          n.querySelector?.('.editor-toolbar')
        )
      )
    );
    if (hasNewToolbar) upgradeAllToolbars();
  });
  obs.observe(document.body, { childList: true, subtree: true });

  /* ─────────────────────────────────────────────────────────
   * FIX 2 — patch addNewTopic
   *
   * WHY NEEDED:
   *   In admin.html, addNewTopic() builds toolbar HTML with
   *   hardcoded "0" for every new topic:
   *     onchange="setEditorFontSize(0, this)"   ← always 0
   *     onclick="formatText(0, 'justifyLeft')"  ← always 0
   *   So topic 2, 3, 4… all controlled editor-0 instead of
   *   their own editor.
   *
   * FIX:
   *   After the original function runs and adds the new topic
   *   to the DOM, we call upgradeAllToolbars(). Our custom
   *   dropdowns use toolbar.nextElementSibling (Fix 1) so
   *   they always bind to the correct editor regardless of
   *   what index was hardcoded in the onclick attributes.
   * ───────────────────────────────────────────────────────── */
  const _origAddNewTopic = window.addNewTopic;
  window.addNewTopic = function() {
    if (_origAddNewTopic) _origAddNewTopic.apply(this, arguments);
    setTimeout(upgradeAllToolbars, 150);
  };

  /* ─────────────────────────────────────────────────────────
   * FIX 3 — same patch for addEditTopic (edit chapter modal)
   *
   * Same root cause: hardcoded indices in the generated HTML.
   * ───────────────────────────────────────────────────────── */
  const _origAddEditTopic = window.addEditTopic;
  window.addEditTopic = function(existingTopic) {
    if (_origAddEditTopic) _origAddEditTopic.call(this, existingTopic);
    setTimeout(upgradeAllToolbars, 150);
  };

  /* ─────────────────────────────────────────────────────────
   * BOOT
   * ───────────────────────────────────────────────────────── */
  injectStyles();

 if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(upgradeAllToolbars, 300);
      setTimeout(upgradeAllToolbars, 800);
      setTimeout(upgradeAllToolbars, 1800);
    });
  } else {
    setTimeout(upgradeAllToolbars, 300);
    setTimeout(upgradeAllToolbars, 800);
    setTimeout(upgradeAllToolbars, 1800);
  }
  // Force hide original dropdowns after page loads
  setTimeout(function forceHideOriginalDropdowns() {
    const originalSelects = document.querySelectorAll('.editor-select-font, .editor-select-size');
    originalSelects.forEach(el => {
      el.style.cssText = 'display: none !important; visibility: hidden !important; width: 0 !important; height: 0 !important; position: absolute !important; opacity: 0 !important; pointer-events: none !important;';
    });
    if (originalSelects.length > 0) {
      console.log(`✅ Force-hid ${originalSelects.length} original font/size dropdowns`);
    }
  }, 500);
  // Hook modal openers — re-run upgrade after each opens
  function hookFn(name) {
    const orig = window[name];
    if (!orig || orig.__fontHooked) return;
    window[name] = function(...args) {
      const r = orig.apply(this, args);
      setTimeout(upgradeAllToolbars, 200);
      setTimeout(upgradeAllToolbars, 500);
      setTimeout(upgradeAllToolbars, 1000);
      return r;
    };
    window[name].__fontHooked = true;
  }

  // Hook immediately + retry after page fully loads
  ['openCreateChapterModal','openEditChapterModal',
   'addNewTopic','addEditTopic'].forEach(hookFn);

  setTimeout(() => {
    ['openCreateChapterModal','openEditChapterModal',
     'addNewTopic','addEditTopic'].forEach(hookFn);
  }, 2000);

 console.log('✅ ASAI Font Fix loaded — Method-A index extraction active');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runFontFix);
  } else {
    runFontFix();
  }

})();