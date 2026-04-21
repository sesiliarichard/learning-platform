/* ============================================================
   AI GRADER — ADMIN SIDE  —  ai-grader-admin.js

   What this does:
   - Adds a rubric builder to the admin Create Assignment modal
   - Adds "Get AI Suggestion" button inside the grade submission
     modal (openGradeSubmissionModal) in the Submissions section
   - Admin reviews the suggestion and approves/edits/discards
     exactly like teachers — nothing is saved until they approve

   Add to admin.html before </body>:
     <script src="ai-grader.js"></script>
     <script src="ai-grader-admin.js"></script>
   ============================================================ */

(function () {

  /* ----------------------------------------------------------
     Boot — wait for DOM then wire everything up
  ---------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function () {
    injectRubricIntoAssignmentModal();
    patchAdminGradeModal();
    injectAIStatusIntoSubmissionsTable();
  });

  /* ============================================================
     1. RUBRIC BUILDER inside admin Create Assignment modal
        (#createAssignmentModal → #createAssignmentForm)
     ============================================================ */
  function injectRubricIntoAssignmentModal() {
    // Poll until the form exists (it may be injected dynamically)
    var attempts = 0;
    var timer = setInterval(function () {
      attempts++;
      var form = document.getElementById('createAssignmentForm');
      if (form && !document.getElementById('adminRubricWrapper')) {
        clearInterval(timer);
        buildRubricUI(form);
      }
      if (attempts > 30) clearInterval(timer);
    }, 300);
  }

  function buildRubricUI(form) {
    // Find the submission type field to insert after it
    var subTypeEl = document.getElementById('assignmentSubmissionType');
    var insertAfter = subTypeEl ? subTypeEl.closest('.form-group') : null;
    if (!insertAfter) {
      // fallback — append to form before the modal-actions div
      insertAfter = form.querySelector('.modal-actions');
    }

    var wrapper = document.createElement('div');
    wrapper.id = 'adminRubricWrapper';
    wrapper.innerHTML = [
      '<div class="form-group" style="margin-top:14px;">',
        '<label style="display:block;font-weight:700;font-size:14px;',
          'color:#374151;margin-bottom:6px;">',
          '<i class="fas fa-list-check" style="color:#7c3aed;margin-right:6px;"></i>',
          'Grading Rubric',
          '<span style="font-size:11px;font-weight:400;color:#9ca3af;margin-left:6px;">',
            '(optional — helps AI give better suggestions)',
          '</span>',
        '</label>',
        '<div id="adminRubricRows" style="display:flex;flex-direction:column;gap:8px;',
          'margin-bottom:8px;"></div>',
        '<button type="button" onclick="adminAddRubricRow()"',
          'style="padding:7px 14px;background:#f5f3ff;color:#7c3aed;',
          'border:2px dashed #c4b5fd;border-radius:10px;font-size:12px;',
          'font-weight:700;cursor:pointer;font-family:inherit;width:100%;">',
          '<i class="fas fa-plus"></i> Add Criterion',
        '</button>',
        '<div id="adminRubricTotal" style="text-align:right;font-size:11px;',
          'color:#9ca3af;margin-top:4px;"></div>',
        '<input type="hidden" id="adminRubricJson" value="[]">',
      '</div>'
    ].join('');

    if (insertAfter && insertAfter.parentNode) {
      insertAfter.parentNode.insertBefore(wrapper, insertAfter.nextSibling);
    } else {
      form.appendChild(wrapper);
    }

    // Add one default row
    adminAddRubricRow();

    // Override form submit to include rubric
    patchAdminAssignmentSubmit(form);
  }

  var _adminRubricIdx = 0;

  window.adminAddRubricRow = function () {
    var list = document.getElementById('adminRubricRows');
    if (!list) return;

    var idx = _adminRubricIdx++;
    var row = document.createElement('div');
    row.id = 'adminRR_' + idx;
    row.style.cssText = 'display:grid;grid-template-columns:2fr 0.45fr 2.5fr auto;' +
      'gap:6px;align-items:center;padding:8px 10px;background:#f9fafb;' +
      'border-radius:8px;border:1px solid #e5e7eb;';
    row.innerHTML = [
      '<input type="text" id="adminRC_' + idx + '" placeholder="Criterion name"',
        'oninput="adminSyncRubric()"',
        'style="padding:6px 8px;border:1px solid #e5e7eb;border-radius:6px;',
        'font-size:12px;font-family:inherit;outline:none;width:100%"',
        'onfocus="this.style.borderColor=\'#7c3aed\'"',
        'onblur="this.style.borderColor=\'#e5e7eb\'">',
      '<input type="number" id="adminRP_' + idx + '" min="1" max="100" value="25"',
        'oninput="adminSyncRubric()"',
        'style="padding:6px 6px;border:1px solid #e5e7eb;border-radius:6px;',
        'font-size:12px;font-family:inherit;outline:none;text-align:center;width:100%"',
        'onfocus="this.style.borderColor=\'#7c3aed\'"',
        'onblur="this.style.borderColor=\'#e5e7eb\'">',
      '<input type="text" id="adminRD_' + idx + '" placeholder="What to look for"',
        'oninput="adminSyncRubric()"',
        'style="padding:6px 8px;border:1px solid #e5e7eb;border-radius:6px;',
        'font-size:12px;font-family:inherit;outline:none;width:100%"',
        'onfocus="this.style.borderColor=\'#7c3aed\'"',
        'onblur="this.style.borderColor=\'#e5e7eb\'">',
      '<button type="button" onclick="adminRemoveRubricRow(' + idx + ')"',
        'style="padding:5px 8px;background:#fee2e2;color:#dc2626;border:none;',
        'border-radius:6px;cursor:pointer;font-size:11px;">',
        '<i class="fas fa-times"></i>',
      '</button>'
    ].join('');

    list.appendChild(row);
    adminSyncRubric();
  };

  window.adminRemoveRubricRow = function (idx) {
    var el = document.getElementById('adminRR_' + idx);
    if (el) el.parentNode.removeChild(el);
    adminSyncRubric();
  };

  window.adminSyncRubric = function () {
    var rows   = document.querySelectorAll('[id^="adminRR_"]');
    var rubric = [];
    var total  = 0;

    rows.forEach(function (r) {
      var idx  = r.id.replace('adminRR_', '');
      var crit = (document.getElementById('adminRC_' + idx) || {}).value || '';
      var pts  = parseInt((document.getElementById('adminRP_' + idx) || {}).value) || 0;
      var desc = (document.getElementById('adminRD_' + idx) || {}).value || '';
      crit = crit.trim();
      if (crit) rubric.push({ criterion: crit, points: pts, description: desc.trim() || crit });
      total += pts;
    });

    var hidden = document.getElementById('adminRubricJson');
    if (hidden) hidden.value = JSON.stringify(rubric);

    var totalEl = document.getElementById('adminRubricTotal');
    if (totalEl) {
      var color = total === 100 ? '#10b981' : total > 100 ? '#ef4444' : '#f59e0b';
      totalEl.innerHTML = '<span style="color:' + color + ';font-weight:700;">Total: ' +
        total + ' pts ' + (total === 100 ? '✓' : '') + '</span>';
    }
  };

  function patchAdminAssignmentSubmit(form) {
    // Use capture phase so this runs before existing handlers
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();

      adminSyncRubric();

      var fd          = new FormData(form);
      var rubricJson  = (document.getElementById('adminRubricJson') || {}).value || '[]';
      var courseId    = fd.get('courseId');
      var title       = fd.get('title');
      var instructions = fd.get('instructions');
      var dueDate     = fd.get('dueDate');
      var maxPoints   = parseInt(fd.get('maxPoints')) || 100;
      var subType     = fd.get('submissionType') || 'file';

      if (!courseId || !title || !instructions) {
        showToast('Please fill in all required fields', 'error');
        return;
      }

      var sb = window.supabaseClient || window.db;

const { data: { user } } = await sb.auth.getUser();

      var result = await sb.from('assignments').insert({
        course_id:       courseId,
        title:           title,
        instructions:    instructions,
        due_date:        dueDate || null,
        max_points:      maxPoints,
        submission_type: subType,
        grading_rubric:  rubricJson,
        created_by:      user.id,
        created_at:      new Date().toISOString()
      });

      if (result.error) {
        showToast('Error: ' + result.error.message, 'error');
        return;
      }

      closeModal('createAssignmentModal');
      form.reset();

      // Reset rubric
      var rubricRows = document.getElementById('adminRubricRows');
      if (rubricRows) rubricRows.innerHTML = '';
      _adminRubricIdx = 0;
      adminAddRubricRow();

      if (typeof loadAdminAssignments === 'function') loadAdminAssignments();
      showToast('✅ Assignment created with rubric');

    }, true);
  }

  /* ============================================================
     2. PATCH admin grade submission modal
        The admin uses openGradeSubmissionModal(submissionId, maxPoints)
        defined in admin.html inline script.
        We wrap it to inject the AI suggestion panel.
     ============================================================ */
  function patchAdminGradeModal() {
    // Poll until the function exists
    var attempts = 0;
    var timer = setInterval(function () {
      attempts++;
      if (typeof window.openGradeSubmissionModal === 'function' &&
          !window._adminGradePatched) {
        clearInterval(timer);
        wrapAdminGradeModal();
      }
      if (attempts > 40) clearInterval(timer);
    }, 200);
  }

  function wrapAdminGradeModal() {
    window._adminGradePatched = true;
    var original = window.openGradeSubmissionModal;

    window.openGradeSubmissionModal = async function (submissionId, maxPoints) {
      window._adminCurrentSubId  = submissionId;
      window._adminCurrentMaxPts = maxPoints;

      // Run original to open the modal
      original.call(this, submissionId, maxPoints);

      // Give the modal a moment to render, then inject AI panel
      setTimeout(function () {
        injectAdminAIPanel(submissionId, maxPoints);
      }, 150);
    };
  }

  async function injectAdminAIPanel(submissionId, maxPoints) {
    // Find the modal content area — try multiple selectors
    var modal = document.getElementById('gradeSubmissionModal');
    if (!modal) return;

    var content = modal.querySelector('.modal-content');
    if (!content) return;

    // Remove any existing AI panel
    var existing = document.getElementById('adminAIPanel');
    if (existing) existing.parentNode.removeChild(existing);

    // Create the panel
    var panel = document.createElement('div');
    panel.id = 'adminAIPanel';
    panel.style.cssText = 'margin:12px 0;';

    // Insert panel before the first form-group (score input area)
    var firstFormGroup = content.querySelector('.form-group');
    if (firstFormGroup) {
      content.insertBefore(panel, firstFormGroup);
    } else {
      content.appendChild(panel);
    }

    // Show loading state
    panel.innerHTML = loadingHtml();

    // Fetch submission state from Supabase
    var sb = window.supabaseClient || window.db;
    var result = await sb
      .from('assignment_submissions')
      .select('text_response, ai_suggestion, ai_grading_status')
      .eq('id', submissionId)
      .maybeSingle();

    var sub    = result.data;
    if (!sub)  { panel.innerHTML = ''; return; }

    var status  = sub.ai_grading_status || 'pending';
    var hasText = !!(sub.text_response && sub.text_response.trim());
    var hasSug  = !!sub.ai_suggestion;

    /* ── Has suggestion ready ── */
    if (hasSug && status === 'suggested') {
      var sug = sub.ai_suggestion;
      if (typeof sug === 'string') {
        try { sug = JSON.parse(sug); } catch (e) { sug = null; }
      }
      if (sug) {
        renderAdminSuggestion(panel, sug, submissionId, maxPoints);
        return;
      }
    }

    /* ── Already approved ── */
    if (status === 'approved') {
      panel.innerHTML = approvedBannerHtml(submissionId);
      return;
    }

    /* ── Currently analysing ── */
    if (status === 'analysing') {
      panel.innerHTML = analysingHtml();
      pollForSuggestion(submissionId, maxPoints, panel);
      return;
    }

    /* ── Has text, not yet analysed ── */
    if (hasText) {
      panel.innerHTML = getAISuggestionHtml(submissionId);
      return;
    }

    /* ── File only — no text ── */
    panel.innerHTML = fileOnlyHtml();
  }

  /* ----------------------------------------------------------
     RENDER SUGGESTION CARD (admin version)
  ---------------------------------------------------------- */
  function renderAdminSuggestion(panel, sug, submissionId, maxPoints) {
    var conf       = sug.confidence ? Math.round(sug.confidence * 100) : null;
    var confColor  = conf >= 80 ? '#10b981' : conf >= 60 ? '#f59e0b' : '#ef4444';
    var confLabel  = conf >= 80 ? 'High confidence'
                   : conf >= 60 ? 'Moderate — review carefully'
                   : 'Low confidence — review carefully';
    var scoreColor = sug.score >= 80 ? '#10b981'
                   : sug.score >= 60 ? '#f59e0b' : '#ef4444';

    // Build rubric rows HTML
    var rubricHtml = '';
    if (sug.rubricBreakdown && sug.rubricBreakdown.length) {
      rubricHtml = '<div style="padding:12px 16px;border-top:1px solid #e5e7eb;">' +
        '<div style="font-size:11px;font-weight:700;color:#374151;' +
        'text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">' +
        '<i class="fas fa-list-check" style="color:#7c3aed;margin-right:4px;"></i>Rubric Breakdown</div>';

      sug.rubricBreakdown.forEach(function (r) {
        var pct = r.maxScore > 0 ? Math.round((r.score / r.maxScore) * 100) : 0;
        var c   = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
        rubricHtml +=
          '<div style="margin-bottom:8px;">' +
            '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">' +
              '<span style="font-weight:600;color:#374151;">' + escHtml(r.criterion) + '</span>' +
              '<span style="font-weight:700;color:' + c + ';">' + r.score + ' / ' + r.maxScore + '</span>' +
            '</div>' +
            '<div style="height:5px;background:#e5e7eb;border-radius:3px;overflow:hidden;">' +
              '<div style="height:100%;width:' + pct + '%;background:' + c + ';border-radius:3px;"></div>' +
            '</div>' +
            (r.comment ? '<div style="font-size:10px;color:#6b7280;margin-top:2px;font-style:italic;">' + escHtml(r.comment) + '</div>' : '') +
          '</div>';
      });
      rubricHtml += '</div>';
    }

    panel.innerHTML = [
      '<div style="border:2px solid #7c3aed40;border-radius:12px;overflow:hidden;margin-bottom:4px;">',

        // Header
        '<div style="background:linear-gradient(135deg,#f0f4ff,#e8edff);',
          'padding:12px 16px;display:flex;align-items:center;gap:10px;',
          'border-bottom:1px solid #7c3aed20;">',
          '<i class="fas fa-robot" style="color:#7c3aed;font-size:18px;"></i>',
          '<div style="flex:1;">',
            '<div style="font-size:13px;font-weight:800;color:#7c3aed;">AI Grading Suggestion</div>',
            '<div style="font-size:11px;color:#6b7280;">',
              'Review carefully. Your approval is required before any grade is saved.',
            '</div>',
          '</div>',
          conf ? (
            '<div style="text-align:right;">' +
              '<div style="font-size:18px;font-weight:800;color:' + confColor + ';">' + conf + '%</div>' +
              '<div style="font-size:9px;color:' + confColor + ';font-weight:600;">' + confLabel + '</div>' +
            '</div>'
          ) : '',
        '</div>',

        // Score + feedback
        '<div style="padding:14px 16px;background:white;border-bottom:1px solid #e5e7eb;">',
          '<div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;">',
            '<div style="text-align:center;min-width:65px;">',
              '<div style="font-size:30px;font-weight:900;color:' + scoreColor + ';line-height:1;">' + sug.score + '</div>',
              '<div style="font-size:10px;color:#6b7280;">suggested pts</div>',
            '</div>',
            '<div style="text-align:center;min-width:45px;">',
              '<div style="font-size:26px;font-weight:900;color:' + scoreColor + ';line-height:1;">' + escHtml(sug.grade) + '</div>',
              '<div style="font-size:10px;color:#6b7280;">grade</div>',
            '</div>',
            '<div style="flex:1;font-size:12px;color:#374151;line-height:1.6;',
              'padding-left:12px;border-left:2px solid #e5e7eb;">',
              '<strong style="color:#1f2937;display:block;margin-bottom:3px;">Suggested Feedback:</strong>',
              escHtml(sug.feedback || ''),
            '</div>',
          '</div>',
          sug.reasoning ? (
            '<div style="margin-top:10px;padding:7px 10px;background:#f9fafb;border-radius:6px;font-size:11px;color:#6b7280;">' +
              '<i class="fas fa-info-circle" style="margin-right:4px;color:#7c3aed;"></i>' +
              '<strong>Why this score: </strong>' + escHtml(sug.reasoning) +
            '</div>'
          ) : '',
        '</div>',

        // Strengths + improvements
        (sug.strengths || sug.improvements) ? (
          '<div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #e5e7eb;">' +
            (sug.strengths ? (
              '<div style="padding:10px 14px;border-right:1px solid #e5e7eb;background:white;">' +
                '<div style="font-size:10px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">' +
                  '<i class="fas fa-thumbs-up"></i> Strengths' +
                '</div>' +
                '<div style="font-size:11px;color:#166534;line-height:1.5;">' + escHtml(sug.strengths) + '</div>' +
              '</div>'
            ) : '<div></div>') +
            (sug.improvements ? (
              '<div style="padding:10px 14px;background:white;">' +
                '<div style="font-size:10px;font-weight:700;color:#c2410c;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">' +
                  '<i class="fas fa-lightbulb"></i> To Improve' +
                '</div>' +
                '<div style="font-size:11px;color:#9a3412;line-height:1.5;">' + escHtml(sug.improvements) + '</div>' +
              '</div>'
            ) : '<div></div>') +
          '</div>'
        ) : '',

        // Rubric
        rubricHtml,

        // Action buttons
        '<div style="padding:12px 16px;background:#f8faff;display:flex;',
          'align-items:center;gap:8px;flex-wrap:wrap;border-top:1px solid #e5e7eb;">',

          '<button onclick="adminApproveSuggestion(\'' + submissionId + '\',' + maxPoints + ')"',
            'id="adminApproveBtn"',
            'style="padding:9px 16px;background:#10b981;color:white;border:none;',
            'border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;',
            'font-family:inherit;display:flex;align-items:center;gap:6px;">',
            '<i class="fas fa-check-double"></i> Approve Suggestion',
          '</button>',

          '<button onclick="adminPrefillGradeForm(' + sug.score + ',\'' + escHtml(sug.grade) + '\',\'' + (sug.feedback || '').replace(/'/g, "\\'").replace(/\n/g, ' ') + '\')"',
            'style="padding:9px 16px;background:#7c3aed;color:white;border:none;',
            'border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;',
            'font-family:inherit;display:flex;align-items:center;gap:6px;">',
            '<i class="fas fa-edit"></i> Edit & Approve',
          '</button>',

          '<button onclick="adminDiscardSuggestion(\'' + submissionId + '\')"',
            'style="padding:9px 14px;background:white;color:#6b7280;border:1px solid #e5e7eb;',
            'border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;',
            'display:flex;align-items:center;gap:6px;">',
            '<i class="fas fa-times"></i> Discard',
          '</button>',

          '<div style="margin-left:auto;font-size:10px;color:#9ca3af;font-style:italic;">',
            '<i class="fas fa-shield-alt" style="margin-right:3px;"></i>',
            'Grade only saves when you approve.',
          '</div>',
        '</div>',

      '</div>'
    ].join('');
  }

  /* ============================================================
     3. ADMIN ACTION FUNCTIONS (called from buttons in panel)
     ============================================================ */

  window.adminRequestAISuggestion = async function (submissionId) {
    var panel = document.getElementById('adminAIPanel');
    if (!panel) return;
    panel.innerHTML = analysingHtml();

    var result = await AIGrader.analyse(submissionId);
    var maxPts = window._adminCurrentMaxPts || 100;

    if (result.success) {
      renderAdminSuggestion(panel, result.suggestion, submissionId, maxPts);
      showToast('✅ AI suggestion ready — please review before approving.');
    } else if (result.skipped) {
      panel.innerHTML = fileOnlyHtml(result.reason);
    } else {
      panel.innerHTML =
        '<div style="padding:10px 14px;background:#fee2e2;border:1px solid #fca5a5;' +
        'border-radius:10px;font-size:12px;color:#dc2626;display:flex;align-items:center;gap:8px;">' +
          '<i class="fas fa-exclamation-circle"></i>' +
          '<span>AI analysis failed: ' + escHtml(result.error) + '</span>' +
          '<button onclick="adminRequestAISuggestion(\'' + submissionId + '\')"' +
            'style="margin-left:auto;padding:4px 10px;background:#dc2626;color:white;' +
            'border:none;border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit;">Retry</button>' +
        '</div>';
    }
  };

  window.adminApproveSuggestion = async function (submissionId, maxPoints) {
    var btn = document.getElementById('adminApproveBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

    try {
      // Read values from the grade form if admin edited them
      var score    = parseInt((document.getElementById('gradeScoreInput') || {}).value);
      var feedback = ((document.getElementById('gradeFeedbackInput') || {}).value || '').trim();

      var overrides = {};
      if (!isNaN(score))   overrides.score    = score;
      if (feedback)        overrides.feedback  = feedback;

      var result = await AIGrader.approveSuggestion(submissionId, overrides);

      if (result.success) {
        closeModal('gradeSubmissionModal');
        showToast('✅ Grade saved: ' + result.score + ' pts (' + result.grade + ')');
        if (typeof loadAssignmentSubmissionsView === 'function') loadAssignmentSubmissionsView();
        if (typeof loadEligibleStudents === 'function') loadEligibleStudents();
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-double"></i> Approve Suggestion'; }
    }
  };

  window.adminDiscardSuggestion = async function (submissionId) {
    if (!confirm('Discard AI suggestion? You will grade this manually.')) return;
    await AIGrader.discardSuggestion(submissionId);
    var panel = document.getElementById('adminAIPanel');
    if (panel) {
      panel.innerHTML =
        '<div style="padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;' +
        'border-radius:10px;font-size:11px;color:#6b7280;display:flex;align-items:center;gap:6px;">' +
          '<i class="fas fa-pen"></i> Grading manually. Fill in the score and feedback below.' +
        '</div>';
    }
  };

  window.adminPrefillGradeForm = function (score, grade, feedback) {
    var scoreEl    = document.getElementById('gradeScoreInput');
    var feedbackEl = document.getElementById('gradeFeedbackInput');
    if (scoreEl)    scoreEl.value    = score;
    if (feedbackEl) feedbackEl.value = feedback;
  };

  /* ============================================================
     4. AI STATUS BADGES in the submissions table
        Runs after loadAssignmentSubmissionsView renders rows
     ============================================================ */
  function injectAIStatusIntoSubmissionsTable() {
    // Override loadAssignmentSubmissionsView to add badges after render
    var attempts = 0;
    var timer = setInterval(function () {
      attempts++;
      if (typeof window.loadAssignmentSubmissionsView === 'function' &&
          !window._adminAssSubPatched) {
        clearInterval(timer);
        patchAssignmentSubmissionsView();
      }
      if (attempts > 40) clearInterval(timer);
    }, 300);
  }

  function patchAssignmentSubmissionsView() {
    window._adminAssSubPatched = true;
    var original = window.loadAssignmentSubmissionsView;

    window.loadAssignmentSubmissionsView = async function () {
      await original.apply(this, arguments);
      // After the table renders, add AI badges
      setTimeout(addAIBadgesToAdminTable, 300);
    };
  }

  async function addAIBadgesToAdminTable() {
    // Find all grade buttons in the submissions table
    var gradeBtns = document.querySelectorAll(
      '#assignmentSubmissionsViewList button[onclick*="openGradeSubmissionModal"]'
    );
    if (!gradeBtns.length) return;

    // Extract submission IDs from onclick attributes
    var ids = [];
    gradeBtns.forEach(function (btn) {
      var match = btn.getAttribute('onclick').match(/openGradeSubmissionModal\(['"]([^'"]+)['"]/);
      if (match) ids.push(match[1]);
    });
    if (!ids.length) return;

    var sb = window.supabaseClient || window.db;
    var result = await sb
      .from('assignment_submissions')
      .select('id, ai_grading_status, text_response')
      .in('id', ids);

    if (!result.data) return;
    var map = {};
    result.data.forEach(function (s) { map[s.id] = s; });

    gradeBtns.forEach(function (btn) {
      var match = btn.getAttribute('onclick').match(/openGradeSubmissionModal\(['"]([^'"]+)['"]/);
      if (!match) return;
      var sid = match[1];
      var st  = map[sid];
      if (!st) return;

      var cell = btn.closest('td') || btn.parentElement;
      if (!cell || cell.querySelector('.admin-ai-badge')) return;

      var status  = st.ai_grading_status || 'pending';
      var hasText = !!(st.text_response && st.text_response.trim());

      var badge = document.createElement('div');
      badge.className = 'admin-ai-badge';
      badge.style.cssText = 'margin-top:5px;';

      if (status === 'suggested') {
        badge.innerHTML =
          '<span style="display:inline-flex;align-items:center;gap:3px;background:#ede9fe;' +
          'color:#7c3aed;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;cursor:pointer;"' +
          'onclick="' + btn.getAttribute('onclick') + '">' +
          '<i class="fas fa-robot"></i> Suggestion ready ↑</span>';
      } else if (status === 'approved') {
        badge.innerHTML =
          '<span style="display:inline-flex;align-items:center;gap:3px;background:#d1fae5;' +
          'color:#065f46;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">' +
          '<i class="fas fa-check-circle"></i> AI reviewed</span>';
      } else if (hasText && status !== 'analysing' && status !== 'discarded') {
        badge.innerHTML =
          '<span style="display:inline-flex;align-items:center;gap:3px;background:#f3f4f6;' +
          'color:#6b7280;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;' +
          'border:1px solid #e5e7eb;">' +
          '<i class="fas fa-robot"></i> AI available</span>';
      }

      if (badge.innerHTML) cell.appendChild(badge);
    });
  }

  /* ============================================================
     POLLING helper — used when status is 'analysing'
     ============================================================ */
  function pollForSuggestion(submissionId, maxPoints, panel) {
    var sb       = window.supabaseClient || window.db;
    var attempts = 0;
    var timer    = setInterval(async function () {
      attempts++;
      var r = await sb
        .from('assignment_submissions')
        .select('ai_grading_status, ai_suggestion')
        .eq('id', submissionId)
        .maybeSingle();

      if (r.data && r.data.ai_grading_status === 'suggested') {
        clearInterval(timer);
        var sug = r.data.ai_suggestion;
        if (typeof sug === 'string') { try { sug = JSON.parse(sug); } catch (e) { sug = null; } }
        if (sug) renderAdminSuggestion(panel, sug, submissionId, maxPoints);
      }
      if (attempts > 20) clearInterval(timer); // stop after ~60s
    }, 3000);
  }

  /* ============================================================
     HTML SNIPPET HELPERS
     ============================================================ */
  function loadingHtml() {
    return '<div style="padding:10px 14px;background:#f0f4ff;border:1.5px solid #7c3aed30;' +
      'border-radius:10px;display:flex;align-items:center;gap:8px;font-size:12px;color:#7c3aed;">' +
      '<i class="fas fa-spinner fa-spin"></i> Loading AI analysis…</div>';
  }

  function analysingHtml() {
    return '<div style="padding:12px 16px;background:#f0f4ff;border:1.5px solid #7c3aed30;' +
      'border-radius:10px;text-align:center;font-size:12px;color:#7c3aed;">' +
      '<i class="fas fa-spinner fa-spin" style="font-size:20px;display:block;margin-bottom:8px;"></i>' +
      '<strong>Claude AI is reading the submission…</strong><br>' +
      '<span style="color:#6b7280;font-size:11px;">This takes about 5-10 seconds.</span></div>';
  }

  function getAISuggestionHtml(submissionId) {
    return '<div style="padding:12px 16px;background:#f0f4ff;border:1.5px dashed #7c3aed60;' +
      'border-radius:10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
      '<div style="flex:1;">' +
        '<div style="font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:3px;">' +
          '<i class="fas fa-robot" style="margin-right:6px;"></i>AI Grading Assistant' +
        '</div>' +
        '<div style="font-size:11px;color:#6b7280;">Get a suggested score and feedback to review. <strong>You make the final decision.</strong></div>' +
      '</div>' +
      '<button onclick="adminRequestAISuggestion(\'' + submissionId + '\')"' +
        'style="padding:9px 18px;background:#7c3aed;color:white;border:none;border-radius:10px;' +
        'font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;' +
        'display:flex;align-items:center;gap:6px;white-space:nowrap;">' +
        '<i class="fas fa-robot"></i> Get AI Suggestion' +
      '</button>' +
      '</div>';
  }

  function fileOnlyHtml(reason) {
    return '<div style="padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;' +
      'border-radius:10px;font-size:11px;color:#6b7280;display:flex;align-items:center;gap:6px;">' +
      '<i class="fas fa-file-upload"></i> ' +
      (reason || 'File-only submission — AI analysis not available. Please grade manually.') +
      '</div>';
  }

  function approvedBannerHtml(submissionId) {
    return '<div style="padding:10px 14px;background:#d1fae5;border:1.5px solid #6ee7b7;' +
      'border-radius:10px;display:flex;align-items:center;gap:8px;font-size:12px;">' +
      '<i class="fas fa-check-circle" style="color:#10b981;"></i>' +
      '<span style="color:#065f46;font-weight:700;">AI suggestion was reviewed and approved.</span>' +
      '<button onclick="adminRequestAISuggestion(\'' + submissionId + '\')"' +
        'style="margin-left:auto;padding:4px 10px;background:white;color:#6b7280;' +
        'border:1px solid #e5e7eb;border-radius:6px;font-size:10px;cursor:pointer;font-family:inherit;">' +
        '<i class="fas fa-redo"></i> Re-analyse' +
      '</button>' +
      '</div>';
  }

  /* ----------------------------------------------------------
     HELPER — safe HTML escape
  ---------------------------------------------------------- */
  function escHtml(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
  }

})();