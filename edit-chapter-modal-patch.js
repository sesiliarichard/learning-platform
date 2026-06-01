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

    // ── Patch openEditChapterModal to inject extra sections ───
    const _origOpen = window.openEditChapterModal;

    window.openEditChapterModal = async function (chapterId) {
        // Call original first (populates title, desc, topics)
        if (_origOpen) await _origOpen(chapterId);

        // Wait a tick for the modal DOM to settle
        await new Promise(r => setTimeout(r, 120));

        const form = document.getElementById('editChapterForm');
        if (!form) return;

        // Don't inject twice
        if (form.querySelector('#editModalSubChapterSection')) return;

        // ── 1. Get course_id for this chapter ─────────────────
        const { data: chapter } = await getSB()
            .from('chapters')
            .select('course_id')
            .eq('id', chapterId)
            .maybeSingle();

        const courseId = chapter?.course_id;
         // ── DEBUG: verify correct IDs ──
    console.log('chapterId received:', chapterId);
    console.log('chapter found:', chapter);
    console.log('courseId used for quiz fetch:', courseId);
        if (!courseId) return;

        // ── 2. Load existing sub-chapters ─────────────────────
        const { data: subChapters } = await getSB()
            .from('sub_chapters')
            .select('id, title, order_num')
            .eq('chapter_id', chapterId)
            .order('order_num', { ascending: true });

        // ── 3. Load quizzes / assignments for this course ──────
        const [quizzesRes, assignsRes, assessmentsRes, linkedQuizzesRes, linkedAssignsRes] = await Promise.all([
    getSB().from('quizzes').select('id, title').eq('course_id', courseId).order('title'),
    getSB().from('assignments').select('id, title').eq('course_id', courseId).order('title'),
    getSB().from('chapter_assessments')
    .select('id, assessment_type, quiz_id, assignment_id, quizzes(title), assignments(title)')
    .eq('chapter_id', chapterId)
    .eq('course_id', courseId)
    .is('topic_id', null),
    // Also fetch quizzes linked via direct chapter_id column
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
        // ── 4. Build sub-chapters HTML ─────────────────────────
        const scListHTML = (subChapters || []).map(sc => `
            <div class="edit-sc-item" id="editSC_${sc.id}"
                 style="display:flex;align-items:center;gap:10px;padding:10px 14px;
                        background:#f5f3ff;border:1.5px solid #ddd6fe;border-radius:10px;
                        margin-bottom:8px;">
                <i class="fas fa-layer-group" style="color:#7c3aed;flex-shrink:0;"></i>
                <span style="flex:1;font-weight:600;color:#374151;">${escHTML(sc.title)}</span>
                <button type="button"
                        onclick="ecmDeleteSubChapter('${sc.id}','${chapterId}','${courseId}')"
                        style="padding:4px 10px;background:#fee2e2;color:#dc2626;border:none;
                               border-radius:6px;font-size:12px;cursor:pointer;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>`).join('');

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

    <!-- Sub-chapters block -->
    <div style="background:#f8f7ff;border-radius:14px;padding:18px;margin-bottom:18px;border:1.5px solid #ede9fe;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <div style="font-size:13px;font-weight:800;color:#7c3aed;text-transform:uppercase;letter-spacing:1px;">
                <i class="fas fa-layer-group"></i> Sub-chapters
            </div>
            <button type="button" onclick="ecmAddSubChapter('${chapterId}','${courseId}')"
                    style="padding:7px 14px;background:linear-gradient(135deg,#7c3aed,#6d28d9);
                           color:white;border:none;border-radius:10px;font-size:12px;
                           font-weight:700;cursor:pointer;font-family:inherit;
                           display:flex;align-items:center;gap:6px;">
                <i class="fas fa-plus"></i> Add Sub-chapter
            </button>
        </div>
        <div id="editSCList">
            ${scListHTML || '<p style="font-size:13px;color:#9ca3af;text-align:center;padding:8px 0;">No sub-chapters yet.</p>'}
        </div>
        <div id="ecmNewSCForm" style="display:none;margin-top:12px;background:white;
                                      border-radius:10px;padding:14px;border:1.5px solid #ddd6fe;">
            <div style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:8px;">New Sub-chapter</div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <input type="text" id="ecmNewSCTitle"
                       placeholder="Sub-chapter title, e.g. 1.1 Introduction"
                       style="flex:1;min-width:180px;padding:9px 12px;border:1.5px solid #ddd6fe;
                              border-radius:8px;font-size:13px;font-family:inherit;outline:none;"
                       onfocus="this.style.borderColor='#7c3aed'"
                       onblur="this.style.borderColor='#ddd6fe'"
                       onkeypress="if(event.key==='Enter'){event.preventDefault();ecmSaveNewSC('${chapterId}','${courseId}');}">
                <input type="number" id="ecmNewSCOrder" value="1" min="1" placeholder="Order"
                       style="width:70px;padding:9px 8px;border:1.5px solid #ddd6fe;
                              border-radius:8px;font-size:13px;font-family:inherit;outline:none;"
                       onfocus="this.style.borderColor='#7c3aed'"
                       onblur="this.style.borderColor='#ddd6fe'">
                <button type="button" onclick="ecmSaveNewSC('${chapterId}','${courseId}')"
                        style="padding:9px 16px;background:#7c3aed;color:white;border:none;
                               border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">
                    <i class="fas fa-save"></i> Save
                </button>
                <button type="button" onclick="document.getElementById('ecmNewSCForm').style.display='none'"
                        style="padding:9px 12px;background:#f3f4f6;color:#6b7280;border:none;
                               border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">
                    Cancel
                </button>
            </div>
        </div>
    </div>

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
_renderTopicAssessments(chapterId, courseId, quizzes, assignments, assessments);

}

    // ── Show/hide inline sub-chapter form ─────────────────────
    window.ecmAddSubChapter = function (chapterId, courseId) {
        const form = document.getElementById('ecmNewSCForm');
        if (!form) return;
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
        if (form.style.display === 'block') {
            document.getElementById('ecmNewSCTitle')?.focus();
        }
    };

    // ── Save new sub-chapter ───────────────────────────────────
    window.ecmSaveNewSC = async function (chapterId, courseId) {
        const title = document.getElementById('ecmNewSCTitle')?.value?.trim();
        const order = parseInt(document.getElementById('ecmNewSCOrder')?.value) || 1;

        if (!title) {
            if (typeof showToast === 'function') showToast('Please enter a title', 'error');
            return;
        }

        const { data, error } = await getSB().from('sub_chapters').insert({
            chapter_id: chapterId,
            course_id:  courseId,
            title,
            order_num:  order
        }).select('id, title, order_num').single();

        if (error) {
            if (typeof showToast === 'function') showToast('Error: ' + error.message, 'error');
            return;
        }

        // Add pill to list
        const list = document.getElementById('editSCList');
        if (list) {
            // Remove "no sub-chapters" placeholder if present
            const placeholder = list.querySelector('p');
            if (placeholder) placeholder.remove();

            const item = document.createElement('div');
            item.id = `editSC_${data.id}`;
            item.className = 'edit-sc-item';
            item.style.cssText = `display:flex;align-items:center;gap:10px;padding:10px 14px;
                background:#f5f3ff;border:1.5px solid #ddd6fe;border-radius:10px;margin-bottom:8px;`;
            item.innerHTML = `
                <i class="fas fa-layer-group" style="color:#7c3aed;flex-shrink:0;"></i>
                <span style="flex:1;font-weight:600;color:#374151;">${escHTML(data.title)}</span>
                <button type="button"
                        onclick="ecmDeleteSubChapter('${data.id}','${chapterId}','${courseId}')"
                        style="padding:4px 10px;background:#fee2e2;color:#dc2626;border:none;
                               border-radius:6px;font-size:12px;cursor:pointer;">
                    <i class="fas fa-trash"></i>
                </button>`;
            list.appendChild(item);
        }

        // Reset & hide form
        const form = document.getElementById('ecmNewSCForm');
        if (form) {
            document.getElementById('ecmNewSCTitle').value = '';
            document.getElementById('ecmNewSCOrder').value = '1';
            form.style.display = 'none';
        }

        if (typeof showToast === 'function') showToast('✅ Sub-chapter added!');
    };

    // ── Delete sub-chapter ─────────────────────────────────────
    window.ecmDeleteSubChapter = async function (scId, chapterId, courseId) {
        if (!confirm('Delete this sub-chapter? Topics inside will become unassigned.')) return;

        // Unassign topics
        await getSB().from('topics').update({ sub_chapter_id: null }).eq('sub_chapter_id', scId);
        const { error } = await getSB().from('sub_chapters').delete().eq('id', scId);

        if (error) {
            if (typeof showToast === 'function') showToast('Error: ' + error.message, 'error');
            return;
        }

        document.getElementById(`editSC_${scId}`)?.remove();
        if (typeof showToast === 'function') showToast('Sub-chapter deleted.');

        const list = document.getElementById('editSCList');
        if (list && !list.querySelector('.edit-sc-item')) {
            list.innerHTML = '<p style="font-size:13px;color:#9ca3af;text-align:center;padding:8px 0;">No sub-chapters yet.</p>';
        }
    };

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
        document.getElementById('editModalSubChapterSection')?.closest('div')?.remove();
window.openEditChapterModal(chapterId);
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
            await getSB().from(table).update({ chapter_id: null }).eq('id', col);
        }

        await getSB().from('chapter_assessments').delete().eq('id', assessmentId);

        if (typeof showToast === 'function') showToast('Unlinked.');

        document.getElementById('editModalSubChapterSection')?.closest('div')?.remove();
window.openEditChapterModal(chapterId);
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

    if (!topics || topics.length === 0) {
        container.innerHTML = '<p style="font-size:13px;color:#9ca3af;padding:8px 0;">No topics yet. Save topics first, then link assessments.</p>';
        return;
    }

    // ── Fetch ALL topic-level assessments for this chapter in ONE query ──
    const { data: topicAssessmentRows } = await getSB()
        .from('chapter_assessments')
        .select('id, topic_id, assessment_type, quiz_id, assignment_id, quizzes(id,title), assignments(id,title)')
        .eq('chapter_id', chapterId)
        .eq('course_id', courseId)
        .not('topic_id', 'is', null);

    // Build map: topic_id → array of assessments
    const byTopic = {};
    (topicAssessmentRows || []).forEach(a => {
        if (!byTopic[a.topic_id]) byTopic[a.topic_id] = [];
        byTopic[a.topic_id].push(a);
    });

    // ── Collect ALL quiz/assign IDs already linked to ANY topic in this chapter ──
    // so we don't show them as available in other topics
    const allLinkedQuizIds   = new Set((topicAssessmentRows || []).filter(a => a.assessment_type === 'quiz'       && a.quiz_id).map(a => a.quiz_id));
    const allLinkedAssignIds = new Set((topicAssessmentRows || []).filter(a => a.assessment_type === 'assignment' && a.assignment_id).map(a => a.assignment_id));

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
                <button type="button" onclick="ecmUnlinkTopicAssessment('${a.id}','${chapterId}','${courseId}')"
                    style="background:none;border:none;cursor:pointer;color:#7c3aed;font-size:11px;">✕</button>
            </span>`).join('');

        const linkedAssignPills = topicAssessments
            .filter(a => a.assessment_type === 'assignment' && a.assignments)
            .map(a => `
            <span style="display:inline-flex;align-items:center;gap:6px;background:#d1fae5;
                         color:#065f46;padding:4px 10px;border-radius:20px;font-size:12px;
                         font-weight:600;margin:3px;">
                <i class="fas fa-tasks"></i> ${escHTML(a.assignments.title)}
                <button type="button" onclick="ecmUnlinkTopicAssessment('${a.id}','${chapterId}','${courseId}')"
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
        </div>`;
    }).join('');
}

// ── Link assessment to a specific topic ──────────────
window.ecmLinkTopicAssessment = async function(type, topicId, chapterId, courseId) {
    const pickerId = type === 'quiz'
        ? `topicQuizLink_${topicId}`
        : `topicAssignLink_${topicId}`;
    const itemId = document.getElementById(pickerId)?.value;
    if (!itemId) {
        if (typeof showToast === 'function') showToast('Please select an item to link', 'error');
        return;
    }

    // Update chapter_id on the item
    const table = type === 'quiz' ? 'quizzes' : 'assignments';
    await getSB().from(table).update({ chapter_id: chapterId }).eq('id', itemId);

    // Insert into chapter_assessments with topic_id
    const { error } = await getSB().from('chapter_assessments').insert({
        chapter_id:      chapterId,
        course_id:       courseId,
        assessment_type: type,
        topic_id:        topicId,
        quiz_id:        type === 'quiz'       ? itemId : null,
        assignment_id:  type === 'assignment' ? itemId : null,
        order_num:      1
    });

    if (error) {
        if (typeof showToast === 'function') showToast('Error: ' + error.message, 'error');
        return;
    }

    if (typeof showToast === 'function') showToast(`✅ ${type === 'quiz' ? 'Quiz' : 'Assignment'} linked to topic!`);

    // Refresh
   document.getElementById('editModalSubChapterSection')?.closest('div')?.remove();
window.openEditChapterModal(chapterId);
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
        await getSB().from(table).update({ chapter_id: null }).eq('id', col);
    }

    await getSB().from('chapter_assessments').delete().eq('id', assessmentId);

    if (typeof showToast === 'function') showToast('Unlinked.');

   document.getElementById('editModalSubChapterSection')?.closest('div')?.remove();
window.openEditChapterModal(chapterId);
};
    // ── Tiny HTML escape ───────────────────────────────────────
    function escHTML(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    console.log('✅ edit-chapter-modal-patch.js loaded');
})();