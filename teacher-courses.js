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
          <p style="font-size:13px;">Select a chapter to view its topics</p>
        </div>
      </div>
    </div>`;

  const chapterListEl = document.getElementById('teacherChapterList');

  // Render chapter list with Week badges
  sortedChapters.forEach((chapter, chIdx) => {
    const topics = topicMap[chapter.id] || [];
    const li = document.createElement('li');
    li.className = 'notes-chapter-item' + (chIdx === 0 ? ' active' : '');
    li.dataset.chapterId = chapter.id;

    li.innerHTML = `
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

    li.onclick = () => {
      document.querySelectorAll('#teacherChapterList .notes-chapter-item')
        .forEach(x => x.classList.remove('active'));
      li.classList.add('active');
      renderTeacherChapterTopics(chapter, topics, sortedChapters, topicMap);
    };

    chapterListEl.appendChild(li);
  });

  // Auto-load first chapter
  if (sortedChapters.length > 0) {
    const firstTopics = topicMap[sortedChapters[0].id] || [];
    renderTeacherChapterTopics(
      sortedChapters[0],
      firstTopics,
      sortedChapters,
      topicMap
    );
  }
}

// ─────────────────────────────────────────────────────────────
// RENDER CHAPTER TOPICS IN READER
// ─────────────────────────────────────────────────────────────
function renderTeacherChapterTopics(chapter, topics, allChapters, topicMap) {
  const reader = document.getElementById('teacherNotesReader');
  if (!reader) return;

  if (!topics.length) {
    reader.innerHTML = `
      <div style="padding:60px 20px;text-align:center;color:var(--mut);">
        <i class="fas fa-book-open"
           style="font-size:32px;display:block;margin-bottom:12px;
                  opacity:0.25;color:var(--acc);"></i>
        <p style="font-size:13px;">No topics in this chapter yet.</p>
      </div>`;
    return;
  }

  reader.innerHTML = `
    <div style="padding:4px 0 12px;">

      <!-- Chapter header badge -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;
                  padding:14px 20px;background:var(--bg2);
                  border-radius:12px;border:1.5px solid var(--bdr);">
        <span style="background:#ede9fe;color:#7c3aed;padding:3px 12px;
                     border-radius:20px;font-size:11px;font-weight:800;
                     white-space:nowrap;flex-shrink:0;">
          Week ${chapter.order_num || '?'}
        </span>
        <span style="font-size:15px;font-weight:700;color:var(--txt);
                     overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${_esc(chapter.title)}
        </span>
        <span style="margin-left:auto;font-size:11px;color:var(--mut);
                     white-space:nowrap;flex-shrink:0;">
          ${topics.length} topic${topics.length !== 1 ? 's' : ''}
        </span>
      </div>

      <!-- Topic rows -->
      <div id="topicListPanel">
        ${topics.map((t, i) => `
          <div class="topic-row-item"
               id="topicRow_${t.id}"
               style="padding:14px 16px;border:1.5px solid var(--bdr);
                      border-radius:10px;margin-bottom:8px;cursor:pointer;
                      background:white;transition:all 0.2s;"
               onclick="viewTeacherTopicInline('${t.id}', this)"
               onmouseenter="this.style.borderColor='var(--acc)';
                             this.style.background='var(--bg2)'"
               onmouseleave="if(!this.classList.contains('open')){
                               this.style.borderColor='var(--bdr)';
                               this.style.background='white';}">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="width:28px;height:28px;background:var(--bg2);
                           border-radius:50%;display:flex;align-items:center;
                           justify-content:center;font-size:11px;font-weight:700;
                           color:var(--acc);flex-shrink:0;">
                ${i + 1}
              </span>
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;color:var(--txt);
                            overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                  ${_esc(t.title)}
                </div>
                <div style="font-size:11px;color:var(--mut);margin-top:2px;">
                  ${_esc(t.category || 'General')} &nbsp;·&nbsp;
                  ${t.duration || '—'} min read
                </div>
              </div>
              <i class="fas fa-chevron-right"
                 id="chevron_${t.id}"
                 style="color:var(--mut);font-size:12px;
                        flex-shrink:0;transition:transform 0.2s;"></i>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;

  reader.scrollTop = 0;
}

