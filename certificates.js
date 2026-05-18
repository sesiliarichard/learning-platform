// ============================================================
// ASAI — CERTIFICATES.JS  v6
// ONE CERTIFICATE per student after completing ALL courses.
// Auto-generated from selected template (Classic/Modern/Elegant
// or any custom template from cert-template-builder.js).
// Email sends automatically on issue — no upload needed.
// ============================================================

function getCertDB() {
    return window.supabaseClient || window.db;
}

let _allRows  = [];
let _certTpl  = localStorage.getItem('asai_selected_template') || 'classic';
let _criteria = { minQuizScore: 70, minCompletion: 80, requireAssignments: false };

const _genNum = () => `ASAI-${new Date().getFullYear()}-${Math.floor(Math.random()*99999).toString().padStart(5,'0')}`;
const _toast  = (m, t='success') => typeof showToast === 'function' ? showToast(m, t) : alert(m);
const _esc    = s => (s || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
const _setEl  = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };

// ============================================================
// BOOT
// ============================================================
async function loadCertificateSection() {
    // Reset tab state on every entry
    ['certEligible', 'certIssued', 'certSettings'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('active');
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('height', '0', 'important');
        el.style.setProperty('overflow', 'hidden', 'important');
    });

    // Activate first tab
    document.querySelectorAll('#certificatesSection .tabs .tab')
        .forEach(t => t.classList.remove('active'));
    const firstTab = document.querySelector('#certificatesSection .tabs .tab');
    if (firstTab) firstTab.classList.add('active');

    const firstPanel = document.getElementById('certEligible');
    if (firstPanel) {
        firstPanel.classList.add('active');
        firstPanel.style.setProperty('display', 'block', 'important');
        firstPanel.style.setProperty('visibility', 'visible', 'important');
        firstPanel.style.setProperty('height', 'auto', 'important');
        firstPanel.style.setProperty('overflow', 'visible', 'important');
    }

    await _loadCriteria();
    await loadEligibleStudents();
    await loadIssuedCerts();
}

async function _loadCriteria() {
    try {
        const { data } = await getCertDB()
            .from('certificate_criteria').select('*').eq('id', 1).maybeSingle();
        if (data) _criteria = {
            minQuizScore:       data.min_quiz_score      ?? 70,
            minCompletion:      data.min_completion      ?? 80,
            requireAssignments: data.require_assignments ?? false
        };
    } catch(_) {}
    const q = document.getElementById('minQuizScore');
    const c = document.getElementById('minCompletion');
    const a = document.getElementById('requireAssignments');
    if (q) q.value = _criteria.minQuizScore;
    if (c) c.value = _criteria.minCompletion;
    if (a) a.value = _criteria.requireAssignments ? 'yes' : 'no';
}

// ============================================================
// FETCH — one row per STUDENT across ALL courses
// ============================================================
async function _fetchAllStudentsForProgram() {
    const db = getCertDB();

    const { data: students, error: sErr } = await db
        .from('profiles')
        .select('id, first_name, last_name, email')
        .eq('role', 'student')
        .order('first_name');
    if (sErr) throw new Error('Could not load students: ' + sErr.message);
    if (!students || students.length === 0) return [];

    const { data: allCourses } = await db.from('courses').select('id, title').order('title');
    const totalCourses = (allCourses || []).length;

    const { data: enrollments }   = await db.from('enrollments').select('student_id, course_id, progress');
    const { data: quizSubs }      = await db.from('quiz_submissions').select('student_id, course_id, score');

    let assignments = [], assignSubs = [];
    try {
        const { data: aData } = await db.from('assignments').select('id, course_id');
        assignments = aData || [];
        const { data: sData } = await db.from('assignment_submissions').select('student_id, course_id');
        assignSubs = sData || [];
    } catch(_) {}

    let certs = [];
    try {
        const { data } = await db.from('certificates')
            .select('id, student_id, cert_number, published, revoked, issued_at, template, course_name, admin_approved, approved_at')
            .neq('revoked', true);
        certs = data || [];
    } catch(_) {}

    const rows = [];
    for (const student of students) {
        const myEnrollments = (enrollments || []).filter(e => e.student_id === student.id);

        const courseBreakdown = (allCourses || []).map(course => {
            const en       = myEnrollments.find(e => e.course_id === course.id);
            const progress = en ? (en.progress || 0) : 0;
            const myQ      = (quizSubs || []).filter(q => q.student_id === student.id && q.course_id === course.id);
            const avgQ     = myQ.length ? Math.round(myQ.reduce((s, q) => s + (q.score || 0), 0) / myQ.length) : 0;
            const totalA   = assignments.filter(a => a.course_id === course.id).length;
            const doneA    = assignSubs.filter(s => s.student_id === student.id && s.course_id === course.id).length;
            const courseDone = en
                && progress >= _criteria.minCompletion
                && avgQ >= _criteria.minQuizScore
                && (!_criteria.requireAssignments || totalA === 0 || doneA >= totalA);
            return { courseId: course.id, courseName: course.title, enrolled: !!en, progress, avgQ, totalA, doneA, courseDone };
        });

        const completedCourses    = courseBreakdown.filter(c => c.courseDone).length;
        const allCoursesCompleted = totalCourses > 0 && completedCourses === totalCourses;
        const enrolled            = courseBreakdown.filter(c => c.enrolled);
        const avgProgress         = enrolled.length ? Math.round(enrolled.reduce((s, c) => s + c.progress, 0) / enrolled.length) : 0;
        const avgQuiz             = enrolled.length ? Math.round(enrolled.reduce((s, c) => s + c.avgQ, 0) / enrolled.length) : 0;

        const existingCert = certs.find(c => c.student_id === student.id && !c.revoked);

        let status = 'pending';
        if (existingCert?.published)                                       status = 'published';
        else if (existingCert?.admin_approved && !existingCert?.published) status = 'approved';
        else if (existingCert && !existingCert?.admin_approved)            status = 'draft';
        else if (allCoursesCompleted)                                      status = 'eligible';

        rows.push({
            studentId:         student.id,
            studentName:       `${student.first_name} ${student.last_name}`,
            email:             student.email,
            totalCourses,
            enrolledCount:     enrolled.length,
            completedCourses,
            allCoursesCompleted,
            avgProgress,
            avgQuiz,
            courseBreakdown,
            status,
            certId:       existingCert?.id           || null,
            certNumber:   existingCert?.cert_number  || null,
            template:     existingCert?.template     || _certTpl,
            adminApproved: existingCert?.admin_approved || false,
        });
    }
    return rows;
}

