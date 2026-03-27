// ============================================================
// ASAI — CERTIFICATES.JS  v4
// FIX: Shows ALL students from profiles table directly.
//      Does NOT require enrollments to show students.
//      Admin can manually select any student + course,
//      keep them pending (draft) or publish + email them.
// ============================================================

const _certDB = window.supabaseClient || window.db;

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
    if (_certSectionLoaded) {
        await loadEligibleStudents();
        await loadIssuedCerts();
        return;
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
    const sel = document.getElementById('certCourseFilter');
    if(!sel) return;
    if (sel.dataset.loaded) return;   
    sel.dataset.loaded = 'true';  
    while(sel.options.length > 1) sel.remove(1);
    const { data: courses } = await _certDB.from('courses').select('id,title').order('title');
    (courses||[]).forEach(c => {
        const o = document.createElement('option');
        o.value = c.id; o.textContent = c.title;
        sel.appendChild(o);
    });
}

// ============================================================
// FETCH — pulls ALL students, joins data where available
// ============================================================
async function _fetchAllStudents(filterCourseId) {
    console.log('Fetching all students...');

    // 1. ALL students — base query, no enrollment required
    const { data: students, error: sErr } = await _certDB
        .from('profiles')
        .select('id, first_name, last_name, email')
        .eq('role', 'student')
        .order('first_name');

    if (sErr) throw new Error('Could not load students: ' + sErr.message);
    console.log('Students found:', students?.length ?? 0);
    if (!students || students.length === 0) return [];

    // 2. Enrollments (optional)
    let enrollments = [];
    try {
        let eq = _certDB.from('enrollments').select('student_id, course_id, progress, courses(id, title)');
        if (filterCourseId) eq = eq.eq('course_id', filterCourseId);
        const { data } = await eq;
        enrollments = data || [];
    } catch(_) { console.warn('enrollments not available'); }

    // 3. Quiz submissions (optional)
    let quizSubs = [];
    try {
        const { data } = await _certDB.from('quiz_submissions').select('student_id, course_id, score');
        quizSubs = data || [];
    } catch(_) {}

    // 4. Assignments (optional)
    let assignments = [], assignSubs = [];
    try {
        const { data: aData } = await _certDB.from('assignments').select('id, course_id');
        assignments = aData || [];
        const { data: sData } = await _certDB.from('assignment_submissions').select('student_id, course_id');
        assignSubs = sData || [];
    } catch(_) {}

    // 5. Certificates
    let certs = [];
    try {
        const { data } = await _certDB.from('certificates')
            .select('id, student_id, course_id, cert_number, published, revoked, issued_at, template, course_name');
        certs = data || [];
    } catch(_) {}

    const rows = [];

    for (const student of students) {
        const studentEnrollments = enrollments.filter(e => e.student_id === student.id);

        if (studentEnrollments.length > 0) {
            for (const en of studentEnrollments) {
                if (filterCourseId && en.course_id !== filterCourseId) continue;

                const cid      = en.course_id;
                const progress = en.progress || 0;
                const myQ      = quizSubs.filter(q => q.student_id === student.id && q.course_id === cid);
                const avgQ     = myQ.length ? Math.round(myQ.reduce((s,q) => s+(q.score||0),0)/myQ.length) : 0;
                const totalA   = assignments.filter(a => a.course_id === cid).length;
                const doneA    = assignSubs.filter(s => s.student_id === student.id && s.course_id === cid).length;
                const assignOk = totalA === 0 || doneA >= totalA;
                const eligible = progress >= _criteria.minCompletion && avgQ >= _criteria.minQuizScore
                               && (!_criteria.requireAssignments || assignOk);

                const cert       = certs.find(c => c.student_id === student.id && c.course_id === cid && !c.revoked);
                const wasRevoked = certs.find(c => c.student_id === student.id && c.course_id === cid &&  c.revoked);

                let status = 'pending';
                if (wasRevoked && !cert)  status = 'revoked';
                else if (cert?.published) status = 'published';
                else if (cert)            status = 'draft';
                else if (eligible)        status = 'eligible';

                rows.push({
                    studentId:   student.id,
                    studentName: `${student.first_name} ${student.last_name}`,
                    email:       student.email,
                    courseId:    cid,
                    courseName:  en.courses?.title || 'Unknown Course',
                    progress, avgQ, totalA, doneA, assignOk, eligible, status,
                    certId:     cert?.id          || null,
                    certNumber: cert?.cert_number || null,
                    template:   cert?.template    || 'classic'
                });
            }
        } else {
            // No enrollments — check for manual certs
            const manualCerts = certs.filter(c => c.student_id === student.id && !c.revoked);
            if (manualCerts.length > 0) {
                for (const cert of manualCerts) {
                    rows.push({
                        studentId:   student.id,
                        studentName: `${student.first_name} ${student.last_name}`,
                        email:       student.email,
                        courseId:    cert.course_id,
                        courseName:  cert.course_name || '—',
                        progress: 0, avgQ: 0, totalA: 0, doneA: 0,
                        assignOk: false, eligible: false,
                        status:     cert.published ? 'published' : 'draft',
                        certId:     cert.id,
                        certNumber: cert.cert_number,
                        template:   cert.template || 'classic'
                    });
                }
            } else {
                // Show student with no course — allow manual issue
                rows.push({
                    studentId:   student.id,
                    studentName: `${student.first_name} ${student.last_name}`,
                    email:       student.email,
                    courseId:    null,
                    courseName:  '(No enrollment)',
                    progress: 0, avgQ: 0, totalA: 0, doneA: 0,
                    assignOk: false, eligible: false,
                    status:     'pending',
                    certId:     null, certNumber: null, template: 'classic'
                });
            }
        }
    }

    console.log('Total rows built:', rows.length);
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
        const courseId = document.getElementById('certCourseFilter')?.value || null;
        const filter   = document.getElementById('certStatusFilter')?.value  || 'all';

        _allRows = await _fetchAllStudents(courseId || null);

        const filtered = filter === 'all' ? _allRows : _allRows.filter(r => {
            if (filter === 'eligible') return r.status === 'eligible';
            if (filter === 'issued')   return r.status === 'published' || r.status === 'draft';
            if (filter === 'pending')  return r.status === 'pending';
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
                <p style="color:#9ca3af;font-size:14px;margin:0 0 24px;">
                    No students match this filter, or no students exist yet.<br>
                    Click <strong>Issue Certificate</strong> above to manually select a student.
                </p>
                <button class="btn-primary" onclick="openIssueCertModal()">
                    <i class="fas fa-award"></i> Issue Certificate
                </button>
            </div>`;
        return;
    }

    // ── GROUP rows by studentId ──────────────────────────────
    const grouped = {};
    rows.forEach(r => {
        if (!grouped[r.studentId]) {
            grouped[r.studentId] = {
                studentId:   r.studentId,
                studentName: r.studentName,
                email:       r.email,
                courses:     []
            };
        }
        grouped[r.studentId].courses.push(r);
    });

    const students = Object.values(grouped);

    container.innerHTML = '';

    const STATUS = {
        pending:   { label:'⏳ Pending',   bg:'#fef9c3', color:'#854d0e' },
        eligible:  { label:'✅ Eligible',  bg:'#dcfce7', color:'#14532d' },
        draft:     { label:'📄 Draft',     bg:'#ede9fe', color:'#4c1d95' },
        published: { label:'🎓 Published', bg:'#d1fae5', color:'#065f46' },
        revoked:   { label:'🚫 Revoked',   bg:'#fee2e2', color:'#7f1d1d' },
    };

    students.forEach((student, idx) => {
        const initials = student.studentName
            .split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

        // ── Student header card ──────────────────────────────
        const studentCard = document.createElement('div');
        studentCard.style.cssText = `
            margin-bottom: 12px;
            border: 1.5px solid #e5e7eb;
            border-radius: 14px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.04);
            background: white;
        `;

        // Count statuses for the student summary
        const pubCount  = student.courses.filter(c => c.status === 'published').length;
        const eligCount = student.courses.filter(c => c.status === 'eligible').length;
        const pendCount = student.courses.filter(c => c.status === 'pending').length;

        const summaryPills = [];
        if (pubCount)  summaryPills.push(`<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">🎓 ${pubCount} Published</span>`);
        if (eligCount) summaryPills.push(`<span style="background:#dcfce7;color:#14532d;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">✅ ${eligCount} Eligible</span>`);
        if (pendCount) summaryPills.push(`<span style="background:#fef9c3;color:#854d0e;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">⏳ ${pendCount} Pending</span>`);

        // Header row (click to expand/collapse)
        const headerDiv = document.createElement('div');
        headerDiv.style.cssText = `
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 14px 20px;
            background: linear-gradient(135deg, #f8faff, #f0f4ff);
            cursor: pointer;
            user-select: none;
            transition: background 0.15s;
        `;
        headerDiv.onmouseenter = () => headerDiv.style.background = 'linear-gradient(135deg,#f0f4ff,#e8eeff)';
        headerDiv.onmouseleave = () => headerDiv.style.background = 'linear-gradient(135deg,#f8faff,#f0f4ff)';

        headerDiv.innerHTML = `
            <!-- Avatar -->
            <div style="width:42px;height:42px;min-width:42px;border-radius:50%;
                        background:linear-gradient(135deg,#7c3aed,#6d28d9);
                        display:flex;align-items:center;justify-content:center;
                        color:white;font-weight:800;font-size:15px;">
                ${initials}
            </div>

            <!-- Name + email -->
            <div style="flex:1;min-width:0;">
                <div style="font-weight:700;color:#1f2937;font-size:15px;margin-bottom:2px;">
                    ${student.studentName}
                </div>
                <div style="font-size:12px;color:#6b7280;">${student.email}</div>
            </div>

            <!-- Status pills -->
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                ${summaryPills.join('')}
                <span style="background:#f3f4f6;color:#6b7280;padding:2px 8px;border-radius:12px;font-size:11px;">
                    ${student.courses.length} course${student.courses.length !== 1 ? 's' : ''}
                </span>
            </div>

            <!-- Expand arrow -->
            <div id="arrow_${idx}" style="color:#7c3aed;font-size:14px;transition:transform 0.2s;transform:rotate(0deg);">
                <i class="fas fa-chevron-down"></i>
            </div>
        `;

        // ── Courses sub-table (collapsible) ──────────────────
        const coursesDiv = document.createElement('div');
        coursesDiv.id = `courses_${idx}`;
        coursesDiv.style.cssText = 'display: none; border-top: 1px solid #e5e7eb;';

        // Sub-table header
        const subHeader = document.createElement('div');
        subHeader.style.cssText = `
            display: grid;
            grid-template-columns: 2.5fr 1.3fr 0.9fr 1.1fr 1.9fr;
            gap: 12px;
            padding: 8px 20px 8px 32px;
            background: #f9fafb;
            font-size: 11px;
            font-weight: 700;
            color: #9ca3af;
            text-transform: uppercase;
            letter-spacing: 0.7px;
            border-bottom: 1px solid #f0f0f0;
        `;
        subHeader.innerHTML = `
            <div>Course</div>
            <div>Progress</div>
            <div>Quiz Avg</div>
            <div>Status</div>
            <div>Actions</div>
        `;
        coursesDiv.appendChild(subHeader);

        // One row per course
        student.courses.forEach(r => {
            const st   = STATUS[r.status] || STATUS.pending;
            const pCol = r.progress >= _criteria.minCompletion ? '#10b981' : r.progress >= 50 ? '#f59e0b' : '#ef4444';
            const qCol = r.avgQ >= _criteria.minQuizScore ? '#10b981' : '#ef4444';

            const sN   = _esc(r.studentName);
            const sE   = _esc(r.email);
            const sCo  = _esc(r.courseName);
            const sCN  = _esc(r.certNumber || '');
            const sTpl = _esc(r.template || 'classic');
            const sCid = _esc(r.courseId || '');

            let actions = '';
            if (r.status === 'eligible') {
                actions = `
                    <button class="btn-primary" style="padding:6px 12px;font-size:12px;white-space:nowrap;"
                        onclick="certPublish('${r.studentId}','${r.courseId}','${sCo}','${sN}','${sE}')">
                        <i class="fas fa-paper-plane"></i> Publish Cert
                    </button>`;
            } else if (r.status === 'draft') {
                actions = `
                    <div style="display:flex;gap:6px;">
                        <button class="btn-primary" style="padding:6px 12px;font-size:12px;background:linear-gradient(135deg,#10b981,#059669);"
                            onclick="certPublishDraft('${r.certId}','${sN}','${sE}','${sCo}','${sCN}')">
                            <i class="fas fa-paper-plane"></i> Publish
                        </button>
                        <button class="action-btn view" title="Preview"
                            onclick="certPreview('${sN}','${sCo}','${sCN}','${sTpl}')">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>`;
            } else if (r.status === 'published') {
                actions = `
                    <div style="display:flex;gap:6px;align-items:center;">
                        <button class="action-btn view" title="Preview"
                            onclick="certPreview('${sN}','${sCo}','${sCN}','${sTpl}')">
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
            } else if (r.status === 'pending') {
                const parts = [];
                if (r.courseId) {
                    if (r.progress < _criteria.minCompletion) parts.push(`${r.progress}% done`);
                    if (r.avgQ < _criteria.minQuizScore)      parts.push(`${r.avgQ}% quiz`);
                }
                const hint = parts.length ? parts.join(' · ') : (r.courseId ? 'Meets criteria' : 'Not enrolled');
                actions = `
                    <div>
                        <div style="font-size:11px;color:#9ca3af;margin-bottom:4px;">${hint}</div>
                        <button style="padding:5px 10px;font-size:11px;border:1.5px solid #7c3aed;
                            border-radius:8px;background:white;color:#7c3aed;cursor:pointer;font-family:inherit;"
                            onclick="openIssueForStudent('${r.studentId}','${sN}','${sE}','${sCid}','${sCo}')">
                            <i class="fas fa-plus-circle"></i> Issue manually
                        </button>
                    </div>`;
            } else {
                actions = `<span style="font-size:12px;color:#ef4444;"><i class="fas fa-ban"></i> Revoked</span>`;
            }

            const cbDisabled = (r.status !== 'eligible' && r.status !== 'draft') ? 'disabled' : '';

            const courseRow = document.createElement('div');
            courseRow.style.cssText = `
                display: grid;
                grid-template-columns: 2.5fr 1.3fr 0.9fr 1.1fr 1.9fr;
                gap: 12px;
                padding: 12px 20px 12px 32px;
                border-bottom: 1px solid #f9fafb;
                align-items: center;
                transition: background 0.15s;
            `;
            courseRow.onmouseenter = () => courseRow.style.background = '#f9fafb';
            courseRow.onmouseleave = () => courseRow.style.background = '';

            courseRow.innerHTML = `
                <!-- Course name with checkbox -->
                <div style="display:flex;align-items:center;gap:10px;">
                    <input type="checkbox" class="cert-select-cb" ${cbDisabled}
                        style="width:14px;height:14px;cursor:pointer;flex-shrink:0;"
                        data-studentid="${r.studentId}" data-courseid="${r.courseId||''}"
                        data-coursename="${r.courseName}" data-studentname="${r.studentName}"
                        data-email="${r.email}">
                    <div>
                        <div style="font-size:13px;font-weight:600;color:#374151;">${r.courseName}</div>
                    </div>
                </div>

                <!-- Progress bar -->
                <div>
                    <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
                        <span style="color:#6b7280;">${r.progress}%</span>
                        <span style="color:${pCol};font-weight:600;font-size:10px;">
                            ${r.courseId ? (r.progress >= _criteria.minCompletion ? '✓' : 'need '+_criteria.minCompletion+'%') : '—'}
                        </span>
                    </div>
                    <div style="height:5px;background:#e5e7eb;border-radius:3px;overflow:hidden;">
                        <div style="height:100%;width:${Math.min(r.progress,100)}%;background:${pCol};border-radius:3px;"></div>
                    </div>
                </div>

                <!-- Quiz score -->
                <div>
                    <div style="font-weight:700;font-size:15px;color:${qCol};">${r.avgQ}%</div>
                    <div style="font-size:10px;color:#9ca3af;">min ${_criteria.minQuizScore}%</div>
                </div>

                <!-- Status badge -->
                <div>
                    <span style="display:inline-block;padding:3px 9px;border-radius:20px;font-size:11px;
                                 font-weight:600;background:${st.bg};color:${st.color};">
                        ${st.label}
                    </span>
                </div>

                <!-- Actions -->
                <div>${actions}</div>
            `;
            coursesDiv.appendChild(courseRow);
        });

        // ── FIXED: Toggle expand/collapse — no optional chaining assignment ──
        let expanded = true; // start expanded
        coursesDiv.style.display = 'block';

        headerDiv.addEventListener('click', () => {
            expanded = !expanded;
            coursesDiv.style.display = expanded ? 'block' : 'none';
            const arrow = studentCard.querySelector(`#arrow_${idx}`);
            if (arrow) arrow.style.transform = expanded ? 'rotate(180deg)' : 'rotate(0deg)';
        });

        studentCard.appendChild(headerDiv);
        studentCard.appendChild(coursesDiv);
        container.appendChild(studentCard);

        // ── FIXED: Set initial arrow rotation after appending to DOM ──
        const arrow = studentCard.querySelector(`#arrow_${idx}`);
        if (arrow) arrow.style.transform = 'rotate(180deg)';
    });
}

