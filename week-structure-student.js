// ============================================================
// ASAI Student Patch: week-structure-student.js
// ============================================================

(function () {
    'use strict';

    function getSB() { return window.supabaseClient; }
    function _esc(s) { return String(s || '').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function _loadingHtml() {
        return `<div style="padding:60px;text-align:center;color:#9ca3af;">
            <i class="fas fa-spinner fa-spin" style="font-size:28px;display:block;margin-bottom:14px;"></i>
            Loading week content…
        </div>`;
    }

    // ─────────────────────────────────────────────────────────
    // PUBLIC ENTRY
    // ─────────────────────────────────────────────────────────
    window.loadWeekStructure = async function (chapter, containerEl) {
        if (!containerEl) return;
        containerEl.innerHTML = _loadingHtml();

        const sb = getSB();
        if (!sb) { containerEl.innerHTML = '<p>Not connected.</p>'; return; }

        try {
            const { data: subChapters } = await sb
                .from('sub_chapters')
                .select('id, title, order_num')
                .eq('chapter_id', chapter.id)
                .order('order_num', { ascending: true });

            const { data: topics } = await sb
                .from('topics')
                .select('id, title, content, duration, category, order_num, sub_chapter_id, has_coding_exercise, coding_prompt, coding_language, coding_starter_code')
                .eq('chapter_id', chapter.id)
                .order('order_num', { ascending: true });

            const { data: assessments } = await sb
                .from('chapter_assessments')
                .select(`id, assessment_type, quizzes(id, title, time_limit), assignments(id, title, instructions, due_date, max_points)`)
                .eq('chapter_id', chapter.id)
                .limit(1);

            const assessment = assessments?.[0] || null;

            const { data: { user } } = await sb.auth.getUser();
            let readTopicIds = new Set();
            if (user) {
                const { data: progress } = await sb
                    .from('course_progress')
                    .select('topic_id')
                    .eq('student_id', user.id)
                    .eq('course_id', chapter.course_id);
                (progress || []).forEach(p => readTopicIds.add(p.topic_id));
            }

            _renderWeekView(containerEl, chapter, subChapters || [], topics || [], assessment, readTopicIds, user?.id);

        } catch (err) {
            console.error('loadWeekStructure error:', err);
            containerEl.innerHTML = `<div style="color:#ef4444;padding:20px;">Error: ${err.message}</div>`;
        }
    };

    // ─────────────────────────────────────────────────────────
    // RENDER WEEK VIEW
    // ─────────────────────────────────────────────────────────
    function _renderWeekView(container, chapter, subChapters, allTopics, assessment, readTopicIds, userId) {
        container.classList.add('week-structure-active');
        container.style.padding = '0';
        container.style.border = 'none';
        container.style.background = 'transparent';
        container.style.boxShadow = 'none';

        const topicsBySubChapter = {};
        const orphanTopics = [];

        allTopics.forEach(t => {
            if (t.sub_chapter_id) {
                if (!topicsBySubChapter[t.sub_chapter_id]) topicsBySubChapter[t.sub_chapter_id] = [];
                topicsBySubChapter[t.sub_chapter_id].push(t);
            } else {
                orphanTopics.push(t);
            }
        });

        const totalTopics = allTopics.length;
        const readCount   = allTopics.filter(t => readTopicIds.has(t.id)).length;
        const pct         = totalTopics > 0 ? Math.round((readCount / totalTopics) * 100) : 0;

        let html = `
        <div style="background:linear-gradient(135deg,#f8f7ff,#f0ecff);border-radius:16px;padding:20px 24px;margin-bottom:24px;border:1.5px solid #ddd6fe;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
                <div>
                    <div style="font-size:18px;font-weight:800;color:#1f2937;">${_esc(chapter.title)}</div>
                    ${chapter.description ? `<div style="font-size:13px;color:#6b7280;margin-top:3px;">${_esc(chapter.description)}</div>` : ''}
                </div>
                <div style="text-align:right;">
                    <div style="font-size:22px;font-weight:800;color:#7c3aed;">${pct}%</div>
                    <div style="font-size:11px;color:#9ca3af;">${readCount}/${totalTopics} topics read</div>
                </div>
            </div>
            <div style="height:8px;background:#ddd6fe;border-radius:20px;overflow:hidden;">
                <div id="weekProgressBar_${chapter.id}"
                     style="height:100%;width:${pct}%;background:linear-gradient(90deg,#7c3aed,#8b5cf6);border-radius:20px;transition:width 0.6s ease;"></div>
            </div>
        </div>`;

        if (subChapters.length > 0) {
            subChapters.forEach((sc, scIndex) => {
                const scTopics = (topicsBySubChapter[sc.id] || [])
                    .sort((a, b) => (a.order_num ?? 999) - (b.order_num ?? 999));
                const scRead  = scTopics.filter(t => readTopicIds.has(t.id)).length;
                const scTotal = scTopics.length;
                const scAllRead = scTotal > 0 && scRead === scTotal;

                html += `
                <div class="ws-subchapter-block" style="margin-bottom:20px;border:1.5px solid #e5e7eb;border-radius:14px;overflow:hidden;background:var(--ws-card-bg,white);box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                    <div style="background:${scAllRead ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : 'linear-gradient(135deg,#fafafa,#f5f3ff)'};
                                padding:14px 18px;display:flex;align-items:center;gap:12px;cursor:pointer;user-select:none;"
                         onclick="wsToggleSubChapter('${sc.id}')">
                        <div style="width:32px;height:32px;border-radius:10px;
                                    background:${scAllRead ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#7c3aed,#6d28d9)'};
                                    display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:13px;flex-shrink:0;">
                            ${scAllRead ? '<i class="fas fa-check" style="font-size:12px;"></i>' : (scIndex + 1)}
                        </div>
                        <div style="flex:1;">
                            <div style="font-weight:700;color:#1f2937;font-size:15px;">${_esc(sc.title)}</div>
                            <div style="font-size:12px;color:#6b7280;margin-top:1px;">${scRead}/${scTotal} topics read</div>
                        </div>
                        <i id="wsScArrow_${sc.id}" class="fas fa-chevron-down" style="color:#7c3aed;transition:transform 0.25s;"></i>
                    </div>
                    <div id="wsSc_${sc.id}" style="border-top:1px solid #f3f4f6;">
                        ${scTopics.length === 0
                            ? `<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">No topics yet.</div>`
                            : scTopics.map((t, ti) => _topicRow(t, ti, readTopicIds.has(t.id), chapter.course_id, chapter.id)).join('')
                        }
                    </div>
                </div>`;
            });
        }

        if (orphanTopics.length > 0) {
            html += `
           <div style="margin-bottom:20px;border:1.5px solid #e5e7eb;border-radius:14px;overflow:hidden;background:var(--ws-card-bg,white);">
                <div style="background:#f9fafb;padding:12px 18px;border-bottom:1px solid #f3f4f6;">
                    <div style="font-weight:700;color:#374151;font-size:13px;">
                        <i class="fas fa-book-open" style="color:#7c3aed;margin-right:6px;"></i>Topics
                    </div>
                </div>
                ${orphanTopics.map((t, ti) => _topicRow(t, ti, readTopicIds.has(t.id), chapter.course_id, chapter.id)).join('')}
            </div>`;
        }

        if (assessment) {
            html += _assessmentSection(assessment, chapter.id, allTopics.length, readTopicIds);
        }

        container.innerHTML = html;

        window.wsToggleSubChapter = function (scId) {
            const body  = document.getElementById(`wsSc_${scId}`);
            const arrow = document.getElementById(`wsScArrow_${scId}`);
            if (!body) return;
            const open = body.style.display !== 'none';
            body.style.display  = open ? 'none' : 'block';
            if (arrow) arrow.style.transform = open ? 'rotate(-90deg)' : 'rotate(0deg)';
        };

        // Wire up code block run buttons
        _wireCodeBlocks(container);
      setTimeout(() => {
    container.querySelectorAll('.asai-inline-coding').forEach(block => {
        const lang = block.dataset.lang || 'python';
        _wireInlineCodingBlock(block, lang);
    });
    // Also wire any existing blocks inside contenteditable editors
    document.querySelectorAll('.editor-content .asai-inline-coding').forEach(block => {
        const lang = block.dataset.lang || 'python';
        _wireInlineCodingBlock(block, lang);
    });
}, 100);
    }

    // ─────────────────────────────────────────────────────────
    // WIRE CODE BLOCKS - makes Run buttons work
    // ─────────────────────────────────────────────────────────
    function _wireCodeBlocks(container) {
        container.querySelectorAll('.asai-code-block').forEach(block => {
            const runBtn = block.querySelector('.asai-run-btn');
            if (!runBtn || runBtn.dataset.wired) return;
            runBtn.dataset.wired = '1';

            runBtn.addEventListener('click', async () => {
                const lang   = block.getAttribute('data-language') || 'python';
                const pre    = block.querySelector('pre');
                const code   = pre?.textContent || '';
                const output = block.querySelector('.asai-code-output');
                const outPre = output?.querySelector('pre');

                if (!output || !outPre) return;

                runBtn.textContent = '⏳ Running…';
                output.style.display = 'block';
                outPre.textContent   = 'Running…';
                outPre.style.color   = '#94a3b8';

                try {
                    const result = await _runCode(code, lang);
                    outPre.textContent = result.output || result.error || '(No output)';
                    outPre.style.color = result.error ? '#f87171' : '#4ade80';
                } catch (err) {
                    outPre.textContent = 'Error: ' + err.message;
                    outPre.style.color = '#f87171';
                }

                runBtn.textContent = '▶ Run';
            });
        });
    }

    // ─────────────────────────────────────────────────────────
    // TOPIC ROW
    // ─────────────────────────────────────────────────────────
    function _topicRow(topic, index, isRead, courseId, chapterId) {
        const catColors = {
            basics:       { bg: '#dbeafe', color: '#1d4ed8' },
            intermediate: { bg: '#ede9fe', color: '#5b21b6' },
            advanced:     { bg: '#fee2e2', color: '#991b1b' },
            practical:    { bg: '#d1fae5', color: '#065f46' }
        };
        const cc = catColors[topic.category] || catColors.basics;

        const codingBadge = topic.has_coding_exercise
            ? `<span style="background:#1e1b4b;color:#a5b4fc;padding:1px 8px;border-radius:20px;font-size:10px;font-weight:700;margin-left:4px;">
                <i class="fas fa-code" style="margin-right:3px;"></i>Code
               </span>`
            : '';

        return `
        <div id="wsTopicRow_${topic.id}"
             style="padding:14px 18px;border-bottom:1px solid #f9fafb;display:flex;align-items:center;gap:12px;cursor:pointer;transition:background 0.15s;${isRead ? 'background:#f0fdf4;' : ''}"
             onclick="wsOpenTopic('${topic.id}','${courseId}','${chapterId}')">
            <div style="width:28px;height:28px;border-radius:50%;flex-shrink:0;
                        background:${isRead ? 'linear-gradient(135deg,#10b981,#059669)' : '#f3f4f6'};
                        border:2px solid ${isRead ? '#10b981' : '#e5e7eb'};
                        display:flex;align-items:center;justify-content:center;">
                ${isRead
                    ? '<i class="fas fa-check" style="color:white;font-size:10px;"></i>'
                    : `<span style="font-size:10px;font-weight:700;color:#9ca3af;">${index + 1}</span>`
                }
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;color:#1f2937;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${_esc(topic.title)}
                </div>
                <div style="display:flex;align-items:center;gap:8px;margin-top:3px;flex-wrap:wrap;">
                    <span style="font-size:11px;color:#6b7280;"><i class="fas fa-clock" style="margin-right:3px;"></i>${topic.duration || 15} min</span>
                    <span style="background:${cc.bg};color:${cc.color};padding:1px 8px;border-radius:20px;font-size:10px;font-weight:700;">${topic.category || 'basics'}</span>
                    ${codingBadge}
                </div>
            </div>
            <i class="fas fa-chevron-right" style="color:#d1d5db;font-size:12px;flex-shrink:0;"></i>
        </div>`;
    }

    // ─────────────────────────────────────────────────────────
    // ASSESSMENT SECTION
    // ─────────────────────────────────────────────────────────
    function _assessmentSection(assessment, chapterId, totalTopics, readTopicIds) {
        const allRead    = readTopicIds.size >= totalTopics && totalTopics > 0;
        const type       = assessment.assessment_type;
        const item       = type === 'quiz' ? assessment.quizzes : assessment.assignments;
        const label      = item?.title || (type === 'quiz' ? 'Chapter Quiz' : 'Chapter Assignment');
        const color      = type === 'quiz' ? '#0ea5e9' : '#10b981';
        const icon       = type === 'quiz' ? 'fa-question-circle' : 'fa-tasks';
        const bgGradient = type === 'quiz' ? 'linear-gradient(135deg,#f0f9ff,#e0f2fe)' : 'linear-gradient(135deg,#f0fdf4,#dcfce7)';
        const border     = type === 'quiz' ? '#7dd3fc' : '#86efac';

        return `
        <div id="wsAssessSection_${chapterId}"
             style="margin-top:24px;background:${bgGradient};border:2px solid ${border};border-radius:16px;padding:22px;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
                <div style="width:42px;height:42px;border-radius:12px;background:${color};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i class="fas ${icon}" style="color:white;font-size:18px;"></i>
                </div>
                <div>
                    <div style="font-size:16px;font-weight:800;color:#1f2937;">End-of-Week ${type === 'quiz' ? 'Quiz' : 'Assignment'}</div>
                    <div style="font-size:13px;font-weight:600;color:#374151;">${_esc(label)}</div>
                </div>
                ${!allRead && totalTopics > 0 ? `
                <div style="margin-left:auto;display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.7);padding:6px 12px;border-radius:20px;">
                    <i class="fas fa-lock" style="color:#9ca3af;font-size:12px;"></i>
                    <span style="font-size:12px;color:#6b7280;font-weight:600;">Read all topics to unlock</span>
                </div>` : ''}
            </div>
            ${!allRead && totalTopics > 0
                ? `<div style="background:rgba(255,255,255,0.6);border-radius:10px;padding:16px;text-align:center;color:#6b7280;">
                       <i class="fas fa-lock" style="font-size:28px;opacity:0.3;display:block;margin-bottom:8px;"></i>
                       <div style="font-size:13px;">Complete all topics to unlock.</div>
                       <div style="margin-top:8px;font-size:12px;color:#9ca3af;">${readTopicIds.size}/${totalTopics} topics read</div>
                   </div>`
                : `<div id="wsAssessContent_${chapterId}">
                       ${type === 'quiz' ? _inlineQuizLoader(assessment, chapterId) : _inlineAssignmentLoader(assessment, chapterId)}
                   </div>`
            }
        </div>`;
    }

    function _inlineQuizLoader(assessment, chapterId) {
        const quiz = assessment.quizzes;
        if (!quiz) return '<p style="color:#6b7280;">Quiz not found.</p>';
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
            <div>${quiz.time_limit ? `<span style="font-size:12px;color:#0369a1;"><i class="fas fa-clock" style="margin-right:4px;"></i>${quiz.time_limit} min</span>` : ''}</div>
            <button onclick="wsStartQuiz('${quiz.id}','${chapterId}')"
                style="padding:11px 24px;background:linear-gradient(135deg,#0ea5e9,#0284c7);color:white;border:none;
                       border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">
                <i class="fas fa-play"></i> Start Quiz
            </button>
        </div>`;
    }

    function _inlineAssignmentLoader(assessment, chapterId) {
        const a = assessment.assignments;
        if (!a) return '<p style="color:#6b7280;">Assignment not found.</p>';
        const due = a.due_date ? new Date(a.due_date).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }) : null;
        return `
        <div>
            ${a.instructions ? `<div style="background:rgba(255,255,255,0.7);border-radius:10px;padding:14px;margin-bottom:14px;font-size:14px;color:#374151;line-height:1.7;">${a.instructions}</div>` : ''}
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                <div style="font-size:12px;color:#065f46;">
                    ${due ? `<span><i class="fas fa-calendar" style="margin-right:4px;"></i>Due: ${due}</span>` : ''}
                    ${a.max_points ? `&nbsp;•&nbsp;<span>${a.max_points} points</span>` : ''}
                </div>
                <button onclick="wsOpenAssignment('${a.id}','${chapterId}')"
                    style="padding:11px 24px;background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;
                           border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">
                    <i class="fas fa-paper-plane"></i> Submit Assignment
                </button>
            </div>
        </div>`;
    }

    // ─────────────────────────────────────────────────────────
    // OPEN TOPIC MODAL
    // ─────────────────────────────────────────────────────────
    window.wsOpenTopic = async function (topicId, courseId, chapterId) {
        const sb = getSB();
        const { data: topic } = await sb
            .from('topics')
            .select('id, title, content, duration, category, has_coding_exercise, coding_prompt, coding_language, coding_starter_code')
            .eq('id', topicId)
            .maybeSingle();
        if (!topic) return;
        _showTopicModal(topic, courseId, chapterId);
    };

    function _showTopicModal(topic, courseId, chapterId) {
        document.getElementById('wsTopicModal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'wsTopicModal';
        modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(0,0,0,0.65);z-index:9000;display:flex;
            align-items:flex-start;justify-content:center;padding:20px;
            overflow-y:auto;backdrop-filter:blur(4px);`;

        const codingSection = topic.has_coding_exercise && topic.coding_prompt
            ? _buildCodingExercise(topic)
            : '';

        modal.innerHTML = `
        <div style="background:white;border-radius:20px;width:100%;max-width:760px;margin:auto;box-shadow:0 25px 60px rgba(0,0,0,0.35);overflow:hidden;">
            <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:20px 24px;display:flex;align-items:center;justify-content:space-between;">
                <div style="color:white;">
                    <div style="font-size:16px;font-weight:800;">${_esc(topic.title)}</div>
                    <div style="font-size:12px;opacity:0.8;margin-top:2px;">
                        <i class="fas fa-clock" style="margin-right:4px;"></i>${topic.duration || 15} min read
                        ${topic.has_coding_exercise ? ' &nbsp;•&nbsp; <i class="fas fa-code" style="margin-right:4px;"></i>Includes Coding Exercise' : ''}
                    </div>
                </div>
                <button onclick="document.getElementById('wsTopicModal').remove()"
                    style="width:34px;height:34px;background:rgba(255,255,255,0.2);border:none;border-radius:50%;color:white;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div style="padding:28px 30px;font-size:15px;line-height:1.8;color:#374151;max-height:55vh;overflow-y:auto;" id="wsTopicContentArea">
                ${topic.content || '<p style="color:#9ca3af;font-style:italic;">No content yet.</p>'}
            </div>

            ${codingSection}

            <div style="padding:16px 24px;border-top:1px solid #f3f4f6;display:flex;justify-content:space-between;align-items:center;background:#fafafa;">
                <button onclick="document.getElementById('wsTopicModal').remove()"
                    style="padding:10px 20px;border:2px solid #e5e7eb;border-radius:10px;background:white;color:#6b7280;font-weight:700;cursor:pointer;font-family:inherit;">
                    Close
                </button>
                <button id="wsMarkReadBtn_${topic.id}"
                        onclick="wsMarkTopicRead('${topic.id}','${courseId}','${chapterId}', this)"
                    style="padding:10px 24px;background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;border-radius:10px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:8px;">
                    <i class="fas fa-check"></i> Mark as Read
                </button>
            </div>
        </div>`;

        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        // Wire code blocks inside modal
        const contentArea = modal.querySelector('#wsTopicContentArea');
        if (contentArea) _wireCodeBlocks(contentArea);

        // Wire coding exercise run button
        _wireCodingExercise(modal, topic);
    }

    // ─────────────────────────────────────────────────────────
    // BUILD CODING EXERCISE SECTION
    // ─────────────────────────────────────────────────────────
    function _buildCodingExercise(topic) {
        const lang        = topic.coding_language || 'python';
        const starter     = topic.coding_starter_code || _getDefaultStarter(lang);
        const langDisplay = lang === 'both' ? 'Python / JavaScript' : lang.charAt(0).toUpperCase() + lang.slice(1);

        const langOptions = lang === 'both'
           ? `<option value="python">Python 3</option>`
            : `<option value="${lang}">${langDisplay}</option>`;

        return `
        <div style="background:linear-gradient(135deg,#0f172a,#1e1b4b);padding:24px 30px;border-top:2px solid #312e81;">
            <!-- Header -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:36px;height:36px;background:linear-gradient(135deg,#7c3aed,#6366f1);border-radius:10px;display:flex;align-items:center;justify-content:center;">
                        <i class="fas fa-code" style="color:white;font-size:14px;"></i>
                    </div>
                    <div>
                        <div style="font-size:15px;font-weight:800;color:white;">Coding Exercise</div>
                        <div style="font-size:11px;color:#6366f1;">${langDisplay}</div>
                    </div>
                </div>
                ${lang === 'both' ? `
                <select id="wsCodingLangSwitch_${topic.id}"
                    onchange="wsSwitchCodingLang('${topic.id}')"
                    style="padding:7px 12px;background:#1e1b4b;color:#a5b4fc;border:1.5px solid #4338ca;border-radius:8px;font-size:13px;font-family:inherit;outline:none;">
                    ${langOptions}
                </select>` : ''}
            </div>

            <!-- Problem statement -->
            <div style="background:rgba(99,102,241,0.15);border:1.5px solid #4338ca;border-radius:12px;padding:14px;margin-bottom:16px;">
                <div style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
                    <i class="fas fa-lightbulb" style="margin-right:6px;"></i>Problem
                </div>
                <div style="font-size:14px;color:#c7d2fe;line-height:1.7;">${_esc(topic.coding_prompt)}</div>
            </div>

            <!-- Code editor -->
            <div style="margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;">Your Code</span>
                    <button onclick="wsResetCode('${topic.id}')"
                        style="padding:4px 10px;background:rgba(255,255,255,0.1);color:#94a3b8;border:none;border-radius:6px;font-size:11px;cursor:pointer;font-family:inherit;">
                        <i class="fas fa-undo"></i> Reset
                    </button>
                </div>
                <textarea id="wsCodingEditor_${topic.id}" rows="8"
                    style="width:100%;padding:14px;background:#0a0a1a;color:#a5b4fc;border:1.5px solid #4338ca;border-radius:10px;font-size:13px;font-family:'Courier New',monospace;outline:none;resize:vertical;box-sizing:border-box;line-height:1.6;"
                    spellcheck="false">${starter}</textarea>
            </div>

            <!-- Run button -->
            <div style="display:flex;gap:10px;margin-bottom:12px;">
                <button onclick="wsRunCodingExercise('${topic.id}','${lang}')"
                    style="flex:1;padding:12px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;">
                    <i class="fas fa-play"></i> Run Code
                </button>
            </div>

            <!-- Output area -->
            <div id="wsCodingOutput_${topic.id}" style="display:none;background:#0a0a1a;border:1.5px solid #4338ca;border-radius:10px;padding:14px;">
                <div style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
                    <i class="fas fa-terminal" style="margin-right:6px;"></i>Output
                </div>
                <pre id="wsCodingResult_${topic.id}" style="margin:0;font-family:'Courier New',monospace;font-size:13px;color:#4ade80;white-space:pre-wrap;word-break:break-all;"></pre>
            </div>
        </div>`;
    }

    function _getDefaultStarter(lang) {
        if (lang === 'javascript') return `// Write your solution here\nfunction solution() {\n    // Your code here\n}\n\nconsole.log(solution());`;
        return `# Write your solution here\ndef solution():\n    # Your code here\n    pass\n\nprint(solution())`;
    }

    function _wireCodingExercise(modal, topic) {
        // Store starter code for reset
        window._wsStarterCodes = window._wsStarterCodes || {};
        window._wsStarterCodes[topic.id] = topic.coding_starter_code || _getDefaultStarter(topic.coding_language || 'python');
    }

    window.wsResetCode = function(topicId) {
        const editor = document.getElementById(`wsCodingEditor_${topicId}`);
        if (editor && window._wsStarterCodes?.[topicId]) {
            editor.value = window._wsStarterCodes[topicId];
        }
    };

    window.wsSwitchCodingLang = function(topicId) {
        const lang   = document.getElementById(`wsCodingLangSwitch_${topicId}`)?.value || 'python';
        const editor = document.getElementById(`wsCodingEditor_${topicId}`);
        if (editor) editor.value = _getDefaultStarter(lang);
    };

    // ─────────────────────────────────────────────────────────
    // RUN CODING EXERCISE
    // ─────────────────────────────────────────────────────────
    window.wsRunCodingExercise = async function(topicId, defaultLang) {
        const editor  = document.getElementById(`wsCodingEditor_${topicId}`);
        const output  = document.getElementById(`wsCodingOutput_${topicId}`);
        const result  = document.getElementById(`wsCodingResult_${topicId}`);
        const runBtn  = document.querySelector(`button[onclick*="wsRunCodingExercise('${topicId}']`);

        if (!editor || !output || !result) return;

        const code = editor.value;
        const lang = document.getElementById(`wsCodingLangSwitch_${topicId}`)?.value || defaultLang || 'python';

        output.style.display = 'block';
        result.style.color   = '#94a3b8';
        result.textContent   = '⏳ Running your code…';
        if (runBtn) { runBtn.disabled = true; runBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running…'; }

        try {
            const res = await _runCode(code, lang);
            if (res.error) {
                result.style.color = '#f87171';
                result.textContent = '❌ Error:\n' + res.error;
            } else {
                result.style.color = '#4ade80';
                result.textContent = res.output || '(No output)';
            }
        } catch (err) {
            result.style.color = '#f87171';
            result.textContent = 'Error: ' + err.message;
        }

        if (runBtn) { runBtn.disabled = false; runBtn.innerHTML = '<i class="fas fa-play"></i> Run Code'; }
    };

    // ─────────────────────────────────────────────────────────
    // SUBMIT CODING EXERCISE
    // ─────────────────────────────────────────────────────────
    window.wsSubmitCodingExercise = async function(topicId, courseId) {
        const editor = document.getElementById(`wsCodingEditor_${topicId}`);
        const output = document.getElementById(`wsCodingResult_${topicId}`);
        if (!editor) return;

        const code = editor.value;
        const lang = document.getElementById(`wsCodingLangSwitch_${topicId}`)?.value || 'python';
        const outputText = output?.textContent || '';

        try {
            const sb = getSB();
            const { data: { user } } = await sb.auth.getUser();
            if (!user) { alert('Please log in first.'); return; }

            const { error } = await sb.from('coding_submissions').insert({
                student_id:  user.id,
                topic_id:    topicId,
                course_id:   courseId || null,
                language:    lang,
                code:        code,
                output:      outputText,
                submitted_at: new Date().toISOString()
            });

            if (error) throw error;

            // Show success message
            const outputDiv = document.getElementById(`wsCodingOutput_${topicId}`);
            if (outputDiv) {
                outputDiv.style.display = 'block';
                const resultEl = document.getElementById(`wsCodingResult_${topicId}`);
                if (resultEl) {
                    resultEl.style.color = '#4ade80';
                    resultEl.textContent = '✅ Solution submitted successfully! Your instructor will review it.';
                }
            }

        } catch (err) {
            alert('Error submitting: ' + err.message);
        }
    };

    // ─────────────────────────────────────────────────────────
    // CODE RUNNER - supports Python and JavaScript
    // ─────────────────────────────────────────────────────────
   async function _runCode(code, lang) {
        // Python and others - use Piston API
        try {
           const langMap = {
                python:     { language: 'python',     version: '3.10.0' },
                javascript: { language: 'javascript', version: '18.15.0' },
                java:       { language: 'java',       version: '15.0.2'  },
                sql:        { language: 'sqlite3',    version: '3.36.0' },
                bash:       { language: 'bash',       version: '5.2.0' },
                html:       { language: 'javascript', version: '18.15.0' }
            };

            const pistonLang = langMap[lang] || langMap.python;

            const response = await fetch('https://emkc.org/api/v2/piston/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    language: pistonLang.language,
                    version:  pistonLang.version,
                    files: [{ content: code }]
                })
            });

            if (!response.ok) throw new Error('API error: ' + response.status);

            const data = await response.json();
            const stdout = data.run?.stdout || '';
            const stderr = data.run?.stderr || '';

            if (stderr && !stdout) return { output: '', error: stderr };
            return { output: stdout + (stderr ? '\n⚠️ Warnings:\n' + stderr : ''), error: null };

        } catch (err) {
            // Fallback for Python simulation
            if (lang === 'python') {
                return _simulatePython(code);
            }
            return { output: '', error: 'Could not run code: ' + err.message };
        }
    }

    function _runJavaScript(code) {
        let output = '';
        let error  = null;

        const originalLog     = console.log;
        const originalError   = console.error;
        const originalWarn    = console.warn;

        console.log   = (...args) => { output += args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') + '\n'; originalLog(...args); };
        console.error = (...args) => { output += '❌ ' + args.join(' ') + '\n'; originalError(...args); };
        console.warn  = (...args) => { output += '⚠️ ' + args.join(' ') + '\n'; originalWarn(...args); };

        try {
            const result = new Function(code)();
            if (result !== undefined && !output) output = String(result);
        } catch (err) {
            error = err.message;
        } finally {
            console.log   = originalLog;
            console.error = originalError;
            console.warn  = originalWarn;
        }

        return { output: output || (error ? '' : '(No output)'), error };
    }

    function _simulatePython(code) {
        // Basic simulation when API is unavailable
        let output = '';
        const printMatches = code.matchAll(/print\s*\(([^)]+)\)/g);
        for (const match of printMatches) {
            try {
                const content = match[1].trim()
                    .replace(/^["']|["']$/g, '')
                    .replace(/f["'](.+?)["']/, '$1');
                output += content + '\n';
            } catch(e) { /* skip */ }
        }
        return {
            output: output || '(Code executed - install Python runtime for full output)',
            error: null
        };
    }

    // ─────────────────────────────────────────────────────────
    // WIRE CODE BLOCKS in rendered content
    // ─────────────────────────────────────────────────────────
    function _wireCodeBlocks(container) {
        container.querySelectorAll('.asai-code-block').forEach(block => {
            const runBtn = block.querySelector('.asai-run-btn');
            if (!runBtn || runBtn.dataset.wired) return;
            runBtn.dataset.wired = '1';

            runBtn.addEventListener('click', async () => {
                const lang   = block.getAttribute('data-language') || 'python';
                const pre    = block.querySelector('pre');
                const code   = pre?.textContent || '';
                const output = block.querySelector('.asai-code-output');
                const outPre = output?.querySelector('pre');

                if (!output || !outPre) return;

                runBtn.innerHTML = '⏳ Running…';
                output.style.display = 'block';
                outPre.textContent   = 'Running…';
                outPre.style.color   = '#94a3b8';

                try {
                    const result = await _runCode(code, lang);
                    outPre.textContent = result.error
                        ? '❌ Error:\n' + result.error
                        : (result.output || '(No output)');
                    outPre.style.color = result.error ? '#f87171' : '#4ade80';
                } catch (err) {
                    outPre.textContent = 'Error: ' + err.message;
                    outPre.style.color = '#f87171';
                }

                runBtn.innerHTML = '▶ Run';
            });
        });
    }

    // ─────────────────────────────────────────────────────────
    // MARK TOPIC AS READ
    // ─────────────────────────────────────────────────────────
    window.wsMarkTopicRead = async function (topicId, courseId, chapterId, btn) {
        const sb = getSB();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;

        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

        await sb.from('course_progress').upsert({
            student_id:   user.id,
            user_id:      user.id,
            topic_id:     topicId,
            course_id:    courseId,
            completed:    true,
            completed_at: new Date().toISOString()
        }, { onConflict: 'student_id,topic_id' });

        document.getElementById('wsTopicModal')?.remove();

        const row = document.getElementById(`wsTopicRow_${topicId}`);
        if (row) {
            row.style.background = '#f0fdf4';
            const indicator = row.querySelector('div:first-child');
            if (indicator) {
                indicator.style.background  = 'linear-gradient(135deg,#10b981,#059669)';
                indicator.style.borderColor = '#10b981';
                indicator.innerHTML = '<i class="fas fa-check" style="color:white;font-size:10px;"></i>';
            }
        }

        await _refreshChapterProgress(chapterId, courseId, user.id);
        _updateEnrollmentProgress(courseId, user.id);
    };

    async function _refreshChapterProgress(chapterId, courseId, userId) {
        const sb = getSB();
        const { data: topics }   = await sb.from('topics').select('id').eq('chapter_id', chapterId);
        const { data: progress } = await sb.from('course_progress')
            .select('topic_id').eq('student_id', userId).eq('course_id', courseId);

        const readIds = new Set((progress || []).map(p => p.topic_id));
        const total   = (topics || []).length;
        const read    = (topics || []).filter(t => readIds.has(t.id)).length;
        const pct     = total > 0 ? Math.round((read / total) * 100) : 0;

        const bar = document.getElementById(`weekProgressBar_${chapterId}`);
        if (bar) bar.style.width = pct + '%';
    }

    async function _updateEnrollmentProgress(courseId, userId) {
        try {
            const sb = getSB();
            const { data: topics }   = await sb.from('topics').select('id').eq('course_id', courseId);
            const { data: progress } = await sb.from('course_progress').select('topic_id').eq('student_id', userId).eq('course_id', courseId);
            const total = (topics || []).length;
            const read  = (progress || []).length;
            const pct   = total > 0 ? Math.round((read / total) * 100) : 0;
            await sb.from('enrollments').update({ progress: pct, updated_at: new Date().toISOString() })
                .eq('student_id', userId).eq('course_id', courseId);
        } catch (e) { /* silent */ }
    }

    // ─────────────────────────────────────────────────────────
    // START QUIZ
    // ─────────────────────────────────────────────────────────
    window.wsStartQuiz = async function (quizId, chapterId) {
        if (typeof window.startQuiz === 'function') { window.startQuiz(quizId); return; }
        if (typeof selectQuiz === 'function') { selectQuiz(quizId); return; }

        const sb = getSB();
        const { data: quiz } = await sb.from('quizzes').select('id, title, time_limit').eq('id', quizId).maybeSingle();
        if (!quiz) { alert('Quiz not found.'); return; }

        const container = document.getElementById(`wsAssessContent_${chapterId}`);
        if (!container) return;

        container.innerHTML = `<div style="text-align:center;padding:30px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;color:#0ea5e9;"></i><div style="margin-top:8px;color:#6b7280;">Loading quiz…</div></div>`;

        const { data: questions } = await sb.from('quiz_questions').select('*').eq('quiz_id', quizId).order('order_num', { ascending: true });

        if (!questions || questions.length === 0) {
            container.innerHTML = '<p style="padding:20px;color:#6b7280;">This quiz has no questions yet.</p>';
            return;
        }

        _renderInlineQuiz(container, quiz, questions, chapterId);
    };

    function _renderInlineQuiz(container, quiz, questions, chapterId) {
        window._wsQuizAnswers = {};
        window._wsQuizQs      = questions;

        let html = `
        <div style="font-weight:700;color:#0369a1;margin-bottom:16px;font-size:15px;">
            <i class="fas fa-question-circle" style="margin-right:6px;"></i>${_esc(quiz.title)}
            <span style="font-size:12px;font-weight:400;color:#6b7280;margin-left:8px;">${questions.length} question${questions.length !== 1 ? 's' : ''}</span>
        </div>`;

        questions.forEach((q, qi) => {
            const opts = q.options || q.answer_options || [];
            html += `
            <div style="background:white;border-radius:12px;padding:16px;margin-bottom:14px;border:1.5px solid #e0f2fe;">
                <div style="font-weight:700;color:#1f2937;margin-bottom:12px;">
                    <span style="color:#0ea5e9;margin-right:6px;">${qi + 1}.</span> ${_esc(q.question || q.question_text || '')}
                </div>`;

            if (q.type === 'truefalse') {
                html += `<div style="display:flex;gap:10px;">
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 14px;border:1.5px solid #e5e7eb;border-radius:8px;">
                        <input type="radio" name="q${qi}" value="true" onchange="window._wsQuizAnswers['${q.id}']='true'"> True
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 14px;border:1.5px solid #e5e7eb;border-radius:8px;">
                        <input type="radio" name="q${qi}" value="false" onchange="window._wsQuizAnswers['${q.id}']='false'"> False
                    </label>
                </div>`;
            } else if (!opts.length) {
                html += `<textarea rows="3" placeholder="Type your answer…"
                    oninput="window._wsQuizAnswers['${q.id}']=this.value"
                    style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:13px;resize:vertical;box-sizing:border-box;"></textarea>`;
            } else {
                html += `<div style="display:flex;flex-direction:column;gap:8px;">
                    ${Array.isArray(opts) ? opts.map((opt, oi) => `
                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;">
                        <input type="radio" name="q${qi}" value="${oi}" onchange="window._wsQuizAnswers['${q.id}']=${oi};">
                        <span>${typeof opt === 'object' ? _esc(opt.text || opt) : _esc(String(opt))}</span>
                    </label>`).join('') : ''}
                </div>`;
            }

            html += `</div>`;
        });

        html += `
        <div style="display:flex;justify-content:flex-end;margin-top:14px;">
            <button onclick="wsSubmitInlineQuiz('${quiz.id}','${chapterId}')"
                style="padding:12px 28px;background:linear-gradient(135deg,#0ea5e9,#0284c7);color:white;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">
                <i class="fas fa-paper-plane"></i> Submit Quiz
            </button>
        </div>`;

        container.innerHTML = html;
    }

    window.wsSubmitInlineQuiz = async function (quizId, chapterId) {
        const answers   = window._wsQuizAnswers || {};
        const questions = window._wsQuizQs || [];
        const sb        = getSB();
        const { data: { user } } = await sb.auth.getUser();

        let correct = 0;
        questions.forEach(q => {
            const ans = answers[q.id];
            const correctAns = q.correct_answer ?? q.correct_option;
            if (ans !== undefined && String(ans) === String(correctAns)) correct++;
        });

        const score = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;

        if (user) {
            const { data: ch } = await sb.from('chapter_assessments').select('course_id').eq('chapter_id', chapterId).maybeSingle();
            await sb.from('quiz_submissions').insert({
                student_id:   user.id,
                user_id:      user.id,
                quiz_id:      quizId,
                course_id:    ch?.course_id || null,
                score,
                submitted_at: new Date().toISOString(),
                answers:      JSON.stringify(answers)
            });
        }

        const container = document.getElementById(`wsAssessContent_${chapterId}`);
        if (!container) return;

        const color = score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
        container.innerHTML = `
        <div style="text-align:center;padding:30px 20px;">
            <div style="font-size:52px;font-weight:900;color:${color};margin-bottom:8px;">${score}%</div>
            <div style="font-size:16px;font-weight:700;color:#1f2937;margin-bottom:4px;">
                ${score >= 70 ? '🎉 Great work!' : score >= 50 ? '👍 Good effort!' : '📚 Keep studying!'}
            </div>
            <div style="font-size:13px;color:#6b7280;margin-bottom:20px;">${correct} / ${questions.length} correct</div>
            <button onclick="wsStartQuiz('${quizId}','${chapterId}')"
                style="padding:10px 22px;background:#f3f4f6;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;color:#374151;">
                <i class="fas fa-redo"></i> Retake Quiz
            </button>
        </div>`;
    };

    window.wsOpenAssignment = function (assignmentId, chapterId) {
        if (typeof openAssignmentSubmission === 'function') { openAssignmentSubmission(assignmentId); return; }
        if (typeof submitAssignmentModal === 'function') { submitAssignmentModal(assignmentId); return; }
        const nav = document.querySelector('.nav-item[data-section="assignments"]');
        if (nav) nav.click();
    };

    // ─────────────────────────────────────────────────────────
    // HOOK INTO NOTES READER
    // ─────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        document.addEventListener('click', async (e) => {
            const chapterTrigger = e.target.closest('[data-chapter-id]');
            if (!chapterTrigger) return;

            const chapterId = chapterTrigger.getAttribute('data-chapter-id');
            const courseId  = chapterTrigger.getAttribute('data-course-id');
            if (!chapterId || !courseId) return;

            const sb = getSB();
            if (!sb) return;

            const { data: scs } = await sb.from('sub_chapters').select('id').eq('chapter_id', chapterId).limit(1);
            if (!scs || scs.length === 0) return;

            const contentArea = document.getElementById('notesContent')
                             || document.getElementById('topicContent')
                             || document.getElementById('chapterContent')
                             || document.querySelector('.notes-content')
                             || document.querySelector('.topic-content');

            if (!contentArea) return;
            e.stopPropagation();

            loadWeekStructure({
                id:          chapterId,
                course_id:   courseId,
                title:       chapterTrigger.textContent?.trim() || ''
            }, contentArea);
        });
    });

    console.log('✅ week-structure-student.js loaded');
})();