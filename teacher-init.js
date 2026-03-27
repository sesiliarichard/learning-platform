// ============================================================
// teacher-init.js
// Foundation for the Teacher Dashboard
// ============================================================

// ── 1. GLOBAL STATE ──────────────────────────────────────────
window.teacherState = {
    user:            null,
    profile:         null,
    courses:         [],
    students:        [],
    quizzes:         [],
    assignments:     [],
    _recentActivity: [],
};
const teacher = window.teacherState;

// ── 4. AUTH GUARD + INIT ──────────────────────────────────────
window.initTeacherDashboard = async function () {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) { window.location.replace('teacher-login.html'); return; }

        let { data: profile } = await supabaseClient
            .from('profiles').select('*').eq('id', session.user.id).maybeSingle();
        if (!profile) {
            const { data: byEmail } = await supabaseClient
                .from('profiles').select('*').eq('email', session.user.email).maybeSingle();
            profile = byEmail;
        }

        if (!profile || (profile.role !== 'teacher' && profile.role !== 'instructor')) {
            await supabaseClient.auth.signOut();
            window.location.replace('teacher-login.html');
            return;
        }

        teacher.user    = session.user;
        teacher.profile = profile;

        const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ')
                      || profile.full_name || session.user.email || 'Teacher';
        const initials = fullName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

        const el = id => document.getElementById(id);
        if (el('sbName'))   el('sbName').textContent   = fullName;
        if (el('sbAv'))     el('sbAv').textContent     = initials;
        if (el('tbAv'))     el('tbAv').textContent     = initials;
        if (el('welcomeN')) el('welcomeN').textContent = fullName.split(' ')[0];

        await loadCoursesFromDB();
        populateCourseDropdowns();

        await Promise.all([
            loadQuizzesFromDB(),
            loadAssignmentsFromDB(),
            loadStudentsFromDB(),
        ]);

        await Promise.all([
            typeof loadPendingGradingFromDB === 'function' ? loadPendingGradingFromDB() : Promise.resolve(),
            typeof loadAnnouncementsFromDB  === 'function' ? loadAnnouncementsFromDB()  : Promise.resolve(),
            typeof loadResourcesFromDB      === 'function' ? loadResourcesFromDB()      : Promise.resolve(),
        ]);

        renderOverview();
        setupNavigation();

    } catch (err) {
        console.error('Teacher init error:', err);
        window.location.replace('teacher-login.html');
    }
};

// ── 5. LOGOUT ─────────────────────────────────────────────────
window.handleLogout = async function () {
    await supabaseClient.auth.signOut();
    window.location.replace('teacher-login.html');
};

// ── 6. NAVIGATION ─────────────────────────────────────────────
function setupNavigation() {
    document.querySelectorAll('.nl').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const sec = link.dataset.s;
            if (sec) showSec(sec);
        });
    });

    const mobBtn  = document.getElementById('mobBtn');
    const sidebar = document.getElementById('sidebar');
    if (mobBtn && sidebar) {
        mobBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
        document.addEventListener('click', e => {
            if (!sidebar.contains(e.target) && !mobBtn.contains(e.target))
                sidebar.classList.remove('open');
        });
    }

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const parent = tab.closest('.sec') || document;
            parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            parent.querySelectorAll('.tp').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = document.getElementById(tab.dataset.tab);
            if (panel) panel.classList.add('active');

switch (tab.dataset.tab) {
                case 'qzList':
                    const rg = document.getElementById('quizResGrid');
                    if (rg) rg.innerHTML = '';
                    if (typeof renderQuizList === 'function') renderQuizList();
                    break;
                case 'qzResults':
                    const qg = document.getElementById('quizzesGrid');
                    if (qg) qg.innerHTML = '';
                    if (typeof renderQuizResultsTab === 'function') renderQuizResultsTab();
                    break;
                case 'assList':
                    const sg = document.getElementById('assignSubGrid');
                    if (sg) sg.innerHTML = '';
                    if (typeof renderAssignmentList === 'function') renderAssignmentList();
                    break;
                case 'assSubs':
                    const ag = document.getElementById('assignGrid');
                    if (ag) ag.innerHTML = '';
                    if (typeof renderAssignmentSubmissions === 'function') renderAssignmentSubmissions();
                    break;
                case 'sRecs':
                    if (typeof loadSavedRecordings === 'function') loadSavedRecordings();
                    break;
            }
        });
    });
}

