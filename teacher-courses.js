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

  // Try courses assigned to this teacher first
let { data: courses, error: cErr } = await db
    .from('courses')
    .select('id, title, description, color, icon, created_at')
    .order('created_at', { ascending: false });

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

  // Bulk fetch enrollments
  const { data: enrollments } = await db
    .from('enrollments')
    .select('course_id, progress')
    .in('course_id', courseIds);

  // Bulk fetch chapters
  const { data: chapters } = await db
    .from('chapters')
    .select('course_id')
    .in('course_id', courseIds);

  // Build lookup maps
  const enrollMap  = {};
  const chapterMap = {};

  (enrollments || []).forEach(e => {
    if (!enrollMap[e.course_id]) enrollMap[e.course_id] = [];
    enrollMap[e.course_id].push(e.progress || 0);
  });

  (chapters || []).forEach(ch => {
    chapterMap[ch.course_id] = (chapterMap[ch.course_id] || 0) + 1;
  });

  // Assemble courses
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

  // ✅ Sync the Active Courses stat card
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
    .order('order_num', { ascending: true });

  if (chErr) {
    console.error('loadContentChapters: chapters error', chErr.message);
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

  const chapterIds = chapters.map(ch => ch.id);

  const { data: allTopics, error: tErr } = await db
    .from('topics')
    .select('id, chapter_id, title, category, duration, order_num')
    .in('chapter_id', chapterIds)
    .order('order_num', { ascending: true });

  if (tErr) console.error('loadContentChapters: topics error', tErr.message);

  const topicMap = {};
  (allTopics || []).forEach(t => {
    if (!topicMap[t.chapter_id]) topicMap[t.chapter_id] = [];
    topicMap[t.chapter_id].push(t);
  });

area.innerHTML = `
    <div class="notes-reading-container">
      <div class="notes-sidebar">
        <h4><i class="fas fa-book-open"></i> Chapters</h4>
        <ul class="notes-chapter-list" id="teacherChapterList"></ul>
      </div>
      <div class="notes-reader" id="teacherNotesReader">
        <div style="padding:60px;text-align:center;color:var(--mut);">
          <i class="fas fa-hand-point-left" style="font-size:32px;display:block;margin-bottom:12px;opacity:0.25;"></i>
          <p style="font-size:13px;">Select a chapter to view its topics</p>
        </div>
      </div>
    </div>`;

  const chapterListEl = document.getElementById('teacherChapterList');

  chapters.forEach((chapter, chIdx) => {
    const topics = topicMap[chapter.id] || [];
    const li = document.createElement('li');
    li.className = 'notes-chapter-item' + (chIdx === 0 ? ' active' : '');
    li.innerHTML = `<span>${chIdx + 1}. ${_esc(chapter.title)}</span>`;
    li.onclick = () => {
      document.querySelectorAll('.notes-chapter-item').forEach(x => x.classList.remove('active'));
      li.classList.add('active');
      renderTeacherChapter(chapter, topics);
    };
    chapterListEl.appendChild(li);
  });

  if (chapters.length > 0) {
    renderTeacherChapter(chapters[0], topicMap[chapters[0].id] || []);
  }
}

