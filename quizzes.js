// ============================================
// ASAI — QUIZZES.JS  (FIXED VERSION)
// Fixes:
//  1. getQuizResults crashes when submission is null (first view)
//  2. viewQuizResults was called but never defined
//  3. Admin score shows 0% due to bad column selects
// ============================================

function getDB() {
    return window.supabaseClient || window.db;
}

// ─────────────────────────────────────────────
// 1. CREATE QUIZ (Admin only)
// ─────────────────────────────────────────────
async function createQuiz({ title, courseId, timeLimit, questions }) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        if (!title?.trim())          throw new Error('Quiz title is required');
        if (!courseId)               throw new Error('Course is required');
        if (!questions || questions.length === 0) throw new Error('At least one question is required');

        const { data: quizRows, error: quizError } = await supabaseClient
            .from('quizzes')
            .insert({
                course_id:   courseId,
                title:       title.trim(),
                time_limit:  timeLimit || null,
                created_by:  user.id,
                created_at:  new Date().toISOString()
            })
            .select();

        if (quizError) throw quizError;
        const quiz = quizRows?.[0];
        if (!quiz?.id) throw new Error('Quiz ID not returned. Check RLS on quizzes table.');

        const questionsToInsert = questions.map((q, index) => ({
            quiz_id:        quiz.id,
            question_text:  q.question,
            question_type:  q.type,
            options:        q.options || [],
            correct_answer: q.correctAnswer,
            points:         q.points || 1,
            order_number:   index + 1
        }));

        const { error: questionsError } = await supabaseClient
            .from('quiz_questions')
            .insert(questionsToInsert);

        if (questionsError) throw questionsError;

        return { success: true, quiz: quiz, message: 'Quiz created successfully!' };

    } catch (error) {
        console.error('❌ createQuiz error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 2. GET QUIZZES FOR A COURSE
// ─────────────────────────────────────────────
async function getCourseQuizzes(courseId) {
    try {
        // ── Step 1: get current user safely ──────────────
        const { data: authData, error: authError } = await supabaseClient
            .auth.getUser();

        if (authError || !authData?.user) {
            console.error('getCourseQuizzes: not authenticated');
            return { success: false, error: 'Not authenticated', quizzes: [] };
        }

        const userId = authData.user.id;

        if (!userId) {
            console.error('getCourseQuizzes: userId is undefined');
            return { success: false, error: 'User ID missing', quizzes: [] };
        }

        if (!courseId) {
            console.error('getCourseQuizzes: courseId is undefined');
            return { success: false, error: 'Course ID missing', quizzes: [] };
        }

        // ── Step 2: fetch quizzes ─────────────────────────
        const { data, error } = await supabaseClient
            .from('quizzes')
            .select(`
                id,
                title,
                time_limit,
                created_at,
                quiz_questions (count)
            `)
            .eq('course_id', courseId)
            .eq('published', true)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('getCourseQuizzes fetch error:', error.message);
            throw error;
        }

        console.log('✅ Quizzes fetched:', data?.length, 'for course:', courseId);

        if (!data || data.length === 0) {
            return { success: true, quizzes: [] };
        }

        // ── Step 3: fetch student submissions separately ──
       const publishedQuizIds = (data || []).map(q => q.id);

        const { data: mySubmissions, error: subError } = await supabaseClient
            .from('quiz_submissions')
            .select('quiz_id, score, correct_answers, total_questions')
            .eq('student_id', userId)
            .in('quiz_id', publishedQuizIds.length > 0 ? publishedQuizIds : ['00000000-0000-0000-0000-000000000000']);

        if (subError) {
            console.warn('Could not fetch submissions:', subError.message);
            // Don't throw — just continue without submission data
        }

        const submittedMap = {};
        (mySubmissions || []).forEach(s => {
            submittedMap[s.quiz_id] = {
                score:           s.score,
                correct_answers: s.correct_answers,
                total_questions: s.total_questions
            };
        });

        // ── Step 4: build quiz objects ────────────────────
        const quizzes = (data || []).map(quiz => {
            const sub = submittedMap[quiz.id];
            return {
                id:              quiz.id,
                title:           quiz.title,
                timeLimit:       quiz.time_limit,
                questionCount:   quiz.quiz_questions?.[0]?.count || 0,
                createdAt:       quiz.created_at,
                status:          sub ? 'completed' : 'pending',
                score:           sub?.score ?? null,
                correct_answers: sub?.correct_answers ?? null,
                total_questions: sub?.total_questions ?? null
            };
        });

        return { success: true, quizzes };

    } catch (error) {
        console.error('❌ getCourseQuizzes error:', error.message);
        return { success: false, error: error.message, quizzes: [] };
    }
}
// ─────────────────────────────────────────────
// 3. GET SINGLE QUIZ WITH QUESTIONS
// ─────────────────────────────────────────────
async function getQuizById(quizId) {
    try {
        const { data: quiz, error: quizError } = await supabaseClient
            .from('quizzes')
            .select(`id, course_id, title, time_limit, created_at`)
            .eq('id', quizId)
            .maybeSingle();

        if (quizError) throw quizError;

        const { data: questions, error: questionsError } = await supabaseClient
            .from('quiz_questions')
            .select('*')
            .eq('quiz_id', quizId)
            .order('order_number', { ascending: true });

        if (questionsError) throw questionsError;

        const { data: { user } } = await supabaseClient.auth.getUser();
        let submission = null;

        if (user) {
            const { data: existingSubmission } = await supabaseClient
                .from('quiz_submissions')
                .select('id, score, submitted_at')
                .eq('quiz_id', quizId)
                .eq('student_id', user.id)
                .maybeSingle();
            submission = existingSubmission || null;
        }

        return { success: true, quiz: quiz, questions: questions || [], submission: submission };

    } catch (error) {
        console.error('❌ getQuizById error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 4. SUBMIT QUIZ ANSWERS
// ─────────────────────────────────────────────
async function submitQuiz(quizId, answers, timeSpent) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data: existing } = await supabaseClient
            .from('quiz_submissions')
            .select('id')
            .eq('quiz_id', quizId)
            .eq('student_id', user.id)
            .maybeSingle();

        if (existing && existing.id) {
            return { success: false, error: 'You have already submitted this quiz' };
        }

        const { data: questions, error: questionsError } = await supabaseClient
            .from('quiz_questions')
            .select('*')
            .eq('quiz_id', quizId);

        if (questionsError) throw questionsError;

        let correctCount = 0;
        const results = questions.map(q => {
            const studentAnswer = answers[q.id];
            let isCorrect = false;

            if (q.question_type === 'multiple') {
                isCorrect = Number(studentAnswer) === Number(q.correct_answer);
            } else if (q.question_type === 'truefalse') {
                const toBool = v => {
                    if (typeof v === 'boolean') return v;
                    if (v === 1 || v === '1') return true;
                    if (v === 0 || v === '0') return false;
                    return String(v).toLowerCase().trim() === 'true';
                };
                isCorrect = toBool(studentAnswer) === toBool(q.correct_answer);
            }
            if (isCorrect === true) correctCount++;

            return {
                questionId:    q.id,
                questionText:  q.question_text,
                studentAnswer: studentAnswer,
                correctAnswer: q.correct_answer,
                isCorrect:     isCorrect,
                points:        q.points
            };
        });

        const totalQuestions = questions.length;
        // ── FIX: store both raw correct count AND percentage ──
        const score          = Math.round((correctCount / totalQuestions) * 100);
        const correctAnswers = correctCount;
        const totalPossible  = totalQuestions;

        const { data: quiz } = await supabaseClient
            .from('quizzes')
            .select('course_id')
            .eq('id', quizId)
            .maybeSingle();

        const { data: submission, error: submitError } = await supabaseClient
            .from('quiz_submissions')
            .insert({
                student_id:      user.id,
                quiz_id:         quizId,
                course_id:       quiz?.course_id,
                score:           score,           // percentage 0-100
                correct_answers: correctAnswers,  // raw count e.g. 8
                total_questions: totalPossible,   // total e.g. 10
                answers:         JSON.stringify(answers),
                time_spent:      timeSpent,
                submitted_at:    new Date().toISOString()
            })
            .select()
            .maybeSingle();

        if (submitError) throw submitError;

        return {
            success:    true,
            submission: submission,
            score:      score,
            correct:    correctAnswers,
            total:      totalPossible,
            results:    results,
            message:    `Quiz submitted! You got ${correctAnswers}/${totalPossible} correct (${score}%)`
        };

    } catch (error) {
        console.error('❌ submitQuiz error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 5. GET QUIZ RESULTS  ← FIXED: null-safe
// ─────────────────────────────────────────────
async function getQuizResults(quizId, studentId = null) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const id = studentId || user.id;

        // ── Step 1: fetch submission ──
        const { data: submission, error: submissionError } = await supabaseClient
            .from('quiz_submissions')
            //  specify the FK explicitly
    .select(`
    id, score, answers, time_spent, submitted_at,
    correct_answers, total_questions
    `)
            
            .eq('quiz_id', quizId)
            .eq('student_id', id)
            .maybeSingle();

        if (submissionError) throw submissionError;

        // ── FIX: submission might be null if not yet submitted ──
        if (!submission) {
            return {
                success:    false,
                error:      'No submission found. Please complete the quiz first.',
                notFound:   true
            };
        }

        // ── Step 2: fetch quiz ──
        const { data: quiz, error: quizError } = await supabaseClient
            .from('quizzes')
            .select('title, time_limit')
            .eq('id', quizId)
            .maybeSingle();

        if (quizError) throw quizError;

        // ── Step 3: fetch questions ──
        const { data: questions, error: questionsError } = await supabaseClient
            .from('quiz_questions')
            .select('*')
            .eq('quiz_id', quizId)
            .order('order_number', { ascending: true });

        if (questionsError) throw questionsError;

        // ── Step 4: parse answers safely ──
        let parsedAnswers = {};
        try {
            parsedAnswers = typeof submission.answers === 'string'
                ? JSON.parse(submission.answers)
                : (submission.answers || {});
        } catch(e) {
            parsedAnswers = {};
        }

        // ── Step 5: build results ──
        const results = (questions || []).map(q => {
            const studentAnswer = parsedAnswers[q.id];
            let isCorrect = false;

            if (q.question_type === 'multiple') {
                isCorrect = Number(studentAnswer) === Number(q.correct_answer);
            } else if (q.question_type === 'truefalse') {
                const toBool = v => {
                    if (typeof v === 'boolean') return v;
                    if (v === 1 || v === '1') return true;
                    if (v === 0 || v === '0') return false;
                    return String(v).toLowerCase().trim() === 'true';
                };
                isCorrect = toBool(studentAnswer) === toBool(q.correct_answer);
            }

            return {
                questionText:  q.question_text,
                questionType:  q.question_type,
                options:       q.options,
                studentAnswer: studentAnswer,
                correctAnswer: q.correct_answer,
                isCorrect:     isCorrect,
                points:        q.points || 1
            };
        });

        // ── Step 6: recalculate score from results (fixes old broken submissions) ──
        const recalcCorrect = results.filter(r => r.isCorrect === true).length;
        const recalcTotal   = questions.length;
        const recalcScore   = recalcTotal > 0
            ? Math.round((recalcCorrect / recalcTotal) * 100)
            : 0;

        // ── FIX: if DB stored 0 but recalc says higher, update the DB ──
        if (submission.score === 0 && recalcScore > 0) {
            supabaseClient
                .from('quiz_submissions')
                .update({
                    score:           recalcScore,
                    correct_answers: recalcCorrect,
                    total_questions: recalcTotal
                })
                .eq('id', submission.id)
                .then(() => console.log('✅ Score auto-corrected in DB'));
        }

        return {
            success:    true,
            quiz:       quiz,
            submission: {
                score:          recalcScore,
                correct:        recalcCorrect,
                total:          recalcTotal,
                scoreDisplay:   `${recalcCorrect} / ${recalcTotal}`,  // e.g. "8 / 10"
                timeSpent:      submission.time_spent,
                submittedAt:    submission.submitted_at,
                student:        submission.profiles
            },
            results: results
        };

    } catch (error) {
        console.error('❌ getQuizResults error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// VIEW QUIZ RESULTS MODAL  ← NEW: was missing
// ─────────────────────────────────────────────
window.viewQuizResults = async function(quizId) {
    // Show loading overlay
    const overlay = document.createElement('div');
    overlay.id = 'resultsOverlay';
    overlay.style.cssText = `
        position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.85);z-index:9999;
        display:flex;align-items:center;justify-content:center;
        padding:20px;backdrop-filter:blur(4px);`;
    overlay.innerHTML = `
        <div style="background:white;border-radius:20px;padding:40px;text-align:center;color:#6b7280;">
            <i class="fas fa-spinner fa-spin" style="font-size:32px;color:#7c3aed;display:block;margin-bottom:14px;"></i>
            Loading your results...
        </div>`;
    document.body.appendChild(overlay);

    const result = await getQuizResults(quizId);

    // ── FIX: handle null submission gracefully ──
    if (!result.success) {
        overlay.innerHTML = `
            <div style="background:white;border-radius:20px;padding:40px;text-align:center;max-width:420px;width:100%;">
                <i class="fas fa-exclamation-circle" style="font-size:48px;color:#ef4444;display:block;margin-bottom:14px;"></i>
                <div style="font-size:18px;font-weight:800;color:#1f2937;margin-bottom:8px;">
                    ${result.notFound ? 'No Submission Found' : 'Could not load results'}
                </div>
                <div style="color:#6b7280;font-size:14px;margin-bottom:24px;">${result.error}</div>
                <button onclick="document.getElementById('resultsOverlay').remove()"
                    style="padding:12px 28px;background:#7c3aed;border:none;border-radius:12px;
                           color:white;font-weight:700;cursor:pointer;font-size:14px;">
                    Close
                </button>
            </div>`;
        return;
    }

    const { quiz, submission, results } = result;
    const scoreColor = submission.score >= 70 ? '#10b981' : submission.score >= 50 ? '#f59e0b' : '#ef4444';
    const passed     = submission.score >= 70;
    const date       = new Date(submission.submittedAt).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric'
    });
    const timeStr = submission.timeSpent
        ? `${Math.floor(submission.timeSpent / 60)}m ${submission.timeSpent % 60}s`
        : '—';

    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

    const questionsHTML = results.map((r, i) => {
        const opts = Array.isArray(r.options) && r.options.length > 0 ? r.options : null;

        // Format student answer for display
        let studentAnsDisplay = '—';
        let correctAnsDisplay = '—';

        if (r.questionType === 'multiple' && opts) {
            const sIdx = Number(r.studentAnswer);
            const cIdx = Number(r.correctAnswer);
            studentAnsDisplay = (opts[sIdx] !== undefined) ? `${letters[sIdx]}. ${opts[sIdx]}` : '(no answer)';
            correctAnsDisplay = (opts[cIdx] !== undefined) ? `${letters[cIdx]}. ${opts[cIdx]}` : '?';
        } else if (r.questionType === 'truefalse') {
            const toBool = v => {
                if (typeof v === 'boolean') return v;
                return String(v).toLowerCase().trim() === 'true';
            };
            studentAnsDisplay = r.studentAnswer !== undefined ? (toBool(r.studentAnswer) ? 'True' : 'False') : '(no answer)';
            correctAnsDisplay = toBool(r.correctAnswer) ? 'True' : 'False';
        } else {
            studentAnsDisplay = r.studentAnswer || '(no answer)';
            correctAnsDisplay = 'Open-ended';
        }

        const bgColor     = r.isCorrect ? '#f0fdf4' : (r.studentAnswer === undefined ? '#fafafa' : '#fff5f5');
        const borderColor = r.isCorrect ? '#10b981' : (r.studentAnswer === undefined ? '#e5e7eb' : '#ef4444');
        const icon        = r.isCorrect ? '✅' : (r.studentAnswer === undefined ? '⬜' : '❌');

        return `
            <div style="background:${bgColor};border:2px solid ${borderColor};border-radius:14px;
                        padding:18px 20px;margin-bottom:14px;">
                <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;">
                    <span style="font-size:18px;flex-shrink:0;">${icon}</span>
                    <div>
                        <div style="font-size:13px;font-weight:700;color:#9ca3af;text-transform:uppercase;
                                    letter-spacing:1px;margin-bottom:4px;">Question ${i + 1}</div>
                        <div style="font-size:15px;font-weight:600;color:#1f2937;line-height:1.5;">
                            ${r.questionText}
                        </div>
                    </div>
                </div>

                ${opts ? `
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;">
                    ${opts.map((opt, oi) => {
                        const isStudentChoice = Number(r.studentAnswer) === oi;
                        const isCorrectChoice = Number(r.correctAnswer) === oi;
                        let optBg = '#f9fafb', optBorder = '#e5e7eb', optColor = '#374151';
                        if (isCorrectChoice)  { optBg = '#d1fae5'; optBorder = '#10b981'; optColor = '#065f46'; }
                        if (isStudentChoice && !isCorrectChoice) { optBg = '#fee2e2'; optBorder = '#ef4444'; optColor = '#991b1b'; }
                        return `<div style="background:${optBg};border:1.5px solid ${optBorder};
                                            border-radius:8px;padding:8px 12px;font-size:13px;color:${optColor};
                                            display:flex;align-items:center;gap:6px;">
                            <span style="font-weight:700;flex-shrink:0;">${letters[oi]}.</span> ${opt}
                            ${isStudentChoice && !isCorrectChoice ? ' <span style="margin-left:auto;">❌</span>' : ''}
                            ${isCorrectChoice ? ' <span style="margin-left:auto;">✓</span>' : ''}
                        </div>`;
                    }).join('')}
                </div>` : `
                <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;">
                    <div style="background:#f9fafb;border-radius:8px;padding:8px 14px;font-size:13px;color:#374151;">
                        <strong>Your answer:</strong> ${studentAnsDisplay}
                    </div>
                    <div style="background:#d1fae5;border-radius:8px;padding:8px 14px;font-size:13px;color:#065f46;">
                        <strong>Correct:</strong> ${correctAnsDisplay}
                    </div>
                </div>`}

                <div style="display:flex;justify-content:space-between;align-items:center;
                            font-size:12px;color:#6b7280;padding-top:10px;border-top:1px solid ${borderColor}30;">
                    <span>${r.questionType === 'multiple' ? 'Multiple Choice' : r.questionType === 'truefalse' ? 'True / False' : 'Short Answer'}</span>
                    <span style="font-weight:700;color:${r.isCorrect ? '#10b981' : '#ef4444'};">
                        ${r.isCorrect ? `+${r.points} pt${r.points !== 1 ? 's' : ''}` : '0 pts'}
                    </span>
                </div>
            </div>`;
    }).join('');

    overlay.innerHTML = `
        <div style="background:#f8f7ff;border-radius:24px;width:100%;max-width:720px;
                    max-height:93vh;overflow:hidden;display:flex;flex-direction:column;
                    box-shadow:0 30px 80px rgba(0,0,0,0.35);">

            <!-- Header -->
            <div style="background:linear-gradient(135deg,#7c3aed,#5b21b6);
                        padding:26px 28px;color:white;flex-shrink:0;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                    <div>
                        <div style="font-size:11px;font-weight:700;letter-spacing:2px;
                                    opacity:0.75;text-transform:uppercase;margin-bottom:5px;">
                            Quiz Results
                        </div>
                        <div style="font-size:20px;font-weight:800;">${quiz?.title || 'Quiz'}</div>
                        <div style="font-size:12px;opacity:0.75;margin-top:4px;">
                            Submitted ${date} • Time: ${timeStr}
                        </div>
                    </div>
                    <button onclick="document.getElementById('resultsOverlay').remove()"
                            style="background:rgba(255,255,255,0.2);border:none;color:white;
                                   width:38px;height:38px;border-radius:50%;cursor:pointer;
                                   font-size:16px;display:flex;align-items:center;justify-content:center;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <!-- Score summary bar -->
                <div style="margin-top:20px;background:rgba(255,255,255,0.15);
                            border-radius:16px;padding:18px 20px;
                            display:flex;align-items:center;gap:24px;flex-wrap:wrap;">
                    <!-- Big score -->
                    <div style="text-align:center;flex-shrink:0;">
                        <div style="font-size:52px;font-weight:900;line-height:1;
                                    color:${submission.score >= 70 ? '#86efac' : submission.score >= 50 ? '#fde68a' : '#fca5a5'};">
                            ${submission.score}%
                        </div>
                        <div style="font-size:12px;opacity:0.8;margin-top:4px;">Overall Score</div>
                    </div>

                    <div style="flex:1;display:flex;flex-direction:column;gap:10px;min-width:160px;">
                        <!-- Correct / Total -->
                        <div style="display:flex;align-items:center;justify-content:space-between;">
                            <span style="font-size:13px;opacity:0.85;">Correct answers</span>
                            <span style="font-size:18px;font-weight:800;">
                                ${submission.correct} <span style="font-size:13px;opacity:0.7;">/ ${submission.total}</span>
                            </span>
                        </div>
                        <!-- Progress bar -->
                        <div style="background:rgba(255,255,255,0.2);height:8px;border-radius:4px;">
                            <div style="height:100%;width:${submission.score}%;
                                        background:${submission.score >= 70 ? '#86efac' : submission.score >= 50 ? '#fde68a' : '#fca5a5'};
                                        border-radius:4px;transition:width 1s;"></div>
                        </div>
                        <!-- Pass/Fail badge -->
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <span style="background:${passed ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'};
                                         padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;">
                                ${passed ? '🎉 Passed' : '📚 Keep Practicing'}
                            </span>
                            <span style="background:rgba(255,255,255,0.15);padding:4px 14px;
                                         border-radius:20px;font-size:12px;">
                                Passing: 70%
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Questions scroll area -->
            <div style="overflow-y:auto;padding:24px 28px;flex:1;">
                <div style="font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;
                            letter-spacing:1px;margin-bottom:16px;">
                    Question Breakdown
                </div>
                ${questionsHTML}
            </div>

            <!-- Footer -->
            <div style="padding:16px 28px;background:white;border-top:2px solid #f3f4f6;
                        display:flex;gap:10px;flex-shrink:0;">
                <button onclick="document.getElementById('resultsOverlay').remove()"
                        style="flex:1;padding:13px;border:2px solid #e5e7eb;border-radius:12px;
                               background:white;color:#374151;font-weight:700;cursor:pointer;
                               font-family:inherit;font-size:14px;">
                    Close
                </button>
            </div>
        </div>`;
};

// ─────────────────────────────────────────────
// 6. GET ALL QUIZ SUBMISSIONS (Admin only)
// ─────────────────────────────────────────────
async function getAllQuizSubmissions() {
    try {
        // ── Get student IDs only — exclude admin/teacher submissions ──
        const { data: studentProfiles } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('role', 'student');

        const studentIds = (studentProfiles || []).map(p => p.id);

        const { data, error } = await supabaseClient
    .from('quiz_submissions')
    .select(`
        id, score, submitted_at, time_spent,
        correct_answers, total_questions, student_id,
        quizzes (title, courses (title))
    `)
    .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000'])
    .order('submitted_at', { ascending: false });

if (error) throw error;

// Fetch profiles SEPARATELY using student_id directly
const allStudentIds = [...new Set((data || []).map(s => s.student_id).filter(Boolean))];
const { data: profileRows } = await supabaseClient
    .from('profiles')
    .select('id, first_name, last_name, email, role')
    .in('id', allStudentIds);

const profileMap = {};
(profileRows || []).forEach(p => { profileMap[p.id] = p; });

        if (error) throw error;

        const submissions = (data || [])
            // Double-check role in case of data inconsistency
            .filter(sub => !sub.profiles?.role || sub.profiles.role === 'student')
            .map(sub => {
            // ── FIX: null-safe profile/quiz access ──
            const profile    = profileMap[sub.student_id] || {};
                const firstName  = profile.first_name || 'Unknown';
                const lastName   = profile.last_name  || '';
const email      = profile.email      || '—';
            const quizTitle  = sub.quizzes?.title       || 'Unknown Quiz';
            const courseTitle = sub.quizzes?.courses?.title || 'Unknown Course';

            // Score display: "8 / 10 (80%)" if we have raw counts, else just "%"
            const scoreDisplay = (sub.correct_answers != null && sub.total_questions != null)
                ? `${sub.correct_answers} / ${sub.total_questions} (${sub.score}%)`
                : `${sub.score ?? 0}%`;

            return {
                id:           sub.id,
                studentName:  `${firstName} ${lastName}`.trim(),
                studentEmail: email,
                quizTitle:    quizTitle,
                courseTitle:  courseTitle,
                score:        sub.score ?? 0,
                correctAnswers: sub.correct_answers,
                totalQuestions: sub.total_questions,
                scoreDisplay: scoreDisplay,
                submittedAt:  sub.submitted_at,
                timeSpent:    sub.time_spent
            };
        });

        return { success: true, submissions };

    } catch (error) {
        console.error('❌ getAllQuizSubmissions error:', error.message);
        return { success: false, error: error.message, submissions: [] };
    }
}

// ─────────────────────────────────────────────
// 7. DELETE QUIZ (Admin only)
// ─────────────────────────────────────────────
async function deleteQuizFromDB(quizId) {
    try {
        // Get course_id before deleting
        const { data: quizData } = await supabaseClient
            .from('quizzes')
            .select('course_id')
            .eq('id', quizId)
            .maybeSingle();

        const courseId = quizData?.course_id;

        // Get all student IDs who submitted this quiz
        const { data: subs } = await supabaseClient
            .from('quiz_submissions')
            .select('student_id')
            .eq('quiz_id', quizId);

        const studentIds = [...new Set((subs || []).map(s => s.student_id))];

        // Delete questions
        const { error: questionsError } = await supabaseClient
            .from('quiz_questions').delete().eq('quiz_id', quizId);
        if (questionsError) throw questionsError;

        // Delete submissions
        const { error: submissionsError } = await supabaseClient
            .from('quiz_submissions').delete().eq('quiz_id', quizId);
        if (submissionsError) throw submissionsError;

        // Delete quiz
        const { error: quizError } = await supabaseClient
            .from('quizzes').delete().eq('id', quizId);
        if (quizError) throw quizError;

        // Recalculate and update progress for affected students
        if (courseId && studentIds.length > 0) {
            for (const studentId of studentIds) {
                if (typeof syncCourseProgressToDB === 'function') {
                    await syncCourseProgressToDB(studentId, courseId);
                } else {
                    // Fallback: delete progress records for this course
                    await supabaseClient
                        .from('course_progress')
                        .delete()
                        .eq('student_id', studentId)
                        .eq('course_id', courseId);
                }
            }
        }

        return { success: true, message: 'Quiz deleted successfully!' };

    } catch (error) {
        console.error('❌ deleteQuiz error:', error.message);
        return { success: false, error: error.message };
    }
}
// ─────────────────────────────────────────────
// QUIZ DETAIL MODAL (View Questions preview)
// ─────────────────────────────────────────────
async function openQuizDetail(quizId) {
    const backdrop = document.getElementById('quizDetailModal');
    const body     = document.getElementById('quizDetailBody');
    if (!backdrop || !body) return;

    window._qdmQuizId = quizId;
    backdrop.classList.add('qdm-active');
    body.innerHTML = '<div class="qdm-loading"><div class="qdm-spinner"></div><span>Loading quiz...</span></div>';

    const result = await getQuizById(quizId);

    if (!result.success) {
        body.innerHTML = `<div class="qdm-error"><i class="fas fa-exclamation-circle"></i> ${result.error}</div>`;
        return;
    }

    const { quiz, questions, submission } = result;

    document.getElementById('quizDetailTitle').textContent = quiz.title;
    document.getElementById('quizDetailPills').innerHTML = `
        <span class="qdm-pill"><i class="fas fa-list-ol"></i> ${questions.length} Questions</span>
        ${quiz.time_limit ? `<span class="qdm-pill"><i class="fas fa-clock"></i> ${quiz.time_limit} mins</span>` : ''}
        ${submission
            ? `<span class="qdm-pill"><i class="fas fa-check-circle"></i> Submitted — ${submission.score}%</span>`
            : '<span class="qdm-pill"><i class="fas fa-hourglass-half"></i> Not attempted</span>'}
    `;

    const btn = document.getElementById('quizDetailActionBtn');
    if (submission) {
        btn.textContent = '✓ Already Submitted';
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor  = 'not-allowed';
    } else {
        btn.textContent = '▶ Start Quiz';
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor  = '';
    }

    const typeLabels = { multiple: 'Multiple Choice', truefalse: 'True / False', short: 'Short Answer', essay: 'Essay' };
    const typeClass  = { multiple: 'qdm-type-multiple', truefalse: 'qdm-type-truefalse', short: 'qdm-type-short', essay: 'qdm-type-essay' };
    const letters    = ['A','B','C','D','E','F'];

    body.innerHTML = questions.length === 0
        ? '<div class="qdm-error">No questions found for this quiz.</div>'
        : questions.map((q, i) => {
            const opts = Array.isArray(q.options) && q.options.length
                ? `<div class="qdm-options">${q.options.map((o, oi) => `
                    <div class="qdm-opt">
                        <div class="qdm-opt-letter">${letters[oi] || oi+1}</div>
                        <span>${o}</span>
                    </div>`).join('')}</div>`
                : q.question_type === 'truefalse'
                ? `<div class="qdm-options">
                    <div class="qdm-opt"><div class="qdm-opt-letter">A</div><span>True</span></div>
                    <div class="qdm-opt"><div class="qdm-opt-letter">B</div><span>False</span></div>
                   </div>`
                : `<div style="margin-top:10px;font-size:13px;color:#9ca3af;font-style:italic;">Written response required</div>`;

            return `<div class="qdm-q-card">
                <div class="qdm-q-top">
                    <div class="qdm-q-num">${i+1}</div>
                    <div class="qdm-q-text">${q.question_text}</div>
                    <span class="qdm-type-badge ${typeClass[q.question_type] || 'qdm-type-short'}">${typeLabels[q.question_type] || q.question_type}</span>
                </div>
                ${opts}
            </div>`;
        }).join('');
}

function closeQuizDetailModal() {
    document.getElementById('quizDetailModal')?.classList.remove('qdm-active');
}

function quizDetailStartQuiz() {
    closeQuizDetailModal();
    if (window._qdmQuizId) startQuiz(window._qdmQuizId);
}

// ─────────────────────────────────────────────
// RENDER QUIZ CARDS IN STUDENT DASHBOARD
// ─────────────────────────────────────────────
async function loadCourseQuizzesUI(courseId) {
    const container = document.getElementById('courseQuizzesGrid');

    if (container) {
        container.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:40px;color:#9ca3af;">
                <i class="fas fa-spinner fa-spin" style="font-size:28px;color:#7c3aed;
                   display:block;margin-bottom:12px;"></i>
                Loading quizzes...
            </div>`;
    }

    const result = await getCourseQuizzes(courseId);

    console.log('Quizzes result:', result);

    if (!result.success) {
        if (container) {
            container.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:40px;color:#ef4444;">
                    <i class="fas fa-exclamation-circle" style="font-size:28px;
                       display:block;margin-bottom:12px;"></i>
                    Error loading quizzes: ${result.error}
                </div>`;
        }
        return;
    }

    console.log('Quizzes to render:', result.quizzes.length);
    renderQuizzesInUI(result.quizzes);
}

function renderQuizzesInUI(quizzes) {
    const container = document.getElementById('courseQuizzesGrid') || document.getElementById('quizzesList');
    if (!container) return;

    if (quizzes.length === 0) {
        container.innerHTML = `
            <div class="course-empty-state" style="grid-column:1/-1">
                <i class="fas fa-question-circle"></i>
                <h3>No quizzes yet</h3>
                <p>Your instructor hasn't added any quizzes for this course yet.</p>
            </div>`;
        return;
    }

    container.innerHTML = '';

    quizzes.forEach((quiz, index) => {
        const courseId   = window.currentCourseId || window.currentCourse || '';
        const courseName = (window.coursesData && window.coursesData[courseId]?.title) || 'Course';

        const status = quiz.status || 'pending';
        const statusMap = {
            completed:     { text: 'Completed',   icon: 'fa-check-circle',    cls: 'completed'   },
            'in-progress': { text: 'In Progress', icon: 'fa-spinner fa-spin', cls: 'in-progress' },
            pending:       { text: 'Pending',     icon: 'fa-hourglass-half',  cls: 'pending'     }
        };
        const s = statusMap[status] || statusMap.pending;

        const countDisplay = (status === 'completed' && quiz.correct_answers != null)
            ? `${quiz.correct_answers}/${quiz.questionCount ?? '--'} correct`
            : `${quiz.questionCount ?? '--'} Questions`;

        const timeDisplay = quiz.timeLimit
            ? `${quiz.timeLimit} mins`
            : (quiz.due ? `Due: ${quiz.due}` : 'Open');

        const btnHtml = (status === 'completed') ? `
            <button class="quiz-btn quiz-btn-results"
                    onclick="event.stopPropagation(); viewQuizResults('${quiz.id}')">
                <i class="fas fa-chart-bar"></i> View Results
            </button>
            <button class="quiz-btn" disabled>
                <i class="fas fa-check"></i> Completed
            </button>
        ` : `
            <button class="quiz-btn"
                    style="margin-bottom:8px;"
                    onclick="event.stopPropagation(); openQuizDetail('${quiz.id}')">
                <i class="fas fa-eye"></i> View Questions
            </button>
            <button class="quiz-btn"
                    onclick="event.stopPropagation(); window.startQuiz('${quiz.id}')">
                <i class="fas fa-play"></i>
                ${status === 'in-progress' ? 'Resume Quiz' : 'Start Quiz'}
            </button>
        `;

        container.innerHTML += `
            <div class="course-quiz-card">
                <div class="quiz-card-header">
                    <span class="quiz-course-pill">
                        <i class="fas fa-book"></i> ${escapeHtml(courseName)}
                    </span>
                    <h4>${escapeHtml(quiz.title)}</h4>
                </div>
                <div class="quiz-card-body">
                    <span class="quiz-status ${s.cls}">
                        <i class="fas ${s.icon}"></i> ${s.text}
                        ${status === 'completed' && quiz.score != null ? ` — ${quiz.score}%` : ''}
                    </span>
                    <div class="quiz-meta-row">
                        <div class="quiz-meta-item">
                            <i class="fas fa-list-ol"></i>
                            ${countDisplay}
                        </div>
                        <div class="quiz-meta-item">
                            <i class="fas fa-clock"></i>
                            ${timeDisplay}
                        </div>
                    </div>
                    ${btnHtml}
                </div>
            </div>`;
    });
}

// ─────────────────────────────────────────────
// START QUIZ
// ─────────────────────────────────────────────
window.startQuiz = async function(quizId) {
    const result = await getQuizById(quizId);

    if (!result.success) {
        showToast('Could not load quiz: ' + result.error, 'error');
        return;
    }

    if (result.submission) {
        showToast('You already submitted this quiz. Score: ' + result.submission.score + '%');
        return;
    }

    _qz.startTime = Date.now();
    showQuizModal(result.quiz, result.questions);
};

// ─────────────────────────────────────────────
// QUIZ MODAL — ONE QUESTION AT A TIME
// ─────────────────────────────────────────────
let _qz = {
    quiz:          null,
    questions:     [],
    current:       0,
    answers:       {},
    startTime:     null,
    timerInterval: null
};

window.showQuizModal = function(quiz, questions) {
    document.getElementById('quizModal')?.remove();

    _qz.quiz      = quiz;
    _qz.questions = questions;
    _qz.current   = 0;
    _qz.answers   = {};
    _qz.startTime = Date.now();

    if (_qz.timerInterval) { clearInterval(_qz.timerInterval); _qz.timerInterval = null; }

    const modal = document.createElement('div');
    modal.id = 'quizModal';
    modal.style.cssText = `
        position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.85);z-index:9999;
        display:flex;align-items:center;justify-content:center;
        padding:20px;backdrop-filter:blur(4px);
        animation:fadeIn 0.3s ease;`;

    modal.innerHTML = `
        <div style="background:#f8f7ff;border-radius:24px;width:100%;max-width:700px;
                    max-height:93vh;overflow:hidden;display:flex;flex-direction:column;
                    box-shadow:0 30px 80px rgba(0,0,0,0.35);">

            <div style="background:linear-gradient(135deg,#7c3aed,#5b21b6);
                        padding:22px 28px;color:white;flex-shrink:0;position:relative;overflow:hidden;">
                <div style="position:absolute;right:-20px;top:-20px;width:110px;height:110px;
                            border-radius:50%;background:rgba(255,255,255,0.08);"></div>
                <div style="display:flex;justify-content:space-between;align-items:flex-start;position:relative;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:11px;font-weight:700;letter-spacing:2px;
                                    text-transform:uppercase;opacity:0.75;margin-bottom:5px;">
                            <i class="fas fa-graduation-cap"></i> Quiz
                        </div>
                        <div style="font-size:18px;font-weight:800;white-space:nowrap;
                                    overflow:hidden;text-overflow:ellipsis;">${quiz.title}</div>
                        <div style="font-size:12px;opacity:0.8;margin-top:4px;">
                            ${questions.length} question${questions.length !== 1 ? 's' : ''}
                            ${quiz.time_limit ? ' • ' + quiz.time_limit + ' minutes' : ''}
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;margin-left:16px;">
                        ${quiz.time_limit ? `
                        <div id="quizTimerDisplay"
                             style="background:rgba(255,255,255,0.2);padding:8px 16px;
                                    border-radius:18px;font-size:17px;font-weight:800;
                                    font-family:monospace;min-width:82px;text-align:center;">
                            ${quiz.time_limit}:00
                        </div>` : ''}
                        <button onclick="closeQuizModal()"
                                style="background:rgba(255,255,255,0.2);border:none;color:white;
                                       width:38px;height:38px;border-radius:50%;cursor:pointer;
                                       font-size:16px;display:flex;align-items:center;justify-content:center;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                <div style="margin-top:16px;background:rgba(255,255,255,0.2);height:6px;border-radius:3px;">
                    <div id="quizProgressBar"
                         style="height:100%;background:white;border-radius:3px;
                                width:0%;transition:width 0.4s ease;"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:11px;opacity:0.75;margin-top:5px;">
                    <span id="quizProgressText">0 of ${questions.length} answered</span>
                    <span id="quizProgressPct">0%</span>
                </div>
            </div>

            <div style="background:white;padding:12px 28px;border-bottom:2px solid #f3f4f6;
                        display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
                <div style="font-size:13px;font-weight:700;color:#7c3aed;">
                    Question <span id="qCurrentNum">1</span> of ${questions.length}
                </div>
                <div id="qDotNav"
                     style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:60%;">
                    ${questions.map((_, i) => `
                        <div class="q-dot" id="qdot_${i}"
                             onclick="goToQuestion(${i})"
                             style="width:28px;height:28px;border-radius:50%;border:2px solid #e5e7eb;
                                    background:white;cursor:pointer;font-size:11px;font-weight:700;
                                    color:#9ca3af;display:flex;align-items:center;justify-content:center;
                                    transition:all 0.2s;flex-shrink:0;">
                            ${i + 1}
                        </div>`).join('')}
                </div>
            </div>

            <div style="overflow-y:auto;padding:24px 28px;flex:1;" id="quizScrollArea">
                <div id="quizQuestionSlot"></div>
            </div>

            <div style="padding:16px 28px;background:white;border-top:2px solid #f3f4f6;
                        display:flex;gap:10px;align-items:center;flex-shrink:0;">
                <button id="qPrevBtn" onclick="quizGoTo(_qz.current - 1)"
                        style="padding:12px 22px;border:2px solid #e5e7eb;border-radius:12px;
                               background:white;color:#6b7280;font-weight:700;cursor:pointer;
                               font-family:inherit;font-size:14px;display:flex;align-items:center;gap:6px;">
                    <i class="fas fa-chevron-left"></i> Prev
                </button>
                <div style="flex:1;text-align:center;font-size:12px;color:#9ca3af;font-weight:600;">
                    <span id="answeredCount">0</span> / ${questions.length} answered
                </div>
                <button id="qNextBtn" onclick="quizGoTo(_qz.current + 1)"
                        style="padding:12px 22px;border:2px solid #e5e7eb;border-radius:12px;
                               background:white;color:#6b7280;font-weight:700;cursor:pointer;
                               font-family:inherit;font-size:14px;display:flex;align-items:center;gap:6px;">
                    Next <i class="fas fa-chevron-right"></i>
                </button>
                <button id="qSubmitBtn" onclick="submitQuizAnswers('${quiz.id}')"
                        style="padding:12px 26px;background:linear-gradient(135deg,#7c3aed,#5b21b6);
                               border:none;border-radius:12px;color:white;font-weight:800;cursor:pointer;
                               font-family:inherit;font-size:14px;display:none;align-items:center;gap:8px;">
                    <i class="fas fa-paper-plane"></i> Submit Quiz
                </button>
            </div>
        </div>

        <style>
            .quiz-opt-label {
                display:flex;align-items:center;gap:14px;padding:14px 18px;
                border:2px solid #e5e7eb;border-radius:12px;cursor:pointer;
                font-size:14px;color:#374151;font-weight:500;background:white;
                transition:all 0.2s;user-select:none;
            }
            .quiz-opt-label:hover { border-color:#7c3aed;background:#faf5ff;color:#7c3aed; }
            .quiz-opt-label.selected { border-color:#7c3aed;background:#faf5ff;color:#7c3aed;border-left-width:4px; }
            .quiz-opt-radio { width:20px;height:20px;border-radius:50%;border:2px solid #d1d5db;flex-shrink:0;transition:all 0.2s;position:relative; }
            .quiz-opt-label.selected .quiz-opt-radio { border-color:#7c3aed;background:#7c3aed; }
            .quiz-opt-label.selected .quiz-opt-radio::after {
                content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
                width:8px;height:8px;border-radius:50%;background:white;
            }
            .q-dot.answered { background:#7c3aed !important;border-color:#7c3aed !important;color:white !important; }
            .q-dot.active   { border-color:#7c3aed !important;color:#7c3aed !important;font-weight:800; }
            @keyframes fadeIn { from{opacity:0;transform:scale(0.97)} to{opacity:1;transform:scale(1)} }
            @keyframes slideQ { from{opacity:0;transform:translateX(30px)} to{opacity:1;transform:translateX(0)} }
        </style>
    `;

    document.body.appendChild(modal);
    if (quiz.time_limit) _startQuizTimer(quiz.time_limit, quiz.id);
    _renderQuestion(0);
};

function _renderQuestion(i) {
    const q    = _qz.questions[i];
    const slot = document.getElementById('quizQuestionSlot');
    if (!slot || !q) return;

    _qz.current = i;

    const numEl = document.getElementById('qCurrentNum');
    if (numEl) numEl.textContent = i + 1;

    _qz.questions.forEach((_, idx) => {
        const dot = document.getElementById('qdot_' + idx);
        if (!dot) return;
        dot.classList.remove('active', 'answered');
        if (_qz.answers[_qz.questions[idx].id] !== undefined) dot.classList.add('answered');
        if (idx === i) dot.classList.add('active');
    });

    const prevBtn   = document.getElementById('qPrevBtn');
    const nextBtn   = document.getElementById('qNextBtn');
    const submitBtn = document.getElementById('qSubmitBtn');
    const isLast    = i === _qz.questions.length - 1;
    const isFirst   = i === 0;

    if (prevBtn)   { prevBtn.style.opacity = isFirst ? '0.35' : '1'; prevBtn.style.pointerEvents = isFirst ? 'none' : 'auto'; }
    if (nextBtn)   { nextBtn.style.display   = isLast ? 'none' : 'flex'; }
    if (submitBtn) { submitBtn.style.display = isLast ? 'flex' : 'none'; }

    const letters = ['A','B','C','D','E','F'];
    let inputHTML = '';

    if (q.question_type === 'multiple') {
        const opts = Array.isArray(q.options) ? q.options : [];
        inputHTML = opts.map((opt, oi) => {
            const isSelected = _qz.answers[q.id] === oi || _qz.answers[q.id] === String(oi);
            return `<label class="quiz-opt-label${isSelected ? ' selected' : ''}"
                           onclick="_selectOpt(this, '${q.id}', ${oi})"
                           style="margin-bottom:4px;">
                        <div class="quiz-opt-radio"></div>
                        <div style="width:26px;height:26px;border-radius:50%;background:#f3f4f6;
                                    display:flex;align-items:center;justify-content:center;
                                    font-size:12px;font-weight:700;color:#6b7280;flex-shrink:0;">
                            ${letters[oi] || oi+1}
                        </div>
                        <span>${opt}</span>
                    </label>`;
        }).join('');
    } else if (q.question_type === 'truefalse') {
        const trueSelected  = _qz.answers[q.id] === true  || _qz.answers[q.id] === 'true';
        const falseSelected = _qz.answers[q.id] === false || _qz.answers[q.id] === 'false';
        inputHTML = `
            <label class="quiz-opt-label${trueSelected  ? ' selected':''}" onclick="_selectOpt(this,'${q.id}',true)"  style="margin-bottom:4px;">
                <div class="quiz-opt-radio"></div>
                <div style="width:26px;height:26px;border-radius:50%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#6b7280;">A</div>
                <span>True</span>
            </label>
            <label class="quiz-opt-label${falseSelected ? ' selected':''}" onclick="_selectOpt(this,'${q.id}',false)" style="margin-bottom:4px;">
                <div class="quiz-opt-radio"></div>
                <div style="width:26px;height:26px;border-radius:50%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#6b7280;">B</div>
                <span>False</span>
            </label>`;
    } else {
        const savedText = _qz.answers[q.id] || '';
        inputHTML = `<textarea
            id="shortAns_${q.id}" rows="5"
            placeholder="Type your answer here…"
            oninput="_saveShortAnswer('${q.id}', this.value)"
            style="width:100%;padding:14px;border:2px solid #e5e7eb;border-radius:12px;
                   font-family:inherit;font-size:14px;resize:vertical;outline:none;"
            onfocus="this.style.borderColor='#7c3aed'"
            onblur="this.style.borderColor='#e5e7eb'"
        >${savedText}</textarea>`;
    }

    const typeLabels = { multiple:'Multiple Choice', truefalse:'True / False', short:'Short Answer', essay:'Essay' };

    slot.innerHTML = `
        <div style="animation:slideQ 0.25s ease;">
            <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:20px;">
                <div style="width:38px;height:38px;background:linear-gradient(135deg,#7c3aed,#5b21b6);
                            border-radius:50%;display:flex;align-items:center;justify-content:center;
                            color:white;font-size:14px;font-weight:800;flex-shrink:0;">
                    ${i + 1}
                </div>
                <div>
                    <div style="font-size:16px;font-weight:700;color:#1f2937;line-height:1.5;">
                        ${q.question_text}
                    </div>
                    <span style="display:inline-block;margin-top:6px;font-size:11px;font-weight:700;
                                 padding:3px 10px;border-radius:20px;background:#ede9fe;color:#7c3aed;">
                        ${typeLabels[q.question_type] || q.question_type}
                    </span>
                </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
                ${inputHTML}
            </div>
        </div>`;
}

window.goToQuestion = function(i) {
    if (i < 0 || i >= _qz.questions.length) return;
    _renderQuestion(i);
    document.getElementById('quizScrollArea')?.scrollTo({ top:0, behavior:'smooth' });
};
window.quizGoTo = function(i) { window.goToQuestion(i); };

window._selectOpt = function(label, qid, value) {
    const block = label.parentElement;
    block.querySelectorAll('.quiz-opt-label').forEach(l => l.classList.remove('selected'));
    label.classList.add('selected');
    _qz.answers[qid] = value;
    _updateProgress();
    const idx = _qz.questions.findIndex(q => String(q.id) === String(qid));
    if (idx >= 0) { const dot = document.getElementById('qdot_' + idx); if (dot) dot.classList.add('answered'); }
};

window._saveShortAnswer = function(qid, value) {
    if (value.trim()) _qz.answers[qid] = value.trim();
    else delete _qz.answers[qid];
    _updateProgress();
    const idx = _qz.questions.findIndex(q => String(q.id) === String(qid));
    if (idx >= 0) {
        const dot = document.getElementById('qdot_' + idx);
        if (dot) { if (value.trim()) dot.classList.add('answered'); else dot.classList.remove('answered'); }
    }
};

function _updateProgress() {
    const answered = Object.keys(_qz.answers).length;
    const total    = _qz.questions.length;
    const pct      = total ? Math.round((answered / total) * 100) : 0;
    const bar    = document.getElementById('quizProgressBar');
    const txt    = document.getElementById('quizProgressText');
    const pctTxt = document.getElementById('quizProgressPct');
    const cnt    = document.getElementById('answeredCount');
    if (bar)    bar.style.width    = pct + '%';
    if (txt)    txt.textContent    = `${answered} of ${total} answered`;
    if (pctTxt) pctTxt.textContent = pct + '%';
    if (cnt)    cnt.textContent    = answered;
}

function _startQuizTimer(minutes, quizId) {
    let timeLeft = minutes * 60;
    const display = document.getElementById('quizTimerDisplay');
    _qz.timerInterval = setInterval(() => {
        timeLeft--;
        const m = Math.floor(timeLeft / 60);
        const s = timeLeft % 60;
        if (display) {
            display.textContent = `${m}:${String(s).padStart(2,'0')}`;
            if (timeLeft <= 60) display.style.background = 'rgba(220,38,38,0.5)';
        }
        if (timeLeft <= 0) {
            clearInterval(_qz.timerInterval);
            showToast('⏰ Time is up! Submitting quiz…', 'error');
            submitQuizAnswers(quizId);
        }
    }, 1000);
}


window.submitQuizAnswers = async function(quizId) {
    _qz.questions.forEach(q => {
        if (q.question_type === 'short' || q.question_type === 'essay') {
            const ta = document.getElementById('shortAns_' + q.id);
            if (ta && ta.value.trim()) _qz.answers[q.id] = ta.value.trim();
        }
    });

    if (Object.keys(_qz.answers).length === 0) {
        showToast('Please answer at least one question before submitting', 'warning');
        return;
    }

    const btn = document.getElementById('qSubmitBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…'; }

    const timeSpent = Math.floor((Date.now() - (_qz.startTime || Date.now())) / 1000);
    const result    = await submitQuiz(quizId, _qz.answers, timeSpent);

    if (_qz.timerInterval) { clearInterval(_qz.timerInterval); _qz.timerInterval = null; }

    if (!result.success) {
        showToast('Error: ' + result.error, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Quiz'; }
        return;
    }

closeQuizModal();
    showToast(`✅ Submitted! You got ${result.correct}/${result.total} correct (${result.score}%)`, 'success');

    const courseId = window.currentCourseId || window.currentCourse;
    if (courseId && typeof loadCourseQuizzesUI === 'function') loadCourseQuizzesUI(courseId);

    // ✅ Sync progress after quiz submission
    if (typeof syncCourseProgressToDB === 'function' && courseId) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) await syncCourseProgressToDB(user.id, courseId);
    }
};

window.closeQuizModal = function() {
    if (_qz.timerInterval) { clearInterval(_qz.timerInterval); _qz.timerInterval = null; }
    document.getElementById('quizModal')?.remove();
};

// ─────────────────────────────────────────────
// ADMIN — LOAD QUIZZES LIST
// ─────────────────────────────────────────────
async function loadAdminQuizzes() {
    const { data, error } = await supabaseClient
        .from('quizzes')
        .select(`
            id, title, time_limit, published, created_at,
            courses (title),
            quiz_questions (count)
        `)
        .order('created_at', { ascending: false });

    if (error) { console.error('Failed to load quizzes:', error); return; }
    renderAdminQuizzesList(data || []);
}

function renderAdminQuizzesList(quizzes) {
    const container = document.getElementById('quizzesList');
    if (!container) return;

    if (quizzes.length === 0) {
        container.innerHTML = '<div class="card"><p style="color:#6b7280;">No quizzes created yet.</p></div>';
        return;
    }

    container.innerHTML = '';

    quizzes.forEach(quiz => {
        const isPublished = quiz.published || false;
        const card = document.createElement('div');
        card.className = 'card';
        card.id = `quiz-card-${quiz.id}`;
        card.innerHTML = `
            <div class="card-header">
                <div>
                    <div class="card-title">${quiz.title}</div>
                    <div style="font-size:14px;color:#6b7280;margin-top:5px;">
                        ${quiz.courses?.title || 'Unknown Course'} •
                        ${quiz.quiz_questions?.[0]?.count || 0} questions
                        ${quiz.time_limit ? ` • ${quiz.time_limit} min` : ''}
                    </div>
                    <span class="badge ${isPublished ? 'active' : 'pending'}" style="margin-top:6px;display:inline-block;">
                        ${isPublished ? '✓ Published' : '⏳ Unpublished'}
                    </span>
                </div>
                <div class="action-buttons">
                    <button class="action-btn edit" onclick="openEditQuizModal('${quiz.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-primary" style="padding:7px 14px;font-size:12px;"
                        onclick="togglePublishQuiz('${quiz.id}', ${isPublished})">
                        <i class="fas fa-${isPublished ? 'eye-slash' : 'paper-plane'}"></i>
                        ${isPublished ? 'Unpublish' : 'Publish'}
                    </button>
                    <button class="action-btn delete" onclick="handleDeleteQuiz('${quiz.id}', '${quiz.title}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>`;
        container.appendChild(card);
    });
}

async function togglePublishQuiz(quizId, currentlyPublished) {
    const newStatus = !currentlyPublished;
    if (!confirm(`Are you sure you want to ${newStatus ? 'publish' : 'unpublish'} this quiz?`)) return;
    const { error } = await supabaseClient.from('quizzes').update({ published: newStatus }).eq('id', quizId);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast(newStatus ? '✅ Quiz published!' : '❌ Quiz unpublished.');
    loadAdminQuizzes();
}

async function openEditQuizModal(quizId) {
    const result = await getQuizById(quizId);
    if (!result.success) { showToast('Could not load quiz: ' + result.error, 'error'); return; }

    const { quiz, questions } = result;
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'editQuizModal';

    const questionsHTML = questions.map((q, i) => `
        <div class="card" style="margin-bottom:15px;" id="edit-q-${q.id}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <strong>Question ${i + 1} <span class="badge active" style="font-size:11px;">${q.question_type}</span></strong>
                <button type="button" class="action-btn delete" onclick="deleteQuizQuestion('${q.id}', '${quizId}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="form-group">
                <label>Question Text</label>
                <textarea id="qtext-${q.id}" rows="2" style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:inherit;">${q.question_text}</textarea>
            </div>
            ${q.question_type === 'multiple' ? `
                <div class="form-group">
                    <label>Options (mark correct one)</label>
                    ${(q.options || []).map((opt, oi) => `
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                            <input type="radio" name="correct-${q.id}" value="${oi}" ${q.correct_answer === oi ? 'checked' : ''}>
                            <input type="text" id="opt-${q.id}-${oi}" value="${opt}"
                                style="flex:1;padding:8px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:inherit;">
                        </div>`).join('')}
                </div>` : ''}
            ${q.question_type === 'truefalse' ? `
                <div class="form-group">
                    <label>Correct Answer</label>
                    <select id="tf-${q.id}" style="padding:8px;border:1.5px solid #e5e7eb;border-radius:8px;">
                        <option value="true"  ${q.correct_answer === true  ? 'selected' : ''}>True</option>
                        <option value="false" ${q.correct_answer === false ? 'selected' : ''}>False</option>
                    </select>
                </div>` : ''}
            <div class="form-group">
                <label>Points</label>
                <input type="number" id="pts-${q.id}" value="${q.points || 1}" min="1"
                    style="width:80px;padding:8px;border:1.5px solid #e5e7eb;border-radius:8px;">
            </div>
        </div>`).join('');

    modal.innerHTML = `
        <div class="modal-content modal-content-wide">
            <div class="modal-header">
                <h2><i class="fas fa-edit"></i> Edit Quiz</h2>
                <button class="modal-close" onclick="document.getElementById('editQuizModal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="form-group">
                <label>Quiz Title *</label>
                <input type="text" id="editQuizTitle" value="${quiz.title}"
                    style="width:100%;padding:12px;border:1.5px solid #e5e7eb;border-radius:10px;font-family:inherit;font-size:14px;">
            </div>
            <div class="form-group">
                <label>Time Limit (minutes)</label>
                <input type="number" id="editQuizTimeLimit" value="${quiz.time_limit || ''}" min="1"
                    style="width:150px;padding:12px;border:1.5px solid #e5e7eb;border-radius:10px;font-family:inherit;font-size:14px;">
            </div>
            <hr style="margin:20px 0;border:none;border-top:1.5px solid #e5e7eb;">
            <h3 style="margin-bottom:15px;color:#1f2937;">Questions</h3>
            <div id="editQuestionsList">${questionsHTML}</div>
            <div style="display:flex;gap:10px;margin-top:20px;">
                <button class="btn-secondary" onclick="document.getElementById('editQuizModal').remove()" style="flex:1;">Cancel</button>
                <button class="btn-primary" onclick="saveEditedQuiz('${quizId}')" style="flex:1;">
                    <i class="fas fa-save"></i> Save Changes
                </button>
                <button class="btn-primary" style="flex:1;background:linear-gradient(135deg,#10b981,#059669);"
                    onclick="saveEditedQuiz('${quizId}', true)">
                    <i class="fas fa-paper-plane"></i> Save & Publish
                </button>
            </div>
        </div>`;

    document.body.appendChild(modal);
}

async function saveEditedQuiz(quizId, publishAfterSave = false) {
    const title     = document.getElementById('editQuizTitle')?.value?.trim();
    const timeLimit = parseInt(document.getElementById('editQuizTimeLimit')?.value) || null;
    if (!title) { showToast('Quiz title cannot be empty', 'error'); return; }

    const updateData = { title, time_limit: timeLimit };
    if (publishAfterSave) updateData.published = true;

    const { error: quizError } = await supabaseClient.from('quizzes').update(updateData).eq('id', quizId);
    if (quizError) { showToast('Error saving quiz: ' + quizError.message, 'error'); return; }

    const questionCards = document.querySelectorAll('#editQuestionsList [id^="edit-q-"]');
    for (const card of questionCards) {
        const qId      = card.id.replace('edit-q-', '');
        const newText  = document.getElementById(`qtext-${qId}`)?.value?.trim();
        const newPoints = parseInt(document.getElementById(`pts-${qId}`)?.value) || 1;

        const radios = card.querySelectorAll(`input[name="correct-${qId}"]`);
        let newOptions = null, newCorrectAnswer = null;

        if (radios.length > 0) {
            newOptions = [];
            radios.forEach((radio, i) => {
                const optVal = document.getElementById(`opt-${qId}-${i}`)?.value?.trim();
                newOptions.push(optVal || '');
                if (radio.checked) newCorrectAnswer = i;
            });
        }

        const tfSelect = document.getElementById(`tf-${qId}`);
        if (tfSelect) newCorrectAnswer = tfSelect.value === 'true';

        const updateQ = { question_text: newText, points: newPoints };
        if (newOptions !== null)       updateQ.options = newOptions;
        if (newCorrectAnswer !== null)  updateQ.correct_answer = newCorrectAnswer;

        const { error: qError } = await supabaseClient.from('quiz_questions').update(updateQ).eq('id', qId);
        if (qError) { showToast('Error updating question: ' + qError.message, 'error'); return; }
    }

    document.getElementById('editQuizModal')?.remove();
    showToast(publishAfterSave ? '✅ Quiz saved and published!' : '✅ Quiz updated successfully!');
    loadAdminQuizzes();
}

async function deleteQuizQuestion(questionId, quizId) {
    if (!confirm('Delete this question?')) return;
    const { error } = await supabaseClient.from('quiz_questions').delete().eq('id', questionId);
    if (error) { showToast('Error deleting question: ' + error.message, 'error'); return; }
    document.getElementById(`edit-q-${questionId}`)?.remove();
    showToast('Question deleted');
}

async function handleDeleteQuiz(quizId, quizTitle) {
    if (!confirm(`Delete quiz "${quizTitle}"?`)) return;

    // Get course_id BEFORE deleting
    const { data: quizData } = await supabaseClient
        .from('quizzes')
        .select('course_id')
        .eq('id', quizId)
        .maybeSingle();

    // Get students who submitted BEFORE deleting
    const { data: submissions } = await supabaseClient
        .from('quiz_submissions')
        .select('student_id')
        .eq('quiz_id', quizId);

    const result = await deleteQuizFromDB(quizId);
    if (!result.success) { showToast('Error: ' + result.error, 'error'); return; }

    // Reset progress for affected students
    if (quizData?.course_id && submissions?.length > 0) {
        for (const sub of submissions) {
            await supabaseClient
                .from('course_progress')
                .delete()
                .eq('student_id', sub.student_id)
                .eq('course_id', quizData.course_id);

            await supabaseClient
                .from('enrollments')
                .update({ progress: 0, updated_at: new Date().toISOString() })
                .eq('student_id', sub.student_id)
                .eq('course_id', quizData.course_id);
        }
    }

    showToast('Quiz deleted and student progress reset');
    loadAdminQuizzes();
}
async function handleCreateQuizDB(event) {
    event.preventDefault();
    const questions = window.currentQuizQuestions || [];
    if (questions.length === 0) { showToast('Please add at least one question', 'error'); return; }

    const formData = new FormData(event.target);
    const result = await createQuiz({
        title:     formData.get('quizTitle'),
        courseId:  formData.get('courseId'),
        timeLimit: parseInt(formData.get('timeLimit')) || null,
        questions: questions
    });

    if (!result.success) { showToast('Error: ' + result.error, 'error'); return; }

    showToast('Quiz created successfully! ✅');
    closeModal('createQuizModal');
    event.target.reset();
    window.currentQuizQuestions = [];
    loadAdminQuizzes();
}

// ─────────────────────────────────────────────
// AUTO-INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const isAdmin = !!document.getElementById('quizzesList');
    if (isAdmin) {
        loadAdminQuizzes();
        const form = document.getElementById('createQuizForm');
        if (form) form.onsubmit = handleCreateQuizDB;
    }
});

console.log('✅ Quizzes.js loaded (fixed version)');