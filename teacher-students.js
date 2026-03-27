// ============================================================
// teacher-students.js  — FIXED
// FIX: uses user_id OR student_id from enrollments
//      fetches profiles by both possible ID columns
// ============================================================

async function loadStudentsFromDB() {
  if (!teacherState.courses.length) return;

  const db        = supabaseClient;
  const courseIds = teacherState.courses.map(c => c.id);

  const { data: enrollments, error: enrErr } = await db
    .from('enrollments')
    .select('student_id, user_id, course_id, progress')
    .in('course_id', courseIds);

  if (enrErr) {
    console.error('loadStudentsFromDB: enrollments error', enrErr.message);
    return;
  }

  if (!enrollments?.length) {
    teacherState.students = [];
    renderStudentsTable();
    return;
  }

  // ✅ FIX: use user_id if available, fall back to student_id
  const studentIds = [...new Set(
    enrollments.map(e => e.user_id || e.student_id).filter(Boolean)
  )];

  console.log('loadStudentsFromDB: studentIds', studentIds);

  const { data: profiles, error: profErr } = await db
    .from('profiles')
    .select('id, first_name, last_name, full_name, email')
    .in('id', studentIds);

  if (profErr) console.error('loadStudentsFromDB: profiles error', profErr.message);

  console.log('loadStudentsFromDB: profiles found', profiles?.length, JSON.stringify(profiles));

  const { data: quizScores } = await db
    .from('quiz_submissions')
    .select('student_id, score')
    .in('student_id', studentIds);

  const scoreMap = {};
  (quizScores || []).forEach(q => {
    if (!scoreMap[q.student_id]) scoreMap[q.student_id] = [];
    scoreMap[q.student_id].push(q.score || 0);
  });
  Object.keys(scoreMap).forEach(id => {
    const arr = scoreMap[id];
    scoreMap[id] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  });

  const profileMap = {};
  (profiles || []).forEach(p => { profileMap[p.id] = p; });

  const seen = new Map();
  enrollments.forEach(e => {
    // ✅ FIX: resolve the actual ID used
    const resolvedId = e.user_id || e.student_id;
    if (!resolvedId || seen.has(resolvedId)) return;

    const p = profileMap[resolvedId] || {};

    const name =
      [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
      || p.full_name
      || p.email
      || 'Unknown Student';

    seen.set(resolvedId, {
      id:          resolvedId,
      name,
      email:       p.email      || '—',
     avatar_url:  null,
      courseId:    e.course_id,
      progress:    e.progress   || 0,
      avg_score:   scoreMap[resolvedId] ?? null,
      last_active: 'Recently',
    });
  });

  teacherState.students = [...seen.values()];
  console.log('loadStudentsFromDB: built students', teacherState.students.length, JSON.stringify(teacherState.students));
  renderStudentsTable();
}

function renderStudentsTable(filter = '', couId = '') {
  const tb = document.getElementById('stuTBody');
  if (!tb) return;

  let list = teacherState.students;
  if (couId)  list = list.filter(s => String(s.courseId) === String(couId));
  if (filter) list = list.filter(s =>
    s.name.toLowerCase().includes(filter.toLowerCase())
  );

  if (!list.length) {
    tb.innerHTML = `
      <tr>
        <td colspan="6"
            style="text-align:center;color:var(--mut);padding:40px">
          <i class="fas fa-users"
             style="font-size:24px;margin-bottom:10px;display:block"></i>
          ${teacherState.students.length
            ? 'No students match your filter.'
            : 'No students enrolled in your courses yet.'}
        </td>
      </tr>`;
    return;
  }

  tb.innerHTML = '';
  list.forEach(s => {
    const c          = teacherState.courses.find(x => x.id === s.courseId);
    const color      = c?.color || '#1a9fd4';
    const initials   = s.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const score      = s.avg_score ?? 0;
    const hasScore   = s.avg_score != null;
    const scoreColor = score >= 80 ? '#00c9a7' : score >= 60 ? 'var(--amb)' : 'var(--red)';

    tb.innerHTML += `
      <tr>
        <td>
          <div class="stu-c">
            ${s.avatar_url
              ? `<img src="${_esc(s.avatar_url)}"
                     style="width:32px;height:32px;border-radius:50%;
                            object-fit:cover;flex-shrink:0"
                     alt="${_esc(s.name)}"/>`
              : `<div class="stu-av" style="background:${color}">${initials}</div>`
            }
            <div>
              <div class="stu-name">${_esc(s.name)}</div>
              <div class="stu-email">${_esc(s.email)}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="chip cv"
                style="background:${color}22;color:${color}">
            ${_esc(c?.title?.split(' ').slice(0, 2).join(' ') || 'N/A')}
          </span>
        </td>
        <td>
          <div class="prog-mn">
            <div class="prog-mf"
                 style="width:${s.progress}%;background:${color}">
            </div>
          </div>
          <span style="font-size:10px">${s.progress}%</span>
        </td>
        <td style="color:var(--mut);font-size:11px">${_esc(s.last_active)}</td>
        <td>
          ${hasScore
            ? `<span style="font-weight:700;color:${scoreColor}">${score}%</span>`
            : `<span style="color:var(--mut);font-size:11px">No quizzes</span>`
          }
        </td>
        <td>
          <div style="display:flex;gap:5px">
            <button class="btn bg"
                    onclick="viewStudent('${s.id}')"
                    title="View Profile">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn bg"
                    onclick="viewStudentWork('${s.id}')"
                    title="View Work">
              <i class="fas fa-file-alt"></i> Work
            </button>
          </div>
        </td>
      </tr>`;
  });
}

function filterStudents() {
  const search = document.getElementById('stuSearch')?.value   || '';
  const couId  = document.getElementById('stuCouFilter')?.value || '';
  renderStudentsTable(search, couId);
}

async function viewStudent(studentId) {
  const s = teacherState.students.find(x => x.id === studentId);
  if (!s) return;

  const c        = teacherState.courses.find(x => x.id === s.courseId);
  const color    = c?.color || '#1a9fd4';
  const initials = s.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  document.getElementById('stuModalContent').innerHTML = `
    <div style="text-align:center;padding:24px">
      <i class="fas fa-spinner fa-spin"
         style="font-size:24px;color:var(--acc)"></i>
      <p style="font-size:12px;color:var(--mut);margin-top:8px">Loading profile…</p>
    </div>`;
  openM('stuModal');

  const db = supabaseClient;

  const [
    { count: enrolledCount },
    { data: qScores },
    { data: aScores },
  ] = await Promise.all([
    db.from('enrollments')
      .select('*', { count: 'exact', head: true })
      .or(`student_id.eq.${studentId},user_id.eq.${studentId}`),
    db.from('quiz_submissions')
      .select('score')
      .eq('student_id', studentId),
    db.from('assignment_submissions')
      .select('score')
      .or(`student_id.eq.${studentId},user_id.eq.${studentId}`)
      .not('score', 'is', null),
  ]);

  const allScores = [
    ...(qScores  || []).map(x => x.score || 0),
    ...(aScores  || []).map(x => x.score || 0),
  ];
  const avgScore = allScores.length
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : (s.avg_score ?? 0);

  const enrolled   = enrolledCount || 1;
  const progress   = s.progress    || 0;
  const lastSeen   = s.last_active || 'Recently';
  const scoreColor = avgScore >= 80 ? '#00c9a7' : avgScore >= 60 ? 'var(--amb)' : 'var(--red)';

  document.getElementById('stuModalContent').innerHTML = `
    <div style="text-align:center">
      ${s.avatar_url
        ? `<img src="${_esc(s.avatar_url)}"
               style="width:64px;height:64px;border-radius:50%;
                      object-fit:cover;margin:0 auto 12px;display:block"
               alt="${_esc(s.name)}"/>`
        : `<div class="stu-av"
               style="width:64px;height:64px;font-size:22px;
                      background:${color};margin:0 auto 12px">
             ${initials}
           </div>`
      }
      <h3 style="font-family:'Syne',sans-serif;margin-bottom:4px">
        ${_esc(s.name)}
      </h3>
      <p style="color:var(--mut);font-size:12px;margin-bottom:6px">
        ${_esc(s.email)}
      </p>
      <span class="chip cv"
            style="background:${color}22;color:${color};
                   display:inline-block;margin-bottom:16px">
        ${_esc(c?.title || 'Enrolled')}
      </span>
      <div style="display:flex;gap:12px;justify-content:center;
                  flex-wrap:wrap;margin:14px 0;padding:14px;
                  background:var(--s3);border-radius:10px">
        ${[
          ['Progress',  progress + '%', 'var(--acc)'],
          ['Avg Score', avgScore + '%', scoreColor],
          ['Courses',   enrolled,       'var(--blu)'],
          ['Quizzes',   (qScores||[]).length, 'var(--grn)'],
          ['Submitted', (aScores||[]).length, 'var(--amb)'],
        ].map(([label, val, col]) => `
          <div style="text-align:center;min-width:56px">
            <div style="font-family:'Syne',sans-serif;font-size:18px;
                        font-weight:700;color:${col}">${val}</div>
            <div style="font-size:10px;color:var(--mut)">${label}</div>
          </div>`).join('')}
      </div>
      <div style="font-size:11px;color:var(--mut);margin-bottom:16px">
        <i class="fas fa-clock"></i> Last active: ${_esc(lastSeen)}
      </div>
      <div style="display:flex;gap:8px;justify-content:center">
        <button class="btn bp"
                onclick="closeM('stuModal');viewStudentWork('${studentId}')">
          <i class="fas fa-file-alt"></i> View Work
        </button>
      </div>
    </div>`;
}

function viewStudentWork(studentId) {
  const swType = document.getElementById('swTypeFilter');
  if (swType) swType.value = 'assignments';
  showSec('studentWork');
  setTimeout(() => {
    if (typeof renderSWList  === 'function') renderSWList();
    if (typeof selectStudent === 'function') selectStudent(studentId);
  }, 150);
}

console.log('✅ teacher-students.js loaded');