// ============================================================
// LOAD ELIGIBLE STUDENTS TABLE
// ============================================================
async function loadEligibleStudents() {
    const container = document.getElementById('eligibleStudentsList');
    if (!container) return;

    container.innerHTML = `
        <div style="padding:60px;text-align:center;color:#6b7280;">
            <i class="fas fa-spinner fa-spin" style="font-size:32px;display:block;margin-bottom:16px;"></i>
            Loading students…
        </div>`;

    try {
        const statusFilter = document.getElementById('certStatusFilter')?.value || 'all';
        _allRows = await _fetchAllStudentsForProgram();

        const filtered = statusFilter === 'all' ? _allRows : _allRows.filter(r => {
            if (statusFilter === 'eligible') return r.status === 'eligible';
            if (statusFilter === 'issued')   return r.status === 'published' || r.status === 'approved';
            if (statusFilter === 'pending')  return r.status === 'pending' || r.status === 'draft';
            return true;
        });

        _renderStudentTable(filtered);
        _updateStatCards();
    } catch(err) {
        console.error('loadEligibleStudents:', err);
        container.innerHTML = `
            <div style="padding:50px;text-align:center;">
                <i class="fas fa-exclamation-triangle" style="font-size:36px;color:#ef4444;display:block;margin-bottom:16px;"></i>
                <p style="color:#ef4444;font-weight:600;">${err.message}</p>
                <button class="btn-secondary" style="margin-top:16px;" onclick="loadEligibleStudents()">
                    <i class="fas fa-redo"></i> Try Again
                </button>
            </div>`;
    }
}

