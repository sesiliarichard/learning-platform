// ============================================================
// teacher-courses.js  — Supabase-connected
// ============================================================

const COURSE_COLORS = ['#1a9fd4', '#2196F3', '#00c9a7', '#0d6ebd', '#f59e0b', '#6366f1'];

function _courseColor(index) {
  return COURSE_COLORS[index % COURSE_COLORS.length];
}

function _courseIcon(title = '') {
  const t = title.toLowerCase();
  if (t.includes('python'))                            return 'fa-code';
  if (t.includes('data'))                              return 'fa-database';
  if (t.includes('ethic'))                             return 'fa-brain';
  if (t.includes('nlp') || t.includes('language'))    return 'fa-language';
  if (t.includes('ai') || t.includes('intelligence')) return 'fa-robot';
  return 'fa-book-open';
}

// ─────────────────────────────────────────────────────────────
// LOAD COURSES FROM SUPABASE
// ─────────────────────────────────────────────────────────────
async function loadCoursesFromDB() {
  const teacherId = teacherState.profile?.id;
  if (!teacherId) return;

  const db = supabaseClient;

  let { data: courses, error: cErr } = await db
    .from('courses')
    .select('id, title, description, color, icon, created_at, order_num')
    .order('order_num', { ascending: true })
    .order('created_at', { ascending: true });

  if (cErr) {
    console.error('loadCoursesFromDB: courses error', cErr.message);
    return;
  }

  if (!courses?.length) {
    teacherState.courses = [];
    renderCourseGrid();
    return;
  }

  const courseIds = courses.map(c => c.id);

  const { data: enrollments } = await db
    .from('enrollments')
    .select('course_id, progress')
    .in('course_id', courseIds);

  const { data: chapters } = await db
    .from('chapters')
    .select('course_id')
    .in('course_id', courseIds);

  const enrollMap  = {};
  const chapterMap = {};

  (enrollments || []).forEach(e => {
    if (!enrollMap[e.course_id]) enrollMap[e.course_id] = [];
    enrollMap[e.course_id].push(e.progress || 0);
  });

  (chapters || []).forEach(ch => {
    chapterMap[ch.course_id] = (chapterMap[ch.course_id] || 0) + 1;
  });

  teacherState.courses = courses.map((c, i) => {
    const progList = enrollMap[c.id] || [];
    const avgProg  = progList.length
      ? Math.round(progList.reduce((a, b) => a + b, 0) / progList.length)
      : 0;
    return {
      ...c,
      color:    c.color || _courseColor(i),
      icon:     c.icon  || _courseIcon(c.title),
      students: progList.length,
      chapters: chapterMap[c.id] || 0,
      progress: avgProg,
    };
  });

  renderCourseGrid();
}

// ─────────────────────────────────────────────────────────────
// RENDER MY COURSES GRID
// ─────────────────────────────────────────────────────────────
function renderCourseGrid() {
  const g = document.getElementById('coursesGrid');
  if (!g) return;

  const stCou = document.getElementById('stCou');
  if (stCou) stCou.textContent = teacherState.courses.length;

  if (!teacherState.courses.length) {
    g.innerHTML = `
      <div class="empty">
        <i class="fas fa-book-open"></i>
        <p>No courses assigned to you yet.<br>
           <small style="color:var(--mut)">
             Ask an admin to assign a course to your account.
           </small>
        </p>
      </div>`;
    return;
  }

  g.innerHTML = '';
  teacherState.courses.forEach(c => {
    g.innerHTML += `
      <div class="ct" style="--c:${c.color}">
        <div class="ct-ico">
          <i class="fas ${c.icon}"></i>
        </div>
        <div class="ct-body">
          <h3>${_esc(c.title)}</h3>
          <div class="ct-meta">
            <span><i class="fas fa-users"></i> ${c.students}</span>
            <span><i class="fas fa-book-open"></i> ${c.chapters} chapter${c.chapters !== 1 ? 's' : ''}</span>
          </div>
          <div class="ct-prog">
            <div class="ct-bar" style="width:${c.progress}%"></div>
          </div>
          <div class="ct-foot">
            <span>${c.progress}% avg completion</span>
            <button class="bxs" onclick="showSec('content')">
              View Notes
            </button>
          </div>
        </div>
      </div>`;
  });
}

