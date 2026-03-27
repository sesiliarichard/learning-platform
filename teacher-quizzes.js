// ============================================================
// teacher-quizzes.js  — FIXED
// FIX: student name lookup now resolves user_id OR student_id
// ============================================================
console.log('QUIZZES FILE VERSION 3 - FIXED');

async function loadQuizzesFromDB() {
  if (!teacherState.courses.length) return;

  const db        = supabaseClient;
  const courseIds = teacherState.courses.map(c => c.id);

  const { data: quizzes, error: qErr } = await db
    .from('quizzes')
    .select('id, title, time_limit, passing_score, created_at, course_id')
    .in('course_id', courseIds)
    .order('created_at', { ascending: false });

  if (qErr) {
    console.error('loadQuizzesFromDB: quizzes error', qErr.message);
    return;
  }
  if (!quizzes?.length) {
    teacherState.quizzes = [];
    renderQuizList();
    return;
  }

  const quizIds = quizzes.map(q => q.id);

  const { data: questions } = await db
    .from('quiz_questions')
    .select('quiz_id')
    .in('quiz_id', quizIds);

  const { data: submissions } = await db
    .from('quiz_submissions')
    .select('quiz_id, score')
    .in('quiz_id', quizIds);

  const qCountMap = {};
  const subMap    = {};

  (questions || []).forEach(q => {
    qCountMap[q.quiz_id] = (qCountMap[q.quiz_id] || 0) + 1;
  });

  (submissions || []).forEach(s => {
    if (!subMap[s.quiz_id]) subMap[s.quiz_id] = [];
    subMap[s.quiz_id].push(s.score || 0);
  });

  teacherState.quizzes = quizzes.map(q => {
    const scores   = subMap[q.id] || [];
    const avgScore = scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;
    return {
      ...q,
      courseId:          q.course_id,
      questions_count:   qCountMap[q.id]  || 0,
      submissions_count: scores.length,
      avg_score:         avgScore,
    };
  });

  renderQuizList();
}

function renderQuizList() {
  const g = document.getElementById('quizzesGrid');
  if (!g) return;

  if (!teacherState.quizzes.length) {
    g.innerHTML = `
      <div class="empty">
        <i class="fas fa-clipboard-list"></i>
        <p>No quizzes found for your courses.</p>
      </div>`;
    return;
  }

  g.innerHTML = '';
  teacherState.quizzes.forEach(q => {
    const c        = teacherState.courses.find(x => x.id === q.courseId);
    const color    = c?.color || '#1a9fd4';
    const subCount = q.submissions_count || 0;
    const avgScore = q.avg_score         || 0;
    const qCount   = q.questions_count   || 0;
    const avgColor = avgScore >= 80 ? 'var(--grn)' : avgScore >= 60 ? 'var(--amb)' : 'var(--red)';

    g.innerHTML += `
      <div class="ic">
        <div class="ic-hd" style="--ic:${color}">
          <i class="fas fa-clipboard-list"></i>
          <span class="ic-bdg">${qCount} Q${qCount !== 1 ? 's' : ''}</span>
        </div>
        <div class="ic-body">
          <h4>${_esc(q.title)}</h4>
          <p>${_esc(c?.title || 'Unknown Course')}</p>
          <div class="ic-meta">
            <span><i class="fas fa-clock"></i> ${q.time_limit || '—'} min</span>
            <span><i class="fas fa-users"></i> ${subCount} submission${subCount !== 1 ? 's' : ''}</span>
          </div>
          ${subCount > 0 ? `
            <div style="margin-top:8px">
              <div style="display:flex;justify-content:space-between;
                          font-size:10px;color:var(--mut);margin-bottom:3px">
                <span>Class average</span>
                <span style="font-weight:700;color:${avgColor}">${avgScore}%</span>
              </div>
              <div style="height:4px;background:var(--s2);
                          border-radius:3px;overflow:hidden">
                <div style="height:100%;width:${avgScore}%;
                            background:${color};border-radius:3px"></div>
              </div>
            </div>` : ''}
        </div>
<div class="ic-act">
          <button class="btn bg" onclick="viewQuizQuestions('${q.id}','${_esc(q.title)}')">
            <i class="fas fa-eye"></i> Questions
          </button>
          <button class="btn bg" onclick="viewQuizResults('${q.id}')">
            <i class="fas fa-chart-bar"></i> Results
          </button>
          <button class="btn bg"
                  onclick="exportQuizResults('${q.id}')"
                  title="Export CSV">
            <i class="fas fa-download"></i>
          </button>
        </div>
      </div>`;
  });
}

