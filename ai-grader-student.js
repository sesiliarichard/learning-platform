/* ============================================================
   AI GRADER — STUDENT SIDE  —  ai-grader-student.js

   What this does:
   - When a student opens the Assignment Feedback modal,
     it enriches the existing modal with AI feedback details
     (strengths, improvements, rubric breakdown).
   - Students NEVER see the AI suggestion — only the final
     approved grade that the teacher confirmed.
   - No buttons, no controls — read-only display only.

   Add to student-dashboard.html before </body>:
     <script src="ai-grader.js"></script>
     <script src="ai-grader-student.js"></script>
   ============================================================ */

(function () {

  /* ----------------------------------------------------------
     Wait for the page to fully load before doing anything
  ---------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function () {
    patchViewAssignmentFeedback();
  });

  /* ----------------------------------------------------------
     PATCH viewAssignmentFeedback
     The original function is defined inline in student-dashboard.html.
     We wait for it to exist, then wrap it.
  ---------------------------------------------------------- */
  function patchViewAssignmentFeedback() {
    // Poll until the original function is available
    var attempts = 0;
    var interval = setInterval(function () {
      attempts++;
      if (typeof window.viewAssignmentFeedback === 'function') {
        clearInterval(interval);
        wrapFeedbackFunction();
      }
      if (attempts > 40) clearInterval(interval); // give up after 8s
    }, 200);
  }

  function wrapFeedbackFunction() {
    var original = window.viewAssignmentFeedback;

    window.viewAssignmentFeedback = async function (assignmentId) {
      // 1. Run the original function first so the modal opens normally
      await original.call(this, assignmentId);

      // 2. Then enrich it with AI feedback details
      await enrichFeedbackModal(assignmentId);
    };
  }

  /* ----------------------------------------------------------
     ENRICH FEEDBACK MODAL
     Reads ai_feedback from the submission and injects
     strengths, improvements and rubric breakdown into
     the existing #rubricBreakdown element.
  ---------------------------------------------------------- */
  async function enrichFeedbackModal(assignmentId) {
    try {
      var sb = window.supabaseClient || window.db;
      if (!sb) return;

      // Get current user
      var authResult = await sb.auth.getUser();
      var user = authResult.data && authResult.data.user;
      if (!user) return;

      // Fetch the submission for this student + assignment
      var result = await sb
        .from('assignment_submissions')
        .select('score, grade, feedback, ai_feedback, ai_grading_status, graded_by, submitted_at')
        .eq('assignment_id', assignmentId)
        .eq('student_id', user.id)
        .maybeSingle();

      var sub = result.data;
      if (!sub) return;

      // Only show AI enrichment if teacher approved an AI suggestion
      var status   = sub.ai_grading_status || '';
      var gradedBy = sub.graded_by || 'manual';

      // Parse ai_feedback
      var aiFeedback = null;
      if (sub.ai_feedback) {
        try {
          aiFeedback = typeof sub.ai_feedback === 'string'
            ? JSON.parse(sub.ai_feedback)
            : sub.ai_feedback;
        } catch (e) {
          aiFeedback = null;
        }
      }

      // Find the rubric container
      var rubricEl = document.getElementById('rubricBreakdown');
      if (!rubricEl) return;

      // Clear placeholder content
      rubricEl.innerHTML = '';

      // ── If no AI feedback exists, show nothing extra ──
      if (!aiFeedback || status !== 'approved') {
        rubricEl.innerHTML = '<p style="font-size:13px;color:#9ca3af;font-style:italic;">' +
          'Detailed rubric breakdown not available for this submission.</p>';
        return;
      }

      // ── Add AI badge to the instructor feedback box ──
      if (gradedBy === 'teacher') {
        var feedbackBox = document.getElementById('instructorFeedback');
        if (feedbackBox) {
          var parent = feedbackBox.closest('.feedback-box') || feedbackBox.parentElement;
          if (parent && !parent.querySelector('.ai-assist-badge')) {
            var badge = document.createElement('div');
            badge.className = 'ai-assist-badge';
            badge.style.cssText = 'display:inline-flex;align-items:center;gap:5px;' +
              'background:#ede9fe;color:#7c3aed;padding:3px 10px;border-radius:20px;' +
              'font-size:11px;font-weight:700;margin-bottom:8px;';
            badge.innerHTML = '<i class="fas fa-robot"></i> AI-assisted grading';
            parent.insertBefore(badge, feedbackBox);
          }
        }
      }

      // ── Strengths & Improvements panels ──
      if (aiFeedback.strengths || aiFeedback.improvements) {
        var siDiv = document.createElement('div');
        siDiv.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;';

        var leftHtml = '';
        var rightHtml = '';

        if (aiFeedback.strengths) {
          leftHtml = '<div style="background:#f0fdf4;border:1.5px solid #bbf7d0;' +
            'border-radius:12px;padding:14px;">' +
            '<div style="font-size:11px;font-weight:700;color:#15803d;' +
            'text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">' +
            '<i class="fas fa-thumbs-up" style="margin-right:4px;"></i>Strengths</div>' +
            '<div style="font-size:13px;color:#166534;line-height:1.6;">' +
            escHtml(aiFeedback.strengths) + '</div></div>';
        }

        if (aiFeedback.improvements) {
          rightHtml = '<div style="background:#fff7ed;border:1.5px solid #fed7aa;' +
            'border-radius:12px;padding:14px;">' +
            '<div style="font-size:11px;font-weight:700;color:#c2410c;' +
            'text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">' +
            '<i class="fas fa-lightbulb" style="margin-right:4px;"></i>To Improve</div>' +
            '<div style="font-size:13px;color:#9a3412;line-height:1.6;">' +
            escHtml(aiFeedback.improvements) + '</div></div>';
        }

        siDiv.innerHTML = leftHtml + rightHtml;
        rubricEl.appendChild(siDiv);
      }

      // ── Rubric breakdown bars ──
      var breakdown = aiFeedback.rubricBreakdown;
      if (breakdown && breakdown.length > 0) {
        var heading = document.createElement('div');
        heading.style.cssText = 'font-size:13px;font-weight:700;color:#374151;margin-bottom:12px;';
        heading.innerHTML = '<i class="fas fa-list-check" style="color:#7c3aed;margin-right:6px;"></i>Rubric Breakdown';
        rubricEl.appendChild(heading);

        breakdown.forEach(function (item) {
          var pct   = item.maxScore > 0 ? Math.round((item.score / item.maxScore) * 100) : 0;
          var color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';

          var row = document.createElement('div');
          row.style.cssText = 'margin-bottom:14px;';
          row.innerHTML =
            '<div style="display:flex;justify-content:space-between;' +
            'align-items:center;margin-bottom:4px;">' +
              '<span style="font-size:13px;font-weight:600;color:#374151;">' +
                escHtml(item.criterion) +
              '</span>' +
              '<span style="font-size:13px;font-weight:800;color:' + color + ';">' +
                item.score + ' / ' + item.maxScore +
              '</span>' +
            '</div>' +
            '<div style="height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden;margin-bottom:4px;">' +
              '<div style="height:100%;width:' + pct + '%;background:' + color + ';' +
                'border-radius:4px;transition:width 0.6s;"></div>' +
            '</div>' +
            (item.comment
              ? '<div style="font-size:12px;color:#6b7280;font-style:italic;">' +
                  escHtml(item.comment) + '</div>'
              : '');
          rubricEl.appendChild(row);
        });
      } else {
        // No rubric breakdown — show simple message
        var noRubric = document.createElement('div');
        noRubric.style.cssText = 'font-size:13px;color:#9ca3af;font-style:italic;padding:8px 0;';
        noRubric.textContent = 'No detailed rubric breakdown available.';
        rubricEl.appendChild(noRubric);
      }

      // ── Confidence indicator (subtle, at the bottom) ──
      if (aiFeedback.confidence !== undefined) {
        var conf      = Math.round(aiFeedback.confidence * 100);
        var confColor = conf >= 80 ? '#10b981' : conf >= 60 ? '#f59e0b' : '#6b7280';
        var confNote  = conf >= 80
          ? 'High confidence grade.'
          : conf >= 60
          ? 'Teacher reviewed and approved this grade.'
          : 'Teacher carefully reviewed this grade.';

        var confEl = document.createElement('div');
        confEl.style.cssText = 'margin-top:16px;padding:10px 14px;background:#f9fafb;' +
          'border-radius:10px;border:1px solid #e5e7eb;';
        confEl.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:space-between;' +
          'font-size:11px;color:#9ca3af;margin-bottom:5px;">' +
            '<span><i class="fas fa-robot" style="margin-right:4px;color:#7c3aed;"></i>' +
            'AI analysis confidence</span>' +
            '<span style="font-weight:700;color:' + confColor + ';">' + conf + '%</span>' +
          '</div>' +
          '<div style="height:4px;background:#e5e7eb;border-radius:2px;overflow:hidden;">' +
            '<div style="height:100%;width:' + conf + '%;background:' + confColor + ';border-radius:2px;"></div>' +
          '</div>' +
          '<div style="font-size:10px;color:#d1d5db;margin-top:5px;">' + confNote + '</div>';
        rubricEl.appendChild(confEl);
      }

    } catch (err) {
      console.warn('ai-grader-student: enrichFeedbackModal error —', err.message);
    }
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