// ── 7. SHOW SECTION ───────────────────────────────────────────
window.showSec = function (secId) {
    document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nl').forEach(l => l.classList.remove('active'));
    const sec  = document.getElementById(secId + 'Section');
    const link = document.querySelector(`.nl[data-s="${secId}"]`);
    if (sec)  sec.classList.add('active');
    if (link) link.classList.add('active');

    const titles = {
        overview:      ['Dashboard',      'Overview'],
        courses:       ['My Courses',     'Course Management'],
        content:       ['Content Studio', 'View Notes & Materials'],
        quizzes:       ['Quizzes',        'Quiz Management'],
        assignments:   ['Assignments',    'Assignment Management'],
        sessions:      ['Live Sessions',  'Video Conferencing'],
        studentWork:   ['Student Work',   'Review Submissions'],
        students:      ['My Students',    'Student Management'],
        grading:       ['Grade Center',   'Pending Submissions'],
        discussions:   ['Discussions',    'Student Discussions'],
        announcements: ['Announcements',  'Post Announcements'],
        resources:     ['Resources',      'Learning Materials'],
    };
    const [title, sub] = titles[secId] || ['Dashboard', ''];
    const pgTitle = document.getElementById('pgTitle');
    const pgSub   = document.getElementById('pgSub');
    if (pgTitle) pgTitle.textContent = title;
    if (pgSub)   pgSub.textContent   = sub;

    if (secId === 'studentWork' && typeof renderSWList === 'function') {
        renderSWList();
    }
    if (secId === 'grading' && typeof loadPendingGradingFromDB === 'function') {
        loadPendingGradingFromDB();
    }
    if (secId === 'students' && typeof renderStudentsTable === 'function') {
        renderStudentsTable();
    }
    if (secId === 'discussions' && typeof initTeacherDiscUI === 'function') {
        initTeacherDiscUI();
    }
   if (secId === 'quizzes') {
        const rg = document.getElementById('quizResGrid');
        if (rg) rg.innerHTML = '';
        if (typeof renderQuizList === 'function') renderQuizList();
    }
    if (secId === 'assignments') {
        const sg = document.getElementById('assignSubGrid');
        if (sg) sg.innerHTML = '';
        if (typeof renderAssignmentList === 'function') renderAssignmentList();
    }

    if (secId === 'announcements') {
        loadTeacherAnnouncementsUI();
    }
};

// ── 8. MODALS ─────────────────────────────────────────────────
window.openM  = id => document.getElementById(id)?.classList.add('open');
window.closeM = id => document.getElementById(id)?.classList.remove('open');
document.addEventListener('click', e => {
    if (e.target.classList.contains('modal')) e.target.classList.remove('open');
});

// ── 9. TOAST ──────────────────────────────────────────────────
window.toast = function (msg, type = 's') {
    const t  = document.getElementById('toast');
    const m  = document.getElementById('toastMsg');
    if (!t || !m) return;
    m.textContent = msg;
    t.className = 'toast ' + type + ' show';
    clearTimeout(t._to);
    t._to = setTimeout(() => t.classList.remove('show'), 3500);
};

// ── 10. POPULATE COURSE DROPDOWNS ─────────────────────────────
function populateCourseDropdowns() {
    ['contentCouSel','qzCouSel','assgnCouSel','annCouSel','resCouSel',
     'schedCouSel','chCouSel','swCouFilter','stuCouFilter','gcCouFilter']
    .forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        while (sel.options.length > 1) sel.remove(1);
        teacher.courses.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id; opt.textContent = c.title;
            sel.appendChild(opt);
        });
    });
}