// ─────────────────────────────────────────────────────────────
// CONTENT STUDIO — load chapters + topics
// ─────────────────────────────────────────────────────────────
async function loadContentChapters() {
  const sel  = document.getElementById('contentCouSel');
  const area = document.getElementById('contentArea');
  if (!area) return;

  const couId = sel?.value;
  if (!couId) {
    area.innerHTML = `
      <div class="empty">
        <i class="fas fa-book-open"></i>
        <p>Select a course to view chapters &amp; topics</p>
      </div>`;
    return;
  }

  area.innerHTML = `
    <div class="empty">
      <i class="fas fa-spinner fa-spin"></i>
      <p>Loading chapters…</p>
    </div>`;

  const db = supabaseClient;

  const { data: chapters, error: chErr } = await db
    .from('chapters')
    .select('id, title, description, order_num')
    .eq('course_id', couId)
    .eq('published', true)
    .order('order_num', { ascending: true })
    .order('created_at', { ascending: true });

  if (chErr) {
    area.innerHTML = `
      <div class="card">
        <p style="color:var(--red);font-size:12px">
          <i class="fas fa-exclamation-circle"></i>
          Failed to load chapters: ${_esc(chErr.message)}
        </p>
      </div>`;
    return;
  }

  if (!chapters?.length) {
    area.innerHTML = `
      <div class="card">
        <p style="color:var(--mut);font-size:12px">
          <i class="fas fa-info-circle"></i>
          No chapters created yet. Chapters are created by Admins only.
        </p>
      </div>`;
    return;
  }

  // Sort chapters by order_num
  const sortedChapters = [...chapters].sort((a, b) =>
    (a.order_num ?? 999) - (b.order_num ?? 999)
  );

  const chapterIds = sortedChapters.map(ch => ch.id);

  const { data: allTopics, error: tErr } = await db
    .from('topics')
    .select('id, chapter_id, title, category, duration, order_num')
    .in('chapter_id', chapterIds)
    .order('order_num', { ascending: true })
    .order('created_at', { ascending: true });

  if (tErr) console.error('loadContentChapters: topics error', tErr.message);

  // Build topic map sorted by order_num
  const topicMap = {};
  (allTopics || []).forEach(t => {
    if (!topicMap[t.chapter_id]) topicMap[t.chapter_id] = [];
    topicMap[t.chapter_id].push(t);
  });

  // Sort topics within each chapter
  Object.keys(topicMap).forEach(chId => {
    topicMap[chId].sort((a, b) => (a.order_num ?? 999) - (b.order_num ?? 999));
  });

// Build layout: chapter sidebar on left, reader on right
  area.innerHTML = `
    <div class="notes-reading-container">
      <div class="notes-sidebar">
        <h4><i class="fas fa-book-open"></i> Chapters</h4>
        <ul class="notes-chapter-list" id="teacherChapterList"></ul>
      </div>
      <div class="notes-reader" id="teacherNotesReader">
        <div style="padding:60px;text-align:center;color:var(--mut);">
          <i class="fas fa-hand-point-left"
             style="font-size:32px;display:block;margin-bottom:12px;opacity:0.25;"></i>
          <p style="font-size:13px;">Select a topic to view its content</p>
        </div>
      </div>
    </div>`;

  const chapterListEl = document.getElementById('teacherChapterList');

  // Build a single flat ordered list of topics across ALL chapters,
  // so Previous/Next can move across chapter boundaries.
  window._teacherNotesFlat = [];
  sortedChapters.forEach((chapter, chIdx) => {
    const topics = topicMap[chapter.id] || [];
    topics.forEach(t => {
      window._teacherNotesFlat.push({
        ...t,
        chapterTitle: chapter.title,
        chapterOrder: chapter.order_num || chIdx + 1
      });
    });
  });

 // Render chapter list with Week badges, each followed by its own
  // topic rows (so the sidebar mirrors the student dashboard layout).
  sortedChapters.forEach((chapter, chIdx) => {
    const topics = topicMap[chapter.id] || [];

    const chapterLi = document.createElement('li');
    chapterLi.className = 'notes-chapter-item' + (chIdx === 0 ? ' active' : '');
    chapterLi.dataset.chapterId = chapter.id;

    chapterLi.innerHTML = `
      <span style="display:flex;align-items:center;gap:6px;width:100%;">
        <span style="background:#ede9fe;color:#7c3aed;padding:1px 7px;
                     border-radius:20px;font-size:9px;font-weight:800;
                     white-space:nowrap;flex-shrink:0;">
          Week ${chapter.order_num || chIdx + 1}
        </span>
        <span style="overflow:hidden;text-overflow:ellipsis;
                     white-space:nowrap;font-size:12px;">
          ${_esc(chapter.title)}
        </span>
      </span>`;

    chapterLi.onclick = () => {
      const firstTopic = topics[0];
      if (firstTopic) {
        const flatIndex = window._teacherNotesFlat.findIndex(t => t.id === firstTopic.id);
        if (flatIndex !== -1) displayTeacherNote(flatIndex);
      } else {
        document.querySelectorAll('#teacherChapterList .notes-chapter-item')
          .forEach(x => x.classList.remove('active'));
        chapterLi.classList.add('active');
        const reader = document.getElementById('teacherNotesReader');
        if (reader) {
          reader.innerHTML = `
            <div style="padding:60px 20px;text-align:center;color:var(--mut);">
              <i class="fas fa-book-open"
                 style="font-size:32px;display:block;margin-bottom:12px;
                        opacity:0.25;color:var(--acc);"></i>
              <p style="font-size:13px;">No topics in this chapter yet.</p>
            </div>`;
        }
      }
    };

    chapterListEl.appendChild(chapterLi);

    // Topic sub-rows under this chapter
    topics.forEach((topic, tIdx) => {
      const topicLi = document.createElement('li');
      topicLi.className = 'notes-chapter-item teacher-topic-subitem';
      topicLi.dataset.topicId = topic.id;
      topicLi.style.cssText = 'padding-left:28px;font-weight:500;';

      let title = topic.title;
      if (title.length > 32) title = title.substring(0, 29) + '...';

      topicLi.innerHTML = `
        <span style="display:flex;align-items:center;gap:6px;width:100%;">
          <i class="fas fa-circle" style="color:#d1d5db;font-size:7px;flex-shrink:0;"></i>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">
            ${_esc(title)}
          </span>
        </span>`;

      topicLi.onclick = (e) => {
        e.stopPropagation();
        const flatIndex = window._teacherNotesFlat.findIndex(t => t.id === topic.id);
        if (flatIndex !== -1) displayTeacherNote(flatIndex);
      };

      chapterListEl.appendChild(topicLi);
    });
  });
  // Auto-load the very first topic across all chapters
  if (window._teacherNotesFlat.length > 0) {
    displayTeacherNote(0);
  }
}

