// ============================================================
//  teacher-grading.js  — FIXED v2
//  FIX 1: renderSWList uses correct course filter (swCouFilter)
//  FIX 2: loadPendingGradingFromDB uses user_id OR student_id
//  FIX 3: renderStudentAssignments queries user_id OR student_id
//  FIX 4: Grade Center loads all ungraded (score IS null)
// ============================================================

let currentGradeItem    = null;
let activeStudentId     = null;
let pendingGradingCache = [];
let swStudentsCache     = [];

const _initials = name =>
  (name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

const _gradeColor = pct =>
  pct >= 80 ? 'var(--grn)' : pct >= 60 ? 'var(--amb)' : 'var(--red)';

const _relTime = iso => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso);
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? 's' : ''} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? 's' : ''} ago`;
};

const LETTER_OPTIONS = ['A+','A','A-','B+','B','B-','C+','C','F'];

function _resolveName(p) {
  if (!p) return 'Student';
  return (
    [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
    || p.full_name
    || p.display_name
    || p.name
    || p.email
    || 'Student'
  );
}

// ============================================================
//  1. LOAD PENDING GRADING
// ============================================================
async function loadPendingGradingFromDB() {
  const db        = supabaseClient;
  const courseIds = teacherState.courses.map(c => c.id);
  if (!courseIds.length) return;

  try {
    const assignIds = teacherState.assignments.map(a => a.id);

    let assSubs = [], assProfileMap = {};
    if (assignIds.length) {

   const { data, error } = await db
         .from('assignment_submissions')
        .select('id, submitted_at, text_response, file_url, assignment_id, student_id, user_id, score, grade')
        .in('assignment_id', assignIds)
        .is('score', null)
        .order('submitted_at', { ascending: true });

      if (error) throw error;
      assSubs = data || [];

if (assSubs.length) {
     const ids = [...new Set(assSubs.map(s => s.student_id || s.user_id).filter(Boolean))];
     console.log('pending grading: looking up ids', ids);
      const { data: profiles, error: pErr } = await db
    .from('profiles')
    .select('id, first_name, last_name, full_name, email')
    .in('id', ids);
      console.log('pending grading: profiles found', profiles, pErr);
     (profiles || []).forEach(p => {
    assProfileMap[p.id] = _resolveName(p);
  });
}
    }

    pendingGradingCache = assSubs.map(s => {
      // ✅ FIX: resolve user_id OR student_id
      const resolvedId = s.user_id || s.student_id;
      const assign     = teacherState.assignments.find(a => a.id === s.assignment_id);
      const course     = teacherState.courses.find(c => c.id === assign?.courseId);
      return {
        id:           s.id,
        type:         'assignment',
        title:        assign?.title        || '—',
        student:      assProfileMap[resolvedId] || 'Student',
        studentId:    resolvedId,
        courseId:     assign?.courseId,
        courseTitle:  course?.title        || '—',
        courseColor:  course?.color        || '#1a9fd4',
        submitted:    _relTime(s.submitted_at),
        submittedAt:  s.submitted_at,
        maxPoints:    assign?.max_points   || 100,
        textResponse: s.text_response,
        fileUrl:      s.file_url,
        autoScore:    null,
      };
    });

    renderGradeCenter();
    renderOverviewPending();
    updatePendingBadge();

    const stPnd = document.getElementById('stPnd');
    if (stPnd) stPnd.textContent = pendingGradingCache.length;

  } catch (err) {
    console.error('loadPendingGradingFromDB:', err.message);
    _showGradeError('Could not load pending grading. Check your connection.');
  }
}

// ============================================================
//  2. GRADE CENTER GRID
// ============================================================
function renderGradeCenter() {
  const g = document.getElementById('gradingGrid');
  if (!g) return;

  const typeF = document.getElementById('gcTypeFilter')?.value || 'all';
  const couF  = document.getElementById('gcCouFilter')?.value  || '';

  let list = [...pendingGradingCache];
  if (typeF && typeF !== 'all') list = list.filter(x => x.type === typeF);
  if (couF)                     list = list.filter(x => String(x.courseId) === couF);

  if (!list.length) {
    g.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <i class="fas fa-check-circle" style="color:var(--grn)"></i>
        <p>All caught up! No pending submissions.</p>
      </div>`;
    return;
  }

  g.innerHTML = list.map(item => `
    <div class="gcd">
      <div class="gcd-top">
        <div class="gcd-typ"
             style="background:${item.courseColor}22;color:${item.courseColor}">
          <i class="fas fa-${item.type === 'quiz' ? 'clipboard-list' : 'file-alt'}"></i>
          ${item.type}
        </div>
        <span class="gcd-time">${item.submitted}</span>
      </div>
      <div class="gcd-ttl">${_esc(item.title)}</div>
      <div class="gcd-stu">
        <div class="stu-av" style="background:${item.courseColor}">
          ${_initials(item.student)}
        </div>
        ${_esc(item.student)}
      </div>
      <div class="gcd-crs">${_esc(item.courseTitle)}</div>
      <button class="btn bp fw"
              onclick="openGradeModalById('${item.id}','${item.type}')">
        <i class="fas fa-pen"></i> Grade Now
      </button>
    </div>`).join('');
}