// ── 11. RENDER OVERVIEW ───────────────────────────────────────
function renderOverview() {
    const el = id => document.getElementById(id);

    if (el('stStu')) el('stStu').textContent = teacher.students.length;
    if (el('stCou')) el('stCou').textContent = teacher.courses.length;

    const pending = teacher.assignments.reduce((s, a) => s + (a.pending_count || 0), 0);
    if (el('stPnd'))     el('stPnd').textContent     = pending;
    if (el('pendBadge')) el('pendBadge').textContent = pending || '';

    const scores = teacher.students.filter(s => s.avg_score != null).map(s => s.avg_score);
    const avg    = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    if (el('stAvg')) el('stAvg').textContent = avg + '%';

    const ovCou = el('ovCou');
    if (ovCou) {
        ovCou.innerHTML = teacher.courses.map(c => `
            <div class="cp-i">
                <div class="cp-info">
                    <span class="cp-dot" style="background:${c.color}"></span>
                    <span class="cp-n">${c.title.split(' ').slice(0,3).join(' ')}…</span>
                    <span class="cp-p">${c.progress || 0}%</span>
                </div>
                <div class="cp-bar">
                    <div class="cp-f" style="width:${c.progress||0}%;background:${c.color}"></div>
                </div>
            </div>`).join('') || '<p style="color:var(--mut);font-size:12px">No courses assigned yet.</p>';
    }

    const ovPend = el('ovPend');
    if (ovPend) {
        const pendItems = teacher.assignments.filter(a => a.pending_count > 0).slice(0, 4);
        ovPend.innerHTML = pendItems.map(a => {
            const c = teacher.courses.find(x => x.id === (a.courseId || a.course_id));
            return `<div class="pend-i">
                <div class="pend-ic" style="background:${c?.color||'#1a9fd4'}22;color:${c?.color||'#1a9fd4'}">
                    <i class="fas fa-file-alt"></i>
                </div>
                <div style="flex:1">
                    <div class="pend-ttl">${_esc(a.title)}</div>
                    <div class="pend-m">${_esc(c?.title||'')} · ${a.pending_count} pending</div>
                </div>
                <button class="bxs" onclick="showSec('grading')">Grade</button>
            </div>`;
        }).join('') || '<p style="color:var(--mut);font-size:12px;padding:10px">All caught up! 🎉</p>';
    }
}



// ── 12. UTILITY ───────────────────────────────────────────────
window._timeAgo = function (date) {
    const sec = Math.floor((new Date() - date) / 1000);
    for (const [s, u] of [[31536000,'year'],[2592000,'month'],[604800,'week'],
                           [86400,'day'],[3600,'hour'],[60,'minute']]) {
        const n = Math.floor(sec / s);
        if (n >= 1) return `${n} ${u}${n>1?'s':''} ago`;
    }
    return 'Just now';
};

window._esc = function (str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
};

// Session timer globals
window.timerInterval = null;
window.timerSec      = 0;
window.startTimer = function () {
    clearInterval(window.timerInterval);
    window.timerSec = 0;
    window.timerInterval = setInterval(() => {
        window.timerSec++;
        const m  = Math.floor(window.timerSec/60).toString().padStart(2,'0');
        const s  = (window.timerSec%60).toString().padStart(2,'0');
        const el = document.getElementById('sessTimer');
        if (el) el.textContent = `${m}:${s}`;
    }, 1000);
};

// Recording globals
window.teacherIsRecording    = false;
window.teacherMediaRecorder  = null;
window.teacherRecordedChunks = [];
window.teacherRecordings     = [];
window.quizQuestions         = [];
window.currentGradeItem      = null;
window.activeStudentId       = null;
window.fakeSizeKB            = 0;