function viewQuizResults(quizId) {
  const tab = document.querySelector('[data-tab="qzResults"]');
  if (tab) tab.click();
  renderQuizResultsTab(quizId);
}

// ─────────────────────────────────────────────────────────────
// FETCH QUIZ SUBMISSIONS — FIXED student name resolution
// ─────────────────────────────────────────────────────────────
async function fetchQuizSubmissions() {
  const db      = supabaseClient;
  const quizIds = teacherState.quizzes.map(q => q.id);
  if (!quizIds.length) return [];

  const { data: subs, error } = await db
    .from('quiz_submissions')
    .select('id, quiz_id, student_id, user_id, score, correct_answers, total_questions, submitted_at, time_spent')
    .in('quiz_id', quizIds)
    .order('submitted_at', { ascending: false });

  if (error) {
    console.error('fetchQuizSubmissions error:', error.message);
    return [];
  }
  if (!subs?.length) return [];

  // ✅ FIX: resolve ID using user_id first, then student_id
  const studentIds = [...new Set(
    subs.map(s => s.user_id || s.student_id).filter(Boolean)
  )];

  console.log('fetchQuizSubmissions: resolved studentIds', studentIds);

  if (!studentIds.length) {
    return subs.map(s => ({
      ...s,
      student_name:  'Unknown',
      student_email: '',
      quiz_title:    teacherState.quizzes.find(q => q.id === s.quiz_id)?.title || 'Quiz',
      course_id:     teacherState.quizzes.find(q => q.id === s.quiz_id)?.courseId,
      passing_score: 60,
    }));
  }

  const { data: profiles } = await db
    .from('profiles')
    .select('id, first_name, last_name, full_name, email')
    .in('id', studentIds);

  console.log('fetchQuizSubmissions: profiles found', profiles?.length, JSON.stringify(profiles));

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
    const quiz = teacherState.quizzes.find(q => q.id === s.quiz_id);
    return {
      ...s,
      student_name:  profileMap[resolvedId] || 'Student',
      student_email: emailMap[resolvedId]   || '',
      quiz_title:    quiz?.title            || 'Quiz',
      course_id:     quiz?.courseId,
      passing_score: quiz?.passing_score    || 60,
    };
  });
}