// ─────────────────────────────────────────────────────────────
// DISPLAY A SINGLE TOPIC IN THE READER, WITH PREVIOUS / NEXT
// ─────────────────────────────────────────────────────────────
async function displayTeacherNote(index) {
  const flat = window._teacherNotesFlat || [];
  if (index < 0 || index >= flat.length) return;

  const reader = document.getElementById('teacherNotesReader');
  if (!reader) return;

  const topicRef = flat[index];

  reader.innerHTML = `
    <div style="text-align:center;padding:40px;color:var(--mut);font-size:12px;">
      <i class="fas fa-spinner fa-spin"></i> Loading topic…
    </div>`;

  const { data: topic, error } = await supabaseClient
    .from('topics')
    .select('id, title, content, category, duration')
    .eq('id', topicRef.id)
    .maybeSingle();

  if (error || !topic) {
    reader.innerHTML = `
      <p style="color:var(--red);padding:20px;font-size:12px;">
        <i class="fas fa-exclamation-circle"></i> Failed to load topic.
      </p>`;
    return;
  }

  // Highlight the matching topic row (and its parent chapter pill) in the sidebar
  document.querySelectorAll('#teacherChapterList .notes-chapter-item').forEach(li => {
    const isMatchChapter = li.dataset.chapterId === topicRef.chapter_id;
    const isMatchTopic   = li.dataset.topicId === topicRef.id;
    li.classList.toggle('active', isMatchChapter || isMatchTopic);
  });

  reader.innerHTML = `
    <div class="notes-header">
      <div class="notes-category-badge">${_esc(topic.category || 'General')}</div>
      <h1 class="notes-title" style="word-break:break-word;white-space:normal;">${_esc(topic.title)}</h1>
      <div class="notes-meta">
        <div class="notes-meta-item">
          <i class="fas fa-clock"></i>
          ${_esc((topic.duration || 15) + ' min read')}
        </div>
        <div class="notes-meta-item">
          <i class="fas fa-layer-group"></i>
          Week ${topicRef.chapterOrder} &middot; ${_esc(topicRef.chapterTitle)}
        </div>
      </div>
    </div>

    <div class="notes-content" style="word-wrap:break-word;overflow-wrap:break-word;max-width:100%;">
      ${topic.content || '<p>No content available for this topic.</p>'}
    </div>

 <div class="notes-navigation">
      <button class="notes-nav-btn" onclick="displayTeacherNote(${index - 1})" ${index === 0 ? 'disabled' : ''}>
        <i class="fas fa-arrow-left"></i>
        Previous
      </button>
      <button class="notes-nav-btn" onclick="displayTeacherNote(${index + 1})" ${index === flat.length - 1 ? 'disabled' : ''}>
        Next
        <i class="fas fa-arrow-right"></i>
      </button>
    </div>`;

  _teacherWireCodingBlocks(reader);
  reader.scrollTop = 0;
}
// ─────────────────────────────────────────────────────────────
// CONVERT STATIC CODING BLOCKS TO INTERACTIVE RUNNERS (teacher view)
// Mirrors the student dashboard's conversion logic so admin-inserted
// asai-inline-coding blocks get a live editor + Run button here too.
// ─────────────────────────────────────────────────────────────
function _teacherWireCodingBlocks(container) {
  container.querySelectorAll('.asai-inline-coding').forEach(block => {
    const lang = block.dataset.lang || 'python';
    const uid  = 'tc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    let prompt = '';
    block.querySelectorAll('div').forEach(d => {
      if (d.textContent.includes('Problem') || d.style.cssText.includes('lightbulb')) {
        const next = d.nextElementSibling;
        if (next) prompt = next.textContent.trim();
      }
    });

    const starter = block.querySelector('pre')?.textContent?.trim() ||
      (lang === 'javascript' ? '// Write your solution here\n' : '# Write your solution here\n');

    const lc = {
      python:     { badge:'#6366f1', border:'#4338ca', bg:'#1e1b4b', label:'Python 3' },
      javascript: { badge:'#f59e0b', border:'#d97706', bg:'#1c1917', label:'JavaScript' },
      both:       { badge:'#34d399', border:'#10b981', bg:'#0f2027', label:'Python / JS' },
      sql:        { badge:'#38bdf8', border:'#0ea5e9', bg:'#0c1a2e', label:'SQL' },
      html:       { badge:'#ef4444', border:'#dc2626', bg:'#1c1917', label:'HTML/CSS' }
    }[lang] || { badge:'#6366f1', border:'#4338ca', bg:'#1e1b4b', label:'Python' };

    const newBlock = document.createElement('div');
    newBlock.className = 'asai-inline-coding';
    newBlock.dataset.lang = lang;
    newBlock.dataset.uid  = uid;
    newBlock.style.cssText = `margin:16px 0;border-radius:14px;overflow:hidden;border:2px solid ${lc.border};background:${lc.bg};`;

    newBlock.innerHTML = `
      <div style="padding:10px 16px;display:flex;align-items:center;
                  justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.1);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:28px;height:28px;background:${lc.badge};border-radius:8px;
                      display:flex;align-items:center;justify-content:center;">
            <i class="fas fa-code" style="color:white;font-size:11px;"></i>
          </div>
          <div>
            <div style="font-size:13px;font-weight:800;color:white;">Coding Exercise</div>
            <div style="font-size:11px;color:${lc.badge};">${lc.label}</div>
          </div>
        </div>
        <span style="background:${lc.badge};color:white;padding:3px 10px;
                     border-radius:20px;font-size:11px;font-weight:700;">Interactive</span>
      </div>

      ${prompt ? `
      <div style="padding:12px 16px;background:rgba(99,102,241,0.12);
                  border-bottom:1px solid rgba(255,255,255,0.06);">
        <div style="font-size:10px;font-weight:700;color:${lc.badge};
                    text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;">
          <i class="fas fa-lightbulb"></i> Problem
        </div>
        <div style="font-size:13px;color:#c7d2fe;line-height:1.6;">${prompt}</div>
      </div>` : ''}

      <div style="padding:12px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:10px;font-weight:700;color:${lc.badge};
                       text-transform:uppercase;letter-spacing:1px;">Your Code</span>
          <button id="resetBtn_${uid}"
              style="padding:3px 10px;background:rgba(255,255,255,0.1);color:#94a3b8;
                     border:none;border-radius:6px;font-size:11px;cursor:pointer;">
            <i class="fas fa-undo"></i> Reset
          </button>
        </div>
        <textarea id="inlineEditor_${uid}" rows="7" spellcheck="false"
            style="width:100%;padding:12px;background:#0a0a1a;color:#a5b4fc;
                   border:1.5px solid ${lc.border};border-radius:10px;font-size:13px;
                   font-family:'Courier New',monospace;outline:none;resize:vertical;
                   box-sizing:border-box;line-height:1.6;"></textarea>
      </div>

      <div style="padding:0 16px 14px;display:flex;gap:10px;">
        <button id="inlineRunBtn_${uid}"
            style="flex:2;padding:11px;background:linear-gradient(135deg,#7c3aed,#6d28d9);
                   color:white;border:none;border-radius:10px;font-size:14px;font-weight:700;
                   cursor:pointer;font-family:inherit;display:flex;align-items:center;
                   justify-content:center;gap:8px;">
          <i class="fas fa-play"></i> Run Code
        </button>
      </div>

      <div id="inlineOutput_${uid}"
           style="display:none;padding:14px 16px;background:#0a0a1a;
                  border-top:1px solid ${lc.border}30;">
        <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;
                    letter-spacing:1px;margin-bottom:8px;">
          <i class="fas fa-terminal"></i> Output
        </div>
        <pre id="inlineResult_${uid}"
             style="margin:0;font-family:'Courier New',monospace;font-size:12px;
                    color:#4ade80;white-space:pre-wrap;word-break:break-all;"></pre>
      </div>
    `;

    block.replaceWith(newBlock);

    const ta = document.getElementById('inlineEditor_' + uid);
    if (ta) ta.value = starter;

    document.getElementById('resetBtn_' + uid)?.addEventListener('click', () => {
      const t = document.getElementById('inlineEditor_' + uid);
      if (t) t.value = starter;
    });

    document.getElementById('inlineRunBtn_' + uid)?.addEventListener('click', () => {
      _teacherRunInlineCode(uid, lang);
    });
  });

  // Also wire any static (non-inline) asai-code-block Run buttons
  container.querySelectorAll('.asai-code-block').forEach(block => {
    const btn = block.querySelector('.asai-run-btn');
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', async function () {
      const lang   = block.dataset.language || 'python';
      const code   = block.querySelector('pre')?.textContent || '';
      const output = block.querySelector('.asai-code-output');
      const outPre = output?.querySelector('pre');
      if (!output || !outPre) return;

      btn.textContent = '⏳ Running…';
      btn.disabled = true;
      output.style.display = 'block';
      outPre.textContent = 'Running…';
      outPre.style.color = '#94a3b8';

      try {
        const res = lang === 'javascript' ? _teacherRunJS(code) : await _teacherRunPyodide(code);
        outPre.textContent = res.error ? '❌ ' + res.error : (res.output || '(No output)');
        outPre.style.color = res.error ? '#f87171' : '#4ade80';
      } catch (err) {
        outPre.textContent = '❌ ' + err.message;
        outPre.style.color = '#f87171';
      }
      btn.textContent = '▶ Run';
      btn.disabled = false;
    });
  });
}