function loadGrading() { renderGradeCenter(); }

// ============================================================
//  3. OVERVIEW PENDING WIDGET
// ============================================================
function renderOverviewPending() {
  const pe = document.getElementById('ovPend');
  if (!pe) return;

  if (!pendingGradingCache.length) {
    pe.innerHTML = `
      <div class="empty" style="padding:16px 0">
        <i class="fas fa-check-circle" style="color:var(--grn)"></i>
        <p>Nothing pending — you're all caught up!</p>
      </div>`;
    return;
  }

  pe.innerHTML = pendingGradingCache.slice(0, 4).map(item => `
    <div class="pend-i">
      <div class="pend-ic"
           style="background:${item.courseColor}22;color:${item.courseColor}">
        <i class="fas fa-${item.type === 'quiz' ? 'clipboard-list' : 'file-alt'}"></i>
      </div>
      <div style="flex:1;min-width:0">
        <div class="pend-ttl">${_esc(item.title)}</div>
        <div class="pend-m">${_esc(item.student)} · ${item.submitted}</div>
      </div>
      <button class="bxs"
              onclick="openGradeModalById('${item.id}','${item.type}')">
        Grade
      </button>
    </div>`).join('');

  const el = document.getElementById('stPnd');
  if (el) el.textContent = pendingGradingCache.length;
}

function updatePendingBadge() {
  const b = document.getElementById('pendBadge');
  if (!b) return;
  b.textContent   = pendingGradingCache.length || '';
  b.style.display = pendingGradingCache.length ? 'inline-flex' : 'none';
}

