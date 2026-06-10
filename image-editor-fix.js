/**
 * ============================================================
 * ASAI LMS — Image Editor Fix
 * Fixes:
 *   1. Paste image from clipboard into editor
 *   2. Insert image at cursor position (not top of editor)
 * ============================================================
 * Load this AFTER editor-enhancements.js and admin.html scripts
 * <script src="image-editor-fix.js"></script>
 * ============================================================
 */

(function () {
  'use strict';

  /* ============================================================
   * FIX 1 — PASTE IMAGE FROM CLIPBOARD
   * Handles Ctrl+V / Cmd+V when cursor is in an editor
   * ============================================================ */
  document.addEventListener('paste', async function (e) {
    const editor = e.target.closest('.editor-content[contenteditable="true"]');
    if (!editor) return;

    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find(item => item.type.startsWith('image/'));
    if (!imgItem) return;

    e.preventDefault();

    const file = imgItem.getAsFile();
    if (!file) return;

    // Read as base64 data URL
    const reader = new FileReader();
    reader.onload = function (ev) {
      const src = ev.target.result;
      _insertImageAtCursor(editor, src);
    };
    reader.readAsDataURL(file);
  });


  /* ============================================================
   * FIX 2 — INSERT IMAGE AT CURSOR POSITION
   * Overrides confirmInsertImage so the image lands where the
   * cursor actually is, not at the top of the editor.
   * ============================================================ */

  // Save cursor range whenever user clicks/types inside an editor
  let _savedRange = null;
  let _savedEditor = null;

  document.addEventListener('mouseup', function (e) {
    const editor = e.target.closest('.editor-content[contenteditable="true"]');
    if (!editor) return;
    _captureCursor(editor);
  });

  document.addEventListener('keyup', function (e) {
    const editor = e.target.closest('.editor-content[contenteditable="true"]');
    if (!editor) return;
    _captureCursor(editor);
  });

  // Also save when focus enters an editor
  document.addEventListener('focusin', function (e) {
    const editor = e.target.closest
      ? e.target.closest('.editor-content[contenteditable="true"]')
      : null;
    if (editor) _captureCursor(editor);
  }, true);

  function _captureCursor(editor) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    // Only save if cursor is actually inside this editor
    if (!editor.contains(range.commonAncestorContainer)) return;
    _savedRange  = range.cloneRange();
    _savedEditor = editor;
  }

  // ── Override the insertImage modal trigger ──
  const _origInsertImage = window.insertImage;
  window.insertImage = function (editorIndex) {
    // Capture cursor NOW before the modal opens and steals focus
    const editor = document.getElementById('editor-' + editorIndex)
                || document.getElementById('editEditor_' + editorIndex);
    if (editor) {
      _captureCursor(editor);
      // Store with the editor index so we can retrieve later
      editor.dataset.lastSavedRange = editorIndex;
    }
    // Call original to open the modal
    if (_origInsertImage) _origInsertImage.apply(this, arguments);
  };

  // ── Override confirmInsertImage (defined in admin.html inline script) ──
  // We watch for the function and replace it once it exists
  function _patchConfirmInsertImage () {
    const origConfirm = window.confirmInsertImage;
    if (!origConfirm || origConfirm.__imgFixed) return;

    window.confirmInsertImage = function (editorIndex) {
      const fileInput = document.getElementById('imgFileInput');
      const urlInput  = document.getElementById('imgUrlInput');
      const widthSel  = document.getElementById('imgWidth');
      const alignSel  = document.getElementById('imgAlign');

      const width = widthSel?.value || '100%';
      const align = alignSel?.value || 'block;margin:8px 0';

      // Find which editor to target
      let editor = document.getElementById('editor-' + editorIndex)
                || document.getElementById('editEditor_' + editorIndex);

      // Fallback: use the editor whose cursor we saved
      if (!editor && _savedEditor) editor = _savedEditor;

      if (!editor) {
        // Last resort: use any visible editor
        editor = document.querySelector('.editor-content[contenteditable="true"]');
      }

      const doInsert = (src) => {
        document.getElementById('imageInsertModal')?.remove();
        _insertImageAtCursor(editor, src, width, align);
      };

      if (fileInput?.files?.length > 0) {
        const reader = new FileReader();
        reader.onload = (e) => doInsert(e.target.result);
        reader.readAsDataURL(fileInput.files[0]);
      } else if (urlInput?.value?.trim()) {
        doInsert(urlInput.value.trim());
      } else {
        if (typeof showToast === 'function') showToast('Please select an image or enter a URL', 'error');
      }
    };

    window.confirmInsertImage.__imgFixed = true;
  }

  // Patch immediately and retry after page loads (function may not exist yet)
  _patchConfirmInsertImage();
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(_patchConfirmInsertImage, 500);
    setTimeout(_patchConfirmInsertImage, 1500);
  });
  setTimeout(_patchConfirmInsertImage, 800);
  setTimeout(_patchConfirmInsertImage, 2000);


  /* ============================================================
   * CORE: Insert an image at the saved cursor position
   * ============================================================ */
  function _insertImageAtCursor (editor, src, width, align) {
    if (!editor) return;
    width = width || '100%';
    align = align || 'block;margin:8px 0';

    // Build image HTML
    const imgHtml = `<div style="display:${align};width:${width};max-width:100%;"><img src="${src}" style="width:${width};max-width:100%;height:auto;display:block;border-radius:6px;" /></div><br>`;

    // Restore the saved cursor position if we have one for this editor
    const hasSavedCursor = _savedRange && _savedEditor === editor;

    if (hasSavedCursor) {
      // Restore selection then insert at that exact spot
      try {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(_savedRange);
        // Now the cursor is back where the user last clicked
        document.execCommand('insertHTML', false, imgHtml);
      } catch (err) {
        // Fallback: append to end
        editor.focus();
        document.execCommand('insertHTML', false, imgHtml);
      }
    } else {
      // No saved range — insert at current cursor or end of editor
      editor.focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        document.execCommand('insertHTML', false, imgHtml);
      } else {
        // Move cursor to end of editor then insert
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('insertHTML', false, imgHtml);
      }
    }

    // Clear saved range so it doesn't get reused
    _savedRange  = null;
    _savedEditor = null;

    // Wire up any resize handles from editor-enhancements.js
    setTimeout(() => {
      editor.querySelectorAll('img').forEach(img => {
        if (!img.closest('.wle-img-wrap') && typeof wrapImage === 'function') {
          wrapImage(img);
        }
      });
    }, 80);

    if (typeof showToast === 'function') showToast('Image inserted ✓');
  }

  // Expose for use by paste handler
  window._insertImageAtCursor = _insertImageAtCursor;


  /* ============================================================
   * Also patch the toolbar insertImage button click:
   * When admin clicks the 🖼 button in the toolbar, we must
   * capture the cursor BEFORE the modal steals focus.
   * ============================================================ */
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('button[onclick*="insertImage"]');
    if (!btn) return;
    // Find which editor this toolbar belongs to
    const toolbar = btn.closest('.editor-toolbar');
    if (!toolbar) return;
    const next = toolbar.nextElementSibling;
    const editor = (next?.classList.contains('editor-content') ? next : null)
                || toolbar.closest('[data-topic-index]')?.querySelector('.editor-content')
                || toolbar.closest('.form-group')?.querySelector('.editor-content');
    if (editor) _captureCursor(editor);
  });


  console.log('✅ image-editor-fix.js loaded — paste + cursor-position insert active');
})();