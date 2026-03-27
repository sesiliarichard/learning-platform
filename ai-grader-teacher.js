/* ============================================================
   AI GRADER — TEACHER UI  —  ai-grader-teacher.js

   Shows teachers the AI suggestion inside the Grade modal.
   Teacher can: Approve as-is | Edit then approve | Discard

   Add to teacher.html after ai-grader.js:
     <script src="ai-grader-teacher.js"></script>
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  patchAssignmentModal();
  patchGradeModal();
  injectAIButtons();
});

/* ============================================================
   1. RUBRIC BUILDER in Create Assignment modal
   ============================================================ */
function patchAssignmentModal() {
  const form = document.getElementById('assignForm');
  if (!form) return;

  const subTypeField = document.getElementById('assignSubType')?.closest('.fg');
  if (!subTypeField) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'teacherRubricWrapper';
  wrapper.innerHTML = `
    <div style="margin-top:14px;padding:14px;background:var(--bg2);
                border:1.5px solid var(--bdr);border-radius:var(--r);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--txt);
                      display:flex;align-items:center;gap:6px;">
            <i class="fas fa-list-check" style="color:var(--acc)"></i>
            Grading Rubric
            <span style="font-size:10px;font-weight:400;color:var(--mut)">(optional — helps AI give better suggestions)</span>
          </div>
        </div>
        <button type="button" onclick="tAddRubricRow()"
          style="padding:5px 11px;background:var(--acc);color:white;border:none;
                 border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;
                 font-family:inherit;">
          <i class="fas fa-plus"></i> Add Criterion
        </button>
      </div>
      <div id="tRubricList" style="display:flex;flex-direction:column;gap:7px;"></div>
      <div id="tRubricTotal" style="text-align:right;font-size:11px;color:var(--mut);margin-top:5px;"></div>
      <input type="hidden" id="tRubricJson" value="[]">
    </div>`;

  subTypeField.insertAdjacentElement('afterend', wrapper);
  tAddRubricRow(); // one default row
}

let _tRIdx = 0;

function tAddRubricRow() {
  const list = document.getElementById('tRubricList');
  if (!list) return;
  const idx = _tRIdx++;
  const row = document.createElement('div');
  row.id = `tRR_${idx}`;
  row.style.cssText = `display:grid;grid-template-columns:2fr 0.45fr 2.5fr auto;
    gap:6px;align-items:center;padding:8px 10px;background:white;
    border-radius:8px;border:1px solid var(--bdr);`;
  row.innerHTML = `
    <input type="text" id="tRC_${idx}" placeholder="e.g. Understanding"
      style="padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;
             font-size:12px;font-family:inherit;outline:none;width:100%"
      oninput="tSyncRubric()"
      onfocus="this.style.borderColor='var(--acc)'"
      onblur="this.style.borderColor='var(--bdr)'">
    <input type="number" id="tRP_${idx}" min="1" max="100" value="25"
      style="padding:6px 6px;border:1px solid var(--bdr);border-radius:6px;
             font-size:12px;font-family:inherit;outline:none;text-align:center;width:100%"
      oninput="tSyncRubric()"
      onfocus="this.style.borderColor='var(--acc)'"
      onblur="this.style.borderColor='var(--bdr)'">
    <input type="text" id="tRD_${idx}" placeholder="What to look for"
      style="padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;
             font-size:12px;font-family:inherit;outline:none;width:100%"
      oninput="tSyncRubric()"
      onfocus="this.style.borderColor='var(--acc)'"
      onblur="this.style.borderColor='var(--bdr)'">
    <button type="button" onclick="tRemoveRow(${idx})"
      style="padding:5px 8px;background:#fee2e2;color:#dc2626;border:none;
             border-radius:6px;cursor:pointer;font-size:11px;">
      <i class="fas fa-times"></i>
    </button>`;
  list.appendChild(row);
  tSyncRubric();
}

function tRemoveRow(idx) {
  document.getElementById(`tRR_${idx}`)?.remove();
  tSyncRubric();
}