// ============================================================
// "ISSUE CERTIFICATE" BUTTON → picker modal
// ============================================================
async function openIssueCertModal() {
    const firstTab = document.querySelector('#certificatesSection .tabs .tab');
    switchCertTab('certEligible', firstTab);
    await _openPickerModal(null, null, null, null, null);
}

async function openIssueForStudent(studentId, studentName, email, courseId, courseName) {
    await _openPickerModal(studentId, studentName, email, courseId, courseName);
}

async function _openPickerModal(preStudId, preStudName, preEmail, preCourseId, preCourseName) {
    const [{ data: students }, { data: courses }] = await Promise.all([
        _certDB.from('profiles').select('id,first_name,last_name,email').eq('role','student').order('first_name'),
        _certDB.from('courses').select('id,title').order('title')
    ]);

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'issuePickerModal';
    modal.style.zIndex = '5000';

    const studOpts = (students||[]).map(s =>
        `<option value="${s.id}" data-name="${_esc(s.first_name+' '+s.last_name)}" data-email="${_esc(s.email)}"
            ${preStudId === s.id ? 'selected' : ''}>
            ${s.first_name} ${s.last_name} — ${s.email}
        </option>`
    ).join('');

    const courseOpts = (courses||[]).map(c =>
        `<option value="${c.id}" ${preCourseId === c.id ? 'selected' : ''}>${c.title}</option>`
    ).join('');

    modal.innerHTML = `
        <div class="modal-content" style="max-width:540px;">
            <div class="modal-header">
                <h2 style="display:flex;align-items:center;gap:10px;">
                    <span style="width:36px;height:36px;background:linear-gradient(135deg,#7c3aed,#6d28d9);
                                 border-radius:10px;display:inline-flex;align-items:center;justify-content:center;">
                        <i class="fas fa-award" style="color:white;font-size:16px;"></i>
                    </span>
                    Issue Certificate
                </h2>
                <button class="modal-close" onclick="document.getElementById('issuePickerModal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div style="background:#faf5ff;border:1.5px solid #e9d5ff;border-radius:12px;
                        padding:14px 18px;margin-bottom:22px;font-size:13px;color:#6d28d9;
                        display:flex;gap:10px;align-items:flex-start;">
                <i class="fas fa-info-circle" style="margin-top:2px;flex-shrink:0;"></i>
                <span>You can issue a certificate to <strong>any student</strong>, regardless of their progress.
                Choose to <strong>Publish Now</strong> (email sent immediately) or <strong>Keep Pending</strong> (save draft, publish later).</span>
            </div>

            <div class="form-group">
                <label style="font-weight:600;color:#374151;font-size:13px;display:block;margin-bottom:6px;">
                    <i class="fas fa-user" style="color:#7c3aed;margin-right:6px;"></i>Select Student *
                </label>
                <select id="_pickStudent"
                    style="width:100%;padding:11px 14px;border:2px solid #e5e7eb;border-radius:10px;
                           font-size:14px;background:white;color:#1f2937;outline:none;cursor:pointer;"
                    onchange="_pickStudentChanged()">
                    <option value="">— Choose a student —</option>
                    ${studOpts}
                </select>
            </div>

            <div class="form-group">
                <label style="font-weight:600;color:#374151;font-size:13px;display:block;margin-bottom:6px;">
                    <i class="fas fa-book" style="color:#7c3aed;margin-right:6px;"></i>Select Course *
                </label>
                <select id="_pickCourse"
                    style="width:100%;padding:11px 14px;border:2px solid #e5e7eb;border-radius:10px;
                           font-size:14px;background:white;color:#1f2937;outline:none;cursor:pointer;">
                    <option value="">— Choose a course —</option>
                    ${courseOpts}
                </select>
            </div>

            <div id="_pickPreview" style="display:none;background:#f0fdf4;border:1.5px solid #86efac;
                border-radius:10px;padding:14px 18px;margin-bottom:20px;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div id="_pickAvatar" style="width:40px;height:40px;border-radius:50%;
                        background:linear-gradient(135deg,#7c3aed,#6d28d9);
                        display:flex;align-items:center;justify-content:center;
                        color:white;font-weight:700;font-size:16px;flex-shrink:0;"></div>
                    <div>
                        <div id="_pickName"  style="font-weight:600;color:#1f2937;font-size:14px;"></div>
                        <div id="_pickEmail" style="font-size:12px;color:#6b7280;"></div>
                    </div>
                    <i class="fas fa-check-circle" style="color:#10b981;font-size:20px;margin-left:auto;"></i>
                </div>
            </div>

            <div class="form-group">
                <label style="font-weight:600;color:#374151;font-size:13px;display:block;margin-bottom:10px;">
                    <i class="fas fa-cog" style="color:#7c3aed;margin-right:6px;"></i>What to do?
                </label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <label id="_lbl_pending"
                        style="display:flex;flex-direction:column;gap:8px;padding:16px;
                               border:2px solid #e5e7eb;border-radius:12px;cursor:pointer;transition:all 0.2s;"
                        onclick="_pickSelectAction('pending')">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <input type="radio" name="_pickAction" value="pending"
                                style="accent-color:#7c3aed;width:16px;height:16px;">
                            <span style="font-size:22px;">⏳</span>
                        </div>
                        <div style="font-weight:700;font-size:14px;color:#1f2937;">Keep Pending</div>
                        <div style="font-size:12px;color:#6b7280;line-height:1.4;">
                            Save as draft. Student won't see it yet. Publish whenever you're ready.
                        </div>
                    </label>
                    <label id="_lbl_publish"
                        style="display:flex;flex-direction:column;gap:8px;padding:16px;
                               border:2px solid #7c3aed;background:#faf5ff;
                               border-radius:12px;cursor:pointer;transition:all 0.2s;"
                        onclick="_pickSelectAction('publish')">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <input type="radio" name="_pickAction" value="publish" checked
                                style="accent-color:#7c3aed;width:16px;height:16px;">
                            <span style="font-size:22px;">🎓</span>
                        </div>
                        <div style="font-weight:700;font-size:14px;color:#1f2937;">Publish Now</div>
                        <div style="font-size:12px;color:#6b7280;line-height:1.4;">
                            Issue immediately and send congratulations email.
                        </div>
                    </label>
                </div>
            </div>

            <div class="modal-actions" style="margin-top:8px;">
                <button type="button" class="btn-secondary"
                    onclick="document.getElementById('issuePickerModal').remove()">Cancel</button>
                <button type="button" class="btn-primary" onclick="_pickConfirm()">
                    <i class="fas fa-award"></i> Confirm
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    if (preStudId) {
        const sel = document.getElementById('_pickStudent');
        if (sel) { sel.value = preStudId; _pickStudentChanged(); }
    }
    if (preCourseId) {
        const sel = document.getElementById('_pickCourse');
        if (sel) sel.value = preCourseId;
    }
}

window._pickStudentChanged = function() {
    const sel     = document.getElementById('_pickStudent');
    const preview = document.getElementById('_pickPreview');
    if (!sel || !preview) return;
    const opt = sel.options[sel.selectedIndex];
    if (sel.value) {
        const name  = opt.dataset.name  || opt.text.split(' — ')[0];
        const email = opt.dataset.email || '';
        document.getElementById('_pickAvatar').textContent = name.charAt(0).toUpperCase();
        document.getElementById('_pickName').textContent   = name;
        document.getElementById('_pickEmail').textContent  = email;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
};

window._pickSelectAction = function(val) {
    document.querySelector(`input[name="_pickAction"][value="${val}"]`).checked = true;
    document.getElementById('_lbl_pending').style.borderColor = val==='pending' ? '#7c3aed' : '#e5e7eb';
    document.getElementById('_lbl_pending').style.background  = val==='pending' ? '#faf5ff' : '';
    document.getElementById('_lbl_publish').style.borderColor = val==='publish' ? '#7c3aed' : '#e5e7eb';
    document.getElementById('_lbl_publish').style.background  = val==='publish' ? '#faf5ff' : '';
};

window._pickConfirm = async function() {
    const studentSel = document.getElementById('_pickStudent');
    const courseSel  = document.getElementById('_pickCourse');
    const action     = document.querySelector('input[name="_pickAction"]:checked')?.value || 'publish';

    if (!studentSel?.value) { _toast('Please select a student', 'error'); return; }
    if (!courseSel?.value)  { _toast('Please select a course',  'error'); return; }

    const opt         = studentSel.options[studentSel.selectedIndex];
    const studentId   = studentSel.value;
    const studentName = (opt.dataset.name  || opt.text.split(' \u2014 ')[0]).replace(/\\'/g,"'");
    const email       = (opt.dataset.email || '').replace(/\\'/g,"'");
    const courseId    = courseSel.value;
    const courseName  = courseSel.options[courseSel.selectedIndex].text;

    document.getElementById('issuePickerModal')?.remove();

    if (action === 'publish') {
        await certPublish(studentId, courseId, courseName, studentName, email);
    } else {
        await _createDraft(studentId, courseId, courseName, studentName, email);
    }
};

// ============================================================
// CREATE DRAFT
// ============================================================
async function _createDraft(studentId, courseId, courseName, studentName, email) {
    _toast('Saving draft…');
    try {
        const { data: ex } = await _certDB.from('certificates')
            .select('id').eq('student_id',studentId).eq('course_id',courseId).eq('revoked',false).maybeSingle();
        if (ex) { _toast(`${studentName} already has a certificate for this course`, 'error'); return; }

        const certNumber = _genNum();
        const { error } = await _certDB.from('certificates').insert({
            student_id: studentId, user_id: studentId,
            course_id:  courseId,  course_name: courseName,
            cert_number: certNumber, template: _certTpl,
            published: false, revoked: false,
            issued_at: new Date().toISOString()
        });
        if (error) throw error;

        _toast(`📄 Draft saved for ${studentName}. Find them in the table to publish when ready.`);
        await loadEligibleStudents();
        await loadIssuedCerts();
    } catch(err) { _toast('Error: ' + err.message, 'error'); }
}

// ============================================================
// PUBLISH
// ============================================================
async function certPublish(studentId, courseId, courseName, studentName, email) {
    if (!confirm(`Publish certificate for ${studentName}?\n\nA congratulations email will be sent to:\n${email}`)) return;
    _toast('Publishing…');
    try {
        const { data: ex } = await _certDB.from('certificates')
            .select('id,cert_number').eq('student_id',studentId).eq('course_id',courseId).eq('revoked',false).maybeSingle();

        let certNumber;
        if (ex) {
            certNumber = ex.cert_number;
            const { error } = await _certDB.from('certificates')
                .update({ published: true, published_at: new Date().toISOString() }).eq('id', ex.id);
            if (error) throw error;
        } else {
            certNumber = _genNum();
            const { error } = await _certDB.from('certificates').insert({
                student_id: studentId,  user_id: studentId,
                course_id:  courseId,   course_name: courseName,
                cert_number: certNumber, template: _certTpl,
                published: true, revoked: false,
                issued_at: new Date().toISOString(), published_at: new Date().toISOString()
            });
            if (error) throw error;
        }

        await _sendEmail({ studentName, email, courseName, certNumber });
        _toast(`✅ Certificate published! Email sent to ${email}`);
    } catch(err) { _toast('Error: ' + err.message, 'error'); return; }
    await loadEligibleStudents();
    await loadIssuedCerts();
}

async function certPublishDraft(certId, studentName, email, courseName, certNumber) {
    if (!confirm(`Publish certificate for ${studentName}?\n\nEmail will be sent to: ${email}`)) return;
    const { error } = await _certDB.from('certificates')
        .update({ published: true, published_at: new Date().toISOString() }).eq('id', certId);
    if (error) { _toast('Error: ' + error.message, 'error'); return; }
    await _sendEmail({ studentName, email, courseName, certNumber });
    _toast(`✅ Published! Email sent to ${email}`);
    await loadEligibleStudents();
    await loadIssuedCerts();
}

// ============================================================
// UNPUBLISH / REVOKE
// ============================================================
async function certUnpublish(certId, studentName) {
    if (!confirm(`Unpublish certificate for ${studentName}?\n\nThey won't see it until you publish again.`)) return;
    const { error } = await _certDB.from('certificates').update({ published: false }).eq('id', certId);
    if (error) { _toast('Error: ' + error.message, 'error'); return; }
    _toast('Certificate unpublished.');
    await loadEligibleStudents();
    await loadIssuedCerts();
}