// ─────────────────────────────────────────────────────────────
// VIEW FULL TOPIC CONTENT
// ─────────────────────────────────────────────────────────────
async function viewTopicContent(chapterId, topicId, topicTitle) {
  const area = document.getElementById('contentArea');
  if (!area) return;

  const viewerId = `topicViewer_${topicId}`;
  const existing = document.getElementById(viewerId);
  if (existing) { existing.remove(); return; }

  const { data: topic, error } = await supabaseClient
    .from('topics')
    .select('id, title, content, category, duration')
    .eq('id', topicId)
    .maybeSingle();

  if (error || !topic) { toast('Failed to load topic content', 'w'); return; }

  const viewer = document.createElement('div');
  viewer.id = viewerId;
  viewer.style.cssText = `
    background:var(--s1);border:1px solid var(--acc)40;
    border-radius:10px;padding:16px;margin-bottom:12px`;

  viewer.innerHTML = `
    <div style="display:flex;align-items:center;
                justify-content:space-between;margin-bottom:12px">
      <div>
        <h4 style="font-family:'Syne',sans-serif;font-size:13px;
                   font-weight:700;margin-bottom:3px">
          ${_esc(topic.title)}
        </h4>
        <span style="font-size:10px;color:var(--mut)">
          ${_esc(topic.category || 'General')} · ${topic.duration || '—'} min read
        </span>
      </div>
      <button class="btn bg"
              onclick="document.getElementById('${viewerId}').remove()"
              title="Close">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="topic-content"
         style="font-size:13px;line-height:1.7;color:var(--txt)">
      ${topic.content || '<p style="color:var(--mut)">No content available.</p>'}
    </div>`;

  // Insert after the chapter card that contains this topic's button
  const allCards = area.querySelectorAll('.card');
  let targetCard = null;
  allCards.forEach(card => {
    if (card.querySelector(`[onclick*="${topicId}"]`)) targetCard = card;
  });

  if (targetCard) targetCard.after(viewer);
  else area.appendChild(viewer);

  viewer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderTeacherChapter(chapter, topics) {
  const reader = document.getElementById('teacherNotesReader');
  if (!reader) return;

  const chapterListEl = document.getElementById('teacherChapterList');
  if (chapterListEl) {
    chapterListEl.innerHTML = '';
    topics.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'notes-chapter-item' + (i === 0 ? ' active' : '');
      li.dataset.topicId = t.id;
      li.innerHTML = `<span>${i + 1}. ${_esc(t.title)}</span>`;
      li.onclick = () => {
        document.querySelectorAll('#teacherChapterList .notes-chapter-item')
          .forEach(x => x.classList.remove('active'));
        li.classList.add('active');
        viewTeacherTopic(chapter.id, t.id);
      };
      chapterListEl.appendChild(li);
    });
  }

  if (topics.length > 0) {
    viewTeacherTopic(chapter.id, topics[0].id);
  } else {
    reader.innerHTML = `
      <div style="padding:60px 20px;text-align:center;color:var(--mut);">
        <i class="fas fa-book-open" style="font-size:32px;display:block;margin-bottom:12px;opacity:0.25;color:var(--acc);"></i>
        <p style="font-size:13px;">No topics in this chapter yet.</p>
      </div>`;
  }
}
async function viewTeacherTopic(chapterId, topicId) {
  const reader = document.getElementById('teacherNotesReader');
  if (!reader) return;

  reader.innerHTML = `
    <div style="text-align:center;padding:40px;color:var(--mut);">
      <i class="fas fa-spinner fa-spin" style="font-size:24px;display:block;margin-bottom:10px;color:var(--acc);"></i>
      <p style="font-size:12px;">Loading topic…</p>
    </div>`;

  const { data: topic, error } = await supabaseClient
    .from('topics')
    .select('id, title, content, category, duration')
    .eq('id', topicId)
    .maybeSingle();

  if (error || !topic) {
    reader.innerHTML = `<p style="color:var(--red);padding:20px;">Failed to load topic.</p>`;
    return;
  }

  // Find current index in sidebar list
  const allItems = Array.from(
    document.querySelectorAll('#teacherChapterList .notes-chapter-item')
  );
  const currentIndex = allItems.findIndex(li =>
    li.onclick?.toString().includes(topicId) ||
    li.dataset.topicId === topicId
  );

  // Mark active in sidebar
  allItems.forEach((li, i) => {
    li.classList.toggle('active', li.dataset.topicId === topicId);
  });

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < allItems.length - 1;

  reader.innerHTML = `
    <div class="notes-header">
      <div class="notes-category-badge">${_esc(topic.category || 'General')}</div>
      <h1 class="notes-title">${_esc(topic.title)}</h1>
      <div class="notes-meta">
        <div class="notes-meta-item">
          <i class="fas fa-clock"></i> ${topic.duration || '—'} min read
        </div>
        <div class="notes-meta-item">
          <i class="fas fa-sync-alt"></i> Updated Recently
        </div>
      </div>
    </div>
    <div class="notes-content">
      ${topic.content || '<p style="color:var(--mut)">No content available.</p>'}
    </div>
    <div class="notes-navigation">
      <button class="notes-nav-btn" id="prevTopicBtn" ${!hasPrev ? 'disabled' : ''}>
        <i class="fas fa-arrow-left"></i> Previous
      </button>
      <button class="notes-nav-btn" id="nextTopicBtn" ${!hasNext ? 'disabled' : ''}>
        Next <i class="fas fa-arrow-right"></i>
      </button>
    </div>`;

  // Wire up Previous button
  if (hasPrev) {
    document.getElementById('prevTopicBtn').onclick = () => {
      allItems[currentIndex - 1].click();
    };
  }

  // Wire up Next button
  if (hasNext) {
    document.getElementById('nextTopicBtn').onclick = () => {
      allItems[currentIndex + 1].click();
    };
  }

  reader.scrollTop = 0;
}

console.log('✅ teacher-courses.js loaded');