function tSyncRubric() {
  const rows   = document.querySelectorAll('[id^="tRR_"]');
  const rubric = [];
  let total    = 0;
  rows.forEach(r => {
    const idx  = r.id.replace('tRR_', '');
    const crit = document.getElementById(`tRC_${idx}`)?.value?.trim();
    const pts  = parseInt(document.getElementById(`tRP_${idx}`)?.value) || 0;
    const desc = document.getElementById(`tRD_${idx}`)?.value?.trim();
    if (crit) rubric.push({ criterion: crit, points: pts, description: desc || crit });
    total += pts;
  });
  const hidden = document.getElementById('tRubricJson');
  if (hidden) hidden.value = JSON.stringify(rubric);
  const el = document.getElementById('tRubricTotal');
  if (el) {
    const c = total === 100 ? 'var(--grn)' : total > 100 ? 'var(--red)' : 'var(--amb)';
    el.innerHTML = `<span style="color:${c};font-weight:700;">Total: ${total} pts ${total === 100 ? '✓' : ''}</span>`;
  }
}

/* Override handleCreateAssignment to save rubric */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('assignForm');
  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    tSyncRubric();

    const fd         = new FormData(form);
    const rubricJson = document.getElementById('tRubricJson')?.value || '[]';
    const sb         = window.supabaseClient || window.db;
    const { data: { user } } = await sb.auth.getUser();

    const { error } = await sb.from('assignments').insert({
      course_id:       fd.get('courseId'),
      title:           fd.get('title'),
      instructions:    fd.get('instructions'),
      due_date:        fd.get('dueDate') || null,
      max_points:      parseInt(fd.get('maxPoints')) || 100,
      submission_type: fd.get('subType') || 'file',
      grading_rubric:  rubricJson,
      teacher_id:      user?.id || null,
      status:          'active'
    });

    if (error) { toast('Error: ' + error.message); return; }

    closeM('assignModal');
    form.reset();
    document.getElementById('tRubricList').innerHTML = '';
    _tRIdx = 0;
    tAddRubricRow();
    if (typeof loadAssignments === 'function') loadAssignments();
    toast('✅ Assignment created');
  }, true);
});

/* ============================================================
   2. PATCH Grade Modal — inject AI Suggestion panel
   ============================================================ */
function patchGradeModal() {
  const _orig = window.openGradePanel;
  if (typeof _orig !== 'function') return;

  window.openGradePanel = async function (submissionId, studentName, assignTitle, maxPts) {
    // Store current submission ID for the approve/discard buttons
    window._currentGradingSubId = submissionId;
    window._currentGradingMax   = maxPts;

    _orig.call(this, submissionId, studentName, assignTitle, maxPts);
    await loadSuggestionPanel(submissionId);
  };
}