// ============================================================
// RENDER TABLE
// ============================================================
function _renderStudentTable(rows) {
    const container = document.getElementById('eligibleStudentsList');
    if (!container) return;

    if (rows.length === 0) {
        container.innerHTML = `
            <div style="padding:80px 20px;text-align:center;">
                <i class="fas fa-users" style="font-size:52px;color:#e5e7eb;display:block;margin-bottom:20px;"></i>
                <p style="color:#374151;font-size:16px;font-weight:600;margin:0 0 8px;">No students found</p>
            </div>`;
        return;
    }

    const STATUS = {
        pending:   { label:'⏳ Pending',          bg:'#fef9c3', color:'#854d0e' },
        eligible:  { label:'✅ All Courses Done',  bg:'#dcfce7', color:'#14532d' },
        draft:     { label:'📄 Draft',             bg:'#ede9fe', color:'#4c1d95' },
        approved:  { label:'🏅 Approved',          bg:'#dbeafe', color:'#1e40af' },
        published: { label:'🎓 Certificate Sent',  bg:'#d1fae5', color:'#065f46' },
    };

    container.innerHTML = '';

    // Header
    const hdr = document.createElement('div');
    hdr.style.cssText = `
        display:grid;grid-template-columns:2.4fr 1fr 1fr 1fr 1.2fr 2fr;
        gap:12px;padding:10px 20px;background:#f8fafc;
        border-bottom:2px solid #e5e7eb;font-size:11px;font-weight:700;
        color:#6b7280;text-transform:uppercase;letter-spacing:0.7px;
        position:sticky;top:0;z-index:2;`;
    hdr.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="selectAllCerts" onchange="toggleSelectAllCerts(this)"
                   style="width:14px;height:14px;cursor:pointer;">
            <span>Student</span>
        </div>
        <div>Courses Done</div>
        <div>Avg Progress</div>
        <div>Avg Quiz</div>
        <div>Status</div>
        <div>Actions</div>`;
    container.appendChild(hdr);

    rows.forEach(r => {
        const st            = STATUS[r.status] || STATUS.pending;
        const initials      = r.studentName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        const progressColor = r.avgProgress >= _criteria.minCompletion ? '#10b981' : r.avgProgress >= 50 ? '#f59e0b' : '#ef4444';
        const quizColor     = r.avgQuiz >= _criteria.minQuizScore ? '#10b981' : '#ef4444';
        const sN            = _esc(r.studentName);
        const sE            = _esc(r.email);
        const sCN           = _esc(r.certNumber || '');
        const detailId      = `certDetail_${r.studentId.replace(/-/g,'_')}`;
        const cbDisabled    = r.status === 'pending' ? 'disabled' : '';

        // ── ACTION BUTTONS ─────────────────────────────────
        let actionBtn = '';

        // "Issue Certificate" button — shown for eligible, draft, approved students
        const issueBtn = (r.status === 'eligible' || r.status === 'draft')
            ? `<button onclick="issueCertificateForStudent('${r.studentId}','${sN}','${sE}')"
                    style="display:inline-flex;align-items:center;gap:8px;padding:9px 18px;
                           background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;
                           border:none;border-radius:10px;font-size:13px;font-weight:700;
                           cursor:pointer;font-family:inherit;white-space:nowrap;
                           box-shadow:0 4px 12px rgba(124,58,237,0.35);">
                    <i class="fas fa-award"></i> Issue Certificate
               </button>`
            : '';

        if (r.status === 'eligible' || r.status === 'draft') {
            actionBtn = issueBtn;
        } else if (r.status === 'approved') {
            actionBtn = `
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                    <button onclick="sendCertToStudent('${r.certId}','${sN}','${sE}','${sCN}','${_esc(r.template)}')"
                        style="display:inline-flex;align-items:center;gap:7px;padding:9px 16px;
                               background:linear-gradient(135deg,#059669,#10b981);color:white;
                               border:none;border-radius:10px;font-size:13px;font-weight:700;
                               cursor:pointer;font-family:inherit;white-space:nowrap;">
                        <i class="fas fa-paper-plane"></i> Send to Student
                    </button>
                    <button class="action-btn view" title="Preview"
                        onclick="previewGeneratedCert('${sN}','${sCN}','${_esc(r.template)}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>`;
        } else if (r.status === 'published') {
            actionBtn = `
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                    <span style="font-size:12px;color:#059669;font-weight:600;">
                        <i class="fas fa-check-circle"></i> Sent
                    </span>
                    <button class="action-btn view" title="Preview"
                        onclick="previewGeneratedCert('${sN}','${sCN}','${_esc(r.template)}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn delete" title="Revoke"
                        onclick="certRevoke('${r.certId}','${sN}')">
                        <i class="fas fa-ban"></i>
                    </button>
                </div>`;
        } else {
            // pending — not eligible yet
            const left = r.totalCourses - r.completedCourses;
            const pct  = r.totalCourses > 0 ? Math.round((r.completedCourses / r.totalCourses) * 100) : 0;
            actionBtn = `
                <div>
                    <div style="font-size:12px;color:#9ca3af;margin-bottom:4px;">
                        ${left} course${left !== 1 ? 's' : ''} remaining
                    </div>
                    <div style="width:120px;height:5px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
                        <div style="height:100%;width:${pct}%;background:#6366f1;border-radius:4px;"></div>
                    </div>
                </div>`;
        }

        // Course breakdown rows
        const courseRows = r.courseBreakdown.map(c => {
            const pCol = c.progress >= _criteria.minCompletion ? '#10b981' : '#f59e0b';
            const qCol = c.avgQ >= _criteria.minQuizScore ? '#10b981' : c.avgQ > 0 ? '#f59e0b' : '#9ca3af';
            return `
            <div style="display:grid;grid-template-columns:2fr 1fr 1fr 0.8fr;gap:10px;
                         padding:9px 20px 9px 36px;border-bottom:1px solid #f3f4f6;
                         align-items:center;background:${c.courseDone ? '#f0fdf4' : '#fafafa'};">
                <div style="font-size:13px;font-weight:600;color:#374151;">
                    ${c.courseDone ? '✅' : '⬜'} ${c.courseName}
                </div>
                <div>
                    ${c.enrolled
                        ? `<div style="font-size:11px;color:${pCol};font-weight:600;margin-bottom:3px;">${c.progress}%</div>
                           <div style="height:4px;background:#e5e7eb;border-radius:2px;overflow:hidden;">
                               <div style="height:100%;width:${Math.min(c.progress,100)}%;background:${pCol};border-radius:2px;"></div>
                           </div>`
                        : `<span style="font-size:11px;color:#d1d5db;">Not enrolled</span>`}
                </div>
                <div style="font-weight:700;font-size:14px;color:${qCol};">
                    ${c.avgQ > 0 ? c.avgQ + '%' : '—'}
                </div>
                <div>
                    ${c.courseDone
                        ? `<span style="color:#10b981;font-weight:700;font-size:12px;">✓ Done</span>`
                        : `<span style="color:#9ca3af;font-size:12px;">Incomplete</span>`}
                </div>
            </div>`;
        }).join('');

        const row = document.createElement('div');
        row.style.cssText = 'border-bottom:1px solid #f0f0f0;';
        row.innerHTML = `
            <div style="display:grid;grid-template-columns:2.4fr 1fr 1fr 1fr 1.2fr 2fr;
                        gap:12px;padding:16px 20px;align-items:center;transition:background 0.15s;"
                onmouseenter="this.style.background='#f8faff'"
                onmouseleave="this.style.background=''">

                <div style="display:flex;align-items:center;gap:10px;">
                    <input type="checkbox" class="cert-select-cb" ${cbDisabled}
                        style="width:14px;height:14px;cursor:pointer;flex-shrink:0;"
                        data-studentid="${r.studentId}"
                        data-studentname="${r.studentName}"
                        data-email="${r.email}">
                    <div style="width:38px;height:38px;min-width:38px;border-radius:50%;
                                background:linear-gradient(135deg,#7c3aed,#6d28d9);
                                display:flex;align-items:center;justify-content:center;
                                color:white;font-weight:800;font-size:14px;flex-shrink:0;">
                        ${initials}
                    </div>
                    <div>
                        <div style="font-weight:700;color:#1f2937;font-size:14px;">${r.studentName}</div>
                        <div style="font-size:12px;color:#6b7280;">${r.email}</div>
                    </div>
                </div>

                <div>
                    <div style="font-size:16px;font-weight:800;
                                color:${r.allCoursesCompleted ? '#10b981' : '#374151'};">
                        ${r.completedCourses}
                        <span style="font-size:12px;font-weight:400;color:#9ca3af;">/${r.totalCourses}</span>
                    </div>
                    <button onclick="toggleCourseBreakdown('${detailId}')"
                        style="background:none;border:none;color:#7c3aed;font-size:11px;font-weight:600;
                               cursor:pointer;padding:0;font-family:inherit;
                               display:flex;align-items:center;gap:4px;margin-top:3px;">
                        <i class="fas fa-list" style="font-size:10px;"></i> View courses
                    </button>
                </div>

                <div>
                    <div style="font-size:13px;font-weight:600;color:${progressColor};margin-bottom:4px;">
                        ${r.avgProgress}%
                    </div>
                    <div style="height:5px;background:#e5e7eb;border-radius:3px;overflow:hidden;width:80px;">
                        <div style="height:100%;width:${Math.min(r.avgProgress,100)}%;
                                    background:${progressColor};border-radius:3px;"></div>
                    </div>
                </div>

                <div style="font-weight:700;font-size:15px;color:${quizColor};">${r.avgQuiz}%</div>

                <div>
                    <span style="display:inline-block;padding:4px 10px;border-radius:20px;
                                 font-size:11px;font-weight:600;
                                 background:${st.bg};color:${st.color};">
                        ${st.label}
                    </span>
                </div>

                <div>${actionBtn}</div>
            </div>

            <!-- Course breakdown (collapsible) -->
            <div id="${detailId}" style="display:none;border-top:1px dashed #e5e7eb;">
                <div style="display:grid;grid-template-columns:2fr 1fr 1fr 0.8fr;gap:10px;
                             padding:8px 20px 8px 36px;background:#f0f4ff;
                             font-size:10px;font-weight:700;color:#9ca3af;
                             text-transform:uppercase;letter-spacing:0.8px;
                             border-bottom:1px solid #e9ecef;">
                    <div>Course</div><div>Progress</div><div>Quiz Score</div><div>Done?</div>
                </div>
                ${courseRows}
            </div>
        `;
        container.appendChild(row);
    });
}