async function _teacherRunInlineCode(uid, lang) {
  const editor = document.getElementById('inlineEditor_' + uid);
  const output = document.getElementById('inlineOutput_' + uid);
  const result = document.getElementById('inlineResult_' + uid);
  const runBtn = document.getElementById('inlineRunBtn_' + uid);
  if (!editor || !output || !result) return;

  const code = editor.value;
  if (!code.trim()) {
    output.style.display = 'block';
    result.textContent = '⚠️ Write some code first!';
    result.style.color = '#f59e0b';
    return;
  }

  runBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running…';
  runBtn.disabled  = true;
  output.style.display = 'block';
  result.style.color = '#94a3b8';
  result.textContent = '⏳ Running your code…';

  try {
    let res;
    if (lang === 'javascript') {
      res = _teacherRunJS(code);
    } else if (lang === 'html') {
      output.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'width:100%;height:200px;border:none;background:white;border-radius:8px;';
      output.appendChild(iframe);
      iframe.src = URL.createObjectURL(new Blob([code], { type: 'text/html' }));
      runBtn.innerHTML = '<i class="fas fa-play"></i> Run Code';
      runBtn.disabled  = false;
      return;
    } else {
      res = await _teacherRunPyodide(code);
    }
    result.textContent = res.error ? '❌ ' + res.error : (res.output || '(No output — did you forget print()?)');
    result.style.color = res.error ? '#f87171' : '#4ade80';
  } catch (err) {
    result.textContent = '❌ ' + err.message;
    result.style.color = '#f87171';
  }
  runBtn.innerHTML = '<i class="fas fa-play"></i> Run Code';
  runBtn.disabled = false;
}

