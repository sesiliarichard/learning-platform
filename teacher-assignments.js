// ============================================================
// teacher-assignments.js  — FIXED
// FIX: student name lookup resolves user_id OR student_id
// ============================================================

async function loadAssignmentsFromDB() {
  if (!teacherState.courses.length) return;

  const db        = supabaseClient;
  const courseIds = teacherState.courses.map(c => c.id);

  const { data: assignments, error: aErr } = await db
    .from('assignments')
    .select('id, title, instructions, due_date, max_points, submission_type, course_id')
    .in('course_id', courseIds)
    .order('due_date', { ascending: true });

  if (aErr) {
    console.error('loadAssignmentsFromDB: assignments error', aErr.message);
    return;
  }
  if (!assignments?.length) {
    teacherState.assignments    = [];
    teacherState.pendingGrading = [];
    renderAssignmentList();
    return;
  }

  const assignIds = assignments.map(a => a.id);

  const { data: allSubs, error: sErr } = await db
    .from('assignment_submissions')
    .select('assignment_id, score, grade')
    .in('assignment_id', assignIds);

  if (sErr) console.error('loadAssignmentsFromDB: submissions error', sErr.message);

  const subMap = {};
  (allSubs || []).forEach(s => {
    if (!subMap[s.assignment_id]) subMap[s.assignment_id] = { total: 0, pending: 0 };
    subMap[s.assignment_id].total++;
    if (s.score === null && !s.grade) subMap[s.assignment_id].pending++;
  });

  teacherState.assignments = assignments.map(a => ({
    ...a,
    courseId:          a.course_id,
    submissions_count: subMap[a.id]?.total   || 0,
    pending_count:     subMap[a.id]?.pending || 0,
  }));

  teacherState.pendingGrading = teacherState.assignments
    .filter(a => a.pending_count > 0)
    .map(a => ({
      id:        a.id,
      type:      'assignment',
      title:     a.title,
      courseId:  a.courseId,
      pending:   a.pending_count,
      submitted: 'Pending review',
    }));

  renderAssignmentList();
}

function renderAssignmentList() {
  const g = document.getElementById('assignGrid');
  if (!g) return;

  if (!teacherState.assignments.length) {
g.innerHTML = `
      <div class="empty">
        <i class="fas fa-file-alt"></i>
        <p>No assignments found for your courses.</p>
      </div>`;
      }

  g.innerHTML = '';
  teacherState.assignments.forEach(a => {
    const c        = teacherState.courses.find(x => x.id === a.courseId);
    const color    = c?.color || '#1a9fd4';
    const isPast   = a.due_date && new Date(a.due_date) < new Date();
    const subCount = a.submissions_count || 0;
    const pending  = a.pending_count     || 0;

    g.innerHTML += `
      <div class="ic">
        <div class="ic-hd" style="--ic:${color}">
          <i class="fas fa-file-alt"></i>
          <span class="ic-bdg ${isPast ? 'cr' : ''}">
            ${isPast ? 'Closed' : 'Open'}
          </span>
        </div>
        <div class="ic-body">
          <h4>${_esc(a.title)}</h4>
          <p>${_esc(c?.title || 'Unknown Course')}</p>
          <div class="ic-meta">
            <span>
              <i class="fas fa-calendar"></i>
              Due ${a.due_date ? new Date(a.due_date).toLocaleDateString() : '—'}
            </span>
            <span><i class="fas fa-star"></i> ${a.max_points || 100} pts</span>
          </div>
          <div class="ic-meta" style="margin-top:5px">
            <span><i class="fas fa-users"></i> ${subCount} submitted</span>
            ${pending > 0
              ? `<span class="chip ca">${pending} pending</span>`
              : '<span class="chip cg">All graded</span>'}
          </div>
        </div>
<div class="ic-act">
          <button class="btn bg"
                  onclick="viewAssignmentDetails('${a.id}','${_esc(a.title)}')">
            <i class="fas fa-eye"></i> View
          </button>
          <button class="btn bg"
                  onclick="viewAssignmentSubmissions('${a.id}')"
                  title="View submissions">
            <i class="fas fa-users"></i> Submissions
          </button>
          <button class="btn bg d"
                  onclick="deleteAssignmentFromDB('${a.id}')"
                  title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>`;
  });
}

