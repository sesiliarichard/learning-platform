// ============================================================
// ASAI — CERTIFICATES.JS  v5
// ONE CERTIFICATE per student after completing ALL courses.
// Admin sees overall progress across all courses per student.
// "Approve Certificate" button appears when student completes all.
// ============================================================

function getCertDB() {
    return window.supabaseClient || window.db;
}
const _certDB = new Proxy({}, {
    get(_, prop) {
        const client = window.supabaseClient || window.db;
        if (!client) throw new Error('Supabase not ready');
        return client[prop];
    }
});

let _allRows  = [];
let _certTpl  = 'classic';
let _criteria = { minQuizScore: 70, minCompletion: 80, requireAssignments: false };

const _genNum = () => `ASAI-${new Date().getFullYear()}-${Math.floor(Math.random()*99999).toString().padStart(5,'0')}`;
const _toast  = (m,t='success') => typeof showToast==='function' ? showToast(m,t) : alert(m);
const _esc    = s => (s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
const _setEl  = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };

// ============================================================
// BOOT
// ============================================================
let _certSectionLoaded = false;

async function loadCertificateSection() {
    // Always reset tab state on every entry
    _certSectionLoaded = false;

    // Force-hide all panels immediately
    ['certEligible', 'certIssued', 'certSettings'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('active');
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('height', '0', 'important');
        el.style.setProperty('overflow', 'hidden', 'important');
    });

    // Activate first tab button and its panel
    document.querySelectorAll('#certificatesSection .tabs .tab').forEach(t => t.classList.remove('active'));
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

    _certSectionLoaded = true;
    await _loadCriteria();
    await populateCertCourseFilter();
    await loadEligibleStudents();
    await loadIssuedCerts();
}
async function _loadCriteria() {
    try {
        const { data } = await _certDB.from('certificate_criteria').select('*').eq('id',1).maybeSingle();
        if (data) _criteria = {
            minQuizScore:       data.min_quiz_score      ?? 70,
            minCompletion:      data.min_completion      ?? 80,
            requireAssignments: data.require_assignments ?? false
        };
    } catch(_) {}
    const q = document.getElementById('minQuizScore');
    const c = document.getElementById('minCompletion');
    const a = document.getElementById('requireAssignments');
    if(q) q.value = _criteria.minQuizScore;
    if(c) c.value = _criteria.minCompletion;
    if(a) a.value = _criteria.requireAssignments ? 'yes' : 'no';
}

async function populateCertCourseFilter() {
    // Program-wide cert — no per-course filter needed
    const sel = document.getElementById('certCourseFilter');
    if (!sel) return;
}