async function loadSuggestionPanel(submissionId) {
  // Inject AI panel above the grade form
  let panel = document.getElementById('aiSuggestionPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'aiSuggestionPanel';
    const gmInfo = document.getElementById('gmInfo');
    if (gmInfo) gmInfo.insertAdjacentElement('afterend', panel);
  }

  // Show loading
  panel.innerHTML = `
    <div style="margin:10px 0;padding:12px 14px;background:#f0f4ff;
                border:1.5px solid var(--acc)30;border-radius:var(--r);
                display:flex;align-items:center;gap:8px;font-size:12px;color:var(--acc);">
      <i class="fas fa-spinner fa-spin"></i> Loading AI analysis…
    </div>`;

  // Fetch current submission state
  const sb = window.supabaseClient || window.db;
  const { data: sub } = await sb
    .from('assignment_submissions')
    .select('text_response, ai_suggestion, ai_grading_status, score, grade')
    .eq('id', submissionId)
    .maybeSingle();

  if (!sub) { panel.innerHTML = ''; return; }

  const status    = sub.ai_grading_status || 'pending';
  const hasText   = !!sub.text_response?.trim();
  const hasSug    = !!sub.ai_suggestion;

  /* ── Case 1: Already has a suggestion waiting for review ── */
  if (hasSug && status === 'suggested') {
    const sug = typeof sub.ai_suggestion === 'string'
      ? JSON.parse(sub.ai_suggestion)
      : sub.ai_suggestion;

    renderSuggestionReview(panel, sug, submissionId);
    return;
  }

  /* ── Case 2: Already approved ── */
  if (status === 'approved') {
    panel.innerHTML = `
      <div style="margin:10px 0;padding:10px 14px;background:var(--grn)10;
                  border:1.5px solid var(--grn)40;border-radius:var(--r);
                  display:flex;align-items:center;gap:8px;font-size:12px;">
        <i class="fas fa-check-circle" style="color:var(--grn)"></i>
        <span style="color:var(--grn);font-weight:700;">AI suggestion was reviewed and approved by teacher.</span>
        <button onclick="reRequestAI('${submissionId}')"
          style="margin-left:auto;padding:4px 10px;background:var(--bg2);color:var(--mut);
                 border:1px solid var(--bdr);border-radius:6px;font-size:10px;cursor:pointer;
                 font-family:inherit;">
          <i class="fas fa-redo"></i> Re-analyse
        </button>
      </div>`;
    return;
  }

  /* ── Case 3: Currently analysing ── */
  if (status === 'analysing') {
    panel.innerHTML = `
      <div style="margin:10px 0;padding:12px 14px;background:#f0f4ff;
                  border:1.5px solid var(--acc)30;border-radius:var(--r);
                  text-align:center;font-size:12px;color:var(--acc);">
        <i class="fas fa-spinner fa-spin" style="margin-right:6px;"></i>
        AI is analysing this submission… this takes a few seconds.
      </div>`;
    // Poll for result
let pollCount = 0;
const poll = setInterval(async () => {
  pollCount++;
  const { data: updated } = await sb
    .from('assignment_submissions')
    .select('ai_grading_status, ai_suggestion')
    .eq('id', submissionId)
    .maybeSingle();

  if (updated?.ai_grading_status === 'suggested') {
    clearInterval(poll);
    await loadSuggestionPanel(submissionId);
  } else if (updated?.ai_grading_status === 'failed' || pollCount > 10) {
    clearInterval(poll);
    panel.innerHTML = `
      <div style="margin:10px 0;padding:10px 14px;background:#fee2e2;
                  border:1px solid red;border-radius:8px;font-size:12px;color:red;">
        <i class="fas fa-exclamation-circle"></i>
        AI analysis timed out. 
        <button onclick="requestAISuggestion('${submissionId}')"
          style="margin-left:8px;padding:3px 8px;background:red;color:white;
                 border:none;border-radius:5px;font-size:11px;cursor:pointer;">
          Retry
        </button>
      </div>`;
  }
}, 3000);
    return;
  }

  /* ── Case 4: Has text but not analysed yet — show "Get AI Suggestion" button ── */
  if (hasText) {
    panel.innerHTML = `
      <div style="margin:10px 0;padding:12px 16px;background:#f0f4ff;
                  border:1.5px dashed var(--acc)60;border-radius:var(--r);">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:700;color:var(--acc);
                        display:flex;align-items:center;gap:6px;margin-bottom:3px;">
              <i class="fas fa-robot"></i> AI Grading Assistant
            </div>
            <div style="font-size:11px;color:var(--mut);">
              Get an AI-suggested score and feedback to review before grading.
              <strong>You make the final decision.</strong>
            </div>
          </div>
          <button onclick="requestAISuggestion('${submissionId}')"
            id="getAISugBtn"
            style="padding:9px 18px;background:var(--acc);color:white;border:none;
                   border-radius:var(--r);font-size:12px;font-weight:700;cursor:pointer;
                   font-family:inherit;display:flex;align-items:center;gap:6px;
                   white-space:nowrap;flex-shrink:0;">
            <i class="fas fa-robot"></i> Get AI Suggestion
          </button>
        </div>
      </div>`;
    return;
  }

  /* ── Case 5: File-only submission — no text to analyse ── */
  panel.innerHTML = `
    <div style="margin:10px 0;padding:10px 14px;background:var(--bg2);
                border:1px solid var(--bdr);border-radius:var(--r);
                font-size:11px;color:var(--mut);display:flex;align-items:center;gap:6px;">
      <i class="fas fa-file-upload"></i>
      File-only submission — AI analysis is not available. Please grade manually.
    </div>`;
}

