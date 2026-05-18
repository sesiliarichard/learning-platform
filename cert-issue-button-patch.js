// ============================================================
// ASAI — CUSTOM CERT BUTTON PATCH
// cert-issue-button-patch.js
//
// HOW TO USE:
//   In admin.html <head>, add this AFTER certificates.js
//   and AFTER cert-custom-issuer.js:
//
//   <script src="cert-custom-issuer.js"></script>
//   <script src="cert-issue-button-patch.js"></script>
//
// That's it. No changes needed anywhere else.
// ============================================================

(function () {
    'use strict';

    // ── Button HTML builder ──────────────────────────────────
    function makeIssueBtn(studentId, studentName, email) {
        const sId   = (studentId   || '').toString();
        const sName = (studentName || '').replace(/'/g, "\\'");
        const sEmail= (email       || '').replace(/'/g, "\\'");

        const btn = document.createElement('button');
        btn.className      = 'custom-cert-issue-btn';
        btn.title          = 'Issue certificate using your own uploaded template image';
        btn.style.cssText  = `
            margin-top: 8px;
            display: flex;
            align-items: center;
            gap: 7px;
            width: 100%;
            padding: 8px 14px;
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            border: 1.5px solid rgba(226,185,111,0.55);
            border-radius: 10px;
            color: #e2b96f;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            font-family: 'Plus Jakarta Sans', sans-serif;
            transition: background 0.18s, color 0.18s, border-color 0.18s;
            white-space: nowrap;
            box-sizing: border-box;
        `;
        btn.innerHTML = '<i class="fas fa-file-import" style="font-size:11px;"></i> Issue Custom Cert';

        btn.onmouseenter = () => {
            btn.style.background   = 'linear-gradient(135deg, #e2b96f, #c8973d)';
            btn.style.color        = '#1a1a1a';
            btn.style.borderColor  = 'transparent';
        };
        btn.onmouseleave = () => {
            btn.style.background   = 'linear-gradient(135deg, #1a1a2e, #16213e)';
            btn.style.color        = '#e2b96f';
            btn.style.borderColor  = 'rgba(226,185,111,0.55)';
        };

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof openCustomCertIssuer === 'function') {
                openCustomCertIssuer(sId, sName, sEmail);
            } else {
                alert('Custom cert issuer not loaded.\nMake sure cert-custom-issuer.js is included before this file.');
            }
        });

        return btn;
    }

    // ── Inject buttons into all visible student rows ─────────
    function injectButtons() {
        // Find every cert-select-cb checkbox — one per student row
        const checkboxes = document.querySelectorAll(
            '#eligibleStudentsList .cert-select-cb'
        );

        checkboxes.forEach(cb => {
            const studentId   = cb.dataset.studentid;
            const studentName = cb.dataset.studentname;
            const email       = cb.dataset.email;
            if (!studentId) return;

            // Walk up to the grid row div
            // The row is the direct child of #eligibleStudentsList
            // that contains the checkbox
            const rowDiv = cb.closest('#eligibleStudentsList > div');
            if (!rowDiv) return;

            // The actions column is the LAST direct child div of the row
            // (it holds the existing action buttons like "Approve", "Send", etc.)
            const cells = Array.from(rowDiv.children);
            if (!cells.length) return;
            const actionCell = cells[cells.length - 1];

            // Skip if already injected for this student
            if (actionCell.querySelector('.custom-cert-issue-btn')) return;

            actionCell.appendChild(makeIssueBtn(studentId, studentName, email));
        });
    }

    // ── MutationObserver: re-inject whenever the list re-renders ──
    function watchEligibleList() {
        const container = document.getElementById('eligibleStudentsList');
        if (!container) {
            // Container not in DOM yet — retry
            setTimeout(watchEligibleList, 500);
            return;
        }

        // Initial injection in case rows already exist
        injectButtons();

        // Watch for any future re-renders (filter change, tab switch, etc.)
        const observer = new MutationObserver(() => {
            // Small debounce so we don't fire mid-render
            clearTimeout(observer._timer);
            observer._timer = setTimeout(injectButtons, 80);
        });

        observer.observe(container, { childList: true, subtree: true });
    }

    // ── Also re-inject when the Certificates nav tab is clicked ──
    document.addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item[data-section="certificates"]');
        if (navItem) {
            // Wait for the section to render, then inject
            setTimeout(injectButtons, 600);
            setTimeout(injectButtons, 1200);
        }

        // Also catch tab switches inside the certificates section
        const certTab = e.target.closest('#certificatesSection .tab');
        if (certTab) {
            setTimeout(injectButtons, 400);
        }
    });

    // ── Boot ────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watchEligibleList);
    } else {
        watchEligibleList();
    }

    console.log('✅ cert-issue-button-patch.js loaded — Custom cert button ready');

})();