// ============================================================
// FETCH — one row per STUDENT (not per course)
// ============================================================
async function _fetchAllStudentsForProgram() {
    console.log('[Certs v5] Fetching all students for program certificate...');

    const { data: students, error: sErr } = await _certDB
        .from('profiles')
        .select('id, first_name, last_name, email')
        .eq('role', 'student')
        .order('first_name');

    if (sErr) throw new Error('Could not load students: ' + sErr.message);
    if (!students || students.length === 0) return [];

    // ALL courses in the system
    const { data: allCourses } = await _certDB
        .from('courses')
        .select('id, title')
        .order('title');
    const totalCourses = (allCourses || []).length;

    // Enrollments
    const { data: enrollments } = await _certDB
        .from('enrollments')
        .select('student_id, course_id, progress');
    const enrollArr = enrollments || [];

    // Quiz submissions
    const { data: quizSubs } = await _certDB
        .from('quiz_submissions')
        .select('student_id, course_id, score');
    const quizArr = quizSubs || [];

    // Assignments
    let assignments = [], assignSubs = [];
    try {
        const { data: aData } = await _certDB.from('assignments').select('id, course_id');
        assignments = aData || [];
        const { data: sData } = await _certDB.from('assignment_submissions').select('student_id, course_id');
        assignSubs = sData || [];
    } catch(_) {}

    // Certificates
    let certs = [];
    try {
        const { data } = await _certDB.from('certificates')
            .select('id, student_id, course_id, cert_number, published, revoked, issued_at, template, course_name, admin_approved, approved_at')
            .neq('revoked', true);
        certs = data || [];
    } catch(_) {}

    const rows = [];

    for (const student of students) {
        const myEnrollments = enrollArr.filter(e => e.student_id === student.id);

        const courseBreakdown = (allCourses || []).map(course => {
            const en = myEnrollments.find(e => e.course_id === course.id);
            const progress = en ? (en.progress || 0) : 0;
            const myQ = quizArr.filter(q => q.student_id === student.id && q.course_id === course.id);
            const avgQ = myQ.length ? Math.round(myQ.reduce((s,q) => s+(q.score||0),0) / myQ.length) : 0;
            const totalA = assignments.filter(a => a.course_id === course.id).length;
            const doneA  = assignSubs.filter(s => s.student_id === student.id && s.course_id === course.id).length;
            const courseDone = en && progress >= _criteria.minCompletion && avgQ >= _criteria.minQuizScore
                && (!_criteria.requireAssignments || totalA === 0 || doneA >= totalA);
            return { courseId: course.id, courseName: course.title, enrolled: !!en, progress, avgQ, totalA, doneA, courseDone };
        });

        const completedCourses    = courseBreakdown.filter(c => c.courseDone).length;
        const allCoursesCompleted = totalCourses > 0 && completedCourses === totalCourses;

        const enrolled = courseBreakdown.filter(c => c.enrolled);
        const avgProgress = enrolled.length ? Math.round(enrolled.reduce((s,c) => s + c.progress, 0) / enrolled.length) : 0;
        const avgQuiz     = enrolled.length ? Math.round(enrolled.reduce((s,c) => s + c.avgQ, 0) / enrolled.length) : 0;

        const existingCert = certs.find(c => c.student_id === student.id && !c.revoked);

        let status = 'pending';
        if (existingCert?.published)                                        status = 'published';
        else if (existingCert?.admin_approved && !existingCert?.published)  status = 'approved';
        else if (existingCert && !existingCert?.admin_approved)             status = 'draft';
        else if (allCoursesCompleted)                                       status = 'eligible';

        rows.push({
            studentId: student.id,
            studentName: `${student.first_name} ${student.last_name}`,
            email: student.email,
            totalCourses, enrolledCount: enrolled.length,
            completedCourses, allCoursesCompleted,
            avgProgress, avgQuiz, courseBreakdown, status,
            certId:       existingCert?.id          || null,
            certNumber:   existingCert?.cert_number || null,
            template:     existingCert?.template    || 'classic',
            adminApproved: existingCert?.admin_approved || false,
            approvedAt:   existingCert?.approved_at    || null
        });
    }

    console.log('[Certs v5] Rows built:', rows.length);
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
            Loading all students…
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
                <p style="color:#ef4444;font-weight:600;font-size:16px;">Failed to load students</p>
                <p style="color:#6b7280;font-size:13px;max-width:400px;margin:8px auto;">${err.message}</p>
                <button class="btn-secondary" style="margin-top:16px;" onclick="loadEligibleStudents()">
                    <i class="fas fa-redo"></i> Try Again
                </button>
            </div>`;
    }
}

// ============================================================
// RENDER TABLE — one row per student, shows all course progress
// ============================================================
function _renderStudentTable(rows) {
    const container = document.getElementById('eligibleStudentsList');
    if (!container) return;

    if (rows.length === 0) {
        container.innerHTML = `
            <div style="padding:80px 20px;text-align:center;">
                <i class="fas fa-users" style="font-size:52px;color:#e5e7eb;display:block;margin-bottom:20px;"></i>
                <p style="color:#374151;font-size:16px;font-weight:600;margin:0 0 8px;">No students found</p>
                <p style="color:#9ca3af;font-size:14px;">No students match this filter yet.</p>
            </div>`;
        return;
    }

    const STATUS = {
        pending:   { label:'⏳ Pending',         bg:'#fef9c3', color:'#854d0e' },
        eligible:  { label:'✅ All Courses Done', bg:'#dcfce7', color:'#14532d' },
        draft:     { label:'📄 Draft',            bg:'#ede9fe', color:'#4c1d95' },
        approved:  { label:'🏅 Approved',         bg:'#dbeafe', color:'#1e40af' },
        published: { label:'🎓 Certificate Sent', bg:'#d1fae5', color:'#065f46' },
        revoked:   { label:'🚫 Revoked',          bg:'#fee2e2', color:'#7f1d1d' },
    };

    container.innerHTML = '';

    // TABLE HEADER
    const hdr = document.createElement('div');
    hdr.style.cssText = `
        display:grid;grid-template-columns:2.4fr 1fr 1fr 1fr 1.2fr 2fr;
        gap:12px;padding:10px 20px;background:#f8fafc;
        border-bottom:2px solid #e5e7eb;font-size:11px;font-weight:700;
        color:#6b7280;text-transform:uppercase;letter-spacing:0.7px;
        position:sticky;top:0;z-index:2;`;
    hdr.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="selectAllCerts" onchange="toggleSelectAllCerts(this)" style="width:14px;height:14px;cursor:pointer;">
            <span>Student</span>
        </div>
        <div>Courses Done</div>
        <div>Avg Progress</div>
        <div>Avg Quiz</div>
        <div>Status</div>
        <div>Actions</div>`;
    container.appendChild(hdr);

    rows.forEach(r => {
        const st = STATUS[r.status] || STATUS.pending;
        const initials = r.studentName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2);
        const progressColor = r.avgProgress >= _criteria.minCompletion ? '#10b981' : r.avgProgress >= 50 ? '#f59e0b' : '#ef4444';
        const quizColor     = r.avgQuiz >= _criteria.minQuizScore ? '#10b981' : '#ef4444';

        const sN  = _esc(r.studentName);
        const sE  = _esc(r.email);
        const sCN = _esc(r.certNumber || '');
        const sTpl = _esc(r.template || 'classic');
        const detailId = `certDetail_${r.studentId.replace(/-/g,'_')}`;

        // ACTION BUTTON
        let actionBtn = '';
        if (r.status === 'eligible') {
            actionBtn = `
                <button onclick="approveCertificate('${r.studentId}','${sN}','${sE}')"
                    style="display:inline-flex;align-items:center;gap:8px;padding:9px 18px;
                           background:linear-gradient(135deg,#1d4ed8,#2563eb);color:white;
                           border:none;border-radius:10px;font-size:13px;font-weight:700;
                           cursor:pointer;font-family:inherit;white-space:nowrap;
                           box-shadow:0 4px 12px rgba(37,99,235,0.35);">
                    <i class="fas fa-check-circle"></i> Approve Certificate
                </button>`;
        } else if (r.status === 'approved') {
            actionBtn = `
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                    <button onclick="publishApprovedCert('${r.certId}','${sN}','${sE}','${sCN}')"
                        style="display:inline-flex;align-items:center;gap:7px;padding:9px 16px;
                               background:linear-gradient(135deg,#059669,#10b981);color:white;
                               border:none;border-radius:10px;font-size:13px;font-weight:700;
                               cursor:pointer;font-family:inherit;white-space:nowrap;">
                        <i class="fas fa-paper-plane"></i> Send to Student
                    </button>
                    <button class="action-btn view" title="Preview"
                        onclick="certPreview('${sN}','ASAI Program Certificate','${sCN}','${sTpl}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>`;
        } else if (r.status === 'published') {
            actionBtn = `
                <div style="display:flex;gap:6px;align-items:center;">
                    <span style="font-size:12px;color:#059669;font-weight:600;"><i class="fas fa-check-circle"></i> Sent</span>
                    <button class="action-btn view" title="Preview" onclick="certPreview('${sN}','ASAI Program Certificate','${sCN}','${sTpl}')"><i class="fas fa-eye"></i></button>
                    <button class="action-btn edit" title="Unpublish" style="color:#f59e0b;" onclick="certUnpublish('${r.certId}','${sN}')"><i class="fas fa-eye-slash"></i></button>
                    <button class="action-btn delete" title="Revoke" onclick="certRevoke('${r.certId}','${sN}')"><i class="fas fa-ban"></i></button>
                </div>`;
        } else if (r.status === 'draft') {
            actionBtn = `
                <div style="display:flex;gap:6px;">
                    <button onclick="approveCertificate('${r.studentId}','${sN}','${sE}')"
                        style="display:inline-flex;align-items:center;gap:7px;padding:8px 14px;
                               background:linear-gradient(135deg,#1d4ed8,#2563eb);color:white;
                               border:none;border-radius:10px;font-size:12px;font-weight:700;
                               cursor:pointer;font-family:inherit;white-space:nowrap;">
                        <i class="fas fa-check-circle"></i> Approve
                    </button>
                    <button class="action-btn view" title="Preview" onclick="certPreview('${sN}','ASAI Program Certificate','${sCN}','${sTpl}')"><i class="fas fa-eye"></i></button>
                </div>`;
        } else {
            const left = r.totalCourses - r.completedCourses;
            const pct  = r.totalCourses > 0 ? Math.round((r.completedCourses/r.totalCourses)*100) : 0;
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

        // COURSE BREAKDOWN ROWS
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
                        ${c.enrolled ? `
                        <div style="font-size:11px;color:${pCol};font-weight:600;margin-bottom:3px;">${c.progress}%</div>
                        <div style="height:4px;background:#e5e7eb;border-radius:2px;overflow:hidden;">
                            <div style="height:100%;width:${Math.min(c.progress,100)}%;background:${pCol};border-radius:2px;"></div>
                        </div>` : `<span style="font-size:11px;color:#d1d5db;">Not enrolled</span>`}
                    </div>
                    <div style="font-weight:700;font-size:14px;color:${qCol};">${c.avgQ > 0 ? c.avgQ + '%' : '—'}</div>
                    <div>${c.courseDone ? `<span style="color:#10b981;font-weight:700;font-size:12px;">✓ Done</span>` : `<span style="color:#9ca3af;font-size:12px;">Incomplete</span>`}</div>
                </div>`;
        }).join('');

        const cbDisabled = (r.status === 'pending') ? 'disabled' : '';

        const row = document.createElement('div');
        row.style.cssText = 'border-bottom:1px solid #f0f0f0;';
        row.innerHTML = `
            <!-- MAIN ROW -->
            <div style="display:grid;grid-template-columns:2.4fr 1fr 1fr 1fr 1.2fr 2fr;
                        gap:12px;padding:16px 20px;align-items:center;transition:background 0.15s;"
                onmouseenter="this.style.background='#f8faff'"
                onmouseleave="this.style.background=''">

                <div style="display:flex;align-items:center;gap:10px;">
                    <input type="checkbox" class="cert-select-cb" ${cbDisabled}
                        style="width:14px;height:14px;cursor:pointer;flex-shrink:0;"
                        data-studentid="${r.studentId}" data-studentname="${r.studentName}" data-email="${r.email}">
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
                    <div style="font-size:16px;font-weight:800;color:${r.allCoursesCompleted ? '#10b981' : '#374151'};">
                        ${r.completedCourses}<span style="font-size:12px;font-weight:400;color:#9ca3af;">/${r.totalCourses}</span>
                    </div>
                    <button onclick="toggleCourseBreakdown('${detailId}')"
                        style="background:none;border:none;color:#7c3aed;font-size:11px;font-weight:600;
                               cursor:pointer;padding:0;font-family:inherit;display:flex;align-items:center;gap:4px;margin-top:3px;">
                        <i class="fas fa-list" style="font-size:10px;"></i> View courses
                    </button>
                </div>

                <div>
                    <div style="font-size:13px;font-weight:600;color:${progressColor};margin-bottom:4px;">${r.avgProgress}%</div>
                    <div style="height:5px;background:#e5e7eb;border-radius:3px;overflow:hidden;width:80px;">
                        <div style="height:100%;width:${Math.min(r.avgProgress,100)}%;background:${progressColor};border-radius:3px;"></div>
                    </div>
                </div>

                <div style="font-weight:700;font-size:15px;color:${quizColor};">${r.avgQuiz}%</div>

                <div>
                    <span style="display:inline-block;padding:4px 10px;border-radius:20px;
                                 font-size:11px;font-weight:600;background:${st.bg};color:${st.color};">
                        ${st.label}
                    </span>
                </div>

                <div>${actionBtn}</div>
            </div>

            <!-- COURSE BREAKDOWN (collapsible) -->
            <div id="${detailId}" style="display:none;border-top:1px dashed #e5e7eb;">
                <div style="display:grid;grid-template-columns:2fr 1fr 1fr 0.8fr;gap:10px;
                             padding:8px 20px 8px 36px;background:#f0f4ff;
                             font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;
                             letter-spacing:0.8px;border-bottom:1px solid #e9ecef;">
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
// APPROVE CERTIFICATE MODAL
// ============================================================
async function approveCertificate(studentId, studentName, email) {
    document.getElementById('certApproveModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'certApproveModal';
    modal.className = 'modal active';
    modal.style.zIndex = '5000';

    const initials = studentName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0,2);

    modal.innerHTML = `
        <div class="modal-content" style="max-width:520px;">
            <div class="modal-header">
                <h2 style="display:flex;align-items:center;gap:10px;">
                    <span style="width:38px;height:38px;background:linear-gradient(135deg,#1d4ed8,#2563eb);
                                 border-radius:10px;display:inline-flex;align-items:center;justify-content:center;">
                        <i class="fas fa-check-circle" style="color:white;font-size:16px;"></i>
                    </span>
                    Approve Program Certificate
                </h2>
                <button class="modal-close" onclick="document.getElementById('certApproveModal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <!-- Student info -->
            <div style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border:1.5px solid #bfdbfe;
                        border-radius:14px;padding:18px 20px;margin-bottom:20px;
                        display:flex;align-items:center;gap:14px;">
                <div style="width:50px;height:50px;border-radius:50%;
                            background:linear-gradient(135deg,#7c3aed,#6d28d9);
                            display:flex;align-items:center;justify-content:center;
                            color:white;font-weight:800;font-size:18px;flex-shrink:0;">
                    ${initials}
                </div>
                <div>
                    <div style="font-weight:700;color:#1f2937;font-size:16px;">${studentName}</div>
                    <div style="font-size:13px;color:#6b7280;">${email}</div>
                    <div style="font-size:12px;color:#1d4ed8;margin-top:4px;font-weight:600;">
                        <i class="fas fa-graduation-cap" style="margin-right:4px;"></i>ASAI Full Program Certificate
                    </div>
                </div>
                <i class="fas fa-check-circle" style="color:#10b981;font-size:28px;margin-left:auto;"></i>
            </div>

            <!-- Info note -->
            <div style="background:#fef9c3;border:1.5px solid #fde68a;border-radius:12px;
                        padding:14px 16px;margin-bottom:20px;font-size:13px;color:#78350f;
                        display:flex;gap:10px;align-items:flex-start;">
                <i class="fas fa-info-circle" style="margin-top:2px;flex-shrink:0;color:#d97706;"></i>
                <span>
                    <strong>Approve Only</strong> — creates the record, student notified later when you click "Send".<br>
                    <strong>Approve & Send Now</strong> — immediately emails the certificate to the student.
                </span>
            </div>

            <!-- Template selector -->
            <div style="margin-bottom:20px;">
                <label style="display:block;font-weight:700;color:#374151;font-size:13px;margin-bottom:10px;">
                    <i class="fas fa-palette" style="color:#7c3aed;margin-right:6px;"></i>Certificate Template
                </label>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
                    <div onclick="selectApproveTemplate('classic',this)" data-tpl="classic"
                        style="border:2px solid #7c3aed;border-radius:10px;overflow:hidden;cursor:pointer;">
                        <div style="height:48px;background:linear-gradient(135deg,#fdf6e3,#f5e6c8);display:flex;align-items:center;justify-content:center;font-size:18px;">🏅</div>
                        <div style="padding:5px;text-align:center;font-size:11px;font-weight:700;color:#374151;">Classic</div>
                    </div>
                    <div onclick="selectApproveTemplate('modern',this)" data-tpl="modern"
                        style="border:2px solid #e5e7eb;border-radius:10px;overflow:hidden;cursor:pointer;">
                        <div style="height:48px;background:linear-gradient(135deg,#1e1b4b,#312e81);display:flex;align-items:center;justify-content:center;font-size:18px;">⭐</div>
                        <div style="padding:5px;text-align:center;font-size:11px;font-weight:700;color:#374151;">Modern</div>
                    </div>
                    <div onclick="selectApproveTemplate('elegant',this)" data-tpl="elegant"
                        style="border:2px solid #e5e7eb;border-radius:10px;overflow:hidden;cursor:pointer;">
                        <div style="height:48px;background:linear-gradient(135deg,#0f2027,#2c5364);display:flex;align-items:center;justify-content:center;font-size:18px;">💎</div>
                        <div style="padding:5px;text-align:center;font-size:11px;font-weight:700;color:#374151;">Elegant</div>
                    </div>
                </div>
            </div>

            <!-- Admin notes -->
            <div style="margin-bottom:22px;">
                <label style="display:block;font-weight:700;color:#374151;font-size:13px;margin-bottom:8px;">
                    <i class="fas fa-sticky-note" style="color:#7c3aed;margin-right:6px;"></i>Admin Notes (optional)
                </label>
                <textarea id="approveNotes" rows="2"
                    placeholder="e.g. Outstanding performance across all modules."
                    style="width:100%;padding:11px;border:2px solid #e5e7eb;border-radius:10px;
                           font-size:13px;font-family:inherit;outline:none;resize:vertical;"
                    onfocus="this.style.borderColor='#2563eb'" onblur="this.style.borderColor='#e5e7eb'"></textarea>
            </div>

            <!-- Buttons -->
            <div style="display:flex;gap:10px;">
                <button onclick="document.getElementById('certApproveModal').remove()"
                    style="flex:1;padding:12px;border:2px solid #e5e7eb;border-radius:12px;
                           background:white;color:#6b7280;font-weight:700;cursor:pointer;font-family:inherit;font-size:14px;">
                    Cancel
                </button>
                <button onclick="confirmApprove('${studentId}','${sN}','${sE}', false)"
                    style="flex:1.2;padding:12px;background:linear-gradient(135deg,#1d4ed8,#2563eb);
                           border:none;border-radius:12px;color:white;font-weight:700;cursor:pointer;
                           font-family:inherit;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;">
                    <i class="fas fa-check-circle"></i> Approve Only
                </button>
                <button onclick="confirmApprove('${studentId}','${sN}','${sE}', true)"
                    style="flex:1.5;padding:12px;background:linear-gradient(135deg,#059669,#10b981);
                           border:none;border-radius:12px;color:white;font-weight:700;cursor:pointer;
                           font-family:inherit;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;">
                    <i class="fas fa-paper-plane"></i> Approve & Send Now
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

let _approveTemplate = 'classic';
function selectApproveTemplate(tpl, el) {
    _approveTemplate = tpl;
    document.querySelectorAll('#certApproveModal [data-tpl]').forEach(card => {
        card.style.borderColor = card.dataset.tpl === tpl ? '#7c3aed' : '#e5e7eb';
    });
}

async function confirmApprove(studentId, studentName, email, sendNow) {
    const notes      = document.getElementById('approveNotes')?.value?.trim() || '';
    const certNumber = _genNum();
    const courseName = 'ASAI Full Program Certificate';
    document.getElementById('certApproveModal')?.remove();

    try {
        const { data: ex } = await _certDB.from('certificates')
            .select('id').eq('student_id', studentId).eq('revoked', false).maybeSingle();

        if (ex) {
            const { error } = await _certDB.from('certificates').update({
                admin_approved: true, approved_at: new Date().toISOString(),
                template: _approveTemplate, admin_notes: notes || null,
                published: sendNow, published_at: sendNow ? new Date().toISOString() : null
            }).eq('id', ex.id);
            if (error) throw error;
        } else {
            const { error } = await _certDB.from('certificates').insert({
                student_id: studentId, user_id: studentId,
                course_id: null, course_name: courseName,
                cert_number: certNumber, template: _approveTemplate,
                admin_approved: true, approved_at: new Date().toISOString(),
                published: sendNow, published_at: sendNow ? new Date().toISOString() : null,
                revoked: false, admin_notes: notes || null,
                issued_at: new Date().toISOString()
            });
            if (error) throw error;
        }

        if (sendNow) {
            await _sendEmail({ studentName, email, courseName, certNumber });
            _toast(`🎓 Certificate approved & sent to ${studentName}!`);
        } else {
            _toast(`✅ Certificate approved for ${studentName}. Click "Send to Student" when ready.`);
        }

        await loadEligibleStudents();
        await loadIssuedCerts();
    } catch(err) {
        _toast('Error: ' + err.message, 'error');
    }
}

async function publishApprovedCert(certId, studentName, email, certNumber) {
    if (!confirm(`Send certificate to ${studentName}?\n\nA congratulations email will be sent to:\n${email}`)) return;
    const { error } = await _certDB.from('certificates').update({
        published: true, published_at: new Date().toISOString()
    }).eq('id', certId);
    if (error) { _toast('Error: ' + error.message, 'error'); return; }
    await _sendEmail({ studentName, email, courseName: 'ASAI Full Program Certificate', certNumber });
    _toast(`🎓 Certificate sent to ${studentName}!`);
    await loadEligibleStudents();
    await loadIssuedCerts();
}

// ============================================================
// UNPUBLISH / REVOKE
// ============================================================
async function certUnpublish(certId, studentName) {
    if (!confirm(`Unpublish certificate for ${studentName}?`)) return;
    const { error } = await _certDB.from('certificates').update({ published: false }).eq('id', certId);
    if (error) { _toast('Error: ' + error.message, 'error'); return; }
    _toast('Certificate unpublished.');
    await loadEligibleStudents();
    await loadIssuedCerts();
}

async function certRevoke(certId, studentName) {
    if (!confirm(`⚠️ Permanently revoke certificate for ${studentName}?\n\nThis cannot be undone.`)) return;
    const { error } = await _certDB.from('certificates').update({
        revoked: true, published: false, revoked_at: new Date().toISOString()
    }).eq('id', certId);
    if (error) { _toast('Error: ' + error.message, 'error'); return; }
    _toast('Certificate revoked.');
    await loadEligibleStudents();
    await loadIssuedCerts();
}

// ============================================================
// BULK APPROVE
// ============================================================
async function bulkIssueCertificates() {
    const cbs = document.querySelectorAll('.cert-select-cb:checked:not(:disabled)');
    if (!cbs.length) { _toast('Select at least one student first', 'error'); return; }
    if (!confirm(`Approve and send certificates for ${cbs.length} student(s)?`)) return;

    let ok = 0;
    for (const cb of cbs) {
        try {
            const certNumber = _genNum();
            const { data: ex } = await _certDB.from('certificates')
                .select('id').eq('student_id',cb.dataset.studentid).eq('revoked',false).maybeSingle();
            if (ex) {
                await _certDB.from('certificates').update({
                    admin_approved: true, approved_at: new Date().toISOString(),
                    published: true, published_at: new Date().toISOString()
                }).eq('id', ex.id);
            } else {
                const { error } = await _certDB.from('certificates').insert({
                    student_id: cb.dataset.studentid, user_id: cb.dataset.studentid,
                    course_id: null, course_name: 'ASAI Full Program Certificate',
                    cert_number: certNumber, template: _certTpl,
                    admin_approved: true, approved_at: new Date().toISOString(),
                    published: true, published_at: new Date().toISOString(),
                    revoked: false, issued_at: new Date().toISOString()
                });
                if (error) continue;
            }
            await _sendEmail({ studentName: cb.dataset.studentname, email: cb.dataset.email, courseName: 'ASAI Full Program Certificate', certNumber });
            ok++;
        } catch(_) {}
    }
    _toast(`✅ ${ok} certificate(s) approved & sent!`);
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
    const { data: c1, error } = await _certDB
        .from('certificates')
        .select(`id,cert_number,course_name,issued_at,published,published_at,revoked,
                 admin_approved,approved_at,student_id,template,
                 profiles!certificates_student_id_fkey(first_name,last_name,email)`)
        .eq('revoked', false).order('issued_at', { ascending: false });

    if (!error) {
        certs = c1 || [];
    } else {
        const { data: c2 } = await _certDB.from('certificates')
            .select('id,cert_number,course_name,issued_at,published,published_at,revoked,admin_approved,approved_at,student_id,template')
            .eq('revoked',false).order('issued_at',{ascending:false});
        const ids = [...new Set((c2||[]).map(c => c.student_id))];
        let profs = [];
        if (ids.length) { const { data: p } = await _certDB.from('profiles').select('id,first_name,last_name,email').in('id',ids); profs = p||[]; }
        certs = (c2||[]).map(c => ({ ...c, profiles: profs.find(p => p.id===c.student_id)||null }));
    }

    _renderIssuedTable(certs);
    try {
        const { count } = await _certDB.from('certificates').select('*',{count:'exact',head:true}).eq('revoked',true);
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
                <p style="font-size:13px;margin:0;">Approve certificates from the Eligible Students tab.</p>
            </div>`;
        return;
    }

    container.innerHTML = '';
    const hdr = document.createElement('div');
    hdr.style.cssText = `display:grid;grid-template-columns:2fr 2fr 1fr 1fr 1fr 1.5fr;
        gap:16px;padding:10px 20px;background:#f8fafc;border-bottom:2px solid #e5e7eb;
        font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.7px;`;
    hdr.innerHTML = `<div>Student</div><div>Certificate</div><div>Approved</div><div>Sent Date</div><div>Status</div><div>Actions</div>`;
    container.appendChild(hdr);

    certs.forEach(cert => {
        const name    = cert.profiles ? `${cert.profiles.first_name} ${cert.profiles.last_name}` : 'Unknown';
        const email   = cert.profiles?.email || '';
        const approvedDate = cert.approved_at ? new Date(cert.approved_at).toLocaleDateString() : '—';
        const pubDate = cert.published_at ? new Date(cert.published_at).toLocaleDateString() : '—';
        const sN = _esc(name), sE = _esc(email), sCo = _esc(cert.course_name||''), sCN = _esc(cert.cert_number||''), sTpl = _esc(cert.template||'classic');

        const row = document.createElement('div');
        row.style.cssText = `display:grid;grid-template-columns:2fr 2fr 1fr 1fr 1fr 1.5fr;
            gap:16px;padding:14px 20px;border-bottom:1px solid #f3f4f6;align-items:center;transition:background 0.15s;`;
        row.onmouseenter = () => row.style.background = '#f9fafb';
        row.onmouseleave = () => row.style.background = '';

        row.innerHTML = `
            <div>
                <div style="font-weight:600;color:#1f2937;font-size:14px;">${name}</div>
                <div style="font-size:12px;color:#6b7280;">${email}</div>
            </div>
            <div>
                <div style="font-size:13px;font-weight:600;color:#374151;">${cert.course_name || 'ASAI Program'}</div>
                ${cert.cert_number ? `<div style="font-size:11px;color:#9ca3af;font-family:'Courier New',monospace;">${cert.cert_number}</div>` : ''}
            </div>
            <div style="font-size:13px;color:#6b7280;">${approvedDate}</div>
            <div style="font-size:13px;color:#6b7280;">${pubDate}</div>
            <div>
                ${cert.published
                    ? `<span style="background:#d1fae5;color:#065f46;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;">🎓 Sent</span>`
                    : cert.admin_approved
                    ? `<span style="background:#dbeafe;color:#1e40af;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;">✅ Approved</span>`
                    : `<span style="background:#fef9c3;color:#854d0e;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;">⏳ Draft</span>`
                }
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="action-btn view" title="Preview" onclick="certPreview('${sN}','${sCo}','${sCN}','${sTpl}')">
                    <i class="fas fa-eye"></i></button>
                ${cert.published
                    ? `<button class="action-btn edit" title="Unpublish" style="color:#f59e0b;" onclick="certUnpublish('${cert.id}','${sN}')"><i class="fas fa-eye-slash"></i></button>`
                    : cert.admin_approved
                    ? `<button onclick="publishApprovedCert('${cert.id}','${sN}','${sE}','${sCN}')"
                           style="padding:5px 10px;background:#10b981;color:white;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">
                           <i class="fas fa-paper-plane"></i> Send
                       </button>`
                    : `<button onclick="approveCertificate('${cert.student_id}','${sN}','${sE}')"
                           style="padding:5px 10px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">
                           <i class="fas fa-check-circle"></i> Approve
                       </button>`
                }
                <button class="action-btn delete" title="Revoke" onclick="certRevoke('${cert.id}','${sN}')">
                    <i class="fas fa-ban"></i></button>
            </div>
        `;
        container.appendChild(row);
    });
}

// ============================================================
// STAT CARDS
// ============================================================
function _updateStatCards() {
    _setEl('totalCertsIssued',      _allRows.filter(r => r.status === 'published').length);
    _setEl('totalEligibleStudents', _allRows.filter(r => r.status === 'eligible').length);
    _setEl('totalPendingCerts',     _allRows.filter(r => r.status === 'pending' || r.status === 'draft').length);
    _setEl('totalRevokedCerts',     _allRows.filter(r => r.status === 'revoked').length);
}

// ============================================================
// PREVIEW MODAL
// ============================================================
function certPreview(studentName, courseName, certNumber, template) {
    const tpl  = template || _certTpl;
    const date = new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
    const T = {
        classic: { bg:'linear-gradient(160deg,#fdf6e3,#fef9ef,#f5e6c8)', border:'3px solid #b45309', inner:'1px solid #d97706', title:'#78350f', name:'#1f2937', nameUL:'#d97706', text:'#78350f', sub:'#92400e', org:'#78350f', seal:'radial-gradient(circle,#fef3c7,#fde68a)', sealB:'3px solid #d97706', sealC:'#78350f' },
        modern:  { bg:'linear-gradient(135deg,#1e1b4b,#312e81)', border:'none', inner:'1px solid rgba(165,180,252,0.2)', title:'#a5b4fc', name:'#fff', nameUL:'#6366f1', text:'#c7d2fe', sub:'#a5b4fc', org:'#c7d2fe', seal:'radial-gradient(circle,#312e81,#1e1b4b)', sealB:'3px solid #6366f1', sealC:'#a5b4fc' },
        elegant: { bg:'linear-gradient(160deg,#0f2027,#203a43,#2c5364)', border:'none', inner:'1px solid rgba(255,215,0,0.3)', title:'#ffd700', name:'#fff', nameUL:'#ffd700', text:'#b0c4ce', sub:'#b0c4ce', org:'#ffd700', seal:'radial-gradient(circle,#203a43,#0f2027)', sealB:'3px solid #ffd700', sealC:'#ffd700' }
    };
    const t = T[tpl] || T.classic;
    const displayName = courseName || 'ASAI Full Program Certificate';

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.style.zIndex = '5500';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:900px;">
            <div class="modal-header">
                <h2><i class="fas fa-certificate" style="color:#7c3aed;margin-right:8px;"></i>Certificate Preview</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()"><i class="fas fa-times"></i></button>
            </div>
            <div style="background:#e5e7eb;padding:28px;border-radius:14px;display:flex;justify-content:center;overflow:auto;">
                <div style="width:720px;min-height:500px;background:${t.bg};border:${t.border};padding:50px 60px;
                            position:relative;font-family:Georgia,serif;text-align:center;
                            box-shadow:0 24px 70px rgba(0,0,0,0.35);display:flex;flex-direction:column;align-items:center;">
                    <div style="position:absolute;inset:14px;border:${t.inner};pointer-events:none;border-radius:2px;"></div>
                    <div style="width:60px;height:60px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border-radius:50%;
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
                                margin-bottom:24px;font-family:'Plus Jakarta Sans',sans-serif;">This is to certify that</div>
                    <div style="font-size:34px;font-weight:700;color:${t.name};border-bottom:2px solid ${t.nameUL};
                                padding-bottom:8px;margin-bottom:18px;min-width:300px;">${studentName}</div>
                    <div style="font-size:13px;color:${t.text};font-style:italic;margin-bottom:8px;">
                        has successfully completed the full program
                    </div>
                    <div style="font-size:20px;font-weight:600;color:${t.name};margin-bottom:22px;">${displayName}</div>
                    <div style="font-size:13px;color:${t.sub};font-style:italic;max-width:460px;line-height:1.7;margin-bottom:28px;">
                        demonstrating knowledge, dedication, and commitment to excellence across all modules of AI education.
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:flex-end;width:100%;margin-top:auto;padding-top:16px;">
                        <div style="text-align:center;">
                            <div style="width:140px;height:1px;background:${t.sub};margin:0 auto 6px;"></div>
                            <div style="font-size:12px;font-weight:600;color:${t.text};font-family:'Plus Jakarta Sans',sans-serif;">Dr. Amina Mohammed</div>
                            <div style="font-size:10px;color:${t.sub};font-family:'Plus Jakarta Sans',sans-serif;">Program Director</div>
                        </div>
                        <div style="width:72px;height:72px;border-radius:50%;background:${t.seal};border:${t.sealB};
                                    display:flex;align-items:center;justify-content:center;">
                            <i class="fas fa-star" style="color:${t.sealC};font-size:22px;"></i>
                        </div>
                        <div style="text-align:center;">
                            <div style="width:140px;height:1px;background:${t.sub};margin:0 auto 6px;"></div>
                            <div style="font-size:12px;font-weight:600;color:${t.text};font-family:'Plus Jakarta Sans',sans-serif;">Date: ${date}</div>
                            <div style="font-size:10px;color:${t.sub};font-family:'Plus Jakarta Sans',sans-serif;">Issue Date</div>
                        </div>
                    </div>
                    <div style="position:absolute;bottom:16px;right:20px;font-size:9px;color:${t.sub};
                                font-family:'Courier New',monospace;opacity:0.8;">ID: ${certNumber||'PREVIEW'}</div>
                </div>
            </div>
            <div style="display:flex;gap:12px;margin-top:18px;">
                <button class="btn-primary" onclick="_toast('PDF download — integrate html2pdf.js')" style="flex:1;">
                    <i class="fas fa-download"></i> Download PDF
                </button>
                <button class="btn-secondary" onclick="this.closest('.modal').remove()" style="flex:1;">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// ============================================================
// TEMPLATE / CRITERIA / TABS
// ============================================================
function selectTemplate(tpl) {
    _certTpl = tpl; window.selectedTemplate = tpl;
    ['classic','modern','elegant'].forEach(t => {
        const card = document.getElementById('tpl-'+t), badge = document.getElementById('badge-'+t);
        if (card)  card.style.borderColor = t===tpl ? '#7c3aed' : '#e5e7eb';
        if (badge) badge.style.display    = t===tpl ? 'flex'    : 'none';
    });
    _toast(`Template "${tpl.charAt(0).toUpperCase()+tpl.slice(1)}" selected`);
}

async function saveCriteria() {
    const q = parseInt(document.getElementById('minQuizScore')?.value)||70;
    const c = parseInt(document.getElementById('minCompletion')?.value)||80;
    const a = document.getElementById('requireAssignments')?.value === 'yes';
    _criteria = { minQuizScore:q, minCompletion:c, requireAssignments:a };
    try { await _certDB.from('certificate_criteria').upsert({ id:1, min_quiz_score:q, min_completion:c, require_assignments:a }); }
    catch(err) { console.warn('Could not save criteria:', err.message); }
    _toast('Criteria saved! ✅');
    await loadEligibleStudents();
}

function toggleSelectAllCerts(cb) {
    document.querySelectorAll('.cert-select-cb:not(:disabled)').forEach(c => c.checked = cb.checked);
}

function switchCertTab(tabId, btn) {
    const CERT_PANELS = ['certEligible', 'certIssued', 'certSettings'];

    // 1. Deactivate all tab buttons
    document.querySelectorAll('#certificatesSection .tabs .tab').forEach(t => {
        t.classList.remove('active');
    });
    if (btn) btn.classList.add('active');

    // 2. Force-hide ALL panels with both class AND inline style
    CERT_PANELS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('active');
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('height', '0', 'important');
        el.style.setProperty('overflow', 'hidden', 'important');
        el.style.setProperty('padding', '0', 'important');
        el.style.setProperty('margin', '0', 'important');
    });

    // 3. Show ONLY the target panel
    const target = document.getElementById(tabId);
    if (target) {
        target.classList.add('active');
        target.style.setProperty('display', 'block', 'important');
        target.style.setProperty('visibility', 'visible', 'important');
        target.style.setProperty('height', 'auto', 'important');
        target.style.setProperty('overflow', 'visible', 'important');
        target.style.setProperty('padding', '', 'important');
        target.style.setProperty('margin', '', 'important');
    }

    // 4. Load data
    if (tabId === 'certIssued')   loadIssuedCerts();
    if (tabId === 'certEligible') loadEligibleStudents();
}

async function viewEmailLog() {
    let certs = [];
    const { data, error } = await _certDB
        .from('certificates')
        .select(`cert_number,course_name,published_at,student_id,profiles!certificates_student_id_fkey(first_name,last_name,email)`)
        .eq('published',true).eq('revoked',false).order('published_at',{ascending:false});
    if (!error) { certs = data || []; }
    else {
        const { data: c2 } = await _certDB.from('certificates').select('cert_number,course_name,published_at,student_id').eq('published',true).eq('revoked',false).order('published_at',{ascending:false});
        const ids = [...new Set((c2||[]).map(c => c.student_id))];
        let profs = [];
        if (ids.length) { const { data: p } = await _certDB.from('profiles').select('id,first_name,last_name,email').in('id',ids); profs = p||[]; }
        certs = (c2||[]).map(c => ({ ...c, profiles: profs.find(p => p.id===c.student_id)||null }));
    }
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.style.zIndex = '5000';
    const logHTML = certs.length === 0
        ? `<div style="padding:60px;text-align:center;color:#9ca3af;"><i class="fas fa-inbox" style="font-size:40px;display:block;margin-bottom:14px;opacity:0.3;"></i>No certificate emails sent yet.</div>`
        : certs.map(c => `
            <div style="padding:16px;background:#f0fdf4;border-radius:10px;margin-bottom:10px;border-left:4px solid #10b981;">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
                    <div>
                        <div style="font-weight:600;color:#1f2937;font-size:14px;">📧 ${c.profiles ? c.profiles.first_name+' '+c.profiles.last_name : 'Unknown'}</div>
                        <div style="font-size:12px;color:#6b7280;">${c.profiles?.email||'—'}</div>
                    </div>
                    <span style="background:#dcfce7;color:#166534;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;">✓ Sent</span>
                </div>
                <div style="font-size:12px;color:#374151;line-height:1.8;">
                    <strong>Certificate:</strong> ${c.course_name||'ASAI Program'}<br>
                    <strong>Sent:</strong> ${c.published_at ? new Date(c.published_at).toLocaleString() : '—'}<br>
                    <strong>Cert ID:</strong> <span style="font-family:'Courier New',monospace;color:#7c3aed;">${c.cert_number}</span>
                </div>
            </div>`).join('');
    modal.innerHTML = `
        <div class="modal-content" style="max-width:680px;">
            <div class="modal-header">
                <h2><i class="fas fa-envelope-open-text" style="color:#7c3aed;margin-right:8px;"></i>Certificate Email Log</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()"><i class="fas fa-times"></i></button>
            </div>
            <p style="color:#6b7280;font-size:13px;margin-bottom:16px;">${certs.length} email${certs.length!==1?'s':''} sent</p>
            <div style="max-height:500px;overflow-y:auto;">${logHTML}</div>
            <button class="btn-secondary" onclick="this.closest('.modal').remove()" style="width:100%;margin-top:16px;">Close</button>
        </div>`;
    document.body.appendChild(modal);
}

// ============================================================
// EMAIL SENDER
// ============================================================
async function _sendEmail({ studentName, email, courseName, certNumber }) {
    try {
        const { data: { session } } = await _certDB.auth.getSession();
        if (!session) { console.warn('No session — email skipped'); return; }
        const supabaseUrl = window.SUPABASE_URL || _certDB.supabaseUrl || _certDB.rest?.url?.replace('/rest/v1', '');
        if (!supabaseUrl) { console.warn('SUPABASE_URL not found — email skipped'); return; }
        const payload = { to: email, studentName, courseName: courseName || 'ASAI Full Program Certificate', certNumber, issuedDate: new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) };
        console.log('📧 Sending certificate email to:', email);
        const res = await fetch(`${supabaseUrl}/functions/v1/send-certificate-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!res.ok) console.error('❌ Email failed:', result);
        else console.log('✅ Email sent:', result);
    } catch (err) { console.error('❌ Email error:', err.message); }
}

// ============================================================
// ⚠️  SUPABASE MIGRATION REQUIRED
// Run this SQL in Supabase SQL editor if not already done:
//
//   ALTER TABLE certificates
//     ADD COLUMN IF NOT EXISTS admin_approved boolean DEFAULT false,
//     ADD COLUMN IF NOT EXISTS approved_at     timestamptz,
//     ADD COLUMN IF NOT EXISTS admin_notes     text,
//     ADD COLUMN IF NOT EXISTS revoked_at      timestamptz;
// ============================================================

// ============================================================
// EXPOSE GLOBALS
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    window.loadCertificateSection   = loadCertificateSection;
    window.loadEligibleStudents     = loadEligibleStudents;
    window.loadIssuedCerts          = loadIssuedCerts;
    window.populateCertCourseFilter = populateCertCourseFilter;
    window.bulkIssueCertificates    = bulkIssueCertificates;
    window.saveCriteria             = saveCriteria;
    window.selectTemplate           = selectTemplate;
    window.toggleSelectAllCerts     = toggleSelectAllCerts;
    window.switchCertTab            = switchCertTab;
    window.viewEmailLog             = viewEmailLog;
    window.approveCertificate       = approveCertificate;
    window.confirmApprove           = confirmApprove;
    window.publishApprovedCert      = publishApprovedCert;
    window.certUnpublish            = certUnpublish;
    window.certRevoke               = certRevoke;
    window.certPreview              = certPreview;
    window.toggleCourseBreakdown    = toggleCourseBreakdown;
    window.selectApproveTemplate    = selectApproveTemplate;
    // Legacy aliases
    window.previewCert   = (id,sN,cN,num,tpl) => certPreview(sN,cN,num,tpl);
    window.revokeCert    = certRevoke;
    window.openIssueCertModal = function() {
        const firstTab = document.querySelector('#certificatesSection .tabs .tab');
        switchCertTab('certEligible', firstTab);
    };
    window.togglePublishCert = (certId, currentlyPub, sName, email, cName, certNum) =>
        currentlyPub ? certUnpublish(certId, sName) : publishApprovedCert(certId, sName, email, certNum);
    console.log('✅ certificates.js v5 loaded — Program-level certificates with Approve flow');
});// ============================================================
// ASAI — CERTIFICATES.JS  v6
// ONE certificate per student after completing ALL courses.
// Canvas-generated certificate with preview before sending.
// No file upload — template is auto-rendered on canvas.
// ============================================================

function getCertDB() { return window.supabaseClient || window.db; }

let _allRows  = [];
let _certTpl  = 'classic';
let _criteria = { minQuizScore: 70, minCompletion: 80, requireAssignments: false };

const _genNum = () => `ASAI-${new Date().getFullYear()}-${Math.floor(Math.random()*99999).toString().padStart(5,'0')}`;
const _toast  = (m, t='success') => typeof showToast === 'function' ? showToast(m, t) : alert(m);
const _esc    = s => (s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
const _setEl  = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };


// ============================================================
// BOOT
// ============================================================
async function loadCertificateSection() {
    // Reset tab state
    ['certEligible','certIssued','certSettings'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('active');
        el.style.setProperty('display','none','important');
        el.style.setProperty('visibility','hidden','important');
        el.style.setProperty('height','0','important');
        el.style.setProperty('overflow','hidden','important');
    });

    document.querySelectorAll('#certificatesSection .tabs .tab').forEach(t => t.classList.remove('active'));
    const firstTabBtn = document.querySelector('#certificatesSection .tabs .tab');
    if (firstTabBtn) firstTabBtn.classList.add('active');

    const firstPanel = document.getElementById('certEligible');
    if (firstPanel) {
        firstPanel.classList.add('active');
        firstPanel.style.setProperty('display','block','important');
        firstPanel.style.setProperty('visibility','visible','important');
        firstPanel.style.setProperty('height','auto','important');
        firstPanel.style.setProperty('overflow','visible','important');
    }

    await _loadCriteria();
    await loadEligibleStudents();
    await loadIssuedCerts();
}

async function _loadCriteria() {
    try {
        const db = getCertDB();
        const { data } = await db.from('certificate_criteria').select('*').eq('id',1).maybeSingle();
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

// needed by admin.html but no per-course filter for program certs
async function populateCertCourseFilter() { /* no-op for program-level certs */ }


// ============================================================
// FETCH — one row per STUDENT across ALL courses
// ============================================================
async function _fetchAllStudents() {
    const db = getCertDB();

    const [
        { data: students,   error: sErr },
        { data: allCourses            },
        { data: enrollments           },
        { data: quizSubs              },
        { data: certs                 },
    ] = await Promise.all([
        db.from('profiles').select('id,first_name,last_name,email').eq('role','student').order('first_name'),
        db.from('courses').select('id,title').order('title'),
        db.from('enrollments').select('student_id,course_id,progress'),
        db.from('quiz_submissions').select('student_id,course_id,score'),
        db.from('certificates').select('id,student_id,cert_number,published,revoked,issued_at,template,admin_approved,approved_at,admin_notes').neq('revoked',true),
    ]);

    if (sErr) throw new Error('Could not load students: ' + sErr.message);

    let assignments = [], assignSubs = [];
    try {
        const { data: aD } = await db.from('assignments').select('id,course_id');
        assignments = aD || [];
        const { data: sD } = await db.from('assignment_submissions').select('student_id,course_id');
        assignSubs = sD || [];
    } catch(_) {}

    const totalCourses = (allCourses || []).length;

    return (students || []).map(student => {
        const myEnrollments = (enrollments || []).filter(e => e.student_id === student.id);

        const courseBreakdown = (allCourses || []).map(course => {
            const en = myEnrollments.find(e => e.course_id === course.id);
            const progress = en ? (en.progress || 0) : 0;
            const myQ = (quizSubs || []).filter(q => q.student_id === student.id && q.course_id === course.id);
            const avgQ = myQ.length ? Math.round(myQ.reduce((s,q) => s+(q.score||0),0) / myQ.length) : 0;
            const totalA = assignments.filter(a => a.course_id === course.id).length;
            const doneA  = assignSubs.filter(s => s.student_id === student.id && s.course_id === course.id).length;
            const courseDone = !!en
                && progress >= _criteria.minCompletion
                && avgQ >= _criteria.minQuizScore
                && (!_criteria.requireAssignments || totalA === 0 || doneA >= totalA);
            return { courseId: course.id, courseName: course.title, enrolled: !!en, progress, avgQ, totalA, doneA, courseDone };
        });

        const completedCourses    = courseBreakdown.filter(c => c.courseDone).length;
        const allCoursesCompleted = totalCourses > 0 && completedCourses === totalCourses;
        const enrolled            = courseBreakdown.filter(c => c.enrolled);
        const avgProgress         = enrolled.length ? Math.round(enrolled.reduce((s,c) => s+c.progress,0) / enrolled.length) : 0;
        const avgQuiz             = enrolled.length ? Math.round(enrolled.reduce((s,c) => s+c.avgQ,0) / enrolled.length) : 0;

        const existingCert = (certs || []).find(c => c.student_id === student.id && !c.revoked);

        let status = 'pending';
        if      (existingCert?.published)                                       status = 'published';
        else if (existingCert?.admin_approved && !existingCert?.published)      status = 'approved';
        else if (existingCert && !existingCert?.admin_approved)                 status = 'draft';
        else if (allCoursesCompleted)                                           status = 'eligible';

        return {
            studentId: student.id,
            studentName: `${student.first_name} ${student.last_name}`,
            email: student.email,
            totalCourses, enrolledCount: enrolled.length, completedCourses, allCoursesCompleted,
            avgProgress, avgQuiz, courseBreakdown, status,
            certId:       existingCert?.id           || null,
            certNumber:   existingCert?.cert_number  || null,
            template:     existingCert?.template     || 'classic',
            adminApproved: existingCert?.admin_approved || false,
        };
    });
}


// ============================================================
// CANVAS — RENDER CERTIFICATE TO DATA URL
// Width 1200 x Height 848  (A4 landscape ratio ~1.41)
// ============================================================
function _renderCertificateCanvas(studentName, certNumber, template) {
    const W = 1200, H = 848;
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const tpl = template || 'classic';
    const DATE = new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });

    // ── Theme definitions ──
    const themes = {
        classic: {
            bg1: '#fdf6e3', bg2: '#f5e6c8',
            borderColor: '#b45309', innerBorder: '#d97706',
            titleColor: '#78350f', nameColor: '#1f2937', nameUnderline: '#d97706',
            textColor: '#78350f', subColor: '#92400e', orgColor: '#78350f',
            sealBg1: '#fef3c7', sealBg2: '#fde68a', sealBorder: '#d97706', sealIcon: '#78350f',
            logoGrad1: '#7c3aed', logoGrad2: '#6d28d9',
        },
        modern: {
            bg1: '#1e1b4b', bg2: '#312e81',
            borderColor: null, innerBorder: 'rgba(165,180,252,0.25)',
            titleColor: '#a5b4fc', nameColor: '#ffffff', nameUnderline: '#6366f1',
            textColor: '#c7d2fe', subColor: '#a5b4fc', orgColor: '#c7d2fe',
            sealBg1: '#312e81', sealBg2: '#1e1b4b', sealBorder: '#6366f1', sealIcon: '#a5b4fc',
            logoGrad1: '#6366f1', logoGrad2: '#4f46e5',
        },
        elegant: {
            bg1: '#0f2027', bg2: '#2c5364',
            borderColor: null, innerBorder: 'rgba(255,215,0,0.35)',
            titleColor: '#ffd700', nameColor: '#ffffff', nameUnderline: '#ffd700',
            textColor: '#b0c4ce', subColor: '#b0c4ce', orgColor: '#ffd700',
            sealBg1: '#203a43', sealBg2: '#0f2027', sealBorder: '#ffd700', sealIcon: '#ffd700',
            logoGrad1: '#b45309', logoGrad2: '#92400e',
        },
    };
    const T = themes[tpl] || themes.classic;

    // ── Background gradient ──
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, T.bg1);
    bgGrad.addColorStop(1, T.bg2);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // ── Outer border ──
    if (T.borderColor) {
        ctx.strokeStyle = T.borderColor;
        ctx.lineWidth   = 10;
        ctx.strokeRect(10, 10, W-20, H-20);
    }

    // ── Inner border ──
    ctx.strokeStyle = T.innerBorder;
    ctx.lineWidth   = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(36, 36, W-72, H-72);

    // ── Corner ornaments ──
    _drawCornerOrnaments(ctx, T.innerBorder, W, H);

    // ── ASAI logo circle ──
    const cx = W/2, logoY = 120;
    const logoGrad = ctx.createRadialGradient(cx, logoY, 0, cx, logoY, 50);
    logoGrad.addColorStop(0, T.logoGrad1);
    logoGrad.addColorStop(1, T.logoGrad2);
    ctx.beginPath();
    ctx.arc(cx, logoY, 50, 0, Math.PI*2);
    ctx.fillStyle = logoGrad;
    ctx.fill();
    // Graduation cap emoji approximation using text
    ctx.fillStyle = '#ffffff';
    ctx.font      = 'bold 38px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎓', cx, logoY);

    // ── ORG NAME ──
    ctx.fillStyle = T.orgColor;
    ctx.font      = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '4px';
    ctx.fillText('ASAI  —  AFRICAN SCHOOL OF AI', cx, 196);

    // ── TITLE ──
    ctx.fillStyle = T.titleColor;
    ctx.font      = 'bold 52px Georgia';
    ctx.fillText('Certificate of Completion', cx, 264);

    // ── THIS IS TO CERTIFY ──
    ctx.fillStyle = T.subColor;
    ctx.font      = 'italic 20px Georgia';
    ctx.fillText('This is to certify that', cx, 318);

    // ── STUDENT NAME ──
    ctx.fillStyle = T.nameColor;
    ctx.font      = 'bold 58px Georgia';
    // Measure and scale if too long
    let nameSize = 58;
    while (ctx.measureText(studentName).width > W - 200 && nameSize > 28) {
        nameSize -= 2;
        ctx.font = `bold ${nameSize}px Georgia`;
    }
    ctx.fillText(studentName, cx, 396);

    // Name underline
    const nameW = ctx.measureText(studentName).width;
    ctx.strokeStyle = T.nameUnderline;
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.moveTo(cx - nameW/2, 412);
    ctx.lineTo(cx + nameW/2, 412);
    ctx.stroke();

    // ── HAS SUCCESSFULLY COMPLETED ──
    ctx.fillStyle = T.textColor;
    ctx.font      = 'italic 20px Georgia';
    ctx.fillText('has successfully completed the full program', cx, 456);

    // ── PROGRAM NAME ──
    ctx.fillStyle = T.nameColor;
    ctx.font      = 'bold 28px Georgia';
    ctx.fillText('ASAI Full Program Certificate', cx, 500);

    // ── DESCRIPTION ──
    ctx.fillStyle = T.subColor;
    ctx.font      = 'italic 17px Georgia';
    ctx.fillText('demonstrating knowledge, dedication, and commitment to excellence', cx, 548);
    ctx.fillText('across all modules of AI education in Africa.', cx, 572);

    // ── DIVIDER LINE ──
    ctx.strokeStyle = T.innerBorder;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(120, 612);
    ctx.lineTo(W-120, 612);
    ctx.stroke();

    // ── SIGNATURE LEFT ──
    ctx.strokeStyle = T.subColor;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(140, 700); ctx.lineTo(380, 700); ctx.stroke();
    ctx.fillStyle = T.textColor;
    ctx.font      = 'bold 15px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Dr. Amina Mohammed', 140, 722);
    ctx.font = '13px Arial';
    ctx.fillStyle = T.subColor;
    ctx.fillText('Program Director', 140, 742);

    // ── DATE RIGHT ──
    ctx.strokeStyle = T.subColor;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(W-380, 700); ctx.lineTo(W-140, 700); ctx.stroke();
    ctx.fillStyle = T.textColor;
    ctx.font      = 'bold 15px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(DATE, W-140, 722);
    ctx.font      = '13px Arial';
    ctx.fillStyle = T.subColor;
    ctx.fillText('Issue Date', W-140, 742);

    // ── SEAL (center bottom) ──
    const sealGrad = ctx.createRadialGradient(cx, 690, 0, cx, 690, 55);
    sealGrad.addColorStop(0, T.sealBg1);
    sealGrad.addColorStop(1, T.sealBg2);
    ctx.beginPath();
    ctx.arc(cx, 690, 55, 0, Math.PI*2);
    ctx.fillStyle   = sealGrad;
    ctx.fill();
    ctx.strokeStyle = T.sealBorder;
    ctx.lineWidth   = 3;
    ctx.stroke();
    ctx.fillStyle   = T.sealIcon;
    ctx.font        = '34px Arial';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', cx, 690);

    // ── CERT ID watermark ──
    ctx.fillStyle = T.subColor;
    ctx.globalAlpha = 0.55;
    ctx.font = '12px Courier New';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('ID: ' + (certNumber || 'PREVIEW'), W-50, H-20);
    ctx.globalAlpha = 1;

    return canvas.toDataURL('image/png');
}

function _drawCornerOrnaments(ctx, color, W, H) {
    const size = 40, pad = 46;
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    const corners = [[pad,pad],[W-pad,pad],[pad,H-pad],[W-pad,H-pad]];
    corners.forEach(([x,y]) => {
        const sx = x === pad ? 1 : -1;
        const sy = y === pad ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(x, y + sy*size);
        ctx.lineTo(x, y);
        ctx.lineTo(x + sx*size, y);
        ctx.stroke();
    });
}


// ============================================================
// PREVIEW MODAL — canvas-rendered certificate
// ============================================================
function certPreview(studentName, _courseName, certNumber, template) {
    document.getElementById('certPreviewModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'certPreviewModal';
    modal.className = 'modal active';
    modal.style.zIndex = '5500';

    // Generate the certificate image
    const dataUrl = _renderCertificateCanvas(studentName, certNumber, template || _certTpl);

    modal.innerHTML = `
        <div class="modal-content" style="max-width:900px;">
            <div class="modal-header">
                <h2>
                    <i class="fas fa-certificate" style="color:#7c3aed;margin-right:8px;"></i>
                    Certificate Preview — ${studentName}
                </h2>
                <button class="modal-close" onclick="document.getElementById('certPreviewModal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div style="background:#e5e7eb;padding:24px;border-radius:14px;text-align:center;margin-bottom:16px;">
                <img src="${dataUrl}"
                     style="max-width:100%;border-radius:8px;box-shadow:0 16px 48px rgba(0,0,0,0.35);"
                     alt="Certificate preview">
            </div>

            <div style="display:flex;gap:12px;">
                <button onclick="_downloadCertPng('${_esc(dataUrl)}','${_esc(studentName)}')"
                    style="flex:1;padding:13px;background:linear-gradient(135deg,#7c3aed,#6d28d9);
                           border:none;border-radius:12px;color:white;font-weight:700;cursor:pointer;
                           font-family:inherit;font-size:14px;display:flex;align-items:center;
                           justify-content:center;gap:8px;">
                    <i class="fas fa-download"></i> Download PNG
                </button>
                <button onclick="document.getElementById('certPreviewModal').remove()"
                    style="flex:1;padding:13px;border:2px solid #e5e7eb;border-radius:12px;
                           background:white;color:#6b7280;font-weight:700;cursor:pointer;
                           font-family:inherit;font-size:14px;">
                    Close
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function _downloadCertPng(dataUrl, studentName) {
    const a = document.createElement('a');
    a.href     = dataUrl;
    a.download = `certificate_${(studentName||'student').replace(/\s+/g,'_')}.png`;
    a.click();
}


// ============================================================
// APPROVE MODAL — with canvas preview embedded
// ============================================================
async function approveCertificate(studentId, studentName, email) {
    document.getElementById('certApproveModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'certApproveModal';
    modal.className = 'modal active';
    modal.style.zIndex = '5000';

    const certNumber = _genNum();   // preview number (will be regenerated on save if needed)
    const initials   = studentName.split(' ').map(n=>n[0]).join('').toUpperCase().substring(0,2);

    // Render initial preview with current template
    const previewDataUrl = _renderCertificateCanvas(studentName, certNumber, _certTpl);

    modal.innerHTML = `
        <div class="modal-content" style="max-width:680px;max-height:90vh;overflow-y:auto;">
            <div class="modal-header">
                <h2 style="display:flex;align-items:center;gap:10px;">
                    <span style="width:38px;height:38px;background:linear-gradient(135deg,#1d4ed8,#2563eb);
                                 border-radius:10px;display:inline-flex;align-items:center;justify-content:center;">
                        <i class="fas fa-check-circle" style="color:white;font-size:16px;"></i>
                    </span>
                    Approve Program Certificate
                </h2>
                <button class="modal-close" onclick="document.getElementById('certApproveModal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <!-- Student info -->
            <div style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border:1.5px solid #bfdbfe;
                        border-radius:14px;padding:16px 18px;margin-bottom:18px;
                        display:flex;align-items:center;gap:14px;">
                <div style="width:46px;height:46px;border-radius:50%;flex-shrink:0;
                            background:linear-gradient(135deg,#7c3aed,#6d28d9);
                            display:flex;align-items:center;justify-content:center;
                            color:white;font-weight:800;font-size:16px;">
                    ${initials}
                </div>
                <div style="flex:1;">
                    <div style="font-weight:700;color:#1f2937;font-size:16px;">${studentName}</div>
                    <div style="font-size:13px;color:#6b7280;">${email}</div>
                </div>
                <i class="fas fa-check-circle" style="color:#10b981;font-size:26px;"></i>
            </div>

            <!-- Template selector -->
            <div style="margin-bottom:16px;">
                <label style="display:block;font-weight:700;color:#374151;font-size:13px;margin-bottom:10px;">
                    <i class="fas fa-palette" style="color:#7c3aed;margin-right:6px;"></i>
                    Certificate Template
                    <span style="font-size:11px;font-weight:400;color:#9ca3af;margin-left:6px;">
                        (preview updates automatically)
                    </span>
                </label>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
                    <div onclick="selectApproveTemplate('classic',this,'${_esc(studentName)}','${certNumber}')"
                        data-tpl="classic"
                        style="border:2px solid #7c3aed;border-radius:10px;overflow:hidden;cursor:pointer;transition:all 0.2s;">
                        <div style="height:46px;background:linear-gradient(135deg,#fdf6e3,#f5e6c8);display:flex;align-items:center;justify-content:center;font-size:18px;">🏅</div>
                        <div style="padding:5px;text-align:center;font-size:11px;font-weight:700;color:#374151;">Classic</div>
                    </div>
                    <div onclick="selectApproveTemplate('modern',this,'${_esc(studentName)}','${certNumber}')"
                        data-tpl="modern"
                        style="border:2px solid #e5e7eb;border-radius:10px;overflow:hidden;cursor:pointer;transition:all 0.2s;">
                        <div style="height:46px;background:linear-gradient(135deg,#1e1b4b,#312e81);display:flex;align-items:center;justify-content:center;font-size:18px;">⭐</div>
                        <div style="padding:5px;text-align:center;font-size:11px;font-weight:700;color:#374151;">Modern</div>
                    </div>
                    <div onclick="selectApproveTemplate('elegant',this,'${_esc(studentName)}','${certNumber}')"
                        data-tpl="elegant"
                        style="border:2px solid #e5e7eb;border-radius:10px;overflow:hidden;cursor:pointer;transition:all 0.2s;">
                        <div style="height:46px;background:linear-gradient(135deg,#0f2027,#2c5364);display:flex;align-items:center;justify-content:center;font-size:18px;">💎</div>
                        <div style="padding:5px;text-align:center;font-size:11px;font-weight:700;color:#374151;">Elegant</div>
                    </div>
                </div>
            </div>

            <!-- Live preview -->
            <div style="background:#f3f4f6;border-radius:12px;padding:16px;margin-bottom:16px;text-align:center;">
                <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;
                            letter-spacing:1px;margin-bottom:10px;">Live Preview</div>
                <img id="approvePreviewImg" src="${previewDataUrl}"
                     style="max-width:100%;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.2);"
                     alt="Certificate preview">
            </div>

            <!-- Admin notes -->
            <div style="margin-bottom:18px;">
                <label style="display:block;font-weight:700;color:#374151;font-size:13px;margin-bottom:8px;">
                    <i class="fas fa-sticky-note" style="color:#7c3aed;margin-right:6px;"></i>Admin Notes (optional)
                </label>
                <textarea id="approveNotes" rows="2"
                    placeholder="e.g. Outstanding performance across all modules."
                    style="width:100%;padding:11px;border:2px solid #e5e7eb;border-radius:10px;
                           font-size:13px;font-family:inherit;outline:none;resize:vertical;box-sizing:border-box;"
                    onfocus="this.style.borderColor='#2563eb'"
                    onblur="this.style.borderColor='#e5e7eb'"></textarea>
            </div>

            <!-- Info note -->
            <div style="background:#fef9c3;border:1.5px solid #fde68a;border-radius:10px;
                        padding:12px 14px;margin-bottom:18px;font-size:13px;color:#78350f;
                        display:flex;gap:10px;align-items:flex-start;">
                <i class="fas fa-info-circle" style="margin-top:2px;flex-shrink:0;color:#d97706;"></i>
                <span>
                    <strong>Approve Only</strong> — saves the record; you send it later via "Send to Student".<br>
                    <strong>Approve &amp; Send Now</strong> — immediately sends the certificate email with a download link.
                </span>
            </div>

            <!-- Action buttons -->
            <div style="display:flex;gap:10px;">
                <button onclick="document.getElementById('certApproveModal').remove()"
                    style="flex:1;padding:12px;border:2px solid #e5e7eb;border-radius:12px;
                           background:white;color:#6b7280;font-weight:700;cursor:pointer;
                           font-family:inherit;font-size:14px;">
                    Cancel
                </button>
                <button onclick="confirmApprove('${studentId}','${_esc(studentName)}','${_esc(email)}',false,'${certNumber}')"
                    style="flex:1.2;padding:12px;background:linear-gradient(135deg,#1d4ed8,#2563eb);
                           border:none;border-radius:12px;color:white;font-weight:700;cursor:pointer;
                           font-family:inherit;font-size:14px;display:flex;align-items:center;
                           justify-content:center;gap:8px;">
                    <i class="fas fa-check-circle"></i> Approve Only
                </button>
                <button onclick="confirmApprove('${studentId}','${_esc(studentName)}','${_esc(email)}',true,'${certNumber}')"
                    style="flex:1.5;padding:12px;background:linear-gradient(135deg,#059669,#10b981);
                           border:none;border-radius:12px;color:white;font-weight:700;cursor:pointer;
                           font-family:inherit;font-size:14px;display:flex;align-items:center;
                           justify-content:center;gap:8px;">
                    <i class="fas fa-paper-plane"></i> Approve &amp; Send Now
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // Store cert number in modal so confirmApprove can use it
    modal.dataset.certNumber = certNumber;
}

let _approveTemplate = 'classic';

function selectApproveTemplate(tpl, el, studentName, certNumber) {
    _approveTemplate = tpl;

    // Highlight selected card
    document.querySelectorAll('#certApproveModal [data-tpl]').forEach(card => {
        card.style.borderColor = card.dataset.tpl === tpl ? '#7c3aed' : '#e5e7eb';
        card.style.transform   = card.dataset.tpl === tpl ? 'scale(1.04)' : 'scale(1)';
    });

    // Update live preview
    const previewImg = document.getElementById('approvePreviewImg');
    if (previewImg) {
        previewImg.style.opacity = '0.5';
        setTimeout(() => {
            previewImg.src     = _renderCertificateCanvas(studentName, certNumber, tpl);
            previewImg.style.opacity = '1';
        }, 80);
    }
}

async function confirmApprove(studentId, studentName, email, sendNow, certNumber) {
    const notes    = document.getElementById('approveNotes')?.value?.trim() || '';
    const usedTpl  = _approveTemplate || _certTpl;
    const usedNum  = certNumber || _genNum();
    const courseName = 'ASAI Full Program Certificate';

    document.getElementById('certApproveModal')?.remove();

    const db = getCertDB();

    try {
        // Check for existing cert
        const { data: existing } = await db.from('certificates')
            .select('id').eq('student_id', studentId).eq('revoked', false).maybeSingle();

        const payload = {
            admin_approved: true,
            approved_at:    new Date().toISOString(),
            template:       usedTpl,
            admin_notes:    notes || null,
            published:      sendNow,
            published_at:   sendNow ? new Date().toISOString() : null,
        };

        if (existing) {
            const { error } = await db.from('certificates').update(payload).eq('id', existing.id);
            if (error) throw error;
        } else {
            const { error } = await db.from('certificates').insert({
                ...payload,
                student_id:  studentId,
                user_id:     studentId,
                course_id:   null,
                course_name: courseName,
                cert_number: usedNum,
                revoked:     false,
                issued_at:   new Date().toISOString(),
            });
            if (error) throw error;
        }

        if (sendNow) {
            // Generate the certificate PNG to embed/attach in email
            const certPng = _renderCertificateCanvas(studentName, usedNum, usedTpl);
            await _sendCertEmail({ studentName, email, courseName, certNumber: usedNum, certPng });
            _toast(`🎓 Certificate approved & sent to ${studentName}!`);
        } else {
            _toast(`✅ Certificate approved for ${studentName}. Click "Send to Student" when ready.`);
        }

        await loadEligibleStudents();
        await loadIssuedCerts();

    } catch(err) {
        _toast('Error: ' + err.message, 'error');
    }
}

// ============================================================
// SEND TO STUDENT (from Issued tab)
// ============================================================
async function publishApprovedCert(certId, studentName, email, certNumber, template) {
    if (!confirm(`Send certificate to ${studentName}?\n\nA congratulations email will be sent to:\n${email}`)) return;

    const db = getCertDB();
    const { error } = await db.from('certificates').update({
        published: true, published_at: new Date().toISOString()
    }).eq('id', certId);
    if (error) { _toast('Error: ' + error.message, 'error'); return; }

    const certPng = _renderCertificateCanvas(studentName, certNumber, template || _certTpl);
    await _sendCertEmail({
        studentName, email,
        courseName:  'ASAI Full Program Certificate',
        certNumber:  certNumber || '',
        certPng,
    });
    _toast(`🎓 Certificate sent to ${studentName}!`);
    await loadEligibleStudents();
    await loadIssuedCerts();
}


// ============================================================
// EMAIL — sends Supabase Edge Function with PNG data
// ============================================================
async function _sendCertEmail({ studentName, email, courseName, certNumber, certPng }) {
    try {
        const db = getCertDB();
        const { data: { session } } = await db.auth.getSession();
        if (!session) { console.warn('No session — email skipped'); return; }

        const supabaseUrl = window.SUPABASE_URL
            || (typeof db.supabaseUrl !== 'undefined' ? db.supabaseUrl : null);
        if (!supabaseUrl) { console.warn('SUPABASE_URL not set — email skipped'); return; }

        const DATE = new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });

        const payload = {
            to:         email,
            studentName,
            courseName: courseName || 'ASAI Full Program Certificate',
            certNumber,
            issuedDate: DATE,
            certPngBase64: certPng,   // the canvas PNG as base64 data URL
        };

        console.log('📧 Sending certificate email to:', email);

        const res = await fetch(`${supabaseUrl}/functions/v1/send-certificate-email`, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify(payload),
        });

        const result = await res.json().catch(() => ({}));
        if (!res.ok) console.error('❌ Email failed:', result);
        else         console.log('✅ Email sent:', result);

    } catch(err) {
        console.error('❌ Email error:', err.message);
    }
}


// ============================================================
// UNPUBLISH / REVOKE
// ============================================================
async function certUnpublish(certId, studentName) {
    if (!confirm(`Unpublish certificate for ${studentName}?`)) return;
    const db = getCertDB();
    const { error } = await db.from('certificates').update({ published: false }).eq('id', certId);
    if (error) { _toast('Error: ' + error.message, 'error'); return; }
    _toast('Certificate unpublished.');
    await loadEligibleStudents();
    await loadIssuedCerts();
}

async function certRevoke(certId, studentName) {
    if (!confirm(`⚠️ Permanently revoke certificate for ${studentName}?\n\nThis cannot be undone.`)) return;
    const db = getCertDB();
    const { error } = await db.from('certificates').update({
        revoked: true, published: false, revoked_at: new Date().toISOString()
    }).eq('id', certId);
    if (error) { _toast('Error: ' + error.message, 'error'); return; }
    _toast('Certificate revoked.');
    await loadEligibleStudents();
    await loadIssuedCerts();
}


// ============================================================
// BULK APPROVE & SEND
// ============================================================
async function bulkIssueCertificates() {
    const cbs = document.querySelectorAll('.cert-select-cb:checked:not(:disabled)');
    if (!cbs.length) { _toast('Select at least one student first', 'error'); return; }
    if (!confirm(`Approve and send certificates for ${cbs.length} student(s)?\n\nEmails will be sent immediately.`)) return;

    const db = getCertDB();
    let ok = 0;

    for (const cb of cbs) {
        try {
            const certNumber = _genNum();
            const { data: ex } = await db.from('certificates')
                .select('id').eq('student_id', cb.dataset.studentid).eq('revoked', false).maybeSingle();

            if (ex) {
                await db.from('certificates').update({
                    admin_approved: true, approved_at: new Date().toISOString(),
                    published: true, published_at: new Date().toISOString()
                }).eq('id', ex.id);
            } else {
                const { error } = await db.from('certificates').insert({
                    student_id: cb.dataset.studentid, user_id: cb.dataset.studentid,
                    course_id: null, course_name: 'ASAI Full Program Certificate',
                    cert_number: certNumber, template: _certTpl,
                    admin_approved: true, approved_at: new Date().toISOString(),
                    published: true, published_at: new Date().toISOString(),
                    revoked: false, issued_at: new Date().toISOString(),
                });
                if (error) continue;
            }

            const certPng = _renderCertificateCanvas(cb.dataset.studentname, certNumber, _certTpl);
            await _sendCertEmail({
                studentName: cb.dataset.studentname,
                email:       cb.dataset.email,
                courseName:  'ASAI Full Program Certificate',
                certNumber,  certPng,
            });
            ok++;
        } catch(_) {}
    }

    _toast(`✅ ${ok} certificate(s) approved & sent!`);
    await loadEligibleStudents();
    await loadIssuedCerts();
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
            Loading all students…
        </div>`;

    try {
        const statusFilter = document.getElementById('certStatusFilter')?.value || 'all';
        _allRows = await _fetchAllStudents();

        const filtered = statusFilter === 'all' ? _allRows : _allRows.filter(r => {
            if (statusFilter === 'eligible') return r.status === 'eligible';
            if (statusFilter === 'issued')   return r.status === 'published' || r.status === 'approved';
            if (statusFilter === 'pending')  return r.status === 'pending'  || r.status === 'draft';
            return true;
        });

        _renderStudentTable(filtered);
        _updateStatCards();

    } catch(err) {
        console.error('loadEligibleStudents:', err);
        container.innerHTML = `
            <div style="padding:50px;text-align:center;">
                <i class="fas fa-exclamation-triangle" style="font-size:36px;color:#ef4444;display:block;margin-bottom:14px;"></i>
                <p style="color:#ef4444;font-weight:600;">${err.message}</p>
                <button class="btn-secondary" style="margin-top:12px;" onclick="loadEligibleStudents()">
                    <i class="fas fa-redo"></i> Try Again
                </button>
            </div>`;
    }
}


// ============================================================
// RENDER TABLE — one row per student
// ============================================================
function _renderStudentTable(rows) {
    const container = document.getElementById('eligibleStudentsList');
    if (!container) return;

    if (!rows.length) {
        container.innerHTML = `
            <div style="padding:80px 20px;text-align:center;">
                <i class="fas fa-users" style="font-size:52px;color:#e5e7eb;display:block;margin-bottom:20px;"></i>
                <p style="color:#374151;font-size:16px;font-weight:600;margin:0 0 8px;">No students found</p>
                <p style="color:#9ca3af;font-size:14px;">No students match this filter.</p>
            </div>`;
        return;
    }

    const STATUS = {
        pending:   { label:'⏳ Pending',         bg:'#fef9c3', color:'#854d0e' },
        eligible:  { label:'✅ All Courses Done', bg:'#dcfce7', color:'#14532d' },
        draft:     { label:'📄 Draft',            bg:'#ede9fe', color:'#4c1d95' },
        approved:  { label:'🏅 Approved',         bg:'#dbeafe', color:'#1e40af' },
        published: { label:'🎓 Certificate Sent', bg:'#d1fae5', color:'#065f46' },
    };

    container.innerHTML = '';

    // Header
    const hdr = document.createElement('div');
    hdr.style.cssText = `
        display:grid;grid-template-columns:2.4fr 1fr 1fr 1fr 1.2fr 2fr;
        gap:12px;padding:10px 20px;background:#f8fafc;border-bottom:2px solid #e5e7eb;
        font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.7px;
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
        const st = STATUS[r.status] || STATUS.pending;
        const initials = r.studentName.split(' ').map(n=>n[0]).join('').toUpperCase().substring(0,2);
        const pColor   = r.avgProgress >= _criteria.minCompletion ? '#10b981' : r.avgProgress >= 50 ? '#f59e0b' : '#ef4444';
        const qColor   = r.avgQuiz >= _criteria.minQuizScore ? '#10b981' : '#ef4444';

        const sN  = _esc(r.studentName);
        const sE  = _esc(r.email);
        const sCN = _esc(r.certNumber || '');
        const sTpl = _esc(r.template || 'classic');
        const detailId = `certDetail_${r.studentId.replace(/-/g,'_')}`;

        // Action button per status
        let actionBtn = '';
        if (r.status === 'eligible') {
            actionBtn = `
                <button onclick="approveCertificate('${r.studentId}','${sN}','${sE}')"
                    style="display:inline-flex;align-items:center;gap:8px;padding:9px 18px;
                           background:linear-gradient(135deg,#1d4ed8,#2563eb);color:white;
                           border:none;border-radius:10px;font-size:13px;font-weight:700;
                           cursor:pointer;font-family:inherit;white-space:nowrap;
                           box-shadow:0 4px 12px rgba(37,99,235,0.3);">
                    <i class="fas fa-check-circle"></i> Approve Certificate
                </button>`;

        } else if (r.status === 'approved') {
            actionBtn = `
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                    <button onclick="publishApprovedCert('${r.certId}','${sN}','${sE}','${sCN}','${sTpl}')"
                        style="display:inline-flex;align-items:center;gap:7px;padding:9px 16px;
                               background:linear-gradient(135deg,#059669,#10b981);color:white;
                               border:none;border-radius:10px;font-size:13px;font-weight:700;
                               cursor:pointer;font-family:inherit;">
                        <i class="fas fa-paper-plane"></i> Send to Student
                    </button>
                    <button class="action-btn view" title="Preview certificate"
                        onclick="certPreview('${sN}','ASAI Full Program Certificate','${sCN}','${sTpl}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>`;

        } else if (r.status === 'published') {
            actionBtn = `
                <div style="display:flex;gap:6px;align-items:center;">
                    <span style="font-size:12px;color:#059669;font-weight:600;">
                        <i class="fas fa-check-circle"></i> Sent
                    </span>
                    <button class="action-btn view" title="Preview"
                        onclick="certPreview('${sN}','ASAI Full Program Certificate','${sCN}','${sTpl}')">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn edit" title="Unpublish" style="color:#f59e0b;"
                        onclick="certUnpublish('${r.certId}','${sN}')">
                        <i class="fas fa-eye-slash"></i>
                    </button>
                    <button class="action-btn delete" title="Revoke"
                        onclick="certRevoke('${r.certId}','${sN}')">
                        <i class="fas fa-ban"></i>
                    </button>
                </div>`;

        } else if (r.status === 'draft') {
            actionBtn = `
                <div style="display:flex;gap:6px;">
                    <button onclick="approveCertificate('${r.studentId}','${sN}','${sE}')"
                        style="display:inline-flex;align-items:center;gap:7px;padding:8px 14px;
                               background:linear-gradient(135deg,#1d4ed8,#2563eb);color:white;
                               border:none;border-radius:10px;font-size:12px;font-weight:700;
                               cursor:pointer;font-family:inherit;">
                        <i class="fas fa-check-circle"></i> Approve
                    </button>
                    <button class="action-btn view" title="Preview"
                        onclick="certPreview('${sN}','ASAI Full Program Certificate','${sCN}','${sTpl}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>`;

        } else {
            const left = r.totalCourses - r.completedCourses;
            const pct  = r.totalCourses > 0 ? Math.round((r.completedCourses / r.totalCourses) * 100) : 0;
            actionBtn  = `
                <div>
                    <div style="font-size:12px;color:#9ca3af;margin-bottom:4px;">
                        ${left} course${left !== 1 ? 's' : ''} remaining
                    </div>
                    <div style="width:120px;height:5px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
                        <div style="height:100%;width:${pct}%;background:#6366f1;border-radius:4px;"></div>
                    </div>
                </div>`;
        }

        // Per-course breakdown rows
        const courseRows = r.courseBreakdown.map(c => {
            const pCol = c.progress >= _criteria.minCompletion ? '#10b981' : '#f59e0b';
            const qCol = c.avgQ >= _criteria.minQuizScore ? '#10b981' : c.avgQ > 0 ? '#f59e0b' : '#9ca3af';
            return `
            <div style="display:grid;grid-template-columns:2fr 1fr 1fr 0.8fr;gap:10px;
                         padding:9px 20px 9px 36px;border-bottom:1px solid #f3f4f6;align-items:center;
                         background:${c.courseDone ? '#f0fdf4' : '#fafafa'};">
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
                <div style="font-weight:700;font-size:14px;color:${qCol};">${c.avgQ > 0 ? c.avgQ + '%' : '—'}</div>
                <div>${c.courseDone
                    ? `<span style="color:#10b981;font-weight:700;font-size:12px;">✓ Done</span>`
                    : `<span style="color:#9ca3af;font-size:12px;">Incomplete</span>`}
                </div>
            </div>`;
        }).join('');

        const cbDisabled = r.status === 'pending' ? 'disabled' : '';

        const row = document.createElement('div');
        row.style.cssText = 'border-bottom:1px solid #f0f0f0;';
        row.innerHTML = `
            <!-- Main row -->
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
                    <div style="width:38px;height:38px;min-width:38px;border-radius:50%;flex-shrink:0;
                                background:linear-gradient(135deg,#7c3aed,#6d28d9);
                                display:flex;align-items:center;justify-content:center;
                                color:white;font-weight:800;font-size:14px;">
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
                               cursor:pointer;padding:0;font-family:inherit;display:flex;align-items:center;
                               gap:4px;margin-top:3px;">
                        <i class="fas fa-list" style="font-size:10px;"></i> View details
                    </button>
                </div>

                <div>
                    <div style="font-size:13px;font-weight:600;color:${pColor};margin-bottom:4px;">
                        ${r.avgProgress}%
                    </div>
                    <div style="height:5px;background:#e5e7eb;border-radius:3px;overflow:hidden;width:80px;">
                        <div style="height:100%;width:${Math.min(r.avgProgress,100)}%;
                                    background:${pColor};border-radius:3px;"></div>
                    </div>
                </div>

                <div style="font-weight:700;font-size:15px;color:${qColor};">${r.avgQuiz}%</div>

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
                             text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid #e9ecef;">
                    <div>Course</div><div>Progress</div><div>Quiz Score</div><div>Done?</div>
                </div>
                ${courseRows}
            </div>`;
        container.appendChild(row);
    });
}

function toggleCourseBreakdown(detailId) {
    const el = document.getElementById(detailId);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}


// ============================================================
// ISSUED CERTS TAB
// ============================================================
async function loadIssuedCerts() {
    const container = document.getElementById('issuedCertsList');
    if (!container) return;

    const db = getCertDB();
    let certs = [];

    // Try with FK join first, fall back to manual join
    const { data: c1, error } = await db.from('certificates')
        .select(`id,cert_number,course_name,issued_at,published,published_at,revoked,
                 admin_approved,approved_at,student_id,template,
                 profiles!certificates_student_id_fkey(first_name,last_name,email)`)
        .eq('revoked', false)
        .order('issued_at', { ascending: false });

    if (!error) {
        certs = c1 || [];
    } else {
        const { data: c2 } = await db.from('certificates')
            .select('id,cert_number,course_name,issued_at,published,published_at,revoked,admin_approved,approved_at,student_id,template')
            .eq('revoked', false).order('issued_at', { ascending: false });
        const ids = [...new Set((c2||[]).map(c => c.student_id))];
        let profs = [];
        if (ids.length) {
            const { data: p } = await db.from('profiles').select('id,first_name,last_name,email').in('id', ids);
            profs = p || [];
        }
        certs = (c2||[]).map(c => ({ ...c, profiles: profs.find(p => p.id === c.student_id) || null }));
    }

    _renderIssuedTable(certs);

    // Update revoked count
    try {
        const { count } = await db.from('certificates')
            .select('*', { count:'exact', head:true }).eq('revoked', true);
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
                <p style="font-size:16px;font-weight:600;color:#6b7280;margin:0 0 8px;">No certificates yet</p>
                <p style="font-size:13px;margin:0;">Approve students from the Eligible Students tab.</p>
            </div>`;
        return;
    }

    container.innerHTML = '';
    const hdr = document.createElement('div');
    hdr.style.cssText = `display:grid;grid-template-columns:2fr 2fr 1fr 1fr 1fr 1.8fr;
        gap:16px;padding:10px 20px;background:#f8fafc;border-bottom:2px solid #e5e7eb;
        font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.7px;`;
    hdr.innerHTML = `<div>Student</div><div>Certificate</div><div>Approved</div><div>Sent</div><div>Status</div><div>Actions</div>`;
    container.appendChild(hdr);

    certs.forEach(cert => {
        const name    = cert.profiles ? `${cert.profiles.first_name} ${cert.profiles.last_name}` : 'Unknown';
        const email   = cert.profiles?.email || '';
        const approved = cert.approved_at ? new Date(cert.approved_at).toLocaleDateString() : '—';
        const sent     = cert.published_at  ? new Date(cert.published_at).toLocaleDateString()  : '—';
        const sN  = _esc(name);
        const sE  = _esc(email);
        const sCN = _esc(cert.cert_number || '');
        const sTpl = _esc(cert.template || 'classic');

        const row = document.createElement('div');
        row.style.cssText = `display:grid;grid-template-columns:2fr 2fr 1fr 1fr 1fr 1.8fr;
            gap:16px;padding:14px 20px;border-bottom:1px solid #f3f4f6;align-items:center;transition:background 0.15s;`;
        row.onmouseenter = () => row.style.background = '#f9fafb';
        row.onmouseleave = () => row.style.background = '';

        row.innerHTML = `
            <div>
                <div style="font-weight:600;color:#1f2937;font-size:14px;">${name}</div>
                <div style="font-size:12px;color:#6b7280;">${email}</div>
            </div>
            <div>
                <div style="font-size:13px;font-weight:600;color:#374151;">
                    ${cert.course_name || 'ASAI Program Certificate'}
                </div>
                ${cert.cert_number
                    ? `<div style="font-size:11px;color:#9ca3af;font-family:'Courier New',monospace;">${cert.cert_number}</div>`
                    : ''}
            </div>
            <div style="font-size:13px;color:#6b7280;">${approved}</div>
            <div style="font-size:13px;color:#6b7280;">${sent}</div>
            <div>
                ${cert.published
                    ? `<span style="background:#d1fae5;color:#065f46;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;">🎓 Sent</span>`
                    : cert.admin_approved
                    ? `<span style="background:#dbeafe;color:#1e40af;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;">✅ Approved</span>`
                    : `<span style="background:#fef9c3;color:#854d0e;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;">⏳ Draft</span>`}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="action-btn view" title="Preview certificate"
                    onclick="certPreview('${sN}','ASAI Full Program Certificate','${sCN}','${sTpl}')">
                    <i class="fas fa-eye"></i>
                </button>
                ${cert.published
                    ? `<button class="action-btn edit" title="Unpublish" style="color:#f59e0b;"
                           onclick="certUnpublish('${cert.id}','${sN}')">
                           <i class="fas fa-eye-slash"></i>
                       </button>`
                    : cert.admin_approved
                    ? `<button onclick="publishApprovedCert('${cert.id}','${sN}','${sE}','${sCN}','${sTpl}')"
                           style="padding:5px 10px;background:#10b981;color:white;border:none;border-radius:8px;
                                  font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">
                           <i class="fas fa-paper-plane"></i> Send
                       </button>`
                    : `<button onclick="approveCertificate('${cert.student_id}','${sN}','${sE}')"
                           style="padding:5px 10px;background:#2563eb;color:white;border:none;border-radius:8px;
                                  font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">
                           <i class="fas fa-check-circle"></i> Approve
                       </button>`}
                <button class="action-btn delete" title="Revoke"
                    onclick="certRevoke('${cert.id}','${sN}')">
                    <i class="fas fa-ban"></i>
                </button>
            </div>`;
        container.appendChild(row);
    });
}


// ============================================================
// STAT CARDS
// ============================================================
function _updateStatCards() {
    _setEl('totalCertsIssued',      _allRows.filter(r => r.status === 'published').length);
    _setEl('totalEligibleStudents', _allRows.filter(r => r.status === 'eligible').length);
    _setEl('totalPendingCerts',     _allRows.filter(r => r.status === 'pending' || r.status === 'draft').length);
    _setEl('totalRevokedCerts',     0); // refreshed in loadIssuedCerts
}


// ============================================================
// TEMPLATE / CRITERIA / TABS
// ============================================================
function selectTemplate(tpl) {
    _certTpl = tpl; window.selectedTemplate = tpl;
    ['classic','modern','elegant'].forEach(t => {
        const card  = document.getElementById('tpl-' + t);
        const badge = document.getElementById('badge-' + t);
        if (card)  card.style.borderColor = t === tpl ? '#7c3aed' : '#e5e7eb';
        if (badge) badge.style.display    = t === tpl ? 'flex'    : 'none';
    });
    _toast(`Template "${tpl.charAt(0).toUpperCase() + tpl.slice(1)}" selected`);
}

async function saveCriteria() {
    const q = parseInt(document.getElementById('minQuizScore')?.value)  || 70;
    const c = parseInt(document.getElementById('minCompletion')?.value)  || 80;
    const a = document.getElementById('requireAssignments')?.value === 'yes';
    _criteria = { minQuizScore: q, minCompletion: c, requireAssignments: a };
    try {
        const db = getCertDB();
        await db.from('certificate_criteria').upsert({ id:1, min_quiz_score:q, min_completion:c, require_assignments:a });
    } catch(err) { console.warn('Could not save criteria:', err.message); }
    _toast('Criteria saved! ✅');
    await loadEligibleStudents();
}

function toggleSelectAllCerts(cb) {
    document.querySelectorAll('.cert-select-cb:not(:disabled)').forEach(c => c.checked = cb.checked);
}

function switchCertTab(tabId, btn) {
    const PANELS = ['certEligible','certIssued','certSettings'];
    document.querySelectorAll('#certificatesSection .tabs .tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');

    PANELS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('active');
        el.style.setProperty('display','none','important');
        el.style.setProperty('visibility','hidden','important');
        el.style.setProperty('height','0','important');
        el.style.setProperty('overflow','hidden','important');
        el.style.setProperty('padding','0','important');
        el.style.setProperty('margin','0','important');
    });

    const target = document.getElementById(tabId);
    if (target) {
        target.classList.add('active');
        target.style.setProperty('display','block','important');
        target.style.setProperty('visibility','visible','important');
        target.style.setProperty('height','auto','important');
        target.style.setProperty('overflow','visible','important');
        target.style.removeProperty('padding');
        target.style.removeProperty('margin');
    }

    if (tabId === 'certIssued')   loadIssuedCerts();
    if (tabId === 'certEligible') loadEligibleStudents();
}