// ─────────────────────────────────────────────────────────────
// FETCH ASSIGNMENT SUBMISSIONS — FIXED student name resolution
// ─────────────────────────────────────────────────────────────
async function fetchAssignmentSubmissions(filterAssignmentId = null) {
  const db        = supabaseClient;
  const assignIds = filterAssignmentId
    ? [filterAssignmentId]
    : teacherState.assignments.map(a => a.id);

  if (!assignIds.length) return [];

  const { data: subs, error } = await db
    .from('assignment_submissions')
    .select('id, assignment_id, student_id, user_id, score, grade, feedback, submitted_at, file_url, text_response, max_score')
    .in('assignment_id', assignIds)
    .order('submitted_at', { ascending: false });

  if (error) {
    console.error('fetchAssignmentSubmissions error:', error.message);
    return [];
  }
  if (!subs?.length) return [];

  // ✅ FIX: resolve ID using user_id first, then student_id
  const studentIds = [...new Set(
    subs.map(s => s.user_id || s.student_id).filter(Boolean)
  )];

  console.log('fetchAssignmentSubmissions: resolved studentIds', studentIds);

  const { data: profiles } = await db
    .from('profiles')
    .select('id, first_name, last_name, full_name, email')
    .in('id', studentIds);

  console.log('fetchAssignmentSubmissions: profiles found', profiles?.length, JSON.stringify(profiles));

  const profileMap = {};
  const emailMap   = {};
  (profiles || []).forEach(p => {
    profileMap[p.id] =
      [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
      || p.full_name
      || p.email
      || 'Unknown';
    emailMap[p.id] = p.email || '';
  });

  // ✅ FIX: use resolved ID for lookup
  return subs.map(s => {
    const resolvedId = s.user_id || s.student_id;
    const assign     = teacherState.assignments.find(a => a.id === s.assignment_id);
    return {
      ...s,
      student_name:     profileMap[resolvedId] || 'Student',
      student_email:    emailMap[resolvedId]   || '',
      assignment_title: assign?.title          || 'Assignment',
      max_points:       assign?.max_points     || s.max_score || 100,
      course_id:        assign?.courseId,
      is_graded:        s.score !== null       || !!s.grade,
    };
  });
}

async function renderAssignmentSubmissions(filterAssignmentId = null) {
  const sg = document.getElementById('assignSubGrid');
  if (!sg) return;

  sg.innerHTML = `
    <div class="empty">
      <i class="fas fa-spinner fa-spin"></i>
      <p>Loading submissions…</p>
    </div>`;

  const submissions = await fetchAssignmentSubmissions(filterAssignmentId);

  if (!submissions.length) {
    sg.innerHTML = `
      <div class="empty">
        <i class="fas fa-file-upload"></i>
        <p>No submissions yet.</p>
      </div>`;
    return;
  }

  const pending = submissions.filter(s => !s.is_graded);
  const graded  = submissions.filter(s =>  s.is_graded);

  sg.innerHTML = '';

  sg.innerHTML += `
    <div style="display:grid;
                grid-template-columns:2fr 1.5fr 1fr 1fr 1fr 1fr;
                gap:10px;padding:8px 14px;
                background:var(--s2);border-radius:8px;
                margin-bottom:6px;font-size:10px;font-weight:700;
                color:var(--mut);text-transform:uppercase;letter-spacing:.5px">
      <span>Student</span>
      <span>Assignment</span>
      <span style="text-align:center">Submitted</span>
      <span style="text-align:center">Score</span>
      <span style="text-align:center">Status</span>
      <span style="text-align:center">Actions</span>
    </div>`;

  [...pending, ...graded].forEach(s => {
    sg.innerHTML += buildSubmissionRow(s, s.is_graded);
  });
}

function buildSubmissionRow(s, isGraded) {
  const c          = teacherState.courses.find(x => x.id === s.course_id);
  const color      = c?.color || '#1a9fd4';
  const maxPts     = s.max_points || s.max_score || 100;
  const pct        = isGraded && maxPts && s.score != null
    ? Math.round((s.score / maxPts) * 100)
    : null;
  const scoreColor = pct != null
    ? (pct >= 80 ? 'var(--grn)' : pct >= 60 ? 'var(--amb)' : 'var(--red)')
    : 'var(--mut)';
  const date = s.submitted_at
    ? new Date(s.submitted_at).toLocaleDateString('en-US',
        { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  const safeName  = (s.student_name     || '').replace(/'/g, "\\'");
  const safeTitle = (s.assignment_title || '').replace(/'/g, "\\'");

  return `
    <div style="display:grid;
                grid-template-columns:2fr 1.5fr 1fr 1fr 1fr 1fr;
                gap:10px;align-items:center;
                padding:10px 14px;
                border-bottom:1px solid var(--bdr);
                transition:background .15s"
         onmouseenter="this.style.background='var(--s2)'"
         onmouseleave="this.style.background=''">
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--txt)">
          ${_esc(s.student_name)}
        </div>
        <div style="font-size:10px;color:var(--mut)">
          ${_esc(s.student_email || '')}
        </div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--txt)">
          ${_esc(s.assignment_title)}
        </div>
        <div style="font-size:10px;color:var(--mut)">
          ${_esc(c?.title || '')}
        </div>
        ${s.file_url ? `
  <a href="${_esc(s.file_url)}" target="_blank" rel="noopener noreferrer"
     onclick="event.stopPropagation()"
     style="font-size:10px;color:var(--acc);cursor:pointer">
    <i class="fas fa-paperclip"></i> View File
  </a>` : ''}
      </div>
      <div style="text-align:center">
        <div style="font-size:11px;color:var(--mut)">${date}</div>
      </div>
      <div style="text-align:center">
        ${isGraded && s.score != null ? `
          <div style="font-size:15px;font-weight:800;color:${scoreColor}">
            ${s.score}<span style="font-size:10px;color:var(--mut)">/${maxPts}</span>
          </div>
          <div style="font-size:10px;color:${scoreColor}">${pct}%</div>
        ` : `<div style="font-size:11px;color:var(--mut)">—</div>`}
      </div>
      <div style="text-align:center">
        <span class="chip ${isGraded ? 'cg' : 'ca'}" style="font-size:9px">
          ${isGraded ? (s.grade || 'Graded') : 'Pending'}
        </span>
      </div>
      <div style="text-align:center;display:flex;gap:6px;justify-content:center">
        <button class="bxs"
        onclick="openGradePanel('${s.id}','${safeName}','${safeTitle}',${maxPts})">
  <i class="fas fa-${isGraded ? 'edit' : 'pen'}"></i>
  ${isGraded ? 'Edit' : 'Grade'}
</button>
${s.file_url ? `
  <a href="${_esc(s.file_url)}" target="_blank" rel="noopener noreferrer"
     class="btn bg" title="View File" style="padding:5px 9px;font-size:11px">
    <i class="fas fa-eye"></i>
  </a>
  <a href="${_esc(s.file_url)}" download class="btn bg" title="Download"
     style="padding:5px 9px;font-size:11px">
    <i class="fas fa-download"></i>
  </a>` : ''}
      </div>
    </div>`;
}

function viewAssignmentSubmissions(assignmentId) {
  const tab = document.querySelector('[data-tab="assSubs"]');
  if (tab) tab.click();
  renderAssignmentSubmissions(assignmentId);
}

function openGradePanel(submissionId, studentName, assignmentTitle, maxPoints) {
  const gmInfo = document.getElementById('gmInfo');
  if (gmInfo) {
    gmInfo.innerHTML = `
      <div class="gi-box">
        <strong>${_esc(assignmentTitle)}</strong>
        <div style="color:var(--mut);font-size:11px;margin-top:3px">
          Student: ${_esc(studentName)}
        </div>
      </div>`;
  }
  const gmMax = document.getElementById('gmMax');
  if (gmMax) gmMax.textContent = maxPoints;

  // ✅ Clear all fields so professor grades manually — no AI pre-fill
  const gmScore = document.getElementById('gmScore');
  if (gmScore) { gmScore.value = ''; }
  const gmGrade = document.getElementById('gmGrade');
  if (gmGrade) { gmGrade.selectedIndex = 0; }
  const gradeFeedback = document.getElementById('gradeFeedback');
  if (gradeFeedback) { gradeFeedback.value = ''; }

  const gradeForm = document.getElementById('gradeForm');
  if (gradeForm) gradeForm.dataset.submissionId = submissionId;
  openM('gradeModal');
}

async function submitGradeFromModal(e) {
  e.preventDefault();
  const fd           = new FormData(e.target);
  const submissionId = e.target.dataset.submissionId;

  if (!submissionId) { toast('No submission selected', 'w'); return; }

  const score    = parseInt(fd.get('score'));
  const grade    = fd.get('grade');
  const feedback = fd.get('feedback')?.trim();

  if (!feedback)             { toast('Please provide feedback', 'w'); return; }
  if (isNaN(score) || score < 0) { toast('Enter a valid score', 'w'); return; }

  try {
    const { error } = await supabaseClient
      .from('assignment_submissions')
      .update({ score, grade, feedback, graded_at: new Date().toISOString() })
      .eq('id', submissionId);

    if (error) throw error;

    toast('Grade submitted! ✅');
    closeM('gradeModal');
    e.target.reset();
    await loadAssignmentsFromDB();
    renderAssignmentSubmissions();
    if (typeof renderOverview === 'function') renderOverview();

  } catch (err) {
    console.error('submitGradeFromModal error:', err);
    toast('Failed to save grade: ' + err.message, 'w');
  }
}

async function handleCreateAssignment(e) {
  e.preventDefault();
  const fd = new FormData(e.target);

  const courseId     = fd.get('courseId');
  const title        = fd.get('title')?.trim();
  const dueDate      = fd.get('dueDate');
  const maxPoints    = parseInt(fd.get('maxPoints') || '100');
  const instructions = fd.get('instructions')?.trim();
  const subType      = fd.get('subType') || 'file';

  if (!courseId || !title || !dueDate || !instructions) {
    toast('Please fill in all required fields', 'w');
    return;
  }

  try {
    const { error } = await supabaseClient
      .from('assignments')
      .insert({ title, course_id: courseId, instructions, due_date: dueDate,
                max_points: maxPoints, submission_type: subType });

    if (error) throw error;
    toast('Assignment created! ✅');
    closeM('assignModal');
    e.target.reset();
    await loadAssignmentsFromDB();

  } catch (err) {
    console.error('handleCreateAssignment error:', err);
    toast('Failed to create assignment: ' + err.message, 'w');
  }
}

async function deleteAssignmentFromDB(assignmentId) {
  if (!confirm('Delete this assignment? This cannot be undone.')) return;
  try {
    const { error } = await supabaseClient
      .from('assignments').delete().eq('id', assignmentId);
    if (error) throw error;
    toast('Assignment deleted');
    await loadAssignmentsFromDB();
  } catch (err) {
    console.error('deleteAssignmentFromDB error:', err);
    toast('Failed to delete: ' + err.message, 'w');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const subsTab = document.querySelector('[data-tab="assSubs"]');
  if (subsTab) {
    subsTab.addEventListener('click', () => {
      if (teacherState.assignments.length) renderAssignmentSubmissions();
    });
  }
  const gradeForm = document.getElementById('gradeForm');
  if (gradeForm) {
    gradeForm.onsubmit = null;
    gradeForm.addEventListener('submit', submitGradeFromModal);
  }
});

function viewAssignmentDetails(assignmentId, assignmentTitle) {
  const a = teacherState.assignments.find(x => x.id === assignmentId);
  if (!a) return;

  const c       = teacherState.courses.find(x => x.id === a.courseId);
  const isPast  = a.due_date && new Date(a.due_date) < new Date();
  const dueDate = a.due_date
    ? new Date(a.due_date).toLocaleDateString('en-US',
        { weekday:'long', year:'numeric', month:'long', day:'numeric' })
    : 'No due date';

  const existing = document.getElementById('assignViewModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'assignViewModal';
  modal.className = 'modal open';
  modal.innerHTML = `
    <div class="mb mbw">
      <div class="mh">
        <h3><i class="fas fa-file-alt" style="color:var(--acc);margin-right:7px"></i>${_esc(a.title)}</h3>
        <button onclick="document.getElementById('assignViewModal').remove()" title="Close">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;
                  gap:10px;margin-bottom:16px">
        <div style="background:var(--s3);border:1.5px solid var(--bdr);
                    border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:10px;color:var(--mut);margin-bottom:4px;
                      text-transform:uppercase;letter-spacing:.5px">Course</div>
          <div style="font-size:12px;font-weight:700;color:var(--txt)">
            ${_esc(c?.title || 'Unknown')}
          </div>
        </div>
        <div style="background:var(--s3);border:1.5px solid var(--bdr);
                    border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:10px;color:var(--mut);margin-bottom:4px;
                      text-transform:uppercase;letter-spacing:.5px">Max Points</div>
          <div style="font-size:18px;font-weight:800;color:var(--acc)">
            ${a.max_points || 100}
          </div>
        </div>
        <div style="background:${isPast ? '#fee2e2' : '#d1fae5'};
                    border:1.5px solid ${isPast ? '#fca5a5' : '#6ee7b7'};
                    border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:10px;color:${isPast ? '#991b1b' : '#065f46'};
                      margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">
            Status
          </div>
          <div style="font-size:12px;font-weight:700;
                      color:${isPast ? '#dc2626' : 'var(--grn)'}">
            ${isPast ? 'Closed' : 'Open'}
          </div>
        </div>
      </div>

      <div style="margin-bottom:14px">
        <div style="font-size:10px;font-weight:700;color:var(--mut);
                    text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">
          <i class="fas fa-calendar" style="color:var(--acc)"></i> Due Date
        </div>
        <div style="font-size:13px;color:var(--txt);font-weight:500">
          ${dueDate}
        </div>
      </div>

      <div style="margin-bottom:14px">
        <div style="font-size:10px;font-weight:700;color:var(--mut);
                    text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">
          <i class="fas fa-file-alt" style="color:var(--acc)"></i> Instructions
        </div>
        <div style="background:var(--s3);border:1.5px solid var(--bdr);
                    border-radius:10px;padding:16px;font-size:13px;
                    color:var(--txt2);line-height:1.75">
          ${_esc(a.instructions || 'No instructions provided.')}
        </div>
      </div>

      <div style="margin-bottom:18px">
        <div style="font-size:10px;font-weight:700;color:var(--mut);
                    text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">
          <i class="fas fa-upload" style="color:var(--acc)"></i> Submission Type
        </div>
        <span class="chip cb" style="font-size:11px">
          ${a.submission_type || 'file'}
        </span>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn bg"
                onclick="document.getElementById('assignViewModal').remove()">
          Close
        </button>
        <button class="btn bp"
                onclick="document.getElementById('assignViewModal').remove();
                         viewAssignmentSubmissions('${a.id}')">
          <i class="fas fa-users"></i> View Submissions
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);
}

console.log('✅ teacher-assignments.js loaded');