// ─────────────────────────────────────────────────────────────
// VIEW TOPIC CONTENT INLINE (click to expand / collapse)
// ─────────────────────────────────────────────────────────────
async function viewTeacherTopicInline(topicId, rowEl) {
  const viewerId = 'inlineTopicViewer_' + topicId;
  const chevron  = document.getElementById('chevron_' + topicId);
  const existing = document.getElementById(viewerId);

  // Toggle off if already open
  if (existing) {
    existing.remove();
    rowEl.classList.remove('open');
    rowEl.style.borderColor = 'var(--bdr)';
    rowEl.style.background  = 'white';
    if (chevron) chevron.style.transform = 'rotate(0deg)';
    return;
  }

  // Close any other open viewers
  document.querySelectorAll('[id^="inlineTopicViewer_"]').forEach(el => el.remove());
  document.querySelectorAll('.topic-row-item.open').forEach(el => {
    el.classList.remove('open');
    el.style.borderColor = 'var(--bdr)';
    el.style.background  = 'white';
  });
  document.querySelectorAll('[id^="chevron_"]').forEach(el => {
    el.style.transform = 'rotate(0deg)';
  });

  // Mark this row as open
  rowEl.classList.add('open');
  rowEl.style.borderColor = 'var(--acc)';
  rowEl.style.background  = 'var(--bg2)';
  if (chevron) chevron.style.transform = 'rotate(90deg)';

  // Loading placeholder
  const loader = document.createElement('div');
  loader.id = viewerId;
  loader.style.cssText = `
    padding:16px;margin-bottom:8px;
    background:var(--bg2);
    border:1.5px solid var(--acc);
    border-radius:0 0 10px 10px;
    margin-top:-8px;`;
  loader.innerHTML = `
    <div style="text-align:center;padding:20px;color:var(--mut);font-size:12px;">
      <i class="fas fa-spinner fa-spin"></i> Loading topic…
    </div>`;
  rowEl.insertAdjacentElement('afterend', loader);

  const { data: topic, error } = await supabaseClient
    .from('topics')
    .select('id, title, content, category, duration')
    .eq('id', topicId)
    .maybeSingle();

  if (error || !topic) {
    loader.innerHTML = `
      <p style="color:var(--red);padding:12px;font-size:12px;">
        <i class="fas fa-exclamation-circle"></i> Failed to load topic.
      </p>`;
    return;
  }

  loader.innerHTML = `
    <div style="text-align:left;">
      <!-- Topic reader header -->
      <div style="display:flex;align-items:center;justify-content:space-between;
                  margin-bottom:14px;padding-bottom:12px;
                  border-bottom:1px solid var(--bdr);">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--txt);">
            ${_esc(topic.title)}
          </div>
          <div style="font-size:11px;color:var(--mut);margin-top:3px;">
            ${_esc(topic.category || 'General')}
            &nbsp;·&nbsp; ${topic.duration || '—'} min read
          </div>
        </div>
        <button onclick="
          document.getElementById('${viewerId}').remove();
          var row = document.getElementById('topicRow_${topicId}');
          if(row){
            row.classList.remove('open');
            row.style.borderColor='var(--bdr)';
            row.style.background='white';
          }
          var ch = document.getElementById('chevron_${topicId}');
          if(ch) ch.style.transform='rotate(0deg)';"
          class="btn bg"
          title="Close"
          style="flex-shrink:0;">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <!-- Topic content -->
      <div class="notes-content"
           style="font-size:13px;line-height:1.7;color:var(--txt);
                  max-height:600px;overflow-y:auto;padding-right:4px;">
        ${topic.content || '<p style="color:var(--mut)">No content available.</p>'}
      </div>
    </div>`;

  loader.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ─────────────────────────────────────────────────────────────
// KEEP OLD FUNCTION NAMES AS ALIASES (backward compatibility)
// ─────────────────────────────────────────────────────────────
function renderTeacherChapter(chapter, topics) {
  renderTeacherChapterTopics(chapter, topics, [], {});
}

async function viewTeacherTopic(chapterId, topicId) {
  const row = document.getElementById('topicRow_' + topicId);
  if (row) viewTeacherTopicInline(topicId, row);
}

async function viewTopicContent(chapterId, topicId, topicTitle) {
  const row = document.getElementById('topicRow_' + topicId);
  if (row) viewTeacherTopicInline(topicId, row);
}

console.log('✅ teacher-courses.js loaded');