async function certRevoke(certId, studentName) {
    if (!confirm(`⚠️ Permanently revoke certificate for ${studentName}?\n\nThis cannot be undone.`)) return;
    const { error } = await _certDB.from('certificates')
        .update({ revoked: true, published: false, revoked_at: new Date().toISOString() }).eq('id', certId);
    if (error) { _toast('Error: ' + error.message, 'error'); return; }
    _toast('Certificate revoked.');
    await loadEligibleStudents();
    await loadIssuedCerts();
}

// ============================================================
// BULK PUBLISH
// ============================================================
async function bulkIssueCertificates() {
    const cbs = document.querySelectorAll('.cert-select-cb:checked:not(:disabled)');
    if (!cbs.length) { _toast('Select at least one student first', 'error'); return; }
    if (!confirm(`Publish ${cbs.length} certificate(s) and send emails?`)) return;

    let ok = 0;
    for (const cb of cbs) {
        if (!cb.dataset.courseid) continue;
        try {
            const certNumber = _genNum();
            const { data: ex } = await _certDB.from('certificates')
                .select('id').eq('student_id',cb.dataset.studentid).eq('course_id',cb.dataset.courseid).eq('revoked',false).maybeSingle();
            if (ex) {
                await _certDB.from('certificates').update({ published:true, published_at:new Date().toISOString() }).eq('id',ex.id);
            } else {
                const { error } = await _certDB.from('certificates').insert({
                    student_id: cb.dataset.studentid, user_id: cb.dataset.studentid,
                    course_id:  cb.dataset.courseid,  course_name: cb.dataset.coursename,
                    cert_number: certNumber, template: _certTpl,
                    published: true, revoked: false,
                    issued_at: new Date().toISOString(), published_at: new Date().toISOString()
                });
                if (error) continue;
            }
            await _sendEmail({ studentName:cb.dataset.studentname, email:cb.dataset.email, courseName:cb.dataset.coursename, certNumber });
            ok++;
        } catch(_) {}
    }
    _toast(`✅ ${ok} certificate(s) published and emails sent!`);
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
        .select(`id,cert_number,course_name,issued_at,published,published_at,revoked,student_id,template,
                 profiles!certificates_student_id_fkey(first_name,last_name,email)`)
        .eq('revoked', false).order('issued_at', { ascending: false });

    if (!error) {
        certs = c1 || [];
    } else {
        const { data: c2 } = await _certDB.from('certificates')
            .select('id,cert_number,course_name,issued_at,published,published_at,revoked,student_id,template')
            .eq('revoked',false).order('issued_at',{ascending:false});
        const ids = [...new Set((c2||[]).map(c => c.student_id))];
        let profs = [];
        if (ids.length) {
            const { data: p } = await _certDB.from('profiles').select('id,first_name,last_name,email').in('id',ids);
            profs = p || [];
        }
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
                <p style="font-size:13px;margin:0;">Issue certificates from the Eligible Students tab.</p>
            </div>`;
        return;
    }

    container.innerHTML = '';
    const hdr = document.createElement('div');
    hdr.style.cssText = `display:grid;grid-template-columns:2fr 2fr 1fr 1fr 1fr 1.5fr;
        gap:16px;padding:10px 20px;background:#f8fafc;border-bottom:2px solid #e5e7eb;
        font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.7px;`;
    hdr.innerHTML = `<div>Student</div><div>Course</div><div>Issued</div><div>Published</div><div>Status</div><div>Actions</div>`;
    container.appendChild(hdr);

    certs.forEach(cert => {
        const name   = cert.profiles ? `${cert.profiles.first_name} ${cert.profiles.last_name}` : 'Unknown';
        const email  = cert.profiles?.email || '';
        const issued = new Date(cert.issued_at).toLocaleDateString();
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
            <div style="font-size:14px;color:#374151;">${cert.course_name||'—'}</div>
            <div style="font-size:13px;color:#6b7280;">${issued}</div>
            <div style="font-size:13px;color:#6b7280;">${pubDate}</div>
            <div>
                <span style="display:inline-block;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;
                    ${cert.published ? 'background:#d1fae5;color:#065f46;' : 'background:#fef9c3;color:#854d0e;'}">
                    ${cert.published ? '✓ Published' : '⏳ Draft'}
                </span>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="action-btn view" title="Preview" onclick="certPreview('${sN}','${sCo}','${sCN}','${sTpl}')">
                    <i class="fas fa-eye"></i></button>
                ${cert.published
                    ? `<button class="action-btn edit" title="Unpublish" style="color:#f59e0b;" onclick="certUnpublish('${cert.id}','${sN}')">
                           <i class="fas fa-eye-slash"></i></button>`
                    : `<button class="action-btn edit" title="Publish" style="color:#10b981;" onclick="certPublishDraft('${cert.id}','${sN}','${sE}','${sCo}','${sCN}')">
                           <i class="fas fa-paper-plane"></i></button>`
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
                <div style="width:720px;min-height:500px;background:${t.bg};border:${t.border};padding:50px 60px;position:relative;font-family:Georgia,serif;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,0.35);display:flex;flex-direction:column;align-items:center;">
                    <div style="position:absolute;inset:14px;border:${t.inner};pointer-events:none;border-radius:2px;"></div>
                    <div style="width:60px;height:60px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
                        <i class="fas fa-graduation-cap" style="color:white;font-size:24px;"></i>
                    </div>
                    <div style="font-size:11px;font-weight:700;letter-spacing:3.5px;text-transform:uppercase;color:${t.org};margin-bottom:20px;font-family:'Plus Jakarta Sans',sans-serif;">ASAI — African School of AI</div>
                    <div style="font-size:36px;font-weight:700;color:${t.title};line-height:1.1;margin-bottom:10px;">Certificate of Completion</div>
                    <div style="font-size:12px;color:${t.sub};letter-spacing:2.5px;text-transform:uppercase;margin-bottom:24px;font-family:'Plus Jakarta Sans',sans-serif;">This is to certify that</div>
                    <div style="font-size:34px;font-weight:700;color:${t.name};border-bottom:2px solid ${t.nameUL};padding-bottom:8px;margin-bottom:18px;min-width:300px;">${studentName}</div>
                    <div style="font-size:13px;color:${t.text};font-style:italic;margin-bottom:8px;">has successfully completed the course</div>
                    <div style="font-size:20px;font-weight:600;color:${t.name};margin-bottom:22px;">${courseName}</div>
                    <div style="font-size:13px;color:${t.sub};font-style:italic;max-width:460px;line-height:1.7;margin-bottom:28px;">demonstrating knowledge, dedication, and commitment to excellence in AI education.</div>
                    <div style="display:flex;justify-content:space-between;align-items:flex-end;width:100%;margin-top:auto;padding-top:16px;">
                        <div style="text-align:center;">
                            <div style="width:140px;height:1px;background:${t.sub};margin:0 auto 6px;"></div>
                            <div style="font-size:12px;font-weight:600;color:${t.text};font-family:'Plus Jakarta Sans',sans-serif;">Dr. Amina Mohammed</div>
                            <div style="font-size:10px;color:${t.sub};font-family:'Plus Jakarta Sans',sans-serif;">Program Director</div>
                        </div>
                        <div style="width:72px;height:72px;border-radius:50%;background:${t.seal};border:${t.sealB};display:flex;align-items:center;justify-content:center;">
                            <i class="fas fa-star" style="color:${t.sealC};font-size:22px;"></i>
                        </div>
                        <div style="text-align:center;">
                            <div style="width:140px;height:1px;background:${t.sub};margin:0 auto 6px;"></div>
                            <div style="font-size:12px;font-weight:600;color:${t.text};font-family:'Plus Jakarta Sans',sans-serif;">Date: ${date}</div>
                            <div style="font-size:10px;color:${t.sub};font-family:'Plus Jakarta Sans',sans-serif;">Issue Date</div>
                        </div>
                    </div>
                    <div style="position:absolute;bottom:16px;right:20px;font-size:9px;color:${t.sub};font-family:'Courier New',monospace;opacity:0.8;">ID: ${certNumber||'PREVIEW'}</div>
                </div>
            </div>
            <div style="display:flex;gap:12px;margin-top:18px;">
                <button class="btn-primary" onclick="_toast('PDF download — integrate html2pdf.js')" style="flex:1;"><i class="fas fa-download"></i> Download PDF</button>
                <button class="btn-secondary" onclick="this.closest('.modal').remove()" style="flex:1;">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// ============================================================
// TEMPLATE / CRITERIA / TABS / EMAIL LOG
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
    document.querySelectorAll('#certificatesSection .tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    document.querySelectorAll('#certificatesSection .tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(tabId)?.classList.add('active');
    if (tabId === 'certIssued')   loadIssuedCerts();
    if (tabId === 'certEligible') loadEligibleStudents();
}

async function viewEmailLog() {
    let certs = [];
    const { data, error } = await _certDB
        .from('certificates')
        .select(`cert_number,course_name,published_at,student_id,profiles!certificates_student_id_fkey(first_name,last_name,email)`)
        .eq('published',true).eq('revoked',false).order('published_at',{ascending:false});

    if (!error) {
        certs = data || [];
    } else {
        const { data: c2 } = await _certDB.from('certificates')
            .select('cert_number,course_name,published_at,student_id').eq('published',true).eq('revoked',false).order('published_at',{ascending:false});
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
                    <strong>Course:</strong> ${c.course_name||'—'}<br>
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
    if (!session) {
      console.warn('No session — email skipped');
      return;
    }

    // Get your Supabase project URL
    const supabaseUrl = window.SUPABASE_URL
      || _certDB.supabaseUrl
      || _certDB.rest?.url?.replace('/rest/v1', '');

    if (!supabaseUrl) {
      console.warn('SUPABASE_URL not found — email skipped');
      return;
    }

    const payload = {
      to:          email,
      studentName: studentName,
      courseName:  courseName,
      certNumber:  certNumber,
      issuedDate:  new Date().toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric'
      })
    };

    console.log('📧 Sending email to:', email);

    const res = await fetch(
      `${supabaseUrl}/functions/v1/send-certificate-email`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(payload)
      }
    );

    const result = await res.json();
    if (!res.ok) {
      console.error('❌ Email failed:', result);
    } else {
      console.log('✅ Email sent:', result);
    }

  } catch (err) {
    console.error('❌ Email error:', err.message);
  }
}

// ============================================================
// EXPOSE GLOBALS + AUTO-INIT
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
    window.openIssueCertModal       = openIssueCertModal;
    window.openIssueForStudent      = openIssueForStudent;
    window.viewEmailLog             = viewEmailLog;
    window.certPublish              = certPublish;
    window.certPublishDraft         = certPublishDraft;
    window.certUnpublish            = certUnpublish;
    window.certRevoke               = certRevoke;
    window.certPreview              = certPreview;
    // Legacy aliases
    window.previewCert              = (id,sN,cN,num,tpl) => certPreview(sN,cN,num,tpl);
    window.revokeCert               = certRevoke;
    window.adminRevokeCert          = certRevoke;
    window.adminUnpublishCert       = certUnpublish;
    window.adminPreviewCert         = certPreview;
    window.issueSingleCert          = certPublish;
    window.togglePublishCert        = (certId, currentlyPub, sName, email, cName, certNum) =>
        currentlyPub ? certUnpublish(certId, sName) : certPublishDraft(certId, sName, email, cName, certNum);
    console.log('✅ certificates.js v4 loaded');
});