/* ============================================================
   RENDER THE SUGGESTION REVIEW CARD
   Teacher sees: suggested score, feedback, breakdown
   Buttons: Approve as-is | Edit & Approve | Discard
   ============================================================ */
function renderSuggestionReview(panel, sug, submissionId) {
  const conf      = sug.confidence ? Math.round(sug.confidence * 100) : null;
  const confColor = conf >= 80 ? 'var(--grn)' : conf >= 60 ? 'var(--amb)' : 'var(--red)';
  const confLabel = conf >= 80 ? 'High confidence' : conf >= 60 ? 'Moderate confidence' : 'Low confidence — review carefully';
  const scoreColor = sug.score >= 80
    ? 'var(--grn)' : sug.score >= 60
    ? 'var(--amb)' : 'var(--red)';

  panel.innerHTML = `
    <div style="margin:10px 0;border:2px solid var(--acc)40;border-radius:var(--r);overflow:hidden;">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#f0f4ff,#e8edff);
                  padding:12px 16px;display:flex;align-items:center;gap:10px;
                  border-bottom:1px solid var(--acc)20;">
        <i class="fas fa-robot" style="color:var(--acc);font-size:18px;"></i>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:800;color:var(--acc);">AI Grading Suggestion</div>
          <div style="font-size:11px;color:var(--mut);">Review carefully before approving. You can edit anything.</div>
        </div>
        ${conf ? `
        <div style="text-align:right;">
          <div style="font-size:18px;font-weight:800;color:${confColor};">${conf}%</div>
          <div style="font-size:9px;color:${confColor};font-weight:600;">${confLabel}</div>
        </div>` : ''}
      </div>

      <!-- Suggested score -->
      <div style="padding:14px 16px;background:white;border-bottom:1px solid var(--bdr);">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
          <div style="text-align:center;min-width:70px;">
            <div style="font-size:32px;font-weight:900;color:${scoreColor};line-height:1;">
              ${sug.score}
            </div>
            <div style="font-size:10px;color:var(--mut);">suggested pts</div>
          </div>
          <div style="text-align:center;min-width:50px;">
            <div style="font-size:28px;font-weight:900;color:${scoreColor};line-height:1;">
              ${sug.grade}
            </div>
            <div style="font-size:10px;color:var(--mut);">grade</div>
          </div>
          <div style="flex:1;font-size:12px;color:var(--txt2);line-height:1.6;
                      padding-left:12px;border-left:2px solid var(--bdr);">
            <strong style="color:var(--txt);display:block;margin-bottom:3px;">
              <i class="fas fa-quote-left" style="color:var(--acc);font-size:9px;margin-right:4px;"></i>
              Suggested Feedback:
            </strong>
            ${_esc(sug.feedback || '')}
          </div>
        </div>

        ${sug.reasoning ? `
        <div style="margin-top:10px;padding:8px 10px;background:var(--bg2);border-radius:6px;
                    font-size:11px;color:var(--mut);">
          <i class="fas fa-info-circle" style="margin-right:4px;color:var(--acc);"></i>
          <strong>Why this score:</strong> ${_esc(sug.reasoning)}
        </div>` : ''}
      </div>

      <!-- Strengths + Improvements -->
      ${(sug.strengths || sug.improvements) ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;
                  border-bottom:1px solid var(--bdr);">
        ${sug.strengths ? `
        <div style="padding:12px 14px;border-right:1px solid var(--bdr);background:white;">
          <div style="font-size:10px;font-weight:700;color:var(--grn);
                      text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">
            <i class="fas fa-thumbs-up"></i> Strengths
          </div>
          <div style="font-size:11px;color:var(--txt2);line-height:1.5;">${_esc(sug.strengths)}</div>
        </div>` : '<div></div>'}
        ${sug.improvements ? `
        <div style="padding:12px 14px;background:white;">
          <div style="font-size:10px;font-weight:700;color:var(--amb);
                      text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">
            <i class="fas fa-lightbulb"></i> To Improve
          </div>
          <div style="font-size:11px;color:var(--txt2);line-height:1.5;">${_esc(sug.improvements)}</div>
        </div>` : '<div></div>'}
      </div>` : ''}

      <!-- Rubric breakdown -->
      ${sug.rubricBreakdown?.length ? `
      <div style="padding:12px 16px;background:white;border-bottom:1px solid var(--bdr);">
        <div style="font-size:10px;font-weight:700;color:var(--txt);
                    text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">
          <i class="fas fa-list-check" style="color:var(--acc);margin-right:4px;"></i>Rubric Breakdown
        </div>
        ${sug.rubricBreakdown.map(r => {
          const pct = r.maxScore > 0 ? Math.round((r.score / r.maxScore) * 100) : 0;
          const c   = pct >= 80 ? 'var(--grn)' : pct >= 50 ? 'var(--amb)' : 'var(--red)';
          return `
          <div style="margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
              <span style="font-weight:600;color:var(--txt)">${_esc(r.criterion)}</span>
              <span style="font-weight:700;color:${c}">${r.score} / ${r.maxScore}</span>
            </div>
            <div style="height:5px;background:var(--bdr);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${pct}%;background:${c};border-radius:3px;
                          transition:width 0.5s;"></div>
            </div>
            ${r.comment ? `<div style="font-size:10px;color:var(--mut);margin-top:2px;font-style:italic;">${_esc(r.comment)}</div>` : ''}
          </div>`;
        }).join('')}
      </div>` : ''}

      <!-- Action buttons -->
      <div style="padding:12px 16px;background:#f8faff;
                  display:flex;align-items:center;gap:8px;flex-wrap:wrap;">

        <!-- Approve as-is -->
        <button onclick="approveAsSuggested('${submissionId}')"
          id="approveAIBtn"
          style="padding:9px 16px;background:var(--grn);color:white;border:none;
                 border-radius:var(--r);font-size:12px;font-weight:700;cursor:pointer;
                 font-family:inherit;display:flex;align-items:center;gap:6px;">
          <i class="fas fa-check-double"></i> Approve Suggestion
        </button>

        <!-- Edit & approve (pre-fills the grade form) -->
        <button onclick="prefillGradeForm(${sug.score}, '${sug.grade}', \`${sug.feedback.replace(/`/g, "'")}\`)"
          style="padding:9px 16px;background:var(--acc);color:white;border:none;
                 border-radius:var(--r);font-size:12px;font-weight:700;cursor:pointer;
                 font-family:inherit;display:flex;align-items:center;gap:6px;">
          <i class="fas fa-edit"></i> Edit & Approve
        </button>

        <!-- Discard -->
        <button onclick="discardAISuggestion('${submissionId}')"
          style="padding:9px 14px;background:var(--bg2);color:var(--mut);
                 border:1px solid var(--bdr);border-radius:var(--r);font-size:12px;
                 font-weight:700;cursor:pointer;font-family:inherit;
                 display:flex;align-items:center;gap:6px;">
          <i class="fas fa-times"></i> Discard & Grade Manually
        </button>

        <div style="margin-left:auto;font-size:10px;color:var(--mut);font-style:italic;">
          <i class="fas fa-shield-alt" style="margin-right:3px;"></i>
          Your approval is required before any grade is saved.
        </div>
      </div>
    </div>`;

  // Pre-fill the grade form fields as a convenience
  prefillGradeForm(sug.score, sug.grade, sug.feedback);
}

/* ============================================================
   TEACHER ACTIONS
   ============================================================ */

/* Request AI suggestion (called from "Get AI Suggestion" button) */
window.requestAISuggestion = async function (submissionId) {
  const btn = document.getElementById('getAISugBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analysing…';
  }

  const panel = document.getElementById('aiSuggestionPanel');
  if (panel) {
    panel.innerHTML = `
      <div style="margin:10px 0;padding:14px 16px;background:#f0f4ff;
                  border:1.5px solid var(--acc)40;border-radius:var(--r);
                  text-align:center;font-size:12px;color:var(--acc);">
        <i class="fas fa-spinner fa-spin" style="font-size:20px;display:block;
           margin-bottom:8px;"></i>
        <strong>Claude AI is reading the submission…</strong><br>
        <span style="color:var(--mut);font-size:11px;">This takes 5-10 seconds.</span>
      </div>`;
  }

  const result = await AIGrader.analyse(submissionId);

  if (result.success) {
    renderSuggestionReview(panel, result.suggestion, submissionId);
    _showToast('✅ AI suggestion ready — please review before approving.');
  } else if (result.skipped) {
    if (panel) panel.innerHTML = `
      <div style="margin:10px 0;padding:10px 14px;background:var(--bg2);
                  border:1px solid var(--bdr);border-radius:var(--r);
                  font-size:11px;color:var(--mut);">
        <i class="fas fa-info-circle" style="margin-right:5px;"></i>
        ${result.reason}
      </div>`;
  } else {
    if (panel) panel.innerHTML = `
      <div style="margin:10px 0;padding:10px 14px;background:#fee2e2;
                  border:1px solid var(--red)40;border-radius:var(--r);
                  font-size:11px;color:var(--red);">
        <i class="fas fa-exclamation-circle" style="margin-right:5px;"></i>
        AI analysis failed: ${result.error}
        <button onclick="requestAISuggestion('${submissionId}')"
          style="margin-left:8px;padding:3px 8px;background:var(--red);color:white;
                 border:none;border-radius:5px;font-size:10px;cursor:pointer;font-family:inherit;">
          Retry
        </button>
      </div>`;
  }
};

/* Re-request AI suggestion */
window.reRequestAI = async function (submissionId) {
  const panel = document.getElementById('aiSuggestionPanel');
  if (panel) panel.innerHTML = '';
  await window.requestAISuggestion(submissionId);
};

/* Approve without editing */
window.approveAsSuggested = async function (submissionId) {
  const btn = document.getElementById('approveAIBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

  try {
    const score    = parseInt(document.getElementById('gmScore')?.value) || undefined;
    const grade    = document.getElementById('gmGrade')?.value || undefined;
    const feedback = document.getElementById('gradeFeedback')?.value?.trim() || undefined;

    // approveSuggestion uses teacher form values as overrides
    const result = await AIGrader.approveSuggestion(submissionId, { score, grade, feedback });

    if (result.success) {
      closeM('gradeModal');
      _showToast(`✅ Grade saved: ${result.score} pts (${result.grade})`);
      if (typeof renderAssignmentSubmissions === 'function') renderAssignmentSubmissions();
      if (typeof loadGrading === 'function') loadGrading();
    }
  } catch (err) {
    _showToast('Error saving grade: ' + err.message);
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-double"></i> Approve Suggestion'; }
  }
};

/* Discard suggestion — teacher will grade manually */
window.discardAISuggestion = async function (submissionId) {
  if (!confirm('Discard AI suggestion? You\'ll grade this manually.')) return;
  await AIGrader.discardSuggestion(submissionId);

  // Clear the form
  const score    = document.getElementById('gmScore');
  const feedback = document.getElementById('gradeFeedback');
  if (score)    score.value    = '';
  if (feedback) feedback.value = '';

  const panel = document.getElementById('aiSuggestionPanel');
  if (panel) panel.innerHTML = `
    <div style="margin:10px 0;padding:10px 14px;background:var(--bg2);
                border:1px solid var(--bdr);border-radius:var(--r);
                font-size:11px;color:var(--mut);display:flex;align-items:center;gap:6px;">
      <i class="fas fa-pen"></i> Grading manually. Fill in the score and feedback below.
    </div>`;
};

/* Pre-fill the grade form with AI suggestion values */
window.prefillGradeForm = function (score, grade, feedback) {
  const scoreEl    = document.getElementById('gmScore');
  const gradeEl    = document.getElementById('gmGrade');
  const feedbackEl = document.getElementById('gradeFeedback');
  if (scoreEl)    scoreEl.value    = score;
  if (gradeEl)    gradeEl.value    = grade;
  if (feedbackEl) feedbackEl.value = feedback;
};

/* ============================================================
   3. INJECT AI buttons into Assignment Submissions table
   ============================================================ */
function injectAIButtons() {
  // Override _buildAssRows to add AI status badges per row
  const _orig = window._buildAssRows;
  if (typeof _orig !== 'function') return;

  window._buildAssRows = function (subs) {
    _orig(subs);
    setTimeout(() => addAIStatusToRows(subs), 150);
  };
}

async function addAIStatusToRows(subs) {
  if (!subs?.length) return;
  const sb  = window.supabaseClient || window.db;
  const ids = subs.map(s => s.id).filter(Boolean);
  if (!ids.length) return;

  const { data: statuses } = await sb
    .from('assignment_submissions')
    .select('id, ai_grading_status, text_response')
    .in('id', ids);

  if (!statuses) return;
  const map = {};
  statuses.forEach(s => { map[s.id] = s; });

  // Find each submission's action cell and inject status
  subs.forEach(s => {
    const st      = map[s.id];
    if (!st) return;
    const status  = st.ai_grading_status || 'pending';
    const hasText = !!st.text_response?.trim();

    // Find the grade button for this submission in the table
    const gradeBtns = document.querySelectorAll(
      `#assSubTableBody button[onclick*="'${s.id}'"]`
    );
    gradeBtns.forEach(btn => {
      const cell = btn.closest('td');
      if (!cell || cell.querySelector('.ai-status-tag')) return;

      const tag = document.createElement('div');
      tag.className = 'ai-status-tag';
      tag.style.cssText = 'margin-top:5px;';

      if (status === 'suggested') {
        tag.innerHTML = `
          <span style="display:inline-flex;align-items:center;gap:3px;
                       background:var(--acc)18;color:var(--acc);padding:2px 7px;
                       border-radius:10px;font-size:10px;font-weight:700;cursor:pointer;"
                onclick="openGradePanel('${s.id}','${(s.student_name||'').replace(/'/g,"\\'")}','${(s.assignment_title||'').replace(/'/g,"\\'")}',${s.max_points||100})">
            <i class="fas fa-robot"></i> Suggestion ready ↑
          </span>`;
      } else if (status === 'approved') {
        tag.innerHTML = `
          <span style="display:inline-flex;align-items:center;gap:3px;
                       background:var(--grn)18;color:var(--grn);padding:2px 7px;
                       border-radius:10px;font-size:10px;font-weight:700;">
            <i class="fas fa-check-circle"></i> AI reviewed
          </span>`;
      } else if (hasText && status !== 'analysing' && status !== 'discarded') {
        tag.innerHTML = `
          <span style="display:inline-flex;align-items:center;gap:3px;
                       background:var(--bg2);color:var(--mut);padding:2px 7px;
                       border-radius:10px;font-size:10px;font-weight:600;border:1px solid var(--bdr);">
            <i class="fas fa-robot"></i> AI available
          </span>`;
      }

      cell.appendChild(tag);
    });
  });
}

/* ============================================================
   HELPERS
   ============================================================ */
function _showToast(msg) {
  if (typeof toast === 'function') { toast(msg); return; }
  const t = document.getElementById('toast');
  const m = document.getElementById('toastMsg');
  if (t && m) { m.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000); }
}

function _esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}