function toggleCourseBreakdown(detailId) {
    const el = document.getElementById(detailId);
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ============================================================
// ISSUE CERTIFICATE — auto generates from selected template
// No upload needed. Uses existing Classic/Modern/Elegant/Custom.
// ============================================================
async function issueCertificateForStudent(studentId, studentName, email) {
    const template   = window.selectedTemplate || localStorage.getItem('asai_selected_template') || 'classic';
    const certNumber = _genNum();
    const courseName = 'ASAI Full Program Certificate';

    // Show confirm with the currently selected template
    const tplLabel = template.startsWith('custom-')
        ? (window.selectedCustomTplName || 'Custom Template')
        : template.charAt(0).toUpperCase() + template.slice(1);

    if (!confirm(
        `Issue certificate for ${studentName}?\n\n` +
        `Template: ${tplLabel}\n` +
        `A congratulations email will be sent to: ${email}\n\n` +
        `To change the template, go to Settings & Templates tab first.`
    )) return;

    try {
        const db = getCertDB();

        // Check if one already exists
        const { data: existing } = await db
            .from('certificates')
            .select('id')
            .eq('student_id', studentId)
            .eq('revoked', false)
            .maybeSingle();

        const certData = {
            student_id:     studentId,
            user_id:        studentId,
            course_id:      null,
            course_name:    courseName,
            cert_number:    certNumber,
            template:       template,
            admin_approved: true,
            approved_at:    new Date().toISOString(),
            published:      true,
            published_at:   new Date().toISOString(),
            revoked:        false,
            issued_at:      new Date().toISOString(),
        };

        let error;
        if (existing) {
            ({ error } = await db.from('certificates').update(certData).eq('id', existing.id));
        } else {
            ({ error } = await db.from('certificates').insert(certData));
        }
        if (error) throw error;

        // Send email automatically
        await _sendCertEmail({ studentName, email, courseName, certNumber, template });

        _toast(`🎓 Certificate issued for ${studentName}! Email sent.`);
        await loadEligibleStudents();
        await loadIssuedCerts();

    } catch(err) {
        _toast('Error: ' + err.message, 'error');
    }
}

// ── Send already-saved cert to student ───────────────────────
async function sendCertToStudent(certId, studentName, email, certNumber, template) {
    if (!confirm(`Send certificate email to ${studentName} at ${email}?`)) return;

    try {
        const { error } = await getCertDB()
            .from('certificates')
            .update({ published: true, published_at: new Date().toISOString() })
            .eq('id', certId);
        if (error) throw error;

        await _sendCertEmail({
            studentName, email,
            courseName: 'ASAI Full Program Certificate',
            certNumber, template
        });

        _toast(`✅ Certificate sent to ${studentName}!`);
        await loadEligibleStudents();
        await loadIssuedCerts();
    } catch(err) {
        _toast('Error: ' + err.message, 'error');
    }
}

// ── Bulk issue for selected students ─────────────────────────
async function bulkIssueCertificates() {
    const cbs = document.querySelectorAll('.cert-select-cb:checked:not(:disabled)');
    if (!cbs.length) { _toast('Select at least one student first', 'error'); return; }

    const template = window.selectedTemplate || localStorage.getItem('asai_selected_template') || 'classic';
    if (!confirm(`Issue certificates for ${cbs.length} student(s) using the current template?\nEmails will be sent automatically.`)) return;

    let ok = 0;
    for (const cb of cbs) {
        try {
            const certNumber = _genNum();
            const db = getCertDB();
            const { data: ex } = await db
                .from('certificates')
                .select('id').eq('student_id', cb.dataset.studentid).eq('revoked', false).maybeSingle();

            const certData = {
                student_id:     cb.dataset.studentid,
                user_id:        cb.dataset.studentid,
                course_id:      null,
                course_name:    'ASAI Full Program Certificate',
                cert_number:    certNumber,
                template:       template,
                admin_approved: true,
                approved_at:    new Date().toISOString(),
                published:      true,
                published_at:   new Date().toISOString(),
                revoked:        false,
                issued_at:      new Date().toISOString(),
            };

            if (ex) { await db.from('certificates').update(certData).eq('id', ex.id); }
            else    { const { error } = await db.from('certificates').insert(certData); if (error) continue; }

            await _sendCertEmail({
                studentName: cb.dataset.studentname,
                email:       cb.dataset.email,
                courseName:  'ASAI Full Program Certificate',
                certNumber,
                template
            });
            ok++;
        } catch(_) {}
    }
    _toast(`✅ ${ok} certificate(s) issued and emailed!`);
    await loadEligibleStudents();
    await loadIssuedCerts();
}

// ============================================================
// REVOKE
// ============================================================
async function certRevoke(certId, studentName) {
    if (!confirm(`⚠️ Revoke certificate for ${studentName}?\n\nThis cannot be undone.`)) return;
    const { error } = await getCertDB()
        .from('certificates')
        .update({ revoked: true, published: false, revoked_at: new Date().toISOString() })
        .eq('id', certId);
    if (error) { _toast('Error: ' + error.message, 'error'); return; }
    _toast('Certificate revoked.');
    await loadEligibleStudents();
    await loadIssuedCerts();
}

// ============================================================
// ISSUED CERTS TAB
// ============================================================
async function loadIssuedCerts() {
    const container = document.getElementById('issuedCertsList');
    if (!container) return;

    let certs = [];
    const { data, error } = await getCertDB()
        .from('certificates')
        .select(`id, cert_number, course_name, issued_at, published, published_at,
                 revoked, template, student_id,
                 profiles!certificates_student_id_fkey(first_name, last_name, email)`)
        .eq('revoked', false)
        .order('issued_at', { ascending: false });

    if (!error) {
        certs = data || [];
    } else {
        // Fallback without join
        const { data: c2 } = await getCertDB()
            .from('certificates')
            .select('id, cert_number, course_name, issued_at, published, published_at, revoked, template, student_id')
            .eq('revoked', false).order('issued_at', { ascending: false });
        const ids = [...new Set((c2 || []).map(c => c.student_id))];
        let profs = [];
        if (ids.length) {
            const { data: p } = await getCertDB()
                .from('profiles').select('id, first_name, last_name, email').in('id', ids);
            profs = p || [];
        }
        certs = (c2 || []).map(c => ({ ...c, profiles: profs.find(p => p.id === c.student_id) || null }));
    }

    _renderIssuedTable(certs);

    try {
        const { count } = await getCertDB()
            .from('certificates')
            .select('*', { count: 'exact', head: true }).eq('revoked', true);
        _setEl('totalRevokedCerts', count || 0);
    } catch(_) {}
}

function _renderIssuedTable(certs) {
    const container = document.getElementById('issuedCertsList');
    if (!container) return;

    if (!certs.length) {
        container.innerHTML = `
            <div style="padding:70px;text-align:center;color:#9ca3af;">
                <i class="fas fa-certificate" style="font-size:52px;display:block;margin-bottom:18px;opacity:0.2;"></i>
                <p style="font-size:16px;font-weight:600;margin:0 0 8px;color:#6b7280;">No certificates yet</p>
                <p style="font-size:13px;margin:0;">Issue certificates from the Eligible Students tab.</p>
            </div>`;
        return;
    }

    container.innerHTML = '';

    const hdr = document.createElement('div');
    hdr.style.cssText = `display:grid;grid-template-columns:2fr 2fr 1fr 1fr 1fr 1.5fr;
        gap:16px;padding:10px 20px;background:#f8fafc;border-bottom:2px solid #e5e7eb;
        font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.7px;`;
    hdr.innerHTML = `<div>Student</div><div>Certificate</div><div>Issued</div>
                     <div>Sent Date</div><div>Status</div><div>Actions</div>`;
    container.appendChild(hdr);

    certs.forEach(cert => {
        const name    = cert.profiles ? `${cert.profiles.first_name} ${cert.profiles.last_name}` : 'Unknown';
        const email   = cert.profiles?.email || '';
        const issued  = cert.issued_at    ? new Date(cert.issued_at).toLocaleDateString()    : '—';
        const pubDate = cert.published_at ? new Date(cert.published_at).toLocaleDateString() : '—';
        const sN  = _esc(name);
        const sE  = _esc(email);
        const sCN = _esc(cert.cert_number || '');
        const sTpl= _esc(cert.template || 'classic');

        const row = document.createElement('div');
        row.style.cssText = `display:grid;grid-template-columns:2fr 2fr 1fr 1fr 1fr 1.5fr;
            gap:16px;padding:14px 20px;border-bottom:1px solid #f3f4f6;
            align-items:center;transition:background 0.15s;`;
        row.onmouseenter = () => row.style.background = '#f9fafb';
        row.onmouseleave = () => row.style.background = '';

        row.innerHTML = `
            <div>
                <div style="font-weight:600;color:#1f2937;font-size:14px;">${name}</div>
                <div style="font-size:12px;color:#6b7280;">${email}</div>
            </div>
            <div>
                <div style="font-size:13px;font-weight:600;color:#374151;">
                    ${cert.course_name || 'ASAI Full Program'}
                </div>
                <div style="font-size:11px;color:#9ca3af;font-family:'Courier New',monospace;">
                    ${cert.cert_number || ''}
                </div>
            </div>
            <div style="font-size:13px;color:#6b7280;">${issued}</div>
            <div style="font-size:13px;color:#6b7280;">${pubDate}</div>
            <div>
                ${cert.published
                    ? `<span style="background:#d1fae5;color:#065f46;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;">🎓 Sent</span>`
                    : `<span style="background:#fef9c3;color:#854d0e;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;">⏳ Draft</span>`}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="action-btn view" title="Preview"
                    onclick="previewGeneratedCert('${sN}','${sCN}','${sTpl}')">
                    <i class="fas fa-eye"></i>
                </button>
                ${!cert.published
                    ? `<button onclick="sendCertToStudent('${cert.id}','${sN}','${sE}','${sCN}','${sTpl}')"
                           style="padding:5px 10px;background:#10b981;color:white;border:none;
                                  border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;
                                  white-space:nowrap;">
                           <i class="fas fa-paper-plane"></i> Send
                       </button>`
                    : ''}
                <button class="action-btn delete" title="Revoke"
                    onclick="certRevoke('${cert.id}','${sN}')">
                    <i class="fas fa-ban"></i>
                </button>
            </div>
        `;
        container.appendChild(row);
    });
}

// ============================================================
// PREVIEW — uses existing templates, no upload
// ============================================================
async function previewGeneratedCert(studentName, certNumber, template) {
    const tpl      = template || _certTpl;
    const date     = new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
    const courseName = 'ASAI Full Program Certificate';

    // Handle custom templates from cert-template-builder.js
    if (tpl.startsWith('custom-')) {
        const tplId = tpl.replace('custom-', '');
        try {
            const { data } = await getCertDB()
                .from('certificate_templates')
                .select('*').eq('id', tplId).single();
            if (data) {
                _renderPreviewModal(studentName, courseName, certNumber, date, _buildCustomTheme(data));
                return;
            }
        } catch(_) {}
    }

    // Built-in themes
    const THEMES = {
        classic: {
            bg:     'linear-gradient(160deg,#fdf6e3,#fef9ef,#f5e6c8)',
            border: '3px solid #b45309', inner: '1px solid #d97706',
            title:  '#78350f', name:  '#1f2937', nameUL: '#d97706',
            text:   '#78350f', sub:   '#92400e', org:    '#78350f',
            seal:   'radial-gradient(circle,#fef3c7,#fde68a)',
            sealB:  '3px solid #d97706', sealC: '#78350f'
        },
        modern: {
            bg:     'linear-gradient(135deg,#1e1b4b,#312e81)',
            border: 'none', inner: '1px solid rgba(165,180,252,0.2)',
            title:  '#a5b4fc', name: '#fff', nameUL: '#6366f1',
            text:   '#c7d2fe', sub:  '#a5b4fc', org:  '#c7d2fe',
            seal:   'radial-gradient(circle,#312e81,#1e1b4b)',
            sealB:  '3px solid #6366f1', sealC: '#a5b4fc'
        },
        elegant: {
            bg:     'linear-gradient(160deg,#0f2027,#203a43,#2c5364)',
            border: 'none', inner: '1px solid rgba(255,215,0,0.3)',
            title:  '#ffd700', name: '#fff', nameUL: '#ffd700',
            text:   '#b0c4ce', sub:  '#b0c4ce', org:  '#ffd700',
            seal:   'radial-gradient(circle,#203a43,#0f2027)',
            sealB:  '3px solid #ffd700', sealC: '#ffd700'
        }
    };

    const t = THEMES[tpl] || THEMES.classic;
    _renderPreviewModal(studentName, courseName, certNumber, date, t);
}

function _buildCustomTheme(data) {
    const hasImage = !!data.bg_image_url;
    const bc = { gold:'#ffd700', white:'rgba(255,255,255,0.5)', accent: data.accent_color, none:'transparent' };
    return {
        bg:      hasImage
                     ? `url('${data.bg_image_url}') center/cover no-repeat`
                     : `linear-gradient(135deg,${data.bg_color||'#1e1b4b'},${data.accent_color||'#7c3aed'})`,
        _hasImg: hasImage,
        border:  'none',
        inner:   `1px solid ${bc[data.border_style || 'gold']}`,
        title:   data.title_color  || '#ffd700',
        name:    data.name_color   || '#fff',
        nameUL:  data.accent_color || '#ffd700',
        text:    data.text_color   || '#c7d2fe',
        sub:     data.title_color  || '#ffd700',
        org:     data.title_color  || '#ffd700',
        seal:    'rgba(255,255,255,0.15)',
        sealB:   `2px solid ${data.accent_color || '#ffd700'}`,
        sealC:   data.title_color  || '#ffd700',
    };
}

function _renderPreviewModal(studentName, courseName, certNumber, date, t) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.style.zIndex = '5500';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:900px;">
            <div class="modal-header">
                <h2><i class="fas fa-certificate" style="color:#7c3aed;margin-right:8px;"></i>Certificate Preview</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="background:#e5e7eb;padding:28px;border-radius:14px;
                        display:flex;justify-content:center;overflow:auto;">
                <div style="width:720px;min-height:500px;background:${t.bg};border:${t.border};
                            padding:50px 60px;position:relative;font-family:Georgia,serif;
                            text-align:center;box-shadow:0 24px 70px rgba(0,0,0,0.35);
                            display:flex;flex-direction:column;align-items:center;
                            background-size:cover;background-position:center;">

                    ${t._hasImg ? `<div style="position:absolute;inset:0;background:rgba(5,10,30,0.62);z-index:0;"></div>` : ''}

                    <div style="position:relative;z-index:1;width:100%;display:flex;flex-direction:column;align-items:center;flex:1;">
                        <div style="position:absolute;inset:14px;border:${t.inner};pointer-events:none;border-radius:2px;"></div>
                        <div style="width:60px;height:60px;background:rgba(255,255,255,0.15);border-radius:50%;
                                    display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
                            <i class="fas fa-graduation-cap" style="color:white;font-size:24px;"></i>
                        </div>
                        <div style="font-size:11px;font-weight:700;letter-spacing:3.5px;text-transform:uppercase;
                                    color:${t.org};margin-bottom:20px;font-family:'Plus Jakarta Sans',sans-serif;">
                            ASAI — African School of AI
                        </div>
                        <div style="font-size:36px;font-weight:700;color:${t.title};line-height:1.1;margin-bottom:10px;">
                            Certificate of Completion
                        </div>
                        <div style="font-size:12px;color:${t.sub};letter-spacing:2.5px;text-transform:uppercase;
                                    margin-bottom:24px;font-family:'Plus Jakarta Sans',sans-serif;">
                            This is to certify that
                        </div>
                        <div style="font-size:34px;font-weight:700;color:${t.name};
                                    border-bottom:2px solid ${t.nameUL};padding-bottom:8px;
                                    margin-bottom:18px;min-width:300px;">
                            ${studentName}
                        </div>
                        <div style="font-size:13px;color:${t.text};font-style:italic;margin-bottom:8px;">
                            has successfully completed the full program
                        </div>
                        <div style="font-size:20px;font-weight:600;color:${t.name};margin-bottom:22px;">
                            ${courseName}
                        </div>
                        <div style="font-size:13px;color:${t.text};font-style:italic;
                                    max-width:460px;line-height:1.7;margin-bottom:28px;">
                            demonstrating knowledge, dedication, and commitment to excellence in AI education.
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:flex-end;
                                    width:100%;margin-top:auto;padding-top:16px;">
                            <div style="text-align:center;">
                                <div style="width:140px;height:1px;background:${t.sub};opacity:0.5;margin:0 auto 6px;"></div>
                                <div style="font-size:12px;font-weight:600;color:${t.text};font-family:'Plus Jakarta Sans',sans-serif;">
                                    Dr. Amina Mohammed
                                </div>
                                <div style="font-size:10px;color:${t.sub};font-family:'Plus Jakarta Sans',sans-serif;">
                                    Program Director
                                </div>
                            </div>
                            <div style="width:72px;height:72px;border-radius:50%;background:${t.seal};
                                        border:${t.sealB};display:flex;align-items:center;justify-content:center;">
                                <i class="fas fa-star" style="color:${t.sealC};font-size:22px;"></i>
                            </div>
                            <div style="text-align:center;">
                                <div style="width:140px;height:1px;background:${t.sub};opacity:0.5;margin:0 auto 6px;"></div>
                                <div style="font-size:12px;font-weight:600;color:${t.text};font-family:'Plus Jakarta Sans',sans-serif;">
                                    Date: ${date}
                                </div>
                                <div style="font-size:10px;color:${t.sub};font-family:'Plus Jakarta Sans',sans-serif;">
                                    Issue Date
                                </div>
                            </div>
                        </div>
                        <div style="position:absolute;bottom:16px;right:20px;font-size:9px;
                                    color:${t.sub};font-family:'Courier New',monospace;opacity:0.7;">
                            ID: ${certNumber || 'PREVIEW'}
                        </div>
                    </div>
                </div>
            </div>
            <div style="display:flex;gap:12px;margin-top:18px;">
                <button class="btn-secondary" onclick="this.closest('.modal').remove()" style="flex:1;">
                    Close
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ============================================================
// STAT CARDS
// ============================================================
function _updateStatCards() {
    _setEl('totalCertsIssued',      _allRows.filter(r => r.status === 'published').length);
    _setEl('totalEligibleStudents', _allRows.filter(r => r.status === 'eligible').length);
    _setEl('totalPendingCerts',     _allRows.filter(r => r.status === 'pending' || r.status === 'draft').length);
}

// ============================================================
// TEMPLATE / CRITERIA / TAB SWITCHER
// ============================================================
function selectTemplate(tpl) {
    _certTpl = tpl;
    window.selectedTemplate = tpl;
    localStorage.setItem('asai_selected_template', tpl);
    ['classic','modern','elegant'].forEach(t => {
        const card  = document.getElementById('tpl-' + t);
        const badge = document.getElementById('badge-' + t);
        if (card)  card.style.borderColor = t === tpl ? '#7c3aed' : '#e5e7eb';
        if (badge) badge.style.display    = t === tpl ? 'flex'    : 'none';
    });
    _toast(`Template "${tpl.charAt(0).toUpperCase() + tpl.slice(1)}" selected`);
}

async function saveCriteria() {
    const q = parseInt(document.getElementById('minQuizScore')?.value) || 70;
    const c = parseInt(document.getElementById('minCompletion')?.value) || 80;
    const a = document.getElementById('requireAssignments')?.value === 'yes';
    _criteria = { minQuizScore: q, minCompletion: c, requireAssignments: a };
    try {
        await getCertDB().from('certificate_criteria')
            .upsert({ id: 1, min_quiz_score: q, min_completion: c, require_assignments: a });
    } catch(err) { console.warn('Could not save criteria:', err.message); }
    _toast('Criteria saved! ✅');
    await loadEligibleStudents();
}

function toggleSelectAllCerts(cb) {
    document.querySelectorAll('.cert-select-cb:not(:disabled)')
        .forEach(c => c.checked = cb.checked);
}

function switchCertTab(tabId, btn) {
    const PANELS = ['certEligible', 'certIssued', 'certSettings'];
    document.querySelectorAll('#certificatesSection .tabs .tab')
        .forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');

    PANELS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('active');
        el.style.setProperty('display',     'none',    'important');
        el.style.setProperty('visibility',  'hidden',  'important');
        el.style.setProperty('height',      '0',       'important');
        el.style.setProperty('overflow',    'hidden',  'important');
        el.style.setProperty('padding',     '0',       'important');
        el.style.setProperty('margin',      '0',       'important');
    });

    const target = document.getElementById(tabId);
    if (target) {
        target.classList.add('active');
        target.style.setProperty('display',    'block',   'important');
        target.style.setProperty('visibility', 'visible', 'important');
        target.style.setProperty('height',     'auto',    'important');
        target.style.setProperty('overflow',   'visible', 'important');
        target.style.removeProperty('padding');
        target.style.removeProperty('margin');
    }

    if (tabId === 'certIssued')   loadIssuedCerts();
    if (tabId === 'certEligible') loadEligibleStudents();
}