// ============================================================
//  4. GRADE MODAL — open
// ============================================================
function openGradeModalById(itemId, type) {
  const item = pendingGradingCache.find(
    p => String(p.id) === String(itemId) && p.type === type
  );
  if (!item) { toast('Submission not found', 'w'); return; }
  currentGradeItem = item;

  document.getElementById('gmInfo').innerHTML = `
    <div class="gi-box">
      <strong>${_esc(item.title)}</strong>
      <div style="color:var(--mut);font-size:11px;margin-top:3px">
        Student: <strong>${_esc(item.student)}</strong>
        · ${_esc(item.courseTitle)}
      </div>
      ${item.textResponse
        ? `<div class="sub-txt" style="margin-top:10px">
             ${_esc(item.textResponse)}
           </div>`
        : ''}
     ${item.fileUrl
  ? `<div style="margin-top:10px">
       <div style="display:flex;gap:8px;margin-bottom:8px">
         <a href="${_esc(item.fileUrl)}" target="_blank"
            class="btn bg" style="font-size:11px;padding:6px 12px">
           <i class="fas fa-eye"></i> View File
         </a>
         <a href="${_esc(item.fileUrl)}" download
            class="btn bg" style="font-size:11px;padding:6px 12px">
           <i class="fas fa-download"></i> Download
         </a>
       </div>
       <div style="border:1.5px solid var(--bdr);border-radius:8px;overflow:hidden;background:var(--s3)">
  ${(() => {
  const rawUrl = item.fileUrl || '';
  const cleanUrl = rawUrl.split('?')[0].toLowerCase();
  if (cleanUrl.match(/\.pdf$/)) {
    return `<iframe src="${_esc(rawUrl)}" width="100%" height="400" style="border:none;display:block"></iframe>`;
  } else if (cleanUrl.match(/\.(png|jpg|jpeg|gif|webp)$/)) {
    return `<img src="${_esc(rawUrl)}" style="width:100%;max-height:320px;object-fit:contain;display:block;padding:8px"/>`;
  } else if (cleanUrl.match(/\.(doc|docx|ppt|pptx|xls|xlsx)$/)) {
    return `<iframe src="https://docs.google.com/gview?url=${encodeURIComponent(rawUrl)}&embedded=true" width="100%" height="400" style="border:none;display:block"></iframe>`;
  } else {
    return `<div style="padding:20px;text-align:center;color:var(--mut)">
      <i class="fas fa-file-alt" style="font-size:32px;display:block;margin-bottom:8px"></i>
      <div style="font-size:12px">Preview not available for this file type</div>
      <a href="${_esc(rawUrl)}" target="_blank" style="font-size:12px;color:var(--acc);margin-top:6px;display:inline-block">Open file in new tab →</a>
    </div>`;
  }
})()}
       </div>
     </div>`
  : ''}
    </div>`;

  const gmMax = document.getElementById('gmMax');
  if (gmMax) gmMax.textContent = item.maxPoints;

  const gmScore = document.getElementById('gmScore');
  if (gmScore) gmScore.value = '';

  openM('gradeModal');
}