async function renderQuizResultsTab(highlightQuizId = null) {
  const rg = document.getElementById('quizResGrid');
  if (!rg) return;

  rg.innerHTML = `
    <div class="empty">
      <i class="fas fa-spinner fa-spin"></i>
      <p>Loading results…</p>
    </div>`;

  const submissions = await fetchQuizSubmissions();

  if (!submissions.length) {
    rg.innerHTML = `
      <div class="empty">
        <i class="fas fa-chart-bar"></i>
        <p>No quiz submissions yet.</p>
      </div>`;
    return;
  }

  rg.innerHTML = `
    <div style="background:var(--bg,#fff);border:1px solid var(--bdr,#e5e7eb);
                border-radius:12px;overflow:hidden;width:100%">
      <div style="display:grid;
                  grid-template-columns:180px 1fr 1fr 90px 130px 100px 70px;
                  gap:0;padding:10px 16px;
                  background:var(--s2,#f8fafc);
                  border-bottom:2px solid var(--bdr,#e5e7eb);
                  font-size:10px;font-weight:700;
                  color:var(--mut,#6b7280);
                  text-transform:uppercase;letter-spacing:.6px">
        <span>Student</span>
        <span>Quiz</span>
        <span>Course</span>
        <span style="text-align:center">Score</span>
        <span style="text-align:center">Submitted</span>
        <span style="text-align:center">Time Spent</span>
        <span style="text-align:center">Action</span>
      </div>
      <div id="qzTableBody"></div>
      <div style="padding:10px 16px;font-size:11px;
                  color:var(--mut,#6b7280);
                  border-top:1px solid var(--bdr,#e5e7eb)">
        Showing <strong>${submissions.length}</strong>
        submission${submissions.length !== 1 ? 's' : ''}
      </div>
    </div>`;

  const body = document.getElementById('qzTableBody');

  submissions.forEach(s => {
    const sc      = s.score || 0;
    const col     = sc >= 80 ? '#10b981' : sc >= 60 ? '#f59e0b' : '#ef4444';
    const course  = teacherState.courses.find(c => c.id === s.course_id);
    const cColor  = course?.color || '#1a9fd4';
    const timeSec = s.time_spent || 0;
    const timeStr = timeSec > 0 ? `${Math.floor(timeSec/60)}m ${timeSec%60}s` : '—';
    const date    = s.submitted_at
      ? new Date(s.submitted_at).toLocaleDateString('en-US',
          { month:'short', day:'numeric', year:'numeric' })
      : '—';
    const quiz    = teacherState.quizzes.find(q => q.id === s.quiz_id);
    const passing = quiz?.passing_score || 60;

    const row = document.createElement('div');
    row.style.cssText = `
      display:grid;
      grid-template-columns:180px 1fr 1fr 90px 130px 100px 70px;
      gap:0;align-items:center;
      padding:12px 16px;
      border-bottom:1px solid var(--bdr,#e5e7eb);
      transition:background .15s;`;
    row.onmouseenter = () => row.style.background = 'var(--s2,#f8fafc)';
    row.onmouseleave = () => row.style.background = '';

    row.innerHTML = `
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--txt,#1f2937)">
          ${_esc(s.student_name)}
        </div>
        <div style="font-size:11px;color:var(--mut,#6b7280)">
          ${_esc(s.student_email || '')}
        </div>
      </div>
      <div style="font-size:12px;color:var(--txt,#1f2937);padding-right:12px">
        ${_esc(s.quiz_title)}
      </div>
      <div>
        <span style="background:${cColor}22;color:${cColor};
                     padding:3px 10px;border-radius:20px;
                     font-size:11px;font-weight:600;
                     display:inline-block;max-width:150px;
                     white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${_esc(course?.title || '—')}
        </span>
      </div>
      <div style="text-align:center">
        <div style="font-size:16px;font-weight:800;color:${col}">${sc}%</div>
        <span style="background:${sc >= passing ? '#d1fae5' : '#fee2e2'};
                     color:${sc >= passing ? '#065f46' : '#991b1b'};
                     padding:1px 8px;border-radius:20px;font-size:9px;font-weight:700">
          ${sc >= passing ? 'Pass' : 'Fail'}
        </span>
      </div>
      <div style="text-align:center;font-size:11px;color:var(--mut,#6b7280)">${date}</div>
      <div style="text-align:center;font-size:11px;color:var(--mut,#6b7280)">${timeStr}</div>
      <div style="text-align:center">
        <button onclick="deleteQuizSubmission('${s.id}')"
                style="background:#fee2e2;border:none;color:#ef4444;
                       width:30px;height:30px;border-radius:8px;
                       cursor:pointer;font-size:13px">
          <i class="fas fa-trash"></i>
        </button>
      </div>`;

    body.appendChild(row);
  });
}

async function deleteQuizSubmission(id) {
  if (!confirm('Delete this submission?')) return;
  const { error } = await supabaseClient
    .from('quiz_submissions').delete().eq('id', id);
  if (error) { toast('Error: ' + error.message, 'w'); return; }
  toast('Submission deleted');
  renderQuizResultsTab();
}