// ── Aliases expected by admin.html inline script ─────────────
function openIssueCertModal() {
    const firstTab = document.querySelector('#certificatesSection .tabs .tab');
    switchCertTab('certEligible', firstTab);
    _toast('Select students below and click "Issue Certificate"');
}

async function viewEmailLog() {
    let certs = [];
    try {
        const { data } = await getCertDB()
            .from('certificates')
            .select(`cert_number, course_name, published_at, student_id,
                     profiles!certificates_student_id_fkey(first_name, last_name, email)`)
            .eq('published', true).eq('revoked', false)
            .order('published_at', { ascending: false });
        certs = data || [];
    } catch(_) {
        const { data: c2 } = await getCertDB()
            .from('certificates')
            .select('cert_number, course_name, published_at, student_id')
            .eq('published', true).eq('revoked', false)
            .order('published_at', { ascending: false });
        const ids = [...new Set((c2 || []).map(c => c.student_id))];
        let profs = [];
        if (ids.length) {
            const { data: p } = await getCertDB()
                .from('profiles').select('id, first_name, last_name, email').in('id', ids);
            profs = p || [];
        }
        certs = (c2 || []).map(c => ({ ...c, profiles: profs.find(p => p.id === c.student_id) || null }));
    }

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.style.zIndex = '5000';
    const logHTML = certs.length === 0
        ? `<div style="padding:60px;text-align:center;color:#9ca3af;">
               <i class="fas fa-inbox" style="font-size:40px;display:block;margin-bottom:14px;opacity:0.3;"></i>
               No certificate emails sent yet.
           </div>`
        : certs.map(c => `
            <div style="padding:16px;background:#f0fdf4;border-radius:10px;margin-bottom:10px;border-left:4px solid #10b981;">
                <div style="font-weight:600;color:#1f2937;margin-bottom:4px;">
                    📧 ${c.profiles ? c.profiles.first_name + ' ' + c.profiles.last_name : 'Unknown'}
                </div>
                <div style="font-size:12px;color:#6b7280;">${c.profiles?.email || '—'}</div>
                <div style="font-size:12px;color:#374151;margin-top:8px;line-height:1.8;">
                    <strong>Certificate:</strong> ${c.course_name || 'ASAI Program'}<br>
                    <strong>Sent:</strong> ${c.published_at ? new Date(c.published_at).toLocaleString() : '—'}<br>
                    <strong>ID:</strong> <span style="font-family:'Courier New',monospace;color:#7c3aed;">${c.cert_number}</span>
                </div>
            </div>`).join('');

    modal.innerHTML = `
        <div class="modal-content" style="max-width:680px;">
            <div class="modal-header">
                <h2><i class="fas fa-envelope-open-text" style="color:#7c3aed;margin-right:8px;"></i>Certificate Email Log</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()"><i class="fas fa-times"></i></button>
            </div>
            <p style="color:#6b7280;font-size:13px;margin-bottom:16px;">
                ${certs.length} email${certs.length !== 1 ? 's' : ''} sent
            </p>
            <div style="max-height:500px;overflow-y:auto;">${logHTML}</div>
            <button class="btn-secondary" onclick="this.closest('.modal').remove()" style="width:100%;margin-top:16px;">Close</button>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ============================================================
// EMAIL — sends via Supabase Edge Function
// ============================================================
async function _sendCertEmail({ studentName, email, courseName, certNumber, template }) {
    try {
        const db = getCertDB();
        const { data: { session } } = await db.auth.getSession();
        if (!session) { console.warn('No session — email skipped'); return; }

        const supabaseUrl = window.SUPABASE_URL
            || (typeof window.supabaseClient !== 'undefined' && window.supabaseClient.supabaseUrl)
            || '';

        if (!supabaseUrl) {
            // Fallback: log to console — add SUPABASE_URL to window if needed
            console.log('📧 Certificate email would send to:', email, '| Cert:', certNumber);
            return;
        }

        const tplLabel = (template || 'classic').startsWith('custom-')
            ? (window.selectedCustomTplName || 'Custom Template')
            : (template || 'classic').charAt(0).toUpperCase() + (template || 'classic').slice(1);

        const payload = {
            to:          email,
            studentName,
            courseName:  courseName || 'ASAI Full Program Certificate',
            certNumber,
            template:    tplLabel,
            issuedDate:  new Date().toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric'
            }),
        };

        const res = await fetch(`${supabaseUrl}/functions/v1/send-certificate-email`, {
            method: 'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify(payload),
        });

        const result = await res.json().catch(() => ({}));
        if (!res.ok) console.error('❌ Email failed:', result);
        else         console.log('✅ Certificate email sent to:', email);

    } catch(err) {
        console.error('❌ Email error:', err.message);
        // Don't throw — email failure shouldn't block certificate issuance
    }
}

// ============================================================
// EXPOSE GLOBALS
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    window.loadCertificateSection   = loadCertificateSection;
    window.loadEligibleStudents     = loadEligibleStudents;
    window.loadIssuedCerts          = loadIssuedCerts;
    window.bulkIssueCertificates    = bulkIssueCertificates;
    window.saveCriteria             = saveCriteria;
    window.selectTemplate           = selectTemplate;
    window.toggleSelectAllCerts     = toggleSelectAllCerts;
    window.switchCertTab            = switchCertTab;
    window.viewEmailLog             = viewEmailLog;
    window.openIssueCertModal       = openIssueCertModal;
    window.issueCertificateForStudent = issueCertificateForStudent;
    window.sendCertToStudent        = sendCertToStudent;
    window.certRevoke               = certRevoke;
    window.previewGeneratedCert     = previewGeneratedCert;
    window.toggleCourseBreakdown    = toggleCourseBreakdown;

    // Legacy aliases
    window.certPreview  = (sN, cN, num, tpl) => previewGeneratedCert(sN, num, tpl);
    window.previewCert  = (id, sN, cN, num, tpl) => previewGeneratedCert(sN, num, tpl);
    window.revokeCert   = certRevoke;
    window.togglePublishCert = (certId, currentlyPub, sName, email, cName, certNum) =>
        currentlyPub
            ? certRevoke(certId, sName)
            : sendCertToStudent(certId, sName, email, certNum, _certTpl);

    // Restore selected template from storage
    const saved = localStorage.getItem('asai_selected_template');
    if (saved && !saved.startsWith('custom-')) selectTemplate(saved);

    console.log('✅ certificates.js v6 loaded — One cert per student, auto-generates from selected template');
});