// ============================================================
//  5. GRADE MODAL — submit
// ============================================================
async function submitGradeFromModal(e) {
  e.preventDefault();
  if (!currentGradeItem) return;

  const fd       = new FormData(e.target);
  const score    = parseInt(fd.get('score'));
  const letter   = fd.get('grade');
  const feedback = fd.get('feedback')?.trim();

  if (isNaN(score) || score < 0 || score > currentGradeItem.maxPoints) {
    toast(`Score must be 0–${currentGradeItem.maxPoints}`, 'w'); return;
  }
  if (!feedback) { toast('Please provide feedback', 'w'); return; }

  const btn = e.target.querySelector('[type=submit]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

  const ok = await _saveGrade(currentGradeItem, { score, letter, feedback });

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Submit Grade'; }

  if (ok) {
    closeM('gradeModal');
    e.target.reset();
    toast('Grade submitted! ✅');
    _removePending(currentGradeItem.id, currentGradeItem.type);
    currentGradeItem = null;
  }
}

// ============================================================
//  6. SAVE GRADE TO SUPABASE
// ============================================================
async function _saveGrade(item, gradeObj) {
  const db = supabaseClient;
  try {
    if (item.type === 'assignment') {
      const { error } = await db
        .from('assignment_submissions')
        .update({
          score:      gradeObj.score,
          grade:      gradeObj.letter,
          feedback:   gradeObj.feedback,
          is_graded:  true,
          graded_at:  new Date().toISOString(),
        })
        .eq('id', item.id);
      if (error) throw error;

    } else if (item.type === 'quiz') {
      const { error } = await db
        .from('quiz_submissions')
        .update({
          score:    gradeObj.score,
          grade:    gradeObj.letter,
          feedback: gradeObj.feedback,
        })
        .eq('id', item.id);
      if (error) throw error;
    }
    return true;
  } catch (err) {
    console.error('_saveGrade:', err.message);
    toast('Failed to save grade: ' + err.message, 'e');
    return false;
  }
}

function _removePending(id, type) {
  pendingGradingCache = pendingGradingCache.filter(
    p => !(String(p.id) === String(id) && p.type === type)
  );
  renderGradeCenter();
  renderOverviewPending();
  updatePendingBadge();
}

// ============================================================
//  7. STUDENT WORK — populate student list
// ============================================================
async function renderSWList() {
  const search = (document.getElementById('swSearch')?.value   || '').toLowerCase();
  // ✅ FIX: read course filter value correctly
  const couId  =  document.getElementById('swCouFilter')?.value || '';
  const el     =  document.getElementById('swStudentList');
  if (!el) return;

  // ✅ FIX: reload students if cache is empty
  if (!teacherState.students.length && typeof loadStudentsFromDB === 'function') {
    await loadStudentsFromDB();
  }

  let list = [...teacherState.students];
  // ✅ FIX: only filter by course if a real course is selected (not "matter" or blank)
  if (couId && couId !== 'matter') {
    list = list.filter(s => String(s.courseId) === String(couId));
  }
  if (search) list = list.filter(s => s.name.toLowerCase().includes(search));

  swStudentsCache = teacherState.students;

  const pc = document.getElementById('swPendCnt');
  const gc = document.getElementById('swGradedCnt');
  const pending = pendingGradingCache.length;
  const graded  = teacherState.students.length - pending;
  if (pc) pc.textContent = `${pending} pending`;
  if (gc) gc.textContent = `${Math.max(0, graded)} graded`;

  if (!list.length) {
    el.innerHTML = `
      <div class="empty" style="padding:20px 0">
        <i class="fas fa-users"></i>
        <p>${teacherState.students.length
          ? 'No students match your filter.'
          : 'No students enrolled yet.'}</p>
      </div>`;
    return;
  }

  el.innerHTML = list.map(s => {
    const c = teacherState.courses.find(x => x.id === s.courseId);
    return `
      <div class="sw-si ${activeStudentId === s.id ? 'active' : ''}"
           onclick="selectStudent('${s.id}')">
        <div class="stu-av"
             style="width:28px;height:28px;font-size:10px;
                    background:${c?.color || '#1a9fd4'}">
          ${_initials(s.name)}
        </div>
        <div style="flex:1;min-width:0">
          <div class="sw-sn">${_esc(s.name)}</div>
          <div class="sw-sc">
            ${_esc((c?.title || '').split(' ').slice(0, 3).join(' '))}
          </div>
        </div>
      </div>`;
  }).join('');
}

// ============================================================
//  8. SELECT STUDENT
// ============================================================
async function selectStudent(studentId) {
  activeStudentId = studentId;
  renderSWList();

  const s    = teacherState.students.find(x => String(x.id) === String(studentId));
  const type = document.getElementById('swTypeFilter')?.value || 'assignments';
  const body = document.getElementById('swDBody');

  if (!s || !body) return;

  const titleEl = document.getElementById('swDTitle');
  const subEl   = document.getElementById('swDSub');
  const badge   = document.getElementById('swDBadges');

  if (titleEl) titleEl.textContent = s.name;
  if (subEl)   subEl.textContent   = `${s.courseTitle || ''} · ${
    type === 'assignments' ? 'Assignment Submissions'
    : type === 'quizzes'  ? 'Quiz Results'
    : 'Course Notes (Read-only)'}`;
  if (badge)   badge.innerHTML = type === 'notes'
    ? `<span class="ro-badge"><i class="fas fa-eye"></i> View Only</span>` : '';

  body.innerHTML = `
    <div class="empty">
      <i class="fas fa-spinner fa-spin"></i><p>Loading…</p>
    </div>`;

  if      (type === 'assignments') await renderStudentAssignments(studentId, body, s);
  else if (type === 'quizzes')     await renderStudentQuizzes(studentId, body, s);
  else                              renderStudentNotesReadOnly(body);
}

// ============================================================
//  9. STUDENT ASSIGNMENT SUBMISSIONS
// ============================================================
async function renderStudentAssignments(studentId, body, student) {
  const db = supabaseClient;
  try {
    // ✅ FIX: query both student_id AND user_id columns
    const { data, error } = await db
      .from('assignment_submissions')
      .select('id, submitted_at, text_response, file_url, score, grade, feedback, assignment_id, student_id, user_id, is_graded')
      .or(`student_id.eq.${studentId},user_id.eq.${studentId}`)
      .order('submitted_at', { ascending: false });

    if (error) throw error;
    if (!data?.length) {
      body.innerHTML = `
        <div class="empty">
          <i class="fas fa-file-alt"></i>
          <p>No assignments submitted yet</p>
        </div>`;
      return;
    }

    let pending = 0, graded = 0;

    body.innerHTML = data.map((sub, idx) => {
      const assign   = teacherState.assignments.find(a => a.id === sub.assignment_id);
      const course   = teacherState.courses.find(c => c.id === assign?.courseId);
      const isGraded = sub.score !== null || sub.is_graded === true;
      const maxPts   = assign?.max_points || 100;
      const pct      = isGraded && sub.score != null ? Math.round((sub.score / maxPts) * 100) : null;
      isGraded ? graded++ : pending++;

      return `
        <div class="sub-c">
          <div class="sub-ch">
            <div>
              <div class="sub-ttl">${_esc(assign?.title || '—')}</div>
              <div class="sub-m">Submitted ${_relTime(sub.submitted_at)}</div>
            </div>
            <span class="chip ${isGraded ? 'cg' : 'ca'}">
              ${isGraded ? 'Graded' : 'Pending Grade'}
            </span>
          </div>
          <div class="sub-mr">
            <div class="sub-mi">
              <span>Course</span>
              <strong>${_esc(course?.title || '—')}</strong>
            </div>
            <div class="sub-mi">
              <span>Max Points</span>
              <strong>${maxPts} pts</strong>
            </div>
          </div>
          ${sub.text_response
            ? `<div class="sub-txt">${_esc(sub.text_response)}</div>` : ''}
     ${sub.file_url
  ? `<div style="margin-bottom:14px">
       <div style="display:flex;gap:8px;margin-bottom:8px">
         <a href="${_esc(sub.file_url)}" target="_blank" rel="noopener noreferrer"
            class="btn bg" style="font-size:11px;padding:6px 12px">
           <i class="fas fa-eye"></i> View File
         </a>
         <a href="${_esc(sub.file_url)}" download rel="noopener noreferrer"
            class="btn bg" style="font-size:11px;padding:6px 12px">
           <i class="fas fa-download"></i> Download
         </a>
       </div>
       <div style="border:1.5px solid var(--bdr);border-radius:8px;overflow:hidden;background:var(--s3)">
         ${(() => {
           const rawUrl = sub.file_url || '';
           const cleanUrl = rawUrl.split('?')[0].toLowerCase();
           if (cleanUrl.match(/\.pdf$/)) {
             return `<iframe src="${_esc(rawUrl)}" width="100%" height="400" style="border:none;display:block"></iframe>`;
           } else if (cleanUrl.match(/\.(png|jpg|jpeg|gif|webp)$/)) {
             return `<img src="${_esc(rawUrl)}" style="width:100%;max-height:320px;object-fit:contain;display:block;padding:8px"/>`;
           } else if (cleanUrl.match(/\.(doc|docx|ppt|pptx|xls|xlsx)$/)) {
             return `<iframe src="https://docs.google.com/gview?url=${encodeURIComponent(rawUrl)}&embedded=true" width="100%" height="400" style="border:none;display:block"></iframe>`;
           } else {
             return `<div style="padding:20px;text-align:center;color:var(--mut)">
               <i class="fas fa-file-alt" style="font-size:32px;display:block;margin-bottom:8px"></i>
               <div style="font-size:12px">Preview not available for this file type</div>
               <a href="${_esc(rawUrl)}" target="_blank" style="font-size:12px;color:var(--acc);margin-top:6px;display:inline-block">Open file in new tab →</a>
             </div>`;
           }
         })()}
       </div>
     </div>` : ''}
          ${isGraded && pct !== null ? `
            <div class="gr-res">
              <div class="gr-top">
                <div class="gr-score" style="color:${_gradeColor(pct)}">
                  ${sub.score}/${maxPts}
                </div>
                <div class="gr-sep"></div>
                <div class="gr-letter">${_esc(sub.grade || '')}</div>
                <div class="gr-sep"></div>
                <div class="gr-det">
                  <div class="gr-det-ttl">Score · ${pct}%</div>
                  <div class="gr-bar">
                    <div class="gr-bf"
                         style="width:${pct}%;background:${_gradeColor(pct)}">
                    </div>
                  </div>
                </div>
                <button class="ed-gr-btn"
                        onclick="toggleInlineEdit('edit_a_${idx}',true)">
                  <i class="fas fa-edit"></i> Edit
                </button>
              </div>
              <div class="gr-fb-lbl">Teacher Feedback</div>
              <div class="gr-fb">${_esc(sub.feedback || '')}</div>
            </div>
            <div id="edit_a_${idx}" style="display:none">
              ${_buildInlineForm('edit_a_'+idx, sub.id, maxPts,
                  sub.score, sub.grade || 'A', sub.feedback || '', 'assignment')}
            </div>
          ` : `
            <div id="new_a_${idx}">
              ${_buildInlineForm('new_a_'+idx, sub.id, maxPts,
             '', '', '', 'assignment')}
            </div>
          `}
        </div>`;
    }).join('');

    const pc = document.getElementById('swPendCnt');
    const gc = document.getElementById('swGradedCnt');
    if (pc) pc.textContent = `${pending} pending`;
    if (gc) gc.textContent = `${graded} graded`;

  } catch (err) {
    console.error('renderStudentAssignments:', err.message);
    body.innerHTML = `
      <div class="empty">
        <i class="fas fa-exclamation-circle"></i>
        <p>Failed to load: ${_esc(err.message)}</p>
      </div>`;
  }
}

// ============================================================
// 10. STUDENT QUIZ RESULTS
// ============================================================
async function renderStudentQuizzes(studentId, body, student) {
  const db = supabaseClient;
  try {
    // ✅ FIX: query both student_id AND user_id
    const { data, error } = await db
      .from('quiz_submissions')
      .select('id, score, submitted_at, correct_answers, total_questions, feedback, grade, quiz_id, student_id, user_id')
      .or(`student_id.eq.${studentId},user_id.eq.${studentId}`)
      .order('submitted_at', { ascending: false });

    if (error) throw error;
    if (!data?.length) {
      body.innerHTML = `
        <div class="empty">
          <i class="fas fa-clipboard-list"></i>
          <p>No quizzes completed yet</p>
        </div>`;
      return;
    }

    body.innerHTML = data.map((sub, idx) => {
      const quiz    = teacherState.quizzes.find(q => q.id === sub.quiz_id);
      const pct     = sub.score || 0;
      const passing = quiz?.passing_score || 60;
      const passed  = pct >= passing;
      const hasGrade = sub.grade !== null && sub.grade !== undefined;
      const correct  = sub.correct_answers || 0;
      const total    = sub.total_questions  || 0;
      const wrong    = total - correct;

      return `
        <div class="sub-c">
          <div class="sub-ch">
            <div>
              <div class="sub-ttl">${_esc(quiz?.title || '—')}</div>
              <div class="sub-m">Completed ${_relTime(sub.submitted_at)}</div>
            </div>
            <span class="chip ${passed ? 'cg' : 'cr'}">
              ${passed ? 'Passed' : 'Failed'}
            </span>
          </div>
          <div class="qsum">
            ${[
              ['Score',   pct + '%', _gradeColor(pct)],
              ['Correct', correct,   'var(--grn)'],
              ['Wrong',   wrong,     'var(--red)'],
              ['Total',   total,     'var(--txt)'],
            ].map(([label, val, col]) => `
              <div class="qsc">
                <div class="qsv" style="color:${col}">${val}</div>
                <div class="qsl">${label}</div>
              </div>`).join('')}
          </div>
           ${hasGrade ? `
            <div class="gr-res">
              <div class="gr-top">
                <div class="gr-score" style="color:${_gradeColor(pct)}">
                  ${pct}/100
                </div>
                <div class="gr-sep"></div>
                <div class="gr-letter">${_esc(sub.grade || '')}</div>
                <div class="gr-sep"></div>
                <div class="gr-det">
                  <div class="gr-det-ttl">Score · ${pct}%</div>
                  <div class="gr-bar">
                    <div class="gr-bf"
                         style="width:${pct}%;background:${_gradeColor(pct)}">
                    </div>
                  </div>
                </div>
                <button class="ed-gr-btn"
                        onclick="toggleInlineEdit('edit_q_${idx}',true)">
                  <i class="fas fa-edit"></i> Edit
                </button>
              </div>
             <div class="gr-fb-lbl">Feedback</div>
              <div class="gr-fb">${_esc(sub.feedback || '')}</div>
            </div>
            <div id="edit_q_${idx}" style="display:none">
              ${_buildInlineForm('edit_q_'+idx, sub.id, 100,
                  pct, sub.grade || 'A', sub.feedback || '', 'quiz')}
            </div>
          ` : `
            <div id="new_q_${idx}">
              ${_buildInlineForm('new_q_'+idx, sub.id, 100,
                  pct, 'A', '', 'quiz')}
            </div>
          `}
        </div>`;
    }).join('');

  } catch (err) {
    console.error('renderStudentQuizzes:', err.message);
    body.innerHTML = `
      <div class="empty">
        <i class="fas fa-exclamation-circle"></i>
        <p>Failed to load: ${_esc(err.message)}</p>
      </div>`;
  }
}

// ============================================================
// 11. READ-ONLY NOTES
// ============================================================
function renderStudentNotesReadOnly(body) {
  if (!body) return;
  body.innerHTML = `
    <div class="nv-notice">
      <i class="fas fa-lock"></i>
      Course notes are created by Admins — read only.
    </div>
    <div class="empty" style="padding:30px 0">
      <i class="fas fa-book-open"></i>
      <p>Select <strong>Assignments</strong> or <strong>Quizzes</strong>
         to grade student work.</p>
    </div>`;
}

// ============================================================
// 12. INLINE GRADE FORM BUILDER
// ============================================================
function _buildInlineForm(panelId, refId, maxPts, score, letter, feedback, type) {
  const safeFeedback = (feedback || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `
    <div class="gp">
      <div class="gp-hd">
        <h4>
          <i class="fas fa-pen"></i>
          ${panelId.startsWith('edit') ? 'Edit Grade' : 'Assign Grade'}
        </h4>
      </div>
      <div class="gi">
        <div>
          <label>Score (out of ${maxPts})</label>
          <input type="number" id="gs_${panelId}"
                 value="${score}" min="0" max="${maxPts}"
                 oninput="calcGrade('${panelId}',${maxPts})"/>
        </div>
        <div>
          <label>Grade Letter</label>
          <select id="gl_${panelId}">
            <option value="">Select…</option>
       ${LETTER_OPTIONS.map(l =>
       `<option ${l === letter ? 'selected' : ''}>${l}</option>`
       ).join('')}
          </select>
        </div>
        <div>
          <label>Score %</label>
          <div id="gpct_${panelId}"
               style="font-family:'Syne',sans-serif;font-size:18px;
                      font-weight:700;padding-top:22px;
                      color:${score
                        ? _gradeColor(Math.round((score/maxPts)*100))
                        : 'var(--mut)'}">
            ${score ? Math.round((score / maxPts) * 100) : '—'}%
          </div>
        </div>
      </div>
      <label class="fb">Feedback *</label>
      <textarea id="gf_${panelId}"
                placeholder="Provide constructive feedback…">${safeFeedback}</textarea>
      <div class="ga">
        ${panelId.startsWith('edit')
          ? `<button class="btn bg"
                     onclick="toggleInlineEdit('${panelId}',false)">
               Cancel
             </button>`
          : ''}
        <button class="bsuccess btn"
                onclick="saveInlineGrade('${panelId}','${refId}',${maxPts},'${type}')">
          <i class="fas fa-check"></i>
          ${panelId.startsWith('edit') ? 'Update Grade' : 'Submit Grade'}
        </button>
      </div>
    </div>`;
}

function calcGrade(panelId, maxPts) {
  const scoreEl = document.getElementById(`gs_${panelId}`);
  const pctEl   = document.getElementById(`gpct_${panelId}`);
  if (!scoreEl || !pctEl) return;
  const pct = Math.round((parseFloat(scoreEl.value) / maxPts) * 100);
  pctEl.textContent = isNaN(pct) ? '—' : pct + '%';
  pctEl.style.color = isNaN(pct) ? 'var(--mut)' : _gradeColor(pct);
}

function toggleInlineEdit(panelId, show) {
  const el = document.getElementById(panelId);
  if (el) el.style.display = show ? 'block' : 'none';
}

// ============================================================
// 13. SAVE INLINE GRADE
// ============================================================
async function saveInlineGrade(panelId, refId, maxPts, type) {
  const score    = parseInt(document.getElementById(`gs_${panelId}`)?.value);
  const letter   = document.getElementById(`gl_${panelId}`)?.value;
  const feedback = document.getElementById(`gf_${panelId}`)?.value?.trim();

  if (isNaN(score) || score < 0 || score > maxPts) {
    toast(`Score must be 0–${maxPts}`, 'w'); return;
  }
  if (!feedback) { toast('Please provide feedback', 'w'); return; }

  const btn = document.querySelector(`#${CSS.escape(panelId)} .bsuccess`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

  const item = {
    id:        refId,
    type,
    studentId: activeStudentId,
    courseId:  teacherState.students.find(s => String(s.id) === String(activeStudentId))?.courseId,
  };

  const ok = await _saveGrade(item, { score, letter, feedback });
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Submit Grade'; }

  if (ok) {
    toast('Grade saved! ✅');
    const body    = document.getElementById('swDBody');
    const student = teacherState.students.find(s => String(s.id) === String(activeStudentId));
    const swType  = document.getElementById('swTypeFilter')?.value;

    if (swType === 'assignments') await renderStudentAssignments(activeStudentId, body, student);
    else                          await renderStudentQuizzes(activeStudentId, body, student);

    _removePending(refId, type);
    renderSWList();
  }
}

function _showGradeError(msg) {
  const g = document.getElementById('gradingGrid');
  if (g) g.innerHTML = `
    <div class="empty" style="grid-column:1/-1">
      <i class="fas fa-exclamation-triangle"></i>
      <p>${_esc(msg)}</p>
    </div>`;
}

function openGradePanel(subId, studentName, assignTitle, maxPts) {
  const fake = {
    id: subId, type: 'assignment',
    title: assignTitle, student: studentName,
    courseTitle: '', courseColor: '#1a9fd4',
    submitted: '—', maxPoints: maxPts,
    textResponse: null, fileUrl: null, autoScore: null,
  };
  pendingGradingCache = pendingGradingCache.filter(p => p.id !== subId);
  pendingGradingCache.unshift(fake);
  openGradeModalById(subId, 'assignment');
}

console.log('✅ teacher-grading.js loaded');