async function viewEmailLog() {
    const db = getCertDB();
    let certs = [];
    const { data, error } = await db.from('certificates')
        .select(`cert_number,course_name,published_at,student_id,
                 profiles!certificates_student_id_fkey(first_name,last_name,email)`)
        .eq('published', true).eq('revoked', false)
        .order('published_at', { ascending: false });

    if (!error) {
        certs = data || [];
    } else {
        const { data: c2 } = await db.from('certificates')
            .select('cert_number,course_name,published_at,student_id')
            .eq('published', true).eq('revoked', false)
            .order('published_at', { ascending: false });
        const ids = [...new Set((c2||[]).map(c => c.student_id))];
        let profs = [];
        if (ids.length) {
            const { data: p } = await db.from('profiles').select('id,first_name,last_name,email').in('id', ids);
            profs = p || [];
        }
        certs = (c2||[]).map(c => ({ ...c, profiles: profs.find(p => p.id === c.student_id) || null }));
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
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
                    <div>
                        <div style="font-weight:600;color:#1f2937;font-size:14px;">
                            📧 ${c.profiles ? c.profiles.first_name + ' ' + c.profiles.last_name : 'Unknown'}
                        </div>
                        <div style="font-size:12px;color:#6b7280;">${c.profiles?.email || '—'}</div>
                    </div>
                    <span style="background:#dcfce7;color:#166534;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;">✓ Sent</span>
                </div>
                <div style="font-size:12px;color:#374151;line-height:1.8;">
                    <strong>Certificate:</strong> ${c.course_name || 'ASAI Full Program Certificate'}<br>
                    <strong>Sent:</strong> ${c.published_at ? new Date(c.published_at).toLocaleString() : '—'}<br>
                    <strong>Cert ID:</strong>
                    <span style="font-family:'Courier New',monospace;color:#7c3aed;">${c.cert_number || '—'}</span>
                </div>
            </div>`).join('');

    modal.innerHTML = `
        <div class="modal-content" style="max-width:680px;">
            <div class="modal-header">
                <h2>
                    <i class="fas fa-envelope-open-text" style="color:#7c3aed;margin-right:8px;"></i>
                    Certificate Email Log
                </h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <p style="color:#6b7280;font-size:13px;margin-bottom:16px;">
                ${certs.length} email${certs.length !== 1 ? 's' : ''} sent
            </p>
            <div style="max-height:500px;overflow-y:auto;">${logHTML}</div>
            <button class="btn-secondary" onclick="this.closest('.modal').remove()"
                style="width:100%;margin-top:16px;">Close</button>
        </div>`;
    document.body.appendChild(modal);
}


// ============================================================
// EXPOSE GLOBALS
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    window.loadCertificateSection   = loadCertificateSection;
    window.loadEligibleStudents     = loadEligibleStudents;
    window.loadIssuedCerts          = loadIssuedCerts;
    window.populateCertCourseFilter = populateCertCourseFilter;
    window.bulkIssueCertificates    = bulkIssueCertificates;
    window.saveCriteria             = saveCriteria;
    window.selectTemplate           = selectTemplate;
    window.toggleSelectAllCerts     = toggleSelectAllCerts;
    window.switchCertTab            = switchCertTab;
    window.viewEmailLog             = viewEmailLog;
    window.approveCertificate       = approveCertificate;
    window.confirmApprove           = confirmApprove;
    window.publishApprovedCert      = publishApprovedCert;
    window.certUnpublish            = certUnpublish;
    window.certRevoke               = certRevoke;
    window.certPreview              = certPreview;
    window.toggleCourseBreakdown    = toggleCourseBreakdown;
    window.selectApproveTemplate    = selectApproveTemplate;

    // Legacy aliases used in admin.html inline code
    window.previewCert       = (id, sN, cN, num, tpl) => certPreview(sN, cN, num, tpl);
    window.revokeCert        = certRevoke;
    window.openIssueCertModal = () => {
        const firstTab = document.querySelector('#certificatesSection .tabs .tab');
        switchCertTab('certEligible', firstTab);
    };
    window.togglePublishCert = (certId, currentlyPub, sName, email, cName, certNum, tpl) =>
        currentlyPub
            ? certUnpublish(certId, sName)
            : publishApprovedCert(certId, sName, email, certNum, tpl);

    console.log('✅ certificates.js v6 loaded — program cert, canvas preview, no upload');
});