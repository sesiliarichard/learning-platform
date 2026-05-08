/**
 * ============================================================
 * ASAI LMS — Editor Font Fix (Simplified)
 * ============================================================
 */

(function() {
    'use strict';
    
    const isAdmin = document.querySelector('.admin-badge, .sidebar, [data-section="users"]');
    if (!isAdmin) return;
    
    // Force font on all editors
    function forceFontOnEditors() {
        const editors = document.querySelectorAll('.editor-content[contenteditable="true"]');
        
        editors.forEach(editor => {
            if (editor.getAttribute('data-font-force') === 'done') return;
            editor.setAttribute('data-font-force', 'done');
            
            // Set font on editor
            editor.style.fontFamily = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
            editor.style.fontSize = '14px';
            editor.style.lineHeight = '1.6';
            
            // Apply to all children
            const allElements = editor.querySelectorAll('*');
            allElements.forEach(el => {
                if (!el.style.fontFamily || el.style.fontFamily === '') {
                    el.style.fontFamily = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
                }
                if (!el.style.fontSize || el.style.fontSize === '') {
                    el.style.fontSize = '14px';
                }
            });
            
            // Wrap text nodes
            const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
            const textNodes = [];
            while (walker.nextNode()) textNodes.push(walker.currentNode);
            
            textNodes.forEach(node => {
                if (node.textContent.trim() && node.parentElement === editor) {
                    const span = document.createElement('span');
                    span.style.fontFamily = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
                    span.style.fontSize = '14px';
                    node.parentNode.insertBefore(span, node);
                    span.appendChild(node);
                }
            });
        });
    }
    
    // Watch for new editors
    const observer = new MutationObserver(() => {
        forceFontOnEditors();
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Run on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(forceFontOnEditors, 200);
            setTimeout(forceFontOnEditors, 800);
        });
    } else {
        setTimeout(forceFontOnEditors, 200);
        setTimeout(forceFontOnEditors, 800);
    }
    
    console.log('✅ ASAI Editor Font Fix loaded');
})();