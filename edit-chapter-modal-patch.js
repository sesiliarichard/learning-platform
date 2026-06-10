// ============================================================
// PATCH: Add Sub-chapter + Quiz/Assignment linking inside
//        the Edit Chapter Modal (editChapterModal)
//
// HOW TO USE:
//   Add this file as a <script> tag in admin.html just before </body>:
//   <script src="edit-chapter-modal-patch.js"></script>
// ============================================================

(function () {
    'use strict';

    function getSB() { return window.supabaseClient || window.db; }

   window.openEditChapterModal = async function (chapterId) {
    if (window._ecmRunning) {
        console.warn('openEditChapterModal already running, skipping duplicate call');
        return;
    }
    window._ecmRunning = true;
    window._lastEcmChapterId = chapterId;

    // Always clean up previous modal injection before rebuilding
    document.getElementById('editModalSubChapterSection')
        ?.closest('div')?.remove();

    // Clean up any previous injection before rebuilding
    document.getElementById('editModalSubChapterSection')
        ?.closest('div[style*="border-top"]')?.remove();
  
   

        // Clear previous topic list before loading new ones
        const prevTopicContainer = document.getElementById('editTopicsContainer');
        if (prevTopicContainer) prevTopicContainer.innerHTML = '';

        // Clear previous assessment section
        document.getElementById('editModalSubChapterSection')
            ?.closest('div')?.remove();

        document.getElementById('editChapterId').value = chapterId;
        document.getElementById('editChapterTitle').value = '';
        document.getElementById('editChapterDescription').value = '';

        // Build topics in editTopicsContainer
        const { data: topicsForEdit } = await getSB()
            .from('topics')
            .select('id, title, content, duration, category, order_num')
            .eq('chapter_id', chapterId)
            .order('order_num', { ascending: true });

        const editContainer = document.getElementById('editTopicsContainer');
        if (editContainer) {
            editContainer.innerHTML = '';
            window.editTopicCounter = 0;
            (topicsForEdit || []).forEach(topic => addEditTopic(topic));
            if (!topicsForEdit || topicsForEdit.length === 0) addEditTopic();
        }

        document.getElementById('editChapterModal').classList.add('active');

        await new Promise(r => setTimeout(r, 120));

        const form = document.getElementById('editChapterForm');
        if (!form) return;

        // Don't inject twice
        if (form.querySelector('#editModalSubChapterSection')) return;

        // ── 1. Get course_id for this chapter ─────────────────
      const { data: chapterFull } = await getSB()
    .from('chapters')
    .select('title, description, course_id')
    .eq('id', chapterId)
    .maybeSingle();

console.log('chapterId received:', chapterId);
console.log('chapter found:', chapterFull);
console.log('courseId:', chapterFull?.course_id);

if (!chapterFull?.course_id) {
    console.error('❌ courseId is null — chapter not found or DB issue');
    window._ecmRunning = false;
    window._lastEcmChapterId = null;
    return;
}

const courseId = chapterFull.course_id;
     

        // ── 3. Load quizzes / assignments for this course ──────


const [quizzesRes, assignsRes, assessmentsRes, linkedQuizzesRes, linkedAssignsRes] = await Promise.all([
    getSB().from('quizzes').select('id, title').eq('course_id', courseId).order('title'),
    getSB().from('assignments').select('id, title').eq('course_id', courseId).order('title'),

    getSB().from('chapter_assessments')
    .select('id, assessment_type, quiz_id, assignment_id, topic_id, quizzes(title), assignments(title)')
    .eq('chapter_id', chapterId)
    .eq('course_id', courseId),

    getSB().from('quizzes')
        .select('id, title')
        .eq('chapter_id', chapterId),
    getSB().from('assignments')
        .select('id, title')
        .eq('chapter_id', chapterId)
]);

const quizzes     = quizzesRes.data    || [];
const assignments = assignsRes.data    || [];
const assessments = assessmentsRes.data || [];

// Only use chapter_id-based links for the chapter-level section
// Topic dropdowns handle their own filtering inside _renderTopicAssessments
const linkedQuizIds = new Set(
    (linkedQuizzesRes.data || []).map(q => q.id)
);
const linkedAssignIds = new Set(
    (linkedAssignsRes.data || []).map(a => a.id)
);
   

        // ── 5. Build linked assessments HTML ───────────────────
        const linkedQuizPills = assessments
            .filter(a => a.assessment_type === 'quiz' && a.quizzes)
            .map(a => `
            <span style="display:inline-flex;align-items:center;gap:6px;background:#ede9fe;
                         color:#5b21b6;padding:4px 10px;border-radius:20px;font-size:12px;
                         font-weight:600;margin:3px;">
                <i class="fas fa-question-circle"></i> ${escHTML(a.quizzes.title)}
                <button type="button"
                        onclick="ecmUnlinkAssessment('${a.id}','${chapterId}','${courseId}')"
                        style="background:none;border:none;cursor:pointer;color:#7c3aed;
                               font-size:11px;padding:0;margin-left:2px;">✕</button>
            </span>`).join('');

        const linkedAssignPills = assessments
            .filter(a => a.assessment_type === 'assignment' && a.assignments)
            .map(a => `
            <span style="display:inline-flex;align-items:center;gap:6px;background:#d1fae5;
                         color:#065f46;padding:4px 10px;border-radius:20px;font-size:12px;
                         font-weight:600;margin:3px;">
                <i class="fas fa-tasks"></i> ${escHTML(a.assignments.title)}
                <button type="button"
                        onclick="ecmUnlinkAssessment('${a.id}','${chapterId}','${courseId}')"
                        style="background:none;border:none;cursor:pointer;color:#065f46;
                               font-size:11px;padding:0;margin-left:2px;">✕</button>
            </span>`).join('');

        const unlinkedQuizzes = quizzes.filter(q => !linkedQuizIds.has(q.id));
        const unlinkedAssigns = assignments.filter(a => !linkedAssignIds.has(a.id));

        const quizOptions   = unlinkedQuizzes.map(q => `<option value="${q.id}">${escHTML(q.title)}</option>`).join('');
        const assignOptions = unlinkedAssigns.map(a => `<option value="${a.id}">${escHTML(a.title)}</option>`).join('');

       // ── 6. Inject sub-chapter section before modal-actions ──
const actionsDiv = form.querySelector('.modal-actions');
const divider = document.createElement('div');
divider.innerHTML = `
<hr style="margin:20px 0;border:none;border-top:2px solid #f3f4f6;">
<div id="editModalSubChapterSection">

    
    <!-- Per-topic assessment blocks -->
    <div id="ecmTopicAssessments">
        <div style="font-size:13px;font-weight:800;color:#374151;text-transform:uppercase;
                    letter-spacing:1px;margin-bottom:14px;">
            <i class="fas fa-link" style="color:#7c3aed;margin-right:6px;"></i>
            Assessments per Topic
        </div>
        <div id="ecmTopicAssessmentsList">
            <div style="color:#9ca3af;font-size:13px;text-align:center;padding:12px 0;">
                <i class="fas fa-spinner fa-spin"></i> Loading topics...
            </div>
        </div>
    </div>

</div>`;

actionsDiv.parentNode.insertBefore(divider, actionsDiv);

// ── Load topics and render per-topic assessment blocks ──
await _renderTopicAssessments(chapterId, courseId, quizzes, assignments, assessments);

    // Reset so next chapter opens cleanly
    window._ecmRunning = false;
    window._lastEcmChapterId = null;
}

   
    // ── Link a quiz or assignment ──────────────────────────────
    window.ecmLinkAssessment = async function (type, chapterId, courseId) {
        const pickerId = type === 'quiz' ? 'ecmQuizPicker' : 'ecmAssignPicker';
        const itemId   = document.getElementById(pickerId)?.value;
        if (!itemId) {
            if (typeof showToast === 'function') showToast('Please select an item to link', 'error');
            return;
        }

        // Update chapter_id on the item
        const table = type === 'quiz' ? 'quizzes' : 'assignments';
        const { error: e1 } = await getSB().from(table).update({ chapter_id: chapterId }).eq('id', itemId);
        if (e1) { if (typeof showToast === 'function') showToast('Error: ' + e1.message, 'error'); return; }

        // Insert into chapter_assessments
        const { error: e2 } = await getSB().from('chapter_assessments').insert({
            chapter_id:      chapterId,
            course_id:       courseId,
            assessment_type: type,
            quiz_id:        type === 'quiz'       ? itemId : null,
            assignment_id:  type === 'assignment' ? itemId : null,
            order_num:      1
        });
        if (e2 && !e2.message.includes('duplicate')) {
            if (typeof showToast === 'function') showToast('Error: ' + e2.message, 'error');
            return;
        }

        if (typeof showToast === 'function') showToast(`✅ ${type === 'quiz' ? 'Quiz' : 'Assignment'} linked!`);

        // Refresh the section by reopening
     window._ecmRunning = false;
window._lastEcmChapterId = null;
document.getElementById('editModalSubChapterSection')?.closest('div')?.remove();

// Small delay to ensure DOM is clean before reopening
setTimeout(() => {
    window.openEditChapterModal(chapterId);
}, 50);
    };

    // ── Unlink an assessment ───────────────────────────────────
   window.ecmUnlinkAssessment = async function (assessmentId, chapterId, courseId) {
        const { data: assessment } = await getSB()
            .from('chapter_assessments')
            .select('assessment_type, quiz_id, assignment_id')
            .eq('id', assessmentId)
            .maybeSingle();

        if (assessment) {
            const table = assessment.assessment_type === 'quiz' ? 'quizzes' : 'assignments';
            const col   = assessment.assessment_type === 'quiz' ? assessment.quiz_id : assessment.assignment_id;
            await getSB().from(table).update({ chapter_id: null, topic_id: null }).eq('id', col);
        }

        await getSB().from('chapter_assessments').delete().eq('id', assessmentId);

        if (typeof showToast === 'function') showToast('Unlinked.');

      window._ecmRunning = false;
window._lastEcmChapterId = null;
document.getElementById('editModalSubChapterSection')?.closest('div')?.remove();

// Small delay to ensure DOM is clean before reopening
setTimeout(() => {
    window.openEditChapterModal(chapterId);
}, 50);
    };

    // ── Helper: re-inject extras without re-opening the modal ─
    async function _reInjectExtras(chapterId) {
    const section = document.getElementById('editModalSubChapterSection');
    if (section) section.closest('div').remove();
    await window.openEditChapterModal(chapterId);  // pass chapterId directly
}

    // ── Render per-topic assessment blocks ────────────────
async function _renderTopicAssessments(chapterId, courseId, quizzes, assignments, existingAssessments) {
    const container = document.getElementById('ecmTopicAssessmentsList');
    if (!container) return;

   
  const { data: topics } = await getSB()
        .from('topics')
        .select('id, title, order_num')
        .eq('chapter_id', chapterId)
        .order('order_num', { ascending: true });

    console.log('Topics for linking:', topics?.map(t => ({id: t.id, title: t.title})));

    if (!topics || topics.length === 0) {
        container.innerHTML = '<p style="font-size:13px;color:#9ca3af;padding:8px 0;">No topics yet. Save topics first, then link assessments.</p>';
        return;
    }

   // ── Read directly from assignments/quizzes tables using topic_id ──
    const [topicQuizzesRes, topicAssignsRes] = await Promise.all([
        getSB().from('quizzes')
            .select('id, title, topic_id')
            .eq('chapter_id', chapterId)
            .eq('course_id', courseId)
            .not('topic_id', 'is', null),
        getSB().from('assignments')
            .select('id, title, topic_id')
            .eq('chapter_id', chapterId)
            .eq('course_id', courseId)
            .not('topic_id', 'is', null)
    ]);

    const topicAssessmentRows = [
        ...(topicQuizzesRes.data || []).map(q => ({
            id: 'quiz-' + q.id,
            topic_id: q.topic_id,
            assessment_type: 'quiz',
            quiz_id: q.id,
            assignment_id: null,
            quizzes: { id: q.id, title: q.title },
            assignments: null
        })),
        ...(topicAssignsRes.data || []).map(a => ({
            id: 'assign-' + a.id,
            topic_id: a.topic_id,
            assessment_type: 'assignment',
            quiz_id: null,
            assignment_id: a.id,
            quizzes: null,
            assignments: { id: a.id, title: a.title }
        }))
    ];

    const byTopic = {};
    topicAssessmentRows.forEach(a => {
        if (!byTopic[a.topic_id]) byTopic[a.topic_id] = [];
        byTopic[a.topic_id].push(a);
    });

    const allLinkedQuizIds   = new Set(topicAssessmentRows.filter(a => a.quiz_id).map(a => a.quiz_id));
    const allLinkedAssignIds = new Set(topicAssessmentRows.filter(a => a.assignment_id).map(a => a.assignment_id));

    container.innerHTML = topics.map((topic, i) => {
        const topicAssessments = byTopic[topic.id] || [];

        // IDs already linked to THIS specific topic
        const linkedQuizIdsForTopic = new Set(
            topicAssessments.filter(a => a.assessment_type === 'quiz' && a.quiz_id).map(a => a.quiz_id)
        );
        const linkedAssignIdsForTopic = new Set(
            topicAssessments.filter(a => a.assessment_type === 'assignment' && a.assignment_id).map(a => a.assignment_id)
        );

        // Available = course quizzes MINUS ones already linked to THIS topic
        // (allow same quiz to be linked to different topics, just not same topic twice)
        const availableQuizzes     = quizzes.filter(q => !linkedQuizIdsForTopic.has(q.id));
        const availableAssignments = assignments.filter(a => !linkedAssignIdsForTopic.has(a.id));

        const quizOptions   = availableQuizzes.map(q =>
            `<option value="${q.id}">${escHTML(q.title)}</option>`).join('');
        const assignOptions = availableAssignments.map(a =>
            `<option value="${a.id}">${escHTML(a.title)}</option>`).join('');

        const linkedQuizPills = topicAssessments
            .filter(a => a.assessment_type === 'quiz' && a.quizzes)
            .map(a => `
            <span style="display:inline-flex;align-items:center;gap:6px;background:#ede9fe;
                         color:#5b21b6;padding:4px 10px;border-radius:20px;font-size:12px;
                         font-weight:600;margin:3px;">
                <i class="fas fa-question-circle"></i> ${escHTML(a.quizzes.title)}
               <button type="button" onclick="ecmDirectUnlinkTopic('quiz','${a.quizzes.id}','${chapterId}','${courseId}')"
                    style="background:none;border:none;cursor:pointer;color:#7c3aed;font-size:11px;">✕</button>
            </span>`).join('');

        const linkedAssignPills = topicAssessments
            .filter(a => a.assessment_type === 'assignment' && a.assignments)
            .map(a => `
            <span style="display:inline-flex;align-items:center;gap:6px;background:#d1fae5;
                         color:#065f46;padding:4px 10px;border-radius:20px;font-size:12px;
                         font-weight:600;margin:3px;">
                <i class="fas fa-tasks"></i> ${escHTML(a.assignments.title)}
                <button type="button" onclick="ecmDirectUnlinkTopic('assignment','${a.assignments.id}','${chapterId}','${courseId}')"
                    style="background:none;border:none;cursor:pointer;color:#065f46;font-size:11px;">✕</button>
            </span>`).join('');

        return `
        <div style="background:white;border:1.5px solid #e5e7eb;border-radius:12px;
                    padding:14px 16px;margin-bottom:12px;">
            <div style="font-size:13px;font-weight:700;color:#1f2937;margin-bottom:10px;
                        display:flex;align-items:center;gap:8px;">
                <span style="background:#ede9fe;color:#7c3aed;width:22px;height:22px;
                             border-radius:50%;display:inline-flex;align-items:center;
                             justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;">
                    ${i + 1}
                </span>
                ${escHTML(topic.title)}
            </div>

            <!-- Linked quizzes -->
            <div style="margin-bottom:10px;">
                <div style="font-size:11px;font-weight:700;color:#5b21b6;margin-bottom:6px;
                            text-transform:uppercase;letter-spacing:0.5px;">
                    <i class="fas fa-question-circle"></i> Quiz
                </div>
                <div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;">
                    ${linkedQuizPills || '<span style="font-size:12px;color:#9ca3af;">None linked</span>'}
                    ${quizOptions ? `
                    <div style="display:inline-flex;align-items:center;gap:6px;margin:3px;">
                        <select id="topicQuizLink_${topic.id}"
                            style="padding:4px 8px;border:1.5px solid #ddd6fe;border-radius:8px;
                                   font-size:12px;font-family:inherit;outline:none;">
                            <option value="">+ Link a quiz…</option>
                            ${quizOptions}
                        </select>
                        <button type="button"
                                onclick="ecmLinkTopicAssessment('quiz','${topic.id}','${chapterId}','${courseId}')"
                                style="padding:4px 10px;background:#7c3aed;color:white;border:none;
                                       border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">
                            Link
                        </button>
                    </div>` : '<span style="font-size:11px;color:#9ca3af;margin-left:6px;">(all quizzes linked)</span>'}
                </div>
            </div>

            <!-- Linked assignments -->
            <div>
                <div style="font-size:11px;font-weight:700;color:#065f46;margin-bottom:6px;
                            text-transform:uppercase;letter-spacing:0.5px;">
                    <i class="fas fa-tasks"></i> Assignment
                </div>
                <div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;">
                    ${linkedAssignPills || '<span style="font-size:12px;color:#9ca3af;">None linked</span>'}
                    ${assignOptions ? `
                    <div style="display:inline-flex;align-items:center;gap:6px;margin:3px;">
                        <select id="topicAssignLink_${topic.id}"
                            style="padding:4px 8px;border:1.5px solid #bbf7d0;border-radius:8px;
                                   font-size:12px;font-family:inherit;outline:none;">
                            <option value="">+ Link an assignment…</option>
                            ${assignOptions}
                        </select>
                        <button type="button"
                                onclick="ecmLinkTopicAssessment('assignment','${topic.id}','${chapterId}','${courseId}')"
                                style="padding:4px 10px;background:#10b981;color:white;border:none;
                                       border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">
                            Link
                        </button>
                    </div>` : '<span style="font-size:11px;color:#9ca3af;margin-left:6px;">(all assignments linked)</span>'}
                </div>
            </div>
        <!-- Coding exercise -->
            <div style="margin-top:12px;padding-top:10px;border-top:1px solid #f3f4f6;">
                <div style="font-size:11px;font-weight:700;color:#1e1b4b;margin-bottom:6px;
                            text-transform:uppercase;letter-spacing:0.5px;">
                    <i class="fas fa-code" style="color:#6366f1;"></i> Coding Exercise
                </div>
                <div id="codingExBlock_${topic.id}" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;">
                    <span style="font-size:12px;color:#9ca3af;" id="codingExStatus_${topic.id}">Loading…</span>
                </div>
            </div>
        </div>`;
    }).join('');

    // Load coding exercise status for each topic
    Promise.all(topics.map(async topic => {
        const { data: t } = await getSB()
            .from('topics')
            .select('has_coding_exercise, coding_prompt, coding_language, coding_starter_code')
            .eq('id', topic.id)
            .maybeSingle();

        const statusEl = document.getElementById('codingExStatus_' + topic.id);
        const block    = document.getElementById('codingExBlock_'  + topic.id);
        if (!statusEl || !block) return;

    if (t?.has_coding_exercise && t?.coding_prompt) {
            const langLabel = (t.coding_language || 'python').charAt(0).toUpperCase() + (t.coding_language || 'python').slice(1);
            block.innerHTML = `
                <span style="background:#1e1b4b;color:#a5b4fc;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px;">
                    <i class="fas fa-code"></i> ${langLabel}: ${escHTML(t.coding_prompt.substring(0, 40))}${t.coding_prompt.length > 40 ? '…' : ''}
                </span>
                <button type="button"
                    onclick="window._ecmRunning=false;window._lastEcmChapterId=null;ecmEditCodingExercise('${topic.id}','${chapterId}')"
                    style="padding:4px 10px;background:#ede9fe;color:#7c3aed;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button type="button"
                    onclick="window._ecmRunning=false;window._lastEcmChapterId=null;ecmDeleteCodingExercise('${topic.id}','${chapterId}')"
                    style="padding:4px 10px;background:#fee2e2;color:#dc2626;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">
                    <i class="fas fa-trash"></i> Remove
                </button>`;
        } else {
            block.innerHTML = `
                <span style="font-size:12px;color:#9ca3af;">None</span>
                <button type="button"
                    onclick="window._ecmRunning=false;window._lastEcmChapterId=null;ecmEditCodingExercise('${topic.id}','${chapterId}')"
                    style="padding:4px 10px;background:#1e1b4b;color:#a5b4fc;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">
                    <i class="fas fa-plus"></i> Add Coding Exercise
                </button>`;
        }
    }));
}

// ── Link assessment to a specific topic ──────────────
window.ecmLinkTopicAssessment = async function(type, topicId, chapterId, courseId) {
    console.log('RAW ARGS:', type, topicId, chapterId, courseId);
    if (!topicId || topicId === 'undefined' || topicId === 'null') {
        if (typeof showToast === 'function') showToast('Error: topic ID missing', 'error');
        console.error('Missing topicId:', topicId);
        return;
    }

    const pickerId = type === 'quiz'
        ? `topicQuizLink_${topicId}`
        : `topicAssignLink_${topicId}`;
    const itemId = document.getElementById(pickerId)?.value;

    if (!itemId) {
        if (typeof showToast === 'function') showToast('Please select an item to link', 'error');
        return;
    }

    console.log('Linking:', type, itemId, '→ topicId:', topicId, 'chapterId:', chapterId);

    const table = type === 'quiz' ? 'quizzes' : 'assignments';

   const { data: updateData, error } = await getSB()
        .from(table)
        .update({
            chapter_id: chapterId,
            topic_id:   topicId
        })
        .eq('id', itemId)
        .select();

    console.log('Update result:', updateData, 'Error:', error);

    if (error) {
        if (typeof showToast === 'function') showToast('Error: ' + error.message, 'error');
        console.error('Link error:', error);
        return;
    }
   // Delete existing then insert fresh
    if (type === 'quiz') {
        await getSB().from('chapter_assessments').delete()
            .eq('chapter_id', chapterId).eq('topic_id', topicId).eq('quiz_id', itemId);
    } else {
        await getSB().from('chapter_assessments').delete()
            .eq('chapter_id', chapterId).eq('topic_id', topicId).eq('assignment_id', itemId);
    }
    
    const { error: caError } = await getSB().from('chapter_assessments').insert({
        chapter_id:      chapterId,
        course_id:       courseId,
        topic_id:        topicId,
        assessment_type: type,
        quiz_id:        type === 'quiz'       ? itemId : null,
        assignment_id:  type === 'assignment' ? itemId : null,
        order_num:      1
    });
    
    console.log('chapter_assessments insert error:', caError);

    console.log('✅ Linked', type, itemId, '→ topic', topicId, 'chapter', chapterId);
    if (typeof showToast === 'function') showToast(`✅ ${type === 'quiz' ? 'Quiz' : 'Assignment'} linked to topic!`);

    window._ecmRunning = false;
    window._lastEcmChapterId = null;
    document.getElementById('editModalSubChapterSection')?.closest('div')?.remove();
    setTimeout(() => { window.openEditChapterModal(chapterId); }, 50);
};
// ── Unlink assessment from topic ─────────────────────
window.ecmUnlinkTopicAssessment = async function(assessmentId, chapterId, courseId) {
    const { data: a } = await getSB()
        .from('chapter_assessments')
        .select('assessment_type, quiz_id, assignment_id')
        .eq('id', assessmentId)
        .maybeSingle();

    if (a) {
        const table = a.assessment_type === 'quiz' ? 'quizzes' : 'assignments';
        const col   = a.assessment_type === 'quiz' ? a.quiz_id : a.assignment_id;
        await getSB().from(table).update({ chapter_id: null, topic_id: null }).eq('id', col);
    }

    await getSB().from('chapter_assessments').delete().eq('id', assessmentId);

    if (typeof showToast === 'function') showToast('Unlinked.');

window._ecmRunning = false;
window._lastEcmChapterId = null;
document.getElementById('editModalSubChapterSection')?.closest('div')?.remove();

// Small delay to ensure DOM is clean before reopening
setTimeout(() => {
    window.openEditChapterModal(chapterId);
}, 50);
};
window.ecmEditCodingExercise = async function(topicId, chapterId) {
        const { data: t } = await getSB()
            .from('topics')
            .select('has_coding_exercise, coding_prompt, coding_language, coding_starter_code')
            .eq('id', topicId)
            .maybeSingle();

        document.getElementById('ecmCodingModal')?.remove();
        const modal = document.createElement('div');
        modal.id = 'ecmCodingModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
        modal.innerHTML = `
        <div style="background:linear-gradient(135deg,#0f172a,#1e1b4b);border-radius:20px;padding:28px;width:520px;max-width:95vw;box-shadow:0 25px 60px rgba(0,0,0,0.5);">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
                <div style="width:40px;height:40px;background:linear-gradient(135deg,#6366f1,#4f46e5);border-radius:10px;display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-code" style="color:white;font-size:15px;"></i>
                </div>
                <div style="flex:1;">
                    <div style="font-size:16px;font-weight:800;color:white;">Coding Exercise</div>
                    <div style="font-size:12px;color:#6366f1;">Edit or add a coding exercise to this topic</div>
                </div>
                <button onclick="document.getElementById('ecmCodingModal').remove()" style="background:rgba(255,255,255,0.1);border:none;color:white;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;">✕</button>
            </div>

            <div style="margin-bottom:14px;">
                <label style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:8px;">Language</label>
                <select id="ecmCodingLang" style="width:100%;padding:10px;background:#1e1b4b;color:#a5b4fc;border:1.5px solid #4338ca;border-radius:10px;font-size:14px;font-family:inherit;outline:none;">
                    <option value="python"     ${(t?.coding_language||'python')==='python'    ?'selected':''}>Python 3</option>
                    <option value="javascript" ${(t?.coding_language||'')==='javascript'       ?'selected':''}>JavaScript</option>
                    <option value="both"       ${(t?.coding_language||'')==='both'             ?'selected':''}>Both</option>
                </select>
            </div>

            <div style="margin-bottom:14px;">
                <label style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:8px;">Problem / Instructions *</label>
                <textarea id="ecmCodingPrompt" rows="4"
                    style="width:100%;padding:12px;background:#1e1b4b;color:#c7d2fe;border:1.5px solid #4338ca;border-radius:10px;font-size:13px;font-family:inherit;outline:none;resize:vertical;box-sizing:border-box;"
                    placeholder="e.g. Write a function that calculates the average of a list…">${t?.coding_prompt || ''}</textarea>
            </div>

            <div style="margin-bottom:22px;">
                <label style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:8px;">Starter Code (optional)</label>
                <textarea id="ecmCodingStarter" rows="5"
                    style="width:100%;padding:12px;background:#0a0a1a;color:#a5b4fc;border:1.5px solid #4338ca;border-radius:10px;font-size:13px;font-family:'Courier New',monospace;outline:none;resize:vertical;box-sizing:border-box;"
                    placeholder="# Write starter code here">${t?.coding_starter_code || ''}</textarea>
            </div>

            <div style="display:flex;gap:10px;">
                <button onclick="document.getElementById('ecmCodingModal').remove()"
                    style="flex:1;padding:12px;border:1.5px solid rgba(255,255,255,0.2);border-radius:12px;background:transparent;color:#9ca3af;font-weight:700;cursor:pointer;font-family:inherit;">Cancel</button>
                <button onclick="ecmSaveCodingExercise('${topicId}','${chapterId}')"
                    style="flex:2;padding:12px;background:linear-gradient(135deg,#6366f1,#4f46e5);border:none;border-radius:12px;color:white;font-weight:800;cursor:pointer;font-family:inherit;font-size:14px;">
                    <i class="fas fa-save"></i> Save Exercise
                </button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    };

    window.ecmSaveCodingExercise = async function(topicId, chapterId) {
        const lang    = document.getElementById('ecmCodingLang')?.value    || 'python';
        const prompt  = document.getElementById('ecmCodingPrompt')?.value?.trim() || '';
        const starter = document.getElementById('ecmCodingStarter')?.value || '';

        if (!prompt) { if (typeof showToast === 'function') showToast('Please enter a problem statement', 'error'); return; }

        const { error } = await getSB().from('topics').update({
            has_coding_exercise: true,
            coding_prompt:       prompt,
            coding_language:     lang,
            coding_starter_code: starter || null
        }).eq('id', topicId);

        if (error) { if (typeof showToast === 'function') showToast('Error: ' + error.message, 'error'); return; }

        document.getElementById('ecmCodingModal')?.remove();
        if (typeof showToast === 'function') showToast('✅ Coding exercise saved!');
        window._ecmRunning = false;
        window._lastEcmChapterId = null;
        document.getElementById('editModalSubChapterSection')?.closest('div')?.remove();
        setTimeout(() => window.openEditChapterModal(chapterId), 50);
    };

    window.ecmDeleteCodingExercise = async function(topicId, chapterId) {
        if (!confirm('Remove the coding exercise from this topic?')) return;

        const { error } = await getSB().from('topics').update({
            has_coding_exercise: false,
            coding_prompt:       null,
            coding_language:     null,
            coding_starter_code: null
        }).eq('id', topicId);

        if (error) { if (typeof showToast === 'function') showToast('Error: ' + error.message, 'error'); return; }

        if (typeof showToast === 'function') showToast('Coding exercise removed.');
        window._ecmRunning = false;
        window._lastEcmChapterId = null;
        document.getElementById('editModalSubChapterSection')?.closest('div')?.remove();
        setTimeout(() => window.openEditChapterModal(chapterId), 50);
    };

    // ── Tiny HTML escape ───────────────────────────────────────
    function escHTML(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

   window.ecmDirectUnlinkTopic = async function(type, itemId, chapterId, courseId) {
        const table = type === 'quiz' ? 'quizzes' : 'assignments';
        const col   = type === 'quiz' ? 'quiz_id'  : 'assignment_id';
        await getSB().from(table).update({ chapter_id: null, topic_id: null }).eq('id', itemId);
        await getSB().from('chapter_assessments').delete().eq(col, itemId).eq('chapter_id', chapterId);
        if (typeof showToast === 'function') showToast('Unlinked.');
        window._ecmRunning = false;
        window._lastEcmChapterId = null;
        document.getElementById('editModalSubChapterSection')?.closest('div')?.remove();
        setTimeout(() => window.openEditChapterModal(chapterId), 50);
    };

    console.log('✅ edit-chapter-modal-patch.js loaded');
})();