window.loadTeacherAnnouncementsUI = async function() {
    const container = document.getElementById('annList');
    if (!container) return;

    container.innerHTML = `
        <div class="empty">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading announcements…</p>
        </div>`;

    const { data, error } = await supabaseClient
        .from('announcements')
        .select('id, title, message, priority, created_at, course_id, type')
        .eq('published', true)
        .order('created_at', { ascending: false });

    if (error || !data?.length) {
        container.innerHTML = `
            <div class="empty">
                <i class="fas fa-bullhorn"></i>
                <p>No announcements yet.</p>
            </div>`;
        return;
    }

    // ── Build the same cream section wrapper as student dashboard ──
    container.innerHTML = `
        <div class="ann-cream-section">
            <div class="ann-corner-dot tl"></div>
            <div class="ann-corner-dot tr"></div>
            <div class="ann-corner-dot bl"></div>
            <div class="ann-corner-dot br"></div>
            <div class="announcements-list" id="teacherAnnListInner"></div>
        </div>`;

    const inner = document.getElementById('teacherAnnListInner');
    if (!inner) return;

    function getTimeAgo(date) {
        const sec = Math.floor((new Date() - date) / 1000);
        const intervals = [
            [31536000,'year'],[2592000,'month'],[604800,'week'],
            [86400,'day'],[3600,'hour'],[60,'minute']
        ];
        for (const [s, u] of intervals) {
            const n = Math.floor(sec / s);
            if (n >= 1) return `${n} ${u}${n > 1 ? 's' : ''} ago`;
        }
        return 'Just now';
    }

    data.forEach(ann => {
        const timeAgo  = getTimeAgo(new Date(ann.created_at));
        const priority = ann.priority || 'normal';
        const typeLabels = {
            admin: 'Admin Notice', quiz: 'Quiz Announcement',
            assignment: 'New Assignment', general: 'General Notice'
        };
        const eyebrow  = typeLabels[ann.type] || 'Announcement';
        const pColors  = { urgent: '#ef4444', high: '#f59e0b', normal: '#6b7280' };
        const pColor   = pColors[priority] || '#6b7280';

        const wrap = document.createElement('div');
        wrap.className = 'ann-hang-wrap is-unread';
        wrap.id = `teacher-ann-${ann.id}`;
        wrap.dataset.priority = priority;
        wrap.style.marginBottom = '24px';
        wrap.style.position = 'relative';

        wrap.innerHTML = `
            <!-- Hanging strings -->
            <div style="display:flex;justify-content:space-around;
                        padding:0 40px;margin-bottom:-2px;">
                <div style="width:2px;height:24px;background:#8b6914;border-radius:1px;"></div>
                <div style="width:2px;height:24px;background:#8b6914;border-radius:1px;"></div>
            </div>

            <!-- Navy sign card -->
            <div style="background:linear-gradient(160deg,#1a2a6c,#162055);
                        border-radius:18px;padding:24px 28px;color:white;
                        position:relative;overflow:hidden;
                        border-left:4px solid #22d3ee;
                        box-shadow:0 8px 32px rgba(26,42,108,0.35);">

                <div style="position:absolute;top:-18px;right:-18px;width:56px;height:56px;
                            background:rgba(255,255,255,0.04);border-radius:50%;"></div>
                <div style="position:absolute;bottom:-12px;left:-12px;width:40px;height:40px;
                            background:rgba(255,255,255,0.03);border-radius:50%;"></div>

                <div style="position:absolute;top:16px;right:16px;width:10px;height:10px;
                            background:#22d3ee;border-radius:50%;animation:pulse 2s infinite;"></div>

                <div style="font-size:10px;font-weight:700;letter-spacing:2px;
                            text-transform:uppercase;color:rgba(255,255,255,0.5);
                            margin-bottom:8px;">${_esc(eyebrow)}</div>

                <div style="font-size:18px;font-weight:800;color:white;
                            margin-bottom:10px;line-height:1.3;">
                    ${_esc(ann.title)}
                </div>

                <div style="font-size:14px;color:rgba(255,255,255,0.8);
                            line-height:1.65;margin-bottom:16px;">
                    ${_esc(ann.message || '')}
                </div>

                <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:14px;">
                    ASAI · info@asai.ac.tz
                </div>

                <div style="display:flex;align-items:center;
                            justify-content:space-between;flex-wrap:wrap;gap:10px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="padding:3px 10px;border-radius:20px;
                                     font-size:11px;font-weight:700;
                                     background:${priority === 'urgent'
                                        ? 'rgba(239,68,68,0.25)'
                                        : priority === 'high'
                                        ? 'rgba(245,158,11,0.25)'
                                        : 'rgba(255,255,255,0.1)'};
                                     color:${pColor};
                                     border:1px solid ${pColor}40;">
                            ${priority}
                        </span>
                        <span style="font-size:12px;color:rgba(255,255,255,0.45);">
                            <i class="fas fa-clock"></i> ${timeAgo}
                        </span>
                    </div>
                </div>
            </div>`;

        inner.appendChild(wrap);
    });
}