function _teacherRunJS(code) {
  let output = '';
  const originalLog = console.log;
  try {
    console.log = (...args) => { output += args.join(' ') + '\n'; };
    // eslint-disable-next-line no-new-func
    new Function(code)();
    console.log = originalLog;
    return { output: output.trim() };
  } catch (err) {
    console.log = originalLog;
    return { error: err.message };
  }
}

async function _teacherRunPyodide(code) {
  try {
    if (!window._pyodideInstance) {
      window._pyodideInstance = await loadPyodide();
    }
    const pyodide = window._pyodideInstance;
    let output = '';
    pyodide.setStdout({ batched: (s) => { output += s + '\n'; } });
    await pyodide.runPythonAsync(code);
    return { output: output.trim() };
  } catch (err) {
    return { error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────
// KEEP OLD FUNCTION NAMES AS ALIASES (backward compatibility)
// ─────────────────────────────────────────────────────────────
function renderTeacherChapter(chapter, topics) {
  if (!window._teacherNotesFlat) window._teacherNotesFlat = [];
  const flatIndex = window._teacherNotesFlat.findIndex(t => t.id === topics?.[0]?.id);
  if (flatIndex !== -1) displayTeacherNote(flatIndex);
}

async function viewTeacherTopic(chapterId, topicId) {
  const flatIndex = (window._teacherNotesFlat || []).findIndex(t => t.id === topicId);
  if (flatIndex !== -1) displayTeacherNote(flatIndex);
}

async function viewTopicContent(chapterId, topicId, topicTitle) {
  const flatIndex = (window._teacherNotesFlat || []).findIndex(t => t.id === topicId);
  if (flatIndex !== -1) displayTeacherNote(flatIndex);
}

console.log('✅ teacher-courses.js loaded');