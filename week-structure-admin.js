// ============================================================
// ASAI Admin Patch: week-structure-admin.js
// Adds: Week → Sub-chapter → Topics + Chapter Assessment
//
// HOW TO USE:
//   Add this AFTER all other scripts in admin.html:
//   <script src="week-structure-admin.js"></script>
// ============================================================

(function () {
    'use strict';

    // ── State ──────────────────────────────────────────────
    let _subChapterCounter = 0;
    let _topicCounters     = {};   // { subChapterIdx: topicCount }

    // ── Helpers ────────────────────────────────────────────
    function getSB() { return window.supabaseClient || window.db; }
    function _esc(s) { return String(s || '').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function _toast(msg, type) {
        if (typeof showToast === 'function') showToast(msg, type);
        else console.log(msg);
    }

    // ── Override openCreateChapterModal ────────────────────
    window.openCreateChapterModal = function () {
        _subChapterCounter = 0;
        _topicCounters     = {};
        document.getElementById('createChapterModal')?.classList.remove('active');
        _buildWeekModal();
    };

    // ── Build the full Week modal ──────────────────────────
    function _buildWeekModal() {
        document.getElementById('weekStructureModal')?.remove();

        const modal = document.createElement('div');
        modal.id        = 'weekStructureModal';
        modal.className = 'modal active';
        modal.style.zIndex = '3000';

        modal.innerHTML = `
        <div class="modal-content modal-content-wide" style="max-width:860px;max-height:90vh;overflow-y:auto;">
            <div class="modal-header" style="position:sticky;top:0;background:white;z-index:10;border-bottom:2px solid #f3f4f6;padding-bottom:14px;">
                <h2 style="display:flex;align-items:center;gap:10px;">
                    <span style="width:36px;height:36px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border-radius:10px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <i class="fas fa-calendar-week" style="color:white;font-size:14px;"></i>
                    </span>
                    Create Week / Chapter
                </h2>
                <button class="modal-close" onclick="document.getElementById('weekStructureModal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <form id="weekStructureForm" style="padding:24px 0 0;">

                <!-- ── Week Info ── -->
                <div style="background:#f8f7ff;border-radius:14px;padding:20px;margin-bottom:24px;border:1.5px solid #ede9fe;">
                    <div style="font-size:13px;font-weight:800;color:#7c3aed;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;">
                        <i class="fas fa-info-circle"></i> Week Details
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
                        <div class="form-group" style="margin:0;">
                            <label>Select Course *</label>
                            <select id="ws_courseId" required style="width:100%;">
                                <option value="">Choose a course…</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label>Week / Chapter Title *</label>
                            <input type="text" id="ws_title" required placeholder="e.g. Week 1: Introduction to AI">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label>Display Order *</label>
                            <input type="number" id="ws_orderNum" min="1" value="1" placeholder="1">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label>Description (optional)</label>
                            <input type="text" id="ws_desc" placeholder="Brief overview of this week">
                        </div>
                    </div>
                </div>

                <!-- ── Sub-chapters ── -->
                <div style="margin-bottom:20px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                        <div style="font-size:13px;font-weight:800;color:#1f2937;text-transform:uppercase;letter-spacing:1px;">
                            <i class="fas fa-layer-group" style="color:#7c3aed;margin-right:6px;"></i>
                            Sub-chapters
                        </div>
                        <button type="button" onclick="wsAddSubChapter()"
                            style="padding:8px 16px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px;">
                            <i class="fas fa-plus"></i> Add Sub-chapter
                        </button>
                    </div>
                    <div id="ws_subChaptersContainer"></div>
                </div>

                <!-- ── End-of-Week Assessment ── -->
                <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1.5px solid #bbf7d0;border-radius:14px;padding:20px;margin-bottom:24px;">
                    <div style="font-size:13px;font-weight:800;color:#065f46;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;">
                        <i class="fas fa-tasks" style="color:#10b981;margin-right:6px;"></i>
                        End-of-Week Assessment (optional)
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 2fr;gap:14px;align-items:end;">
                        <div class="form-group" style="margin:0;">
                            <label>Type</label>
                            <select id="ws_assessType" onchange="wsToggleAssessment()" style="width:100%;">
                                <option value="">None</option>
                                <option value="quiz">Quiz</option>
                                <option value="assignment">Assignment</option>
                            </select>
                        </div>
                        <div id="ws_assessPickerWrap" style="display:none;" class="form-group" style="margin:0;">
                            <label id="ws_assessPickerLabel">Select Quiz</label>
                            <select id="ws_assessId" style="width:100%;">
                                <option value="">Loading…</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- ── Actions ── -->
                <div class="modal-actions" style="position:sticky;bottom:0;background:white;padding-top:16px;margin-top:0;border-top:2px solid #f3f4f6;">
                    <button type="button" class="btn-secondary" onclick="document.getElementById('weekStructureModal').remove()">Cancel</button>
                    <button type="submit" class="btn-primary" id="ws_submitBtn">
                        <i class="fas fa-save"></i> Save Week
                    </button>
                </div>

            </form>
        </div>`;

        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        // Populate course dropdown
        _populateWsCourses();

        // Add first sub-chapter automatically
        wsAddSubChapter();

        // Wire form submit
        document.getElementById('weekStructureForm').onsubmit = _handleWsSubmit;
    }

    async function _populateWsCourses() {
        const sel = document.getElementById('ws_courseId');
        if (!sel) return;
        const { data: courses } = await getSB()
            .from('courses').select('id, title').order('order_num', { ascending: true });
        while (sel.options.length > 1) sel.remove(1);
        (courses || []).forEach(c => {
            const o = document.createElement('option');
            o.value = c.id;
            o.textContent = c.title;
            sel.appendChild(o);
        });
    }

    // ── Toggle quiz / assignment picker ───────────────────
    window.wsToggleAssessment = async function () {
        const type = document.getElementById('ws_assessType')?.value;
        const wrap = document.getElementById('ws_assessPickerWrap');
        const sel  = document.getElementById('ws_assessId');
        const lbl  = document.getElementById('ws_assessPickerLabel');
        if (!wrap || !sel) return;

        if (!type) { wrap.style.display = 'none'; return; }
        wrap.style.display = 'block';
        lbl.textContent = type === 'quiz' ? 'Select Quiz' : 'Select Assignment';

        sel.innerHTML = '<option value="">Loading…</option>';
        const table = type === 'quiz' ? 'quizzes' : 'assignments';
        const { data } = await getSB().from(table).select('id, title').order('title');
        sel.innerHTML = `<option value="">Choose ${type}…</option>`;
        (data || []).forEach(item => {
            const o = document.createElement('option');
            o.value = item.id;
            o.textContent = item.title;
            sel.appendChild(o);
        });
    };

    // ── Add Sub-chapter block ──────────────────────────────
    window.wsAddSubChapter = function () {
        const idx = _subChapterCounter++;
        _topicCounters[idx] = 0;

        const container = document.getElementById('ws_subChaptersContainer');
        if (!container) return;

        const div = document.createElement('div');
        div.id = `ws_sc_${idx}`;
        div.style.cssText = 'background:white;border:1.5px solid #e5e7eb;border-radius:14px;margin-bottom:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.04);';

        div.innerHTML = `
            <!-- Sub-chapter header -->
            <div style="background:linear-gradient(135deg,#f8f7ff,#f0ecff);padding:14px 18px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #e5e7eb;">
                <div style="width:28px;height:28px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:800;flex-shrink:0;">${idx + 1}</div>
                <input type="text" id="ws_sc_title_${idx}"
                    placeholder="Sub-chapter title, e.g. 1.1 What is Machine Learning?"
                    style="flex:1;padding:8px 12px;border:1.5px solid #ddd6fe;border-radius:8px;font-size:13px;font-family:inherit;outline:none;font-weight:600;"
                    onfocus="this.style.borderColor='#7c3aed'" onblur="this.style.borderColor='#ddd6fe'">
                <button type="button" onclick="wsRemoveSubChapter(${idx})"
                    style="width:30px;height:30px;background:#fee2e2;color:#dc2626;border:none;border-radius:8px;cursor:pointer;font-size:13px;flex-shrink:0;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>

            <!-- Topics inside this sub-chapter -->
            <div style="padding:14px 18px 10px;">
                <div id="ws_topics_${idx}" style="margin-bottom:10px;"></div>
                <button type="button" onclick="wsAddTopic(${idx})"
                    style="padding:7px 14px;background:#ede9fe;color:#7c3aed;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px;">
                    <i class="fas fa-plus"></i> Add Topic
                </button>
            </div>`;

        container.appendChild(div);

        // Add first topic automatically
        wsAddTopic(idx);
    };

    window.wsRemoveSubChapter = function (idx) {
        document.getElementById(`ws_sc_${idx}`)?.remove();
    };

    // ── Add Topic inside a Sub-chapter ────────────────────
    window.wsAddTopic = function (scIdx) {
        const topicIdx  = _topicCounters[scIdx]++;
        const globalIdx = `${scIdx}_${topicIdx}`;
        const container = document.getElementById(`ws_topics_${scIdx}`);
        if (!container) return;

        const div = document.createElement('div');
        div.id = `ws_topic_${globalIdx}`;
        div.style.cssText = 'background:#fafafa;border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:10px;';

        div.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                <span style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;white-space:nowrap;">Topic ${topicIdx + 1}</span>
                <input type="text" id="ws_t_title_${globalIdx}"
                    placeholder="Topic title, e.g. Types of Machine Learning"
                    style="flex:1;padding:7px 11px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;font-family:inherit;outline:none;"
                    onfocus="this.style.borderColor='#7c3aed'" onblur="this.style.borderColor='#e5e7eb'">
                <button type="button" onclick="wsRemoveTopic('${globalIdx}')"
                    style="width:28px;height:28px;background:#fee2e2;color:#dc2626;border:none;border-radius:7px;cursor:pointer;font-size:12px;flex-shrink:0;">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <!-- Mini rich-text toolbar -->
            <div class="editor-toolbar" style="margin-bottom:6px;flex-wrap:wrap;gap:2px;">
                <button type="button" class="editor-btn" onclick="wsFormatTopic('${globalIdx}','bold')" title="Bold"><b>B</b></button>
                <button type="button" class="editor-btn" onclick="wsFormatTopic('${globalIdx}','italic')" title="Italic"><i>I</i></button>
                <button type="button" class="editor-btn" onclick="wsFormatTopic('${globalIdx}','underline')" title="Underline"><u>U</u></button>
                <div class="editor-sep"></div>
                <button type="button" class="editor-btn" onclick="wsFormatTopic('${globalIdx}','insertUnorderedList')" title="Bullet"><i class="fas fa-list-ul"></i></button>
                <button type="button" class="editor-btn" onclick="wsFormatTopic('${globalIdx}','insertOrderedList')" title="Numbered"><i class="fas fa-list-ol"></i></button>
                <button type="button" class="editor-btn" onclick="wsFormatTopic('${globalIdx}','formatBlock','<h3>')" title="Heading"><i class="fas fa-heading"></i></button>
                <div class="editor-sep"></div>
                <button type="button" class="editor-btn" onclick="wsFormatTopic('${globalIdx}','justifyLeft')" title="Left"><i class="fas fa-align-left"></i></button>
                <button type="button" class="editor-btn" onclick="wsFormatTopic('${globalIdx}','justifyCenter')" title="Center"><i class="fas fa-align-center"></i></button>
            </div>
            <div class="editor-content" contenteditable="true"
                 id="ws_t_content_${globalIdx}"
                 style="min-height:90px;padding:10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;line-height:1.6;outline:none;font-family:'Plus Jakarta Sans',sans-serif;"
                 data-placeholder="Write topic content here…"
                 onfocus="this.style.borderColor='#7c3aed'" onblur="this.style.borderColor='#e5e7eb'">
            </div>
            <div style="display:flex;gap:10px;margin-top:8px;">
                <div style="flex:1;">
                    <label style="font-size:11px;font-weight:700;color:#6b7280;display:block;margin-bottom:3px;">Reading time (min)</label>
                    <input type="number" id="ws_t_dur_${globalIdx}" min="1" value="15" style="width:100%;padding:6px 10px;border:1.5px solid #e5e7eb;border-radius:7px;font-size:12px;font-family:inherit;">
                </div>
                <div style="flex:1;">
                    <label style="font-size:11px;font-weight:700;color:#6b7280;display:block;margin-bottom:3px;">Category</label>
                    <select id="ws_t_cat_${globalIdx}" style="width:100%;padding:6px 10px;border:1.5px solid #e5e7eb;border-radius:7px;font-size:12px;font-family:inherit;">
                        <option value="basics">Basics</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                        <option value="practical">Practical</option>
                    </select>
                </div>
            </div>`;

        container.appendChild(div);
    };

    window.wsRemoveTopic = function (globalIdx) {
        document.getElementById(`ws_topic_${globalIdx}`)?.remove();
    };

    window.wsFormatTopic = function (globalIdx, cmd, val) {
        const editor = document.getElementById(`ws_t_content_${globalIdx}`);
        if (!editor) return;
        editor.focus();
        setTimeout(() => document.execCommand(cmd, false, val || null), 10);
    };

    // ── Save handler ──────────────────────────────────────
    async function _handleWsSubmit(e) {
        e.preventDefault();
        const btn = document.getElementById('ws_submitBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

        try {
            const courseId  = document.getElementById('ws_courseId')?.value;
            const title     = document.getElementById('ws_title')?.value?.trim();
            const desc      = document.getElementById('ws_desc')?.value?.trim() || '';
            const orderNum  = parseInt(document.getElementById('ws_orderNum')?.value) || 1;

            if (!courseId) throw new Error('Please select a course.');
            if (!title)    throw new Error('Please enter a week title.');

            const sb = getSB();

            // 1. Create chapter
            const { data: chapterArr, error: cErr } = await sb
                .from('chapters')
                .insert({ course_id: courseId, title, description: desc, order_num: orderNum, published: false })
                .select('id');
            if (cErr) throw cErr;
            const chapterId = chapterArr[0]?.id;
            if (!chapterId) throw new Error('Chapter not created.');

            // 2. Create sub-chapters + topics
            const scDivs = document.querySelectorAll('#ws_subChaptersContainer > div[id^="ws_sc_"]');
            let scOrder  = 1;

            for (const scDiv of scDivs) {
                const scIdx  = scDiv.id.replace('ws_sc_', '');
                const scTitle = document.getElementById(`ws_sc_title_${scIdx}`)?.value?.trim();
                if (!scTitle) continue;

                // Insert sub-chapter
                const { data: scArr, error: scErr } = await sb
                    .from('sub_chapters')
                    .insert({ chapter_id: chapterId, course_id: courseId, title: scTitle, order_num: scOrder++ })
                    .select('id');
                if (scErr) throw scErr;
                const subChapterId = scArr[0]?.id;

                // Collect topics for this sub-chapter
                const topicDivs = document.querySelectorAll(`#ws_topics_${scIdx} > div[id^="ws_topic_"]`);
                const topicsToInsert = [];
                let tOrder = 1;

                for (const tDiv of topicDivs) {
                    const gIdx    = tDiv.id.replace('ws_topic_', '');
                    const tTitle  = document.getElementById(`ws_t_title_${gIdx}`)?.value?.trim();
                    const content = document.getElementById(`ws_t_content_${gIdx}`)?.innerHTML || '';
                    const dur     = document.getElementById(`ws_t_dur_${gIdx}`)?.value || '15';
                    const cat     = document.getElementById(`ws_t_cat_${gIdx}`)?.value || 'basics';
                    if (!tTitle) continue;

                    const textOnly = content.replace(/<[^>]*>/g, '').trim();
                    topicsToInsert.push({
                        chapter_id:     chapterId,
                        sub_chapter_id: subChapterId,
                        course_id:      courseId,
                        title:          tTitle,
                        content:        textOnly ? content : '',
                        duration:       dur,
                        category:       cat,
                        order_num:      tOrder++
                    });
                }

                if (topicsToInsert.length > 0) {
                    const { error: tErr } = await sb.from('topics').insert(topicsToInsert);
                    if (tErr) throw tErr;
                }
            }

            // 3. End-of-week assessment
            const assessType = document.getElementById('ws_assessType')?.value;
            const assessId   = document.getElementById('ws_assessId')?.value;
            if (assessType && assessId) {
                const { error: aErr } = await sb.from('chapter_assessments').insert({
                    chapter_id:      chapterId,
                    course_id:       courseId,
                    assessment_type: assessType,
                    quiz_id:        assessType === 'quiz'       ? assessId : null,
                    assignment_id:  assessType === 'assignment' ? assessId : null,
                    order_num:      1
                });
                if (aErr) console.warn('Assessment link warning:', aErr.message);
            }

            document.getElementById('weekStructureModal')?.remove();
            _toast('✅ Week saved! Sub-chapters, topics and assessment linked.');

            // Refresh admin course notes list
            if (typeof loadChapters === 'function') loadChapters();
            if (typeof loadAdminCourses === 'function') loadAdminCourses();

        } catch (err) {
            console.error('wsSubmit error:', err);
            _toast('Error: ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save Week'; }
        }
    }

    // ── Patch loadChapters to show sub-chapter structure ──
    // We wrap the existing function to also show sub-chapters
    const _origLoadChapters = window.loadChapters;
    window.loadChapters = async function () {
        // Call original to render base chapters
        if (_origLoadChapters) await _origLoadChapters();
        // Then annotate each chapter card with sub-chapter info
        await _annotateChaptersWithSubChapters();
    };

    async function _annotateChaptersWithSubChapters() {
        const courseId = document.getElementById('courseSelectNotes')?.value;
        if (!courseId) return;

        const sb = getSB();
        const { data: subChapters } = await sb
            .from('sub_chapters')
            .select('id, chapter_id, title, order_num')
            .eq('course_id', courseId)
            .order('order_num', { ascending: true });

        if (!subChapters || subChapters.length === 0) return;

        // Group sub-chapters by chapter_id
        const byChapter = {};
        subChapters.forEach(sc => {
            if (!byChapter[sc.chapter_id]) byChapter[sc.chapter_id] = [];
            byChapter[sc.chapter_id].push(sc);
        });

        // Also fetch assessments for this course
        const { data: assessments } = await sb
            .from('chapter_assessments')
            .select(`
                id, chapter_id, assessment_type,
                quizzes(id, title),
                assignments(id, title)
            `)
            .eq('course_id', courseId);

        const assessByChapter = {};
        (assessments || []).forEach(a => {
            assessByChapter[a.chapter_id] = a;
        });

        // Find each chapter card and inject the sub-chapter badge list + assessment badge
        const chapterCards = document.querySelectorAll('#chaptersContainer .card');
        chapterCards.forEach(card => {
            // Try to extract chapter id from any button inside the card
            const editBtn = card.querySelector('[onclick*="openEditChapterModal"]');
            if (!editBtn) return;
            const match = editBtn.getAttribute('onclick')?.match(/'([^']+)'/);
            if (!match) return;
            const chId = match[1];

            const scs    = byChapter[chId] || [];
            const assess = assessByChapter[chId];

            // Remove any existing annotation
            card.querySelector('.ws-sub-annotation')?.remove();

            if (scs.length === 0 && !assess) return;

            const ann = document.createElement('div');
            ann.className = 'ws-sub-annotation';
            ann.style.cssText = 'margin-top:12px;padding-top:12px;border-top:1px solid #f3f4f6;';

            let html = '';

            if (scs.length > 0) {
                html += `<div style="font-size:12px;font-weight:700;color:#7c3aed;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;"><i class="fas fa-layer-group"></i> Sub-chapters</div>`;
                html += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:${assess ? 10 : 0}px;">`;
                scs.forEach(sc => {
                    html += `<span style="background:#ede9fe;color:#5b21b6;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">${_esc(sc.title)}</span>`;
                });
                html += `</div>`;
            }

            if (assess) {
                const label = assess.assessment_type === 'quiz'
                    ? (assess.quizzes?.title || 'Quiz')
                    : (assess.assignments?.title || 'Assignment');
                const color  = assess.assessment_type === 'quiz' ? '#0ea5e9' : '#10b981';
                const icon   = assess.assessment_type === 'quiz' ? 'fa-question-circle' : 'fa-tasks';
                const badge  = assess.assessment_type === 'quiz' ? 'Quiz' : 'Assignment';
                html += `
                <div style="display:flex;align-items:center;gap:8px;background:#f0f9ff;border-radius:10px;padding:8px 12px;border:1px solid #bae6fd;">
                    <i class="fas ${icon}" style="color:${color};"></i>
                    <span style="font-size:12px;font-weight:600;color:#0c4a6e;">End-of-Week ${badge}:</span>
                    <span style="font-size:13px;font-weight:700;color:#0369a1;">${_esc(label)}</span>
                    <button onclick="wsEditAssessment('${chId}','${assess.id}')"
                        style="margin-left:auto;padding:4px 10px;background:white;border:1.5px solid ${color};color:${color};border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;">
                        <i class="fas fa-pencil"></i> Change
                    </button>
                </div>`;
            } else {
                html += `
                <button onclick="wsAttachAssessment('${chId}', '${courseId}')"
                    style="padding:6px 14px;background:#f0f9ff;border:1.5px dashed #7dd3fc;color:#0369a1;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">
                    <i class="fas fa-plus"></i> Attach Quiz / Assignment
                </button>`;
            }

            ann.innerHTML = html;
            card.appendChild(ann);
        });
    }

    // ── Attach / change assessment on existing chapter ──
    window.wsAttachAssessment = async function (chapterId, courseId) {
        _openAssessmentPicker(chapterId, courseId, null);
    };
    window.wsEditAssessment = async function (chapterId, assessmentId) {
        // Get course id
        const { data: ch } = await getSB().from('chapters').select('course_id').eq('id', chapterId).maybeSingle();
        _openAssessmentPicker(chapterId, ch?.course_id, assessmentId);
    };

    async function _openAssessmentPicker(chapterId, courseId, existingId) {
        document.getElementById('wsAssessPickerModal')?.remove();
        const modal = document.createElement('div');
        modal.id        = 'wsAssessPickerModal';
        modal.className = 'modal active';
        modal.style.zIndex = '4000';
        modal.innerHTML = `
        <div class="modal-content" style="max-width:460px;">
            <div class="modal-header">
                <h2><i class="fas fa-link" style="color:#10b981;margin-right:8px;"></i>${existingId ? 'Change' : 'Attach'} Assessment</h2>
                <button class="modal-close" onclick="document.getElementById('wsAssessPickerModal').remove()"><i class="fas fa-times"></i></button>
            </div>
            <div class="form-group">
                <label>Type</label>
                <select id="wsp_type" onchange="wspLoadItems()" style="width:100%;">
                    <option value="">None (remove)</option>
                    <option value="quiz">Quiz</option>
                    <option value="assignment">Assignment</option>
                </select>
            </div>
            <div id="wsp_itemWrap" class="form-group" style="display:none;">
                <label id="wsp_itemLabel">Select Quiz</label>
                <select id="wsp_itemId" style="width:100%;"><option value="">Loading…</option></select>
            </div>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="document.getElementById('wsAssessPickerModal').remove()">Cancel</button>
                <button type="button" class="btn-primary" onclick="wspSave('${chapterId}','${courseId}','${existingId||''}')">
                    <i class="fas fa-save"></i> Save
                </button>
            </div>
        </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    }

    window.wspLoadItems = async function () {
        const type = document.getElementById('wsp_type')?.value;
        const wrap = document.getElementById('wsp_itemWrap');
        const sel  = document.getElementById('wsp_itemId');
        const lbl  = document.getElementById('wsp_itemLabel');
        if (!wrap || !sel) return;
        if (!type) { wrap.style.display = 'none'; return; }
        wrap.style.display = 'block';
        lbl.textContent = type === 'quiz' ? 'Select Quiz' : 'Select Assignment';
        sel.innerHTML = '<option value="">Loading…</option>';
        const table = type === 'quiz' ? 'quizzes' : 'assignments';
        const { data } = await getSB().from(table).select('id, title').order('title');
        sel.innerHTML = `<option value="">Choose…</option>`;
        (data || []).forEach(item => {
            const o = document.createElement('option');
            o.value = item.id; o.textContent = item.title;
            sel.appendChild(o);
        });
    };

    window.wspSave = async function (chapterId, courseId, existingId) {
        const type    = document.getElementById('wsp_type')?.value;
        const itemId  = document.getElementById('wsp_itemId')?.value;
        const sb      = getSB();

        // Delete existing if any
        if (existingId) {
            await sb.from('chapter_assessments').delete().eq('id', existingId);
        }

        // Insert new
        if (type && itemId) {
            const { error } = await sb.from('chapter_assessments').insert({
                chapter_id:      chapterId,
                course_id:       courseId,
                assessment_type: type,
                quiz_id:        type === 'quiz'       ? itemId : null,
                assignment_id:  type === 'assignment' ? itemId : null,
                order_num:      1
            });
            if (error) { _toast('Error: ' + error.message, 'error'); return; }
        }

        document.getElementById('wsAssessPickerModal')?.remove();
        _toast('✅ Assessment updated!');
        if (typeof loadChapters === 'function') loadChapters();
    };

    console.log('✅ week-structure-admin.js loaded');
})();