async function exportQuizResults(quizId) {
  const all      = await fetchQuizSubmissions();
  const filtered = all.filter(s => String(s.quiz_id) === String(quizId));
  if (!filtered.length) { toast('No submissions to export', 'w'); return; }
  const quiz = teacherState.quizzes.find(q => String(q.id) === String(quizId));
  exportQuizResultsFromData(filtered, quiz?.title || 'quiz');
}

function exportQuizResultsFromData(subs, quizTitle) {
  if (!subs?.length) { toast('No data to export', 'w'); return; }
  const headers = ['Student', 'Score (%)', 'Correct', 'Total Qs', 'Pass/Fail', 'Submitted'];
  const rows = subs.map(s => [
    s.student_name    || 'Student',
    s.score           || 0,
    s.correct_answers || 0,
    s.total_questions || 0,
    (s.score || 0) >= (s.passing_score || 60) ? 'Pass' : 'Fail',
    s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : 'N/A',
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))
    .join('\n');
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `${quizTitle.replace(/[^a-z0-9]/gi, '_')}_results.csv`;
  a.click();
  toast('Results exported! 📊');
}

document.addEventListener('DOMContentLoaded', () => {
  const resultsTab = document.querySelector('[data-tab="qzResults"]');
  const allQuizzesTab = document.querySelector('[data-tab="qzList"]');

  if (resultsTab) {
    resultsTab.addEventListener('click', () => {
      if (teacherState.quizzes.length) renderQuizResultsTab();
    });
  }

  if (allQuizzesTab) {
    allQuizzesTab.addEventListener('click', () => {
      // Re-render quiz list when coming back to All Quizzes tab
      renderQuizList();
    });
  }
});

