/* ============================================================
   AI GRADER  —  ai-grader.js  (Suggestion-Only Mode)

   PHILOSOPHY:
   AI suggests → Teacher reviews → Teacher approves/edits → Grade saved

   The AI NEVER saves a grade to the database.
   It only returns a suggestion for the teacher to review.

   Add to admin.html AND teacher.html before </body>:
     <script src="ai-grader.js"></script>
   ============================================================ */

const AIGrader = (() => {

  const MODEL   = 'claude-sonnet-4-20250514';
  const API_URL = '/.netlify/functions/claude-proxy';
  const MAX_TOKENS = 800;

  /* ----------------------------------------------------------
     CALL CLAUDE
  ---------------------------------------------------------- */
 async function callClaude(systemPrompt, userMessage) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  const response = await fetch(API_URL, {
    method: 'POST',
    signal: controller.signal,
    headers: { 
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  clearTimeout(timeout);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${response.status}`);
  }

  const data  = await response.json();
  const raw   = data.content?.[0]?.text || '';
  const clean = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  return JSON.parse(clean);
}

  /* ----------------------------------------------------------
     BUILD SUGGESTION — calls Claude, returns suggestion object.
     NOTHING is written to the database here.
  ---------------------------------------------------------- */
  async function buildSuggestion(assignmentMeta, submissionText, studentName) {
    const { title, instructions, maxPoints = 100, rubric = [] } = assignmentMeta;

    const rubricText = rubric.length > 0
      ? rubric.map((r, i) =>
          `${i + 1}. ${r.criterion} — ${r.points} pts: ${r.description}`
        ).join('\n')
      : `General quality and completeness (${maxPoints} pts total)`;

    const systemPrompt = `You are a grading assistant for the African School of AI (ASAI).
Your role is to SUGGEST a grade for the teacher to review — the teacher makes the final decision.
Be fair, constructive and culturally sensitive. Many students write in English as a second language.
Respond ONLY with valid JSON — no markdown, no extra text outside the JSON.

Required JSON format:
{
  "score": <integer 0-${maxPoints}>,
  "grade": "<A|B|C|D|F>",
  "feedback": "<2-4 sentence constructive feedback written directly to the student>",
  "strengths": "<1-2 specific things the student did well>",
  "improvements": "<1-2 specific areas the student should improve>",
  "rubricBreakdown": [
    { "criterion": "<name>", "score": <int>, "maxScore": <int>, "comment": "<brief>" }
  ],
  "confidence": <0.0-1.0>,
  "reasoning": "<one sentence explaining why this score was suggested>"
}`;

    const userMessage = `Assignment: ${title}
Instructions: ${instructions}
Max Points: ${maxPoints}

Rubric:
${rubricText}

Student Name: ${studentName}
Student Submission:
---
${submissionText}
---

Provide a grading SUGGESTION for the teacher to review.`;

    return callClaude(systemPrompt, userMessage);
  }

  /* ----------------------------------------------------------
     FETCH ASSIGNMENT META
  ---------------------------------------------------------- */
  async function fetchAssignmentMeta(assignmentId) {
    const sb = window.supabaseClient || window.db;
    const { data, error } = await sb
      .from('assignments')
      .select('title, instructions, max_points, grading_rubric, submission_type')
      .eq('id', assignmentId)
      .maybeSingle();

    if (error || !data) throw new Error('Assignment not found');

    let rubric = [];
    if (data.grading_rubric) {
      try {
        rubric = typeof data.grading_rubric === 'string'
          ? JSON.parse(data.grading_rubric)
          : data.grading_rubric;
      } catch (_) {}
    }

    return {
      title:          data.title,
      instructions:   data.instructions,
      maxPoints:      data.max_points || 100,
      submissionType: data.submission_type,
      rubric
    };
  }

  /* ----------------------------------------------------------
     FETCH SUBMISSION + STUDENT NAME
  ---------------------------------------------------------- */
  async function fetchSubmissionData(submissionId) {
    const sb = window.supabaseClient || window.db;

    const { data: sub } = await sb
      .from('assignment_submissions')
      .select('id, text_response, assignment_id, student_id')
      .eq('id', submissionId)
      .maybeSingle();

    if (!sub) throw new Error('Submission not found');

    let studentName = 'Student';
    if (sub.student_id) {
      const { data: profile } = await sb
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', sub.student_id)
        .maybeSingle();
      if (profile) studentName = `${profile.first_name} ${profile.last_name}`;
    }

    return { ...sub, studentName };
  }

  /* ----------------------------------------------------------
     PUBLIC: analyse(submissionId)

     Fetches submission → calls Claude → saves suggestion to DB
     (status = 'suggested') → returns suggestion for UI display.

     NOTHING is graded. The teacher must call approveSuggestion().
  ---------------------------------------------------------- */
  async function analyse(submissionId) {
    const sb = window.supabaseClient || window.db;

    try {
      const sub = await fetchSubmissionData(submissionId);

      if (!sub.text_response?.trim()) {
        return {
          success: false,
          skipped: true,
          reason:  'No text response — file-only submissions cannot be AI-analysed.'
        };
      }

      const meta = await fetchAssignmentMeta(sub.assignment_id);

      if (meta.submissionType === 'file') {
        return {
          success: false,
          skipped: true,
          reason:  'File-only assignments cannot be AI-graded.'
        };
      }

      // Mark as "analysing" so UI can show a spinner
      await sb.from('assignment_submissions')
        .update({ ai_grading_status: 'analysing' })
        .eq('id', submissionId);

      const suggestion = await buildSuggestion(meta, sub.text_response, sub.studentName);

      // Save suggestion ONLY — no score, no grade, no feedback written yet
      await sb.from('assignment_submissions').update({
        ai_suggestion:     JSON.stringify(suggestion),
        ai_grading_status: 'suggested'   // waiting for teacher to review
      }).eq('id', submissionId);

      return {
        success:     true,
        suggestion,
        meta,
        studentName: sub.studentName
      };

    } catch (err) {
      console.error('AIGrader.analyse error:', err.message);
      await sb.from('assignment_submissions')
      .update({ ai_grading_status: 'failed' })
      .eq('id', submissionId);
      return { success: false, error: err.message };
    }
  }

  /* ----------------------------------------------------------
     PUBLIC: approveSuggestion(submissionId, overrides)

     The ONLY function that writes a grade to the database.
     Called when the teacher clicks "Approve" or "Save Grade".

     overrides = { score, grade, feedback } — teacher's edits.
     If teacher didn't change anything, AI suggestion values are used.
  ---------------------------------------------------------- */
  async function approveSuggestion(submissionId, overrides = {}) {
    const sb = window.supabaseClient || window.db;

    const { data: sub } = await sb
      .from('assignment_submissions')
      .select('ai_suggestion')
      .eq('id', submissionId)
      .maybeSingle();

    if (!sub?.ai_suggestion) {
      throw new Error('No AI suggestion found. Please run AI analysis first.');
    }

    const suggestion = typeof sub.ai_suggestion === 'string'
      ? JSON.parse(sub.ai_suggestion)
      : sub.ai_suggestion;

    // Teacher overrides win — fall back to AI suggestion
    const finalScore    = overrides.score    !== undefined ? overrides.score    : suggestion.score;
    const finalGrade    = overrides.grade    || suggestion.grade;
    const finalFeedback = overrides.feedback || suggestion.feedback;

    const wasEdited = (
      (overrides.score    !== undefined && overrides.score    !== suggestion.score)    ||
      (overrides.grade    && overrides.grade    !== suggestion.grade)    ||
      (overrides.feedback && overrides.feedback !== suggestion.feedback)
    );

    const { error } = await sb.from('assignment_submissions').update({
      score:             finalScore,
      grade:             finalGrade,
      feedback:          finalFeedback,
      ai_feedback:       JSON.stringify({
        strengths:       suggestion.strengths,
        improvements:    suggestion.improvements,
        rubricBreakdown: suggestion.rubricBreakdown,
        confidence:      suggestion.confidence,
        reasoning:       suggestion.reasoning,
        wasEdited,                              // did teacher change anything?
        approvedAt:      new Date().toISOString()
      }),
      ai_grading_status: 'approved',
      graded_by:         'teacher',             // teacher owns the final grade
      graded_at:         new Date().toISOString()
    }).eq('id', submissionId);

    if (error) throw new Error(error.message);

    return { success: true, score: finalScore, grade: finalGrade, wasEdited };
  }

  /* ----------------------------------------------------------
     PUBLIC: discardSuggestion(submissionId)
     Teacher dismisses the suggestion — will grade manually.
  ---------------------------------------------------------- */
  async function discardSuggestion(submissionId) {
    const sb = window.supabaseClient || window.db;
    await sb.from('assignment_submissions').update({
      ai_suggestion:     null,
      ai_grading_status: 'discarded'
    }).eq('id', submissionId);
    return { success: true };
  }

  return { analyse, approveSuggestion, discardSuggestion };

})();