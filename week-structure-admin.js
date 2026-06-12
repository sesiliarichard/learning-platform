// ============================================================
// ASAI Admin Patch: week-structure-admin.js
// ============================================================

(function () {
    'use strict';

    let _subChapterCounter = 0;
    let _topicCounters     = {};

    function getSB() { return window.supabaseClient || window.db; }
    function _esc(s) { return String(s || '').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function _toast(msg, type) {
        if (typeof showToast === 'function') showToast(msg, type);
        else console.log(msg);
    }
// Week structure modal disabled — using default chapter modal instead
// window.openCreateChapterModal is left to admin.html's original function

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
                        <div id="ws_assessPickerWrap" style="display:none;" class="form-group">
                            <label id="ws_assessPickerLabel">Select Quiz</label>
                            <select id="ws_assessId" style="width:100%;">
                                <option value="">Loading…</option>
                            </select>
                        </div>
                    </div>
                </div>

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
       _populateWsCourses();
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
                    placeholder="Topic title"
                    style="flex:1;padding:7px 11px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;font-family:inherit;outline:none;"
                    onfocus="this.style.borderColor='#7c3aed'" onblur="this.style.borderColor='#e5e7eb'">
                <button type="button" onclick="wsRemoveTopic('${globalIdx}')"
                    style="width:28px;height:28px;background:#fee2e2;color:#dc2626;border:none;border-radius:7px;cursor:pointer;font-size:12px;flex-shrink:0;">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <!-- Rich text toolbar -->
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
                <div class="editor-sep"></div>
                <!-- Code block button -->
                <button type="button" class="editor-btn" onclick="wsInsertCodeBlock('${globalIdx}')" 
                    title="Insert Code Block"
                    style="background:#1e1b4b;color:#a5b4fc;border-radius:6px;padding:4px 8px;">
                    <i class="fas fa-code"></i>
                </button>
            </div>

            <!-- Content editor -->
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
            </div>

            <!-- ── Coding Exercise Section ── -->
            <div style="margin-top:14px;background:linear-gradient(135deg,#1e1b4b,#312e81);border-radius:12px;padding:16px;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                        <input type="checkbox" id="ws_t_hasCoding_${globalIdx}"
                            onchange="wsToggleCodingSection('${globalIdx}')"
                            style="width:16px;height:16px;cursor:pointer;">
                        <span style="font-size:13px;font-weight:700;color:#a5b4fc;">
                            <i class="fas fa-code" style="margin-right:6px;"></i>
                            Add Coding Exercise
                        </span>
                    </label>
                </div>
                <div id="ws_t_codingSection_${globalIdx}" style="display:none;">
                    <div style="margin-bottom:10px;">
                        <label style="font-size:11px;font-weight:700;color:#a5b4fc;display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">Language</label>
                        <select id="ws_t_lang_${globalIdx}" 
                            style="width:100%;padding:8px 12px;border:1.5px solid #4338ca;border-radius:8px;font-size:13px;font-family:inherit;background:#1e1b4b;color:#a5b4fc;outline:none;">
                            <option value="python">Python</option>
                            <option value="javascript">JavaScript</option>
                            <option value="both">Both (student chooses)</option>
                        </select>
                    </div>
                    <div style="margin-bottom:10px;">
                        <label style="font-size:11px;font-weight:700;color:#a5b4fc;display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">Problem Statement / Instructions</label>
                        <textarea id="ws_t_prompt_${globalIdx}" rows="3"
                            placeholder="e.g. Write a function that takes a list of numbers and returns the average..."
                            style="width:100%;padding:10px;border:1.5px solid #4338ca;border-radius:8px;font-size:13px;font-family:inherit;background:#1e1b4b;color:#c7d2fe;outline:none;resize:vertical;box-sizing:border-box;"></textarea>
                    </div>
                    <div>
                        <label style="font-size:11px;font-weight:700;color:#a5b4fc;display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">Starter Code (optional)</label>
                        <textarea id="ws_t_starterCode_${globalIdx}" rows="4"
                            placeholder="# Write starter code here&#10;def calculate_average(numbers):&#10;    # Your code here&#10;    pass"
                            style="width:100%;padding:10px;border:1.5px solid #4338ca;border-radius:8px;font-size:13px;font-family:'Courier New',monospace;background:#0f0e2a;color:#a5b4fc;outline:none;resize:vertical;box-sizing:border-box;"></textarea>
                    </div>
                </div>
            </div>`;

        container.appendChild(div);
    };

    window.wsToggleCodingSection = function(globalIdx) {
        const checkbox = document.getElementById(`ws_t_hasCoding_${globalIdx}`);
        const section  = document.getElementById(`ws_t_codingSection_${globalIdx}`);
        if (!section) return;
        section.style.display = checkbox?.checked ? 'block' : 'none';
    };

    window.wsInsertCodeBlock = function(globalIdx) {
        const editor = document.getElementById(`ws_t_content_${globalIdx}`);
        if (!editor) return;

        // Remove existing language picker modal
        document.getElementById('wsCodeLangModal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'wsCodeLangModal';
        modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(0,0,0,0.5);z-index:9999;display:flex;
            align-items:center;justify-content:center;`;

        modal.innerHTML = `
        <div style="background:white;border-radius:16px;padding:24px;width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <h3 style="margin:0 0 16px;font-size:16px;font-weight:800;color:#1f2937;">
                <i class="fas fa-code" style="color:#7c3aed;margin-right:8px;"></i>Insert Code Block
            </h3>
            <div style="margin-bottom:16px;">
                <label style="font-size:13px;font-weight:700;color:#374151;display:block;margin-bottom:8px;">Language</label>
                <select id="wsCodeLangSelect"
                    style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;font-size:14px;font-family:inherit;outline:none;">
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript</option>
                    <option value="html">HTML/CSS</option>
                    <option value="sql">SQL</option>
                    <option value="bash">Bash</option>
                </select>
            </div>
            <div style="margin-bottom:16px;">
                <label style="font-size:13px;font-weight:700;color:#374151;display:block;margin-bottom:8px;">Code</label>
                <textarea id="wsCodeInput" rows="6"
                    placeholder="# Write your code here"
                    style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;font-size:13px;font-family:'Courier New',monospace;outline:none;resize:vertical;box-sizing:border-box;background:#1e1b4b;color:#a5b4fc;"></textarea>
            </div>
            <div style="display:flex;gap:10px;">
                <button onclick="document.getElementById('wsCodeLangModal').remove()"
                    style="flex:1;padding:10px;border:2px solid #e5e7eb;border-radius:10px;background:white;color:#6b7280;font-weight:700;cursor:pointer;font-family:inherit;">
                    Cancel
                </button>
                <button onclick="wsConfirmInsertCode('${globalIdx}')"
                    style="flex:2;padding:10px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border:none;border-radius:10px;color:white;font-weight:800;cursor:pointer;font-family:inherit;">
                    <i class="fas fa-code"></i> Insert
                </button>
            </div>
        </div>`;

        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.getElementById('wsCodeInput')?.focus();
    };

   window.wsConfirmInsertCode = function(globalIdx) {
    const lang = document.getElementById('wsCodeLangSelect')?.value || 'python';
    const code = document.getElementById('wsCodeInput')?.value || '';
    document.getElementById('wsCodeLangModal')?.remove();

    const editor = document.getElementById(`ws_t_content_${globalIdx}`);
    if (!editor) return;

    const langColors = {
        python:     { bg: '#1e1b4b', border: '#4338ca', badge: '#6366f1', label: 'Python' },
        javascript: { bg: '#1c1917', border: '#d97706', badge: '#f59e0b', label: 'JavaScript' },
        html:       { bg: '#1c1917', border: '#dc2626', badge: '#ef4444', label: 'HTML/CSS' },
        sql:        { bg: '#0c1a2e', border: '#0ea5e9', badge: '#38bdf8', label: 'SQL' },
        bash:       { bg: '#0a1628', border: '#10b981', badge: '#34d399', label: 'Bash' }
    };
    const lc = langColors[lang] || langColors.python;

    // Use a placeholder div so the HTML is injected as a real DOM node, not via execCommand
    const placeholder = document.createElement('div');
    placeholder.innerHTML = `
    <div class="asai-code-block" data-language="${lang}"
         style="margin:12px 0;border-radius:12px;overflow:hidden;border:1.5px solid ${lc.border};">
        <div style="background:${lc.bg};padding:8px 14px;display:flex;justify-content:space-between;align-items:center;">
            <span style="background:${lc.badge};color:white;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;">${lc.label}</span>
            <span class="asai-run-btn" style="background:rgba(255,255,255,0.15);color:white;padding:4px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">▶ Run</span>
        </div>
        <pre style="margin:0;padding:14px;background:${lc.bg};color:#c7d2fe;font-family:'Courier New',monospace;font-size:13px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;">${_esc(code)}</pre>
        <div class="asai-code-output" style="display:none;background:#0f172a;padding:12px 14px;border-top:1px solid ${lc.border};">
            <div style="font-size:10px;font-weight:700;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">Output</div>
            <pre style="margin:0;color:#4ade80;font-family:'Courier New',monospace;font-size:12px;white-space:pre-wrap;"></pre>
        </div>
    </div>`;

    const codeNode = placeholder.firstElementChild;
    const br = document.createElement('br');

    // Get cursor position and insert at caret, or append to end
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(br);
        range.insertNode(codeNode);
        range.setStartAfter(br);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    } else {
        editor.appendChild(codeNode);
        editor.appendChild(br);
    }
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
window.wsInsertInlineCoding = function(globalIdx) {
    const editor = document.getElementById(`ws_t_content_${globalIdx}`);
    if (!editor) return;

    // Remove existing picker
    document.getElementById('wsCodingInsertModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'wsCodingInsertModal';
    modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.6);z-index:9999;display:flex;
        align-items:center;justify-content:center;backdrop-filter:blur(4px);`;

    modal.innerHTML = `
    <div style="background:linear-gradient(135deg,#0f172a,#1e1b4b);border-radius:20px;
                padding:28px;width:520px;max-width:95vw;box-shadow:0 25px 60px rgba(0,0,0,0.5);">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px;">
            <div style="width:40px;height:40px;background:linear-gradient(135deg,#10b981,#059669);
                        border-radius:10px;display:flex;align-items:center;justify-content:center;">
                <i class="fas fa-code" style="color:white;font-size:16px;"></i>
            </div>
            <div>
                <div style="font-size:17px;font-weight:800;color:white;">Insert Coding Exercise</div>
                <div style="font-size:12px;color:#6366f1;">Embedded inline in your topic content</div>
            </div>
            <button onclick="document.getElementById('wsCodingInsertModal').remove()"
                style="margin-left:auto;background:rgba(255,255,255,0.1);border:none;color:white;
                       width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;">✕</button>
        </div>

        <div style="margin-bottom:14px;">
            <label style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;
                          letter-spacing:1px;display:block;margin-bottom:8px;">Language</label>
            <select id="wsCodingLangSelect"
                style="width:100%;padding:10px 14px;background:#1e1b4b;color:#a5b4fc;
                       border:1.5px solid #4338ca;border-radius:10px;font-size:14px;
                       font-family:inherit;outline:none;">
                <option value="python">Python 3</option>
                <option value="javascript">JavaScript</option>
                <option value="both">Both (student chooses)</option>
            </select>
        </div>

        <div style="margin-bottom:14px;">
            <label style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;
                          letter-spacing:1px;display:block;margin-bottom:8px;">
                Problem / Instructions
            </label>
            <textarea id="wsCodingPromptInput" rows="3"
                placeholder="e.g. Write a function that calculates the average of a list..."
                style="width:100%;padding:12px;background:#1e1b4b;color:#c7d2fe;
                       border:1.5px solid #4338ca;border-radius:10px;font-size:13px;
                       font-family:inherit;outline:none;resize:vertical;box-sizing:border-box;"></textarea>
        </div>

        <div style="margin-bottom:20px;">
            <label style="font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;
                          letter-spacing:1px;display:block;margin-bottom:8px;">
                Starter Code (optional)
            </label>
            <textarea id="wsCodingStarterInput" rows="5"
                placeholder="# Write starter code here&#10;def calculate_average(numbers):&#10;    # Your code here&#10;    pass"
                style="width:100%;padding:12px;background:#0a0a1a;color:#a5b4fc;
                       border:1.5px solid #4338ca;border-radius:10px;font-size:13px;
                       font-family:'Courier New',monospace;outline:none;resize:vertical;
                       box-sizing:border-box;"></textarea>
        </div>

        <div style="display:flex;gap:10px;">
            <button onclick="document.getElementById('wsCodingInsertModal').remove()"
                style="flex:1;padding:12px;border:1.5px solid rgba(255,255,255,0.2);border-radius:12px;
                       background:transparent;color:#9ca3af;font-weight:700;cursor:pointer;font-family:inherit;">
                Cancel
            </button>
            <button onclick="wsConfirmInsertCoding('${globalIdx}')"
                style="flex:2;padding:12px;background:linear-gradient(135deg,#10b981,#059669);
                       border:none;border-radius:12px;color:white;font-weight:800;cursor:pointer;
                       font-family:inherit;font-size:14px;display:flex;align-items:center;
                       justify-content:center;gap:8px;">
                <i class="fas fa-plus-circle"></i> Insert Coding Exercise
            </button>
        </div>
    </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.getElementById('wsCodingPromptInput')?.focus();
};

window.wsConfirmInsertCoding = function(globalIdx) {
    const lang    = document.getElementById('wsCodingLangSelect')?.value || 'python';
    const prompt  = document.getElementById('wsCodingPromptInput')?.value?.trim() || '';
    const starter = document.getElementById('wsCodingStarterInput')?.value || '';
    document.getElementById('wsCodingInsertModal')?.remove();

    const editor = document.getElementById(`ws_t_content_${globalIdx}`);
    if (!editor) return;

    const langColors = {
        python:     { bg: '#1e1b4b', border: '#4338ca', badge: '#6366f1', label: 'Python 3' },
        javascript: { bg: '#1c1917', border: '#d97706', badge: '#f59e0b', label: 'JavaScript' },
        both:       { bg: '#0f2027', border: '#10b981', badge: '#34d399', label: 'Python / JS' }
    };
    const lc = langColors[lang] || langColors.python;
    const defaultStarter = starter || (lang === 'javascript'
        ? '// Write your solution here\nfunction solution() {\n    \n}'
        : '# Write your solution here\ndef solution():\n    pass');
    const uid = 'ce_' + Date.now();
    const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
   <div class="asai-inline-coding" data-lang="${lang}" data-uid="${uid}"
     contenteditable="false"
     style="margin:16px 0;border-radius:14px;overflow:hidden;border:2px solid ${lc.border};background:${lc.bg};display:block;width:100%;max-width:560px;box-sizing:border-box;">
        <div style="padding:10px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.1);">
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:28px;height:28px;background:${lc.badge};border-radius:8px;display:flex;align-items:center;justify-content:center;">
                    <i class="fas fa-code" style="color:white;font-size:11px;"></i>
                </div>
                <div>
                    <div style="font-size:13px;font-weight:800;color:white;">Coding Exercise</div>
                    <div style="font-size:11px;color:${lc.badge};">${lc.label}</div>
                </div>
            </div>
            <div style="display:flex;gap:6px;">
                <button class="asai-inline-edit-btn" title="Edit"
                    style="background:rgba(255,255,255,0.15);border:none;color:white;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:12px;">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="asai-inline-delete-btn" title="Delete"
                    style="background:rgba(239,68,68,0.3);border:1px solid rgba(239,68,68,0.5);color:#fca5a5;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:12px;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
        ${prompt ? `
        <div style="padding:12px 16px;background:rgba(99,102,241,0.12);border-bottom:1px solid rgba(255,255,255,0.06);">
            <div style="font-size:10px;font-weight:700;color:${lc.badge};text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;">
                <i class="fas fa-lightbulb"></i> Problem
            </div>
            <div style="font-size:13px;color:#c7d2fe;line-height:1.6;">${esc(prompt)}</div>
        </div>` : ''}
        <div style="padding:12px 16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span style="font-size:10px;font-weight:700;color:${lc.badge};text-transform:uppercase;letter-spacing:1px;">Your Code</span>
                <button class="asai-inline-run-btn"
                    style="padding:4px 12px;background:${lc.badge};color:white;border:none;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:5px;">
                    <i class="fas fa-play"></i> Run
                </button>
            </div>
            <textarea class="asai-inline-editor" rows="5" spellcheck="false"
                style="width:100%;padding:12px;background:#0a0a1a;color:#a5b4fc;border:1.5px solid ${lc.border};border-radius:10px;font-size:13px;font-family:'Courier New',monospace;outline:none;resize:vertical;box-sizing:border-box;line-height:1.6;"></textarea>
        </div>
        <div class="asai-inline-output" style="display:none;padding:14px 16px;background:#0a0a1a;border-top:1px solid ${lc.border}30;">
            <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
                <i class="fas fa-terminal"></i> Output
            </div>
            <pre class="asai-inline-result" style="margin:0;font-family:'Courier New',monospace;font-size:12px;color:#4ade80;white-space:pre-wrap;word-break:break-all;"></pre>
        </div>
    </div>`;

    const codingNode = wrapper.firstElementChild;

    // Insert at cursor or append
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const br = document.createElement('br');
        range.insertNode(br);
        range.insertNode(codingNode);
        range.setStartAfter(br);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    } else {
        editor.appendChild(document.createElement('br'));
        editor.appendChild(codingNode);
        editor.appendChild(document.createElement('br'));
    }

    // Set textarea value AFTER it is in the DOM
    const ta = codingNode.querySelector('.asai-inline-editor');
    if (ta) ta.value = defaultStarter;

    // Wire Run button
    const runBtn = codingNode.querySelector('.asai-inline-run-btn');
    if (runBtn) {
        runBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const textarea = codingNode.querySelector('.asai-inline-editor');
            const outDiv   = codingNode.querySelector('.asai-inline-output');
            const outPre   = outDiv?.querySelector('.asai-inline-result');
            if (!textarea || !outPre) return;
            runBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            runBtn.disabled = true;
            outDiv.style.display = 'block';
            outPre.style.color = '#94a3b8';
            outPre.textContent = 'Running…';
            try {
                let res;
                if (lang === 'javascript') {
                    let out = '';
                    const orig = console.log;
                    console.log = (...a) => { out += a.join(' ') + '\n'; };
                    let err = null;
                    try { new Function(textarea.value)(); } catch(ex) { err = ex.message; }
                    finally { console.log = orig; }
                    res = { output: out.trim() || (err ? '' : '(No output)'), error: err };
                } else {
                    const r = await fetch('https://emkc.org/api/v2/piston/execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ language: 'python', version: '3.10.0', files: [{ content: textarea.value }] })
                    });
                    const d = await r.json();
                    const stdout = (d.run?.stdout || '').trim();
                    const stderr = (d.run?.stderr || '').trim();
                    res = { output: stdout || (stderr ? '' : '(No output)'), error: stderr && !stdout ? stderr : null };
                }
                outPre.textContent = res.error ? '❌ ' + res.error : res.output;
                outPre.style.color = res.error ? '#f87171' : '#4ade80';
            } catch (err) {
                outPre.textContent = '❌ ' + err.message;
                outPre.style.color = '#f87171';
            }
            runBtn.innerHTML = '<i class="fas fa-play"></i> Run';
            runBtn.disabled = false;
        });
    }

    // Wire Delete button
    const delBtn = codingNode.querySelector('.asai-inline-delete-btn');
    if (delBtn) {
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Delete this coding exercise?')) {
                codingNode.remove();
                showToast('Coding block deleted.');
            }
        });
    }

    // Wire Edit button
    const editBtn = codingNode.querySelector('.asai-inline-edit-btn');
    if (editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const currentPrompt  = codingNode.querySelector('[style*="Problem"]')?.nextElementSibling?.textContent?.trim() || '';
            const currentStarter = codingNode.querySelector('.asai-inline-editor')?.value || '';
            // Re-open the insert modal pre-filled
            wsInsertInlineCoding(globalIdx);
            setTimeout(() => {
                const lSel = document.getElementById('wsCodingLangSelect');
                const pEl  = document.getElementById('wsCodingPromptInput');
                const sEl  = document.getElementById('wsCodingStarterInput');
                if (lSel) lSel.value = lang;
                if (pEl)  pEl.value  = currentPrompt;
                if (sEl)  sEl.value  = currentStarter;
            }, 150);
            codingNode.remove();
        });
    }

    showToast('✅ Coding exercise inserted!');
};

function _wireInlineCodingBlock(block, lang) {
    // Support both selector patterns
    const runBtn = block.querySelector('.asai-inline-run-btn') 
                || block.querySelector('[class*="run"]');
    if (!runBtn || runBtn.dataset.wired) return;
    runBtn.dataset.wired = '1';

    runBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const uid      = runBtn.dataset.uid;
        // Support both uid-based and non-uid editors
        const textarea = uid
            ? block.querySelector(`.asai-inline-editor[data-uid="${uid}"]`)
            : block.querySelector('textarea');
        const output   = uid
            ? block.querySelector(`.asai-inline-output[data-uid="${uid}"]`)
            : block.querySelector('.asai-inline-output, .asai-code-output');
        const result   = uid
            ? block.querySelector(`.asai-inline-result[data-uid="${uid}"]`)
            : (output ? output.querySelector('pre') : null);

        if (!textarea) return;

        const code = textarea.value;
        const resolvedLang = lang || block.dataset.lang || 'python';

        runBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running…';
        runBtn.disabled  = true;

        if (output) {
            output.style.display = 'block';
            if (result) {
                result.textContent = 'Running…';
                result.style.color = '#94a3b8';
            }
        }

        try {
            let res;
            if (resolvedLang === 'javascript') {
                res = _runJSInline(code);
            } else if (resolvedLang === 'html') {
                if (output) {
                    output.innerHTML = '';
                    const iframe = document.createElement('iframe');
                    iframe.style.cssText = 'width:100%;height:200px;border:none;background:white;border-radius:8px;';
                    output.appendChild(iframe);
                    const blob = new Blob([code], { type: 'text/html' });
                    iframe.src = URL.createObjectURL(blob);
                }
                runBtn.innerHTML = '<i class="fas fa-play"></i> Run';
                runBtn.disabled  = false;
                return;
           } else {
    // Always use Pyodide - it's loaded on both admin and student pages
    if (typeof loadPyodide !== 'undefined') {
        res = await _runPyodideInline(code, output);
    } else {
        res = { output: '', error: 'Python engine not available. Please refresh the page.' };
    }
}

            if (result) {
                result.textContent = res.error
                    ? '❌ ' + res.error
                    : (res.output || '(No output — did you forget print()?)');
                result.style.color = res.error ? '#f87171' : '#4ade80';
            }
        } catch (err) {
            if (result) {
                result.textContent = '❌ ' + err.message;
                result.style.color = '#f87171';
            }
        }

        runBtn.innerHTML = '<i class="fas fa-play"></i> Run';
        runBtn.disabled  = false;
    });
}
function _runJSInline(code) {
    let output = '';
    const orig = console.log;
    console.log = (...args) => { output += args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n'; };
    let error = null;
    try { new Function(code)(); } catch(e) { error = e.message; }
    finally { console.log = orig; }
    return { output: output.trim() || (error ? '' : '(No output)'), error };
}

async function _runPyodideInline(code, outputEl) {
    try {
        if (!window._pyodide) {
            outputEl.style.display = 'block';
            outputEl.querySelector('pre').textContent = 'Loading Python engine…';
            window._pyodide = await loadPyodide({ stdout: () => {}, stderr: () => {} });
        }
        let out = '', err = '';
        window._pyodide.setStdout({ batched: t => { out += t + '\n'; } });
        window._pyodide.setStderr({ batched: t => { err += t + '\n'; } });
        await window._pyodide.runPythonAsync(code);
        return { output: out.trim(), error: err.trim() && !out.trim() ? err.trim() : null };
    } catch(e) {
        return { output: '', error: String(e) };
    }
}

async function _runPistonInline(code) {
    // Pyodide is already loaded on admin page - use it directly
    try {
        if (!window._adminPyodide) {
            window._adminPyodide = await loadPyodide({ stdout: () => {}, stderr: () => {} });
        }
        let out = '', err = '';
        window._adminPyodide.setStdout({ batched: t => { out += t + '\n'; } });
        window._adminPyodide.setStderr({ batched: t => { err += t + '\n'; } });
        await window._adminPyodide.runPythonAsync(code);
        return { output: out.trim(), error: err.trim() && !out.trim() ? err.trim() : null };
    } catch(e) {
        return { output: '', error: String(e) };
    }
}
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

            const { data: chapterArr, error: cErr } = await sb
                .from('chapters')
                .insert({ course_id: courseId, title, description: desc, order_num: orderNum, published: false })
                .select('id');
            if (cErr) throw cErr;
            const chapterId = chapterArr[0]?.id;
            if (!chapterId) throw new Error('Chapter not created.');

            const scDivs = document.querySelectorAll('#ws_subChaptersContainer > div[id^="ws_sc_"]');
            let scOrder  = 1;

            for (const scDiv of scDivs) {
                const scIdx  = scDiv.id.replace('ws_sc_', '');
                const scTitle = document.getElementById(`ws_sc_title_${scIdx}`)?.value?.trim();
                if (!scTitle) continue;

                const { data: scArr, error: scErr } = await sb
                    .from('sub_chapters')
                    .insert({ chapter_id: chapterId, course_id: courseId, title: scTitle, order_num: scOrder++ })
                    .select('id');
                if (scErr) throw scErr;
                const subChapterId = scArr[0]?.id;

                const topicDivs = document.querySelectorAll(`#ws_topics_${scIdx} > div[id^="ws_topic_"]`);
                const topicsToInsert = [];
                let tOrder = 1;

                for (const tDiv of topicDivs) {
                    const gIdx       = tDiv.id.replace('ws_topic_', '');
                    const tTitle     = document.getElementById(`ws_t_title_${gIdx}`)?.value?.trim();
                    const content    = document.getElementById(`ws_t_content_${gIdx}`)?.innerHTML || '';
                    const dur        = document.getElementById(`ws_t_dur_${gIdx}`)?.value || '15';
                    const cat        = document.getElementById(`ws_t_cat_${gIdx}`)?.value || 'basics';
                    const hasCoding  = document.getElementById(`ws_t_hasCoding_${gIdx}`)?.checked || false;
                    const prompt     = document.getElementById(`ws_t_prompt_${gIdx}`)?.value?.trim() || '';
                    const lang       = document.getElementById(`ws_t_lang_${gIdx}`)?.value || 'python';
                    const starter    = document.getElementById(`ws_t_starterCode_${gIdx}`)?.value?.trim() || '';

                    if (!tTitle) continue;

                    topicsToInsert.push({
                        chapter_id:          chapterId,
                        sub_chapter_id:      subChapterId,
                        course_id:           courseId,
                        title:               tTitle,
                        content:             content,
                        duration:            dur,
                        category:            cat,
                        order_num:           tOrder++,
                        has_coding_exercise: hasCoding,
                        coding_prompt:       hasCoding ? prompt : null,
                        coding_language:     hasCoding ? lang   : null,
                        coding_starter_code: hasCoding ? starter : null
                    });
                }

                if (topicsToInsert.length > 0) {
                    const { error: tErr } = await sb.from('topics').insert(topicsToInsert);
                    if (tErr) throw tErr;
                }
            }

            const assessType = document.getElementById('ws_assessType')?.value;
            const assessId   = document.getElementById('ws_assessId')?.value;
            if (assessType && assessId) {
                await sb.from('chapter_assessments').insert({
                    chapter_id:      chapterId,
                    course_id:       courseId,
                    assessment_type: assessType,
                    quiz_id:        assessType === 'quiz'       ? assessId : null,
                    assignment_id:  assessType === 'assignment' ? assessId : null,
                    order_num:      1
                });
            }

            document.getElementById('weekStructureModal')?.remove();
            _toast('✅ Week saved successfully!');

            if (typeof loadChapters === 'function') loadChapters();
            if (typeof loadAdminCourses === 'function') loadAdminCourses();

        } catch (err) {
            console.error('wsSubmit error:', err);
            _toast('Error: ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save Week'; }
        }
    }

    const _origLoadChapters = window.loadChapters;
    window.loadChapters = async function () {
        if (_origLoadChapters) await _origLoadChapters();
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

        const byChapter = {};
        subChapters.forEach(sc => {
            if (!byChapter[sc.chapter_id]) byChapter[sc.chapter_id] = [];
            byChapter[sc.chapter_id].push(sc);
        });

        const { data: assessments } = await sb
            .from('chapter_assessments')
            .select(`id, chapter_id, assessment_type, quizzes(id, title), assignments(id, title)`)
            .eq('course_id', courseId);

        const assessByChapter = {};
        (assessments || []).forEach(a => { assessByChapter[a.chapter_id] = a; });

        const chapterCards = document.querySelectorAll('#chaptersContainer .card');
        chapterCards.forEach(card => {
            const editBtn = card.querySelector('[onclick*="openEditChapterModal"]');
            if (!editBtn) return;
            const match = editBtn.getAttribute('onclick')?.match(/'([^']+)'/);
            if (!match) return;
            const chId = match[1];

            const scs    = byChapter[chId] || [];
            const assess = assessByChapter[chId];

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
                const label  = assess.assessment_type === 'quiz' ? (assess.quizzes?.title || 'Quiz') : (assess.assignments?.title || 'Assignment');
                const color  = assess.assessment_type === 'quiz' ? '#0ea5e9' : '#10b981';
                const icon   = assess.assessment_type === 'quiz' ? 'fa-question-circle' : 'fa-tasks';
                const badge  = assess.assessment_type === 'quiz' ? 'Quiz' : 'Assignment';
                html += `
                <div style="display:flex;align-items:center;gap:8px;background:#f0f9ff;border-radius:10px;padding:8px 12px;border:1px solid #bae6fd;">
                    <i class="fas ${icon}" style="color:${color};"></i>
                    <span style="font-size:12px;font-weight:600;color:#0c4a6e;">End-of-Week ${badge}:</span>
                    <span style="font-size:13px;font-weight:700;color:#0369a1;">${_esc(label)}</span>
                </div>`;
            }

            ann.innerHTML = html;
            card.appendChild(ann);
        });
    }

    // Also run SQL to add coding_starter_code column if needed
    window.wsEnsureCodingColumns = async function() {
        try {
            await getSB().rpc('exec_sql', {
                sql: `ALTER TABLE topics ADD COLUMN IF NOT EXISTS coding_starter_code text;`
            });
        } catch(e) { /* silent - column may already exist */ }
    };

    console.log('✅ week-structure-admin.js loaded');
})();