async function viewQuizQuestions(quizId, quizTitle) {
  const db = supabaseClient;

  // Create modal overlay
  const existing = document.getElementById('quizViewModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'quizViewModal';
  modal.className = 'modal open';
  modal.innerHTML = `
    <div class="mb mbw">
      <div class="mh">
        <h3><i class="fas fa-clipboard-list" style="color:var(--acc);margin-right:7px"></i>${_esc(quizTitle)}</h3>
        <button onclick="document.getElementById('quizViewModal').remove()" title="Close">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div id="quizQuestionsBody">
        <div class="empty">
          <i class="fas fa-spinner fa-spin"></i>
          <p>Loading questions…</p>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  // Fetch questions
 const { data: questions, error } = await db
    .from('quiz_questions')
    .select('id, question_text, question_type, options, correct_answer, points')
    .eq('quiz_id', quizId);

  if (error) console.error('viewQuizQuestions error:', error.message);

  const body = document.getElementById('quizQuestionsBody');
  if (!body) return;

  if (error || !questions?.length) {
    body.innerHTML = `
      <div class="empty">
        <i class="fas fa-inbox"></i>
        <p>No questions found for this quiz.</p>
      </div>`;
    return;
  }

  body.innerHTML = `
    <div style="margin-bottom:14px;padding:10px 14px;
                background:var(--s3);border-radius:9px;
                font-size:12px;color:var(--txt2);
                border:1.5px solid var(--bdr)">
      <i class="fas fa-info-circle" style="color:var(--acc)"></i>
      &nbsp;This quiz has <strong>${questions.length}</strong> question${questions.length !== 1 ? 's' : ''}.
      Created by Admin — view only.
    </div>`;

  questions.forEach((q, i) => {
    let optionsHtml = '';

    // Parse options
    let opts = [];
    try {
      opts = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []);
    } catch(e) { opts = []; }

    if (q.question_type === 'mcq' || q.question_type === 'multiple_choice') {
      optionsHtml = opts.map((opt, oi) => {
        const optText   = typeof opt === 'object' ? (opt.text || opt.label || JSON.stringify(opt)) : opt;
        const optValue  = typeof opt === 'object' ? (opt.value || opt.id || String(oi)) : opt;
        const isCorrect = String(q.correct_answer) === String(optValue) ||
                          String(q.correct_answer) === String(optText)  ||
                          String(q.correct_answer) === String(oi);
        return `
          <div style="display:flex;align-items:center;gap:9px;
                      padding:9px 13px;border-radius:9px;margin-bottom:5px;
                      background:${isCorrect ? '#d1fae5' : 'var(--s3)'};
                      border:1.5px solid ${isCorrect ? '#6ee7b7' : 'var(--bdr)'}">
            <div style="width:18px;height:18px;border-radius:50%;
                        background:${isCorrect ? 'var(--grn)' : 'var(--bdr)'};
                        display:flex;align-items:center;justify-content:center;
                        flex-shrink:0">
              ${isCorrect ? '<i class="fas fa-check" style="color:#fff;font-size:9px"></i>' : ''}
            </div>
            <span style="font-size:12px;color:${isCorrect ? '#065f46' : 'var(--txt2)'};
                         font-weight:${isCorrect ? '600' : '400'}">
              ${_esc(String(optText))}
            </span>
            ${isCorrect ? '<span class="chip cg" style="margin-left:auto;font-size:9px">Correct</span>' : ''}
          </div>`;
      }).join('');

    } else if (q.question_type === 'tf' || q.question_type === 'true_false') {
      ['True', 'False'].forEach(val => {
        const isCorrect = String(q.correct_answer).toLowerCase() === val.toLowerCase();
        optionsHtml += `
          <div style="display:flex;align-items:center;gap:9px;
                      padding:9px 13px;border-radius:9px;margin-bottom:5px;
                      background:${isCorrect ? '#d1fae5' : 'var(--s3)'};
                      border:1.5px solid ${isCorrect ? '#6ee7b7' : 'var(--bdr)'}">
            <span style="font-size:12px;font-weight:${isCorrect ? '600' : '400'};
                         color:${isCorrect ? '#065f46' : 'var(--txt2)'}">
              ${val}
            </span>
            ${isCorrect ? '<span class="chip cg" style="margin-left:auto;font-size:9px">Correct</span>' : ''}
          </div>`;
      });

    } else {
      // Short answer
      optionsHtml = `
        <div style="background:var(--s3);border:1.5px solid var(--bdr);
                    border-radius:9px;padding:10px 13px;font-size:12px;
                    color:var(--txt2)">
          <i class="fas fa-pen" style="color:var(--acc);margin-right:6px"></i>
          Short answer — Expected: 
          <strong style="color:var(--txt)">${_esc(String(q.correct_answer || 'Open ended'))}</strong>
        </div>`;
    }

    body.innerHTML += `
      <div style="background:#fff;border:1.5px solid var(--bdr);
                  border-radius:var(--r);padding:16px;margin-bottom:10px;
                  box-shadow:var(--shd2)">
        <div style="display:flex;align-items:start;gap:10px;margin-bottom:12px">
          <span style="background:var(--acc);color:#fff;font-size:10px;
                       font-weight:700;padding:3px 9px;border-radius:20px;
                       flex-shrink:0;margin-top:1px">
            Q${i + 1}
          </span>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:var(--txt);
                        line-height:1.5;margin-bottom:3px">
              ${_esc(q.question_text || '')}
            </div>
            <div style="display:flex;gap:10px;font-size:10px;color:var(--mut)">
              <span><i class="fas fa-tag"></i> ${q.question_type || 'mcq'}</span>
              <span><i class="fas fa-star"></i> ${q.points || 1} pt${(q.points || 1) !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
        ${optionsHtml}
      </div>`;
  });

  // Close footer
  body.innerHTML += `
    <div style="display:flex;justify-content:flex-end;margin-top:16px">
      <button class="btn bg"
              onclick="document.getElementById('quizViewModal').remove()">
        Close
      </button>
    </div>`;
}

console.log('✅ teacher-quizzes.js loaded');
