// ============================================================
// CERTIFICATE FORCE-ISSUE PATCH
// Add this as a <script> tag at the bottom of admin.html,
// OR paste it at the end of the big <script> block.
//
// What it does:
//   • Adds a "⚡ Force Issue" button in the ACTIONS column for
//     every student/course row — regardless of progress/quiz status.
//   • Clicking it opens the same approval modal as the normal
//     "Issue" button, so admin can still pick template + notes.
//   • Once a cert is already published it shows nothing extra
//     (the existing view/unpublish buttons are enough).
// ============================================================

(function patchForceCertIssue() {

    // ── 1. The force-issue modal (same as issueSingleCert but labeled clearly) ──
    window.forceIssueCert = function(studentId, courseId, courseName, studentName, email) {
        document.getElementById('certApprovalModal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'certApprovalModal';
        modal.className = 'modal active';
        modal.style.zIndex = '5000';

        const initials = studentName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

        modal.innerHTML = `
            <div class="modal-content" style="max-width:500px;">
                <div class="modal-header">
                    <h2 style="display:flex;align-items:center;gap:10px;">
                        <span style="width:36px;height:36px;background:linear-gradient(135deg,#f59e0b,#d97706);
                                     border-radius:10px;display:inline-flex;align-items:center;
                                     justify-content:center;flex-shrink:0;">
                            <i class="fas fa-bolt" style="color:white;font-size:15px;"></i>
                        </span>
                        Force-Issue Certificate
                    </h2>
                    <button class="modal-close" onclick="document.getElementById('certApprovalModal').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <!-- Warning banner -->
                <div style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:12px;
                            padding:12px 16px;margin-bottom:18px;display:flex;gap:10px;
                            align-items:flex-start;font-size:13px;color:#92400e;">
                    <i class="fas fa-exclamation-triangle" style="color:#f59e0b;margin-top:2px;flex-shrink:0;"></i>
                    <span>
                        This student has <strong>not met the normal eligibility criteria</strong>
                        (80% progress + 70% quiz score). You are overriding the requirement
                        and issuing manually as admin.
                    </span>
                </div>

                <!-- Student info -->
                <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1.5px solid #fde68a;
                            border-radius:14px;padding:16px 18px;margin-bottom:18px;
                            display:flex;align-items:center;gap:14px;">
                    <div style="width:44px;height:44px;border-radius:50%;flex-shrink:0;
                                background:linear-gradient(135deg,#f59e0b,#d97706);
                                display:flex;align-items:center;justify-content:center;
                                color:white;font-weight:800;font-size:16px;">
                        ${initials}
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:700;color:#1f2937;font-size:16px;">${studentName}</div>
                        <div style="font-size:13px;color:#6b7280;">${email}</div>
                        <div style="font-size:12px;color:#92400e;margin-top:3px;font-weight:600;">
                            <i class="fas fa-book" style="margin-right:4px;"></i>${courseName}
                        </div>
                    </div>
                </div>

                <!-- Template selector -->
                <div style="margin-bottom:16px;">
                    <label style="display:block;font-weight:700;color:#374151;font-size:13px;margin-bottom:10px;">
                        <i class="fas fa-palette" style="color:#f59e0b;margin-right:6px;"></i>Certificate Template
                    </label>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
                        <div onclick="selectApprovalTemplate('classic',this)"
                            data-tpl="classic"
                            style="border:2px solid #f59e0b;border-radius:10px;overflow:hidden;cursor:pointer;">
                            <div style="height:44px;background:linear-gradient(135deg,#fdf6e3,#f5e6c8);
                                        display:flex;align-items:center;justify-content:center;font-size:18px;">🏅</div>
                            <div style="padding:5px;text-align:center;font-size:11px;font-weight:700;color:#374151;">Classic</div>
                        </div>
                        <div onclick="selectApprovalTemplate('modern',this)"
                            data-tpl="modern"
                            style="border:2px solid #e5e7eb;border-radius:10px;overflow:hidden;cursor:pointer;">
                            <div style="height:44px;background:linear-gradient(135deg,#1e1b4b,#312e81);
                                        display:flex;align-items:center;justify-content:center;font-size:18px;">⭐</div>
                            <div style="padding:5px;text-align:center;font-size:11px;font-weight:700;color:#374151;">Modern</div>
                        </div>
                        <div onclick="selectApprovalTemplate('elegant',this)"
                            data-tpl="elegant"
                            style="border:2px solid #e5e7eb;border-radius:10px;overflow:hidden;cursor:pointer;">
                            <div style="height:44px;background:linear-gradient(135deg,#0f2027,#2c5364);
                                        display:flex;align-items:center;justify-content:center;font-size:18px;">💎</div>
                            <div style="padding:5px;text-align:center;font-size:11px;font-weight:700;color:#374151;">Elegant</div>
                        </div>
                    </div>
                </div>

                <!-- Admin notes -->
                <div style="margin-bottom:18px;">
                    <label style="display:block;font-weight:700;color:#374151;font-size:13px;margin-bottom:8px;">
                        <i class="fas fa-sticky-note" style="color:#f59e0b;margin-right:6px;"></i>Reason / Notes (optional)
                    </label>
                    <textarea id="certApprovalNotes" rows="2"
                        placeholder="e.g. Completed course offline, special circumstances…"
                        style="width:100%;padding:11px;border:2px solid #e5e7eb;border-radius:10px;
                               font-size:13px;font-family:inherit;outline:none;resize:vertical;box-sizing:border-box;"
                        onfocus="this.style.borderColor='#f59e0b'"
                        onblur="this.style.borderColor='#e5e7eb'"></textarea>
                </div>

                <!-- Buttons -->
                <div style="display:flex;gap:10px;">
                    <button onclick="document.getElementById('certApprovalModal').remove()"
                        style="flex:1;padding:12px;border:2px solid #e5e7eb;border-radius:12px;
                               background:white;color:#6b7280;font-weight:700;cursor:pointer;
                               font-family:inherit;font-size:14px;">
                        Cancel
                    </button>
                    <button onclick="confirmIssueCert('${studentId}','${courseId}','${courseName.replace(/'/g,"\\'").replace(/"/g,'&quot;')}','${studentName.replace(/'/g,"\\'").replace(/"/g,'&quot;')}','${email}')"
                        style="flex:2;padding:12px;background:linear-gradient(135deg,#f59e0b,#d97706);
                               border:none;border-radius:12px;color:white;font-weight:800;cursor:pointer;
                               font-family:inherit;font-size:14px;display:flex;align-items:center;
                               justify-content:center;gap:8px;">
                        <i class="fas fa-bolt"></i> Force Issue Certificate
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    };


    // ── 2. Patch renderEligibleStudentsFixed to inject the force-issue button ──
    //       We override the function that was defined inline in admin.html.
    const _origRender = window.renderEligibleStudentsFixed;

    window.renderEligibleStudentsFixed = function(rows) {
        // Call the original renderer first so the DOM is built
        _origRender(rows);

        // Now find every course row and add the Force Issue button where needed
        // The rows are rendered as child divs of #eligibleStudentsList
        const container = document.getElementById('eligibleStudentsList');
        if (!container) return;

        // Walk all student cards → find course rows (grid divs inside the body)
        // Each card has a header + a body. Inside body, skip the sub-header row.
        const cards = container.querySelectorAll('[id^=""]');

        // Instead, we re-run our own injector after a brief tick so the DOM settles
        setTimeout(() => _injectForceButtons(rows), 50);
    };

    function _injectForceButtons(rows) {
        const container = document.getElementById('eligibleStudentsList');
        if (!container) return;

        // Build a lookup: studentId+courseId → row data
        const lookup = {};
        rows.forEach(r => {
            lookup[r.studentId + '|' + r.courseId] = r;
        });

        // Each student card is a direct child div of the container
        const cards = container.children;

        Array.from(cards).forEach(card => {
            // The body is the second child of the card (first = header)
            if (card.children.length < 2) return;
            const body = card.children[1];

            // Course rows are children of body starting from index 1 (0 = sub-header)
            const courseRows = Array.from(body.children).slice(1);

            courseRows.forEach(courseRow => {
                // Find the checkbox in this row to get student/course IDs
                const cb = courseRow.querySelector('input[type="checkbox"]');
                if (!cb) return;

                const studentId = cb.dataset.studentid;
                const courseId  = cb.dataset.courseid;
                if (!studentId || !courseId) return;

                const r = lookup[studentId + '|' + courseId];
                if (!r) return;

                // Only add the button if the cert is NOT already published
                if (r.certStatus === 'published') return;

                // Find the actions cell (last grid column = 5th child div)
                const cols = courseRow.querySelectorAll(':scope > div');
                if (!cols.length) return;
                const actionsCol = cols[cols.length - 1];
                if (!actionsCol) return;

                // Don't add twice
                if (actionsCol.querySelector('.force-issue-btn')) return;

                const sName   = r.studentName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                const sEmail  = r.email.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                const sCourse = r.courseName.replace(/'/g, "\\'").replace(/"/g, '&quot;');

                const btn = document.createElement('button');
                btn.className = 'force-issue-btn';
                btn.title = 'Force-issue certificate (override eligibility)';
                btn.style.cssText = `
                    margin-top: 6px;
                    padding: 5px 11px;
                    background: linear-gradient(135deg, #f59e0b, #d97706);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 11px;
                    font-weight: 700;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-family: inherit;
                    white-space: nowrap;
                    box-shadow: 0 2px 8px rgba(245,158,11,0.35);
                    transition: opacity 0.15s;
                `;
                btn.innerHTML = '<i class="fas fa-bolt"></i> Force Issue';
                btn.onmouseenter = () => btn.style.opacity = '0.85';
                btn.onmouseleave = () => btn.style.opacity = '1';
                btn.onclick = (e) => {
                    e.stopPropagation();
                    window.forceIssueCert(
                        r.studentId,
                        r.courseId,
                        r.courseName,
                        r.studentName,
                        r.email
                    );
                };

                actionsCol.appendChild(btn);
            });
        });
    }

    console.log('✅ Force-issue certificate patch loaded');
})();