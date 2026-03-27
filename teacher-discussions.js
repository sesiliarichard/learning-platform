// ============================================================
//  teacher-discussions.js  — Supabase-connected
//  FIXED: Group-chat layout — teacher's own replies on RIGHT
//         (purple), student replies on LEFT (white), with
//         sender names and timestamps clearly shown.
// ============================================================

let discussionsCache = [];
let openThreadId     = null;

// ─────────────────────────────────────────────────────────────
//  TIME HELPER
// ─────────────────────────────────────────────────────────────
function _discTimeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso);
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d} day${d > 1 ? 's' : ''} ago`;
  return new Date(iso).toLocaleDateString();
}

// ─────────────────────────────────────────────────────────────
//  AVATAR HELPERS  (consistent with student side)
// ─────────────────────────────────────────────────────────────
const _TD_AV_COLORS = ['#7c3aed','#2563eb','#059669','#d97706','#dc2626','#0891b2','#be185d','#9333ea'];
function _tdAvColor(s) {
  s = s || ''; let h = 0;
  for (let i = 0; i < s.length; i++) h += s.charCodeAt(i);
  return _TD_AV_COLORS[h % _TD_AV_COLORS.length];
}
function _tdAvInit(n) {
  return (n || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

// ============================================================
//  1. LOAD DISCUSSIONS
// ============================================================
async function loadDiscussionsFromDB() {
  const el = document.getElementById('discList') || document.getElementById('_tdThreadList');
  if (!el) return;

  el.innerHTML = `
    <div class="empty">
      <i class="fas fa-spinner fa-spin"></i>
      <p>Loading discussions…</p>
    </div>`;

  const courseIds = teacherState.courses.map(c => c.id);
  if (!courseIds.length) {
    el.innerHTML = `
      <div class="empty">
        <i class="fas fa-comments"></i>
        <p>No courses found.</p>
      </div>`;
    return;
  }

  const db = supabaseClient;

  try {
    const { data: threads, error: tErr } = await db
      .from('discussion_threads')
      .select('id, title, content, is_solved, created_at, course_id, author_id')
      .order('created_at', { ascending: false });

    if (tErr) throw tErr;
    if (!threads?.length) {
      discussionsCache = [];
      renderDiscussions();
      return;
    }

    // Bulk fetch author profiles
    const authorIds = [...new Set(threads.map(t => t.author_id).filter(Boolean))];
    const { data: profiles } = await db
      .from('profiles')
      .select('id, first_name, last_name, avatar_url')
      .in('id', authorIds);

    const profileMap = {};
    (profiles || []).forEach(p => {
      profileMap[p.id] = {
        name:   [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Student',
        avatar: p.avatar_url,
      };
    });

    // Bulk fetch reply counts
    const threadIds = threads.map(t => t.id);
    const { data: replies } = await db
      .from('discussion_replies')
      .select('thread_id')
      .in('thread_id', threadIds);

    const replyCountMap = {};
    (replies || []).forEach(r => {
      replyCountMap[r.thread_id] = (replyCountMap[r.thread_id] || 0) + 1;
    });

    // Assemble cache
    discussionsCache = threads.map(t => {
      const course = teacherState.courses.find(c => c.id === t.course_id);
      return {
        id:          t.id,
        title:       t.title,
        body:        t.content,
        solved:      t.is_solved || false,
        courseId:    t.course_id,
        courseTitle: course?.title || '—',
        courseColor: course?.color || '#1a9fd4',
        authorId:    t.author_id,
        author:      profileMap[t.author_id]?.name   || 'Student',
        authorAvatar:profileMap[t.author_id]?.avatar || null,
        replyCount:  replyCountMap[t.id] || 0,
        time:        _discTimeAgo(t.created_at),
        createdAt:   t.created_at,
      };
    });

    renderDiscussions();

  } catch (err) {
    console.error('loadDiscussionsFromDB:', err.message);
    el.innerHTML = `
      <div class="empty">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Failed to load discussions.<br>
           <small style="color:var(--mut)">${_esc(err.message)}</small>
        </p>
      </div>`;
  }
}

// ============================================================
//  2. RENDER DISCUSSION LIST
// ============================================================
function renderDiscussions() {
  const el = document.getElementById('discList');
  if (!el) return;

  if (!discussionsCache.length) {
    el.innerHTML = `
      <div class="empty">
        <i class="fas fa-comments"></i>
        <p>No discussions yet in your courses.</p>
      </div>`;
    return;
  }

  el.innerHTML = discussionsCache.map(d => `
    <div class="disc-i" id="disc_${d.id}">

      <!-- Badges row -->
      <div class="disc-m">
        <span class="chip cv"
              style="background:${d.courseColor}22;color:${d.courseColor}">
          ${_esc(d.courseTitle.split(' ').slice(0, 3).join(' '))}
        </span>
        <span class="chip ${d.solved ? 'cg' : 'ca'}">
          ${d.solved ? 'Solved' : 'Open'}
        </span>
        <span style="margin-left:auto;font-size:10px;color:var(--mut)">
          ${d.time}
        </span>
      </div>

      <!-- Title -->
      <div class="disc-t">${_esc(d.title)}</div>

      <!-- Body preview -->
      ${d.body ? `
        <div style="font-size:12px;color:var(--txt2);margin:4px 0 8px;
                    overflow:hidden;max-height:42px;line-height:1.5">
          ${_esc(d.body)}
        </div>` : ''}

      <!-- Footer -->
      <div class="disc-f">
        <span><i class="fas fa-user"></i> ${_esc(d.author)}</span>
        <span>
          <i class="fas fa-comments"></i>
          ${d.replyCount} repl${d.replyCount === 1 ? 'y' : 'ies'}
        </span>
        <span><i class="fas fa-clock"></i> ${d.time}</span>

        <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
          <button class="bxs" onclick="toggleReplies('${d.id}')">
            <i class="fas fa-reply"></i> Reply
          </button>
          <button class="btn bg"
                  onclick="markDiscussionSolved('${d.id}', ${!d.solved})"
                  style="font-size:11px;padding:4px 9px"
                  title="${d.solved ? 'Reopen this thread' : 'Mark as solved'}">
            <i class="fas fa-${d.solved ? 'redo' : 'check-circle'}"></i>
            ${d.solved ? 'Reopen' : 'Mark Solved'}
          </button>
        </div>
      </div>

      <!-- Replies chat panel (hidden by default) -->
      <div id="replies_${d.id}"
           style="display:none;margin-top:12px;
                  border-top:1px solid var(--bdr);padding-top:10px">

        <!-- Chat message list -->
        <div id="replyList_${d.id}" class="_tdc-msgs"></div>

        <!-- Compose box -->
        <div class="_tdc-compose">
          <textarea id="replyText_${d.id}" rows="2" class="_tdc-ta"
                    placeholder="Write your reply as teacher…"></textarea>
          <div class="_tdc-compose-row">
            <button class="btn bg" onclick="toggleReplies('${d.id}')">
              Cancel
            </button>
            <button class="btn bp"
                    id="replyBtn_${d.id}"
                    onclick="submitReply('${d.id}')">
              <i class="fas fa-paper-plane"></i> Send Reply
            </button>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  // Inject chat bubble styles if not already done
  _injectTeacherDiscStyles();
}

// ============================================================
//  3. TOGGLE REPLIES PANEL
// ============================================================
async function toggleReplies(threadId) {
  const panel = document.getElementById(`replies_${threadId}`);
  if (!panel) return;

  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';

  if (!isOpen) {
    openThreadId = threadId;
    await loadReplies(threadId);
    document.getElementById(`replyText_${threadId}`)?.focus();
  } else {
    if (openThreadId === threadId) openThreadId = null;
  }
}

// ============================================================
//  4. LOAD REPLIES  ← CORE FIX
//
//  Problems fixed:
//  1. Teacher's own messages now appear on the RIGHT (purple)
//  2. Student messages appear on the LEFT (white bubbles)
//  3. Sender name shown above first message in each group
//  4. Timestamps below each bubble
//  5. String comparison for author_id (UUID type safety)
// ============================================================
async function loadReplies(threadId) {
  const listEl = document.getElementById(`replyList_${threadId}`);
  if (!listEl) return;

  listEl.innerHTML = `
    <p style="color:var(--mut);font-size:11px;text-align:center;padding:8px 0">
      <i class="fas fa-spinner fa-spin"></i> Loading…
    </p>`;

  const db = supabaseClient;

  try {
    // Get current teacher's user ID for left/right decision
    const { data: { user: currentUser } } = await db.auth.getUser();
    const myId = currentUser?.id;

    const { data: replies, error } = await db
      .from('discussion_replies')
      .select('id, content, created_at, updated_at, author_id, author_name')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    if (!replies?.length) {
      listEl.innerHTML = `
        <p style="color:var(--mut);font-size:11px;text-align:center;padding:12px 0">
          No replies yet. Be the first to reply!
        </p>`;
      return;
    }

    // Bulk fetch reply author profiles
    const authorIds = [...new Set(replies.map(r => r.author_id).filter(Boolean))];
    const { data: profiles } = await db
      .from('profiles')
      .select('id, first_name, last_name, role, avatar_url')
      .in('id', authorIds);

    const profileMap = {};
    (profiles || []).forEach(p => {
      profileMap[p.id] = {
        name:     [p.first_name, p.last_name].filter(Boolean).join(' ') || (p.role === 'teacher' ? 'Teacher' : 'Student'),
        role:     p.role,
        avatar:   p.avatar_url,
        initials: [p.first_name, p.last_name]
          .filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?',
      };
    });

    // Build bubble HTML
    let lastAuthorId = null;
    const bubbles = replies.map(r => {
      // ── FIX 1: String comparison so UUIDs always match ──
      const isSelf      = myId && String(r.author_id) === String(myId);
      const prof        = profileMap[r.author_id] || {
        name:     r.author_name || 'User',
        role:     'student',
        initials: (r.author_name||'U')[0].toUpperCase(),
        avatar:   null,
      };
      const isTeacher   = prof.role === 'teacher' || prof.role === 'instructor';

      // Show name + avatar only when sender changes
      const showHeader  = String(r.author_id) !== String(lastAuthorId);
      lastAuthorId = r.author_id;

      // Bubble corner and color
      //  - Self (teacher): purple gradient, right side, right-opening corner
      //  - Other teacher:  teal gradient, left side, left-opening corner
      //  - Student:        white, left side, left-opening corner
      const bubbleStyle = isSelf
        ? 'background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border-radius:16px 3px 16px 16px;box-shadow:0 4px 14px rgba(124,58,237,.3);'
        : isTeacher
          ? 'background:linear-gradient(135deg,#0891b2,#0e7490);color:#fff;border-radius:3px 16px 16px 16px;box-shadow:0 4px 14px rgba(8,145,178,.25);'
          : 'background:#fff;color:#1f2937;border-radius:3px 16px 16px 16px;box-shadow:0 2px 8px rgba(0,0,0,.06);border:1px solid #f0f0f0;';

      const avBg = isSelf ? '#7c3aed' : (isTeacher ? '#0891b2' : _tdAvColor(prof.name));

      const avatarHtml = showHeader
        ? (prof.avatar
            ? `<img src="${prof.avatar}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;" alt="${_esc(prof.name)}">`
            : `<div style="width:30px;height:30px;border-radius:50%;background:${avBg};color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;flex-shrink:0;">${prof.initials}</div>`)
        : `<div style="width:30px;flex-shrink:0;"></div>`;  /* spacer */

      const roleBadge = isTeacher && !isSelf
        ? `<span style="font-size:9px;font-weight:700;background:#e0f2fe;color:#0369a1;padding:1px 6px;border-radius:20px;">Teacher</span>`
        : isSelf
          ? `<span style="font-size:9px;font-weight:700;background:#ede9fe;color:#7c3aed;padding:1px 6px;border-radius:20px;">You</span>`
          : '';

      const nameRow = showHeader ? `
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;${isSelf?'flex-direction:row-reverse;':''} flex-wrap:wrap;">
          <span style="font-size:11px;font-weight:700;color:#374151;">${_esc(prof.name)}</span>
          ${roleBadge}
        </div>` : '';

      const timestamp = `
        <div style="font-size:9px;color:#9ca3af;margin-top:3px;${isSelf?'text-align:right;':''}">
          ${_discTimeAgo(r.created_at || r.updated_at)}
        </div>`;

      return `
        <div style="
          display:flex;
          flex-direction:${isSelf ? 'row-reverse' : 'row'};
          gap:8px;
          align-items:flex-end;
          margin-bottom:${showHeader ? '10px' : '3px'};
        ">
          <!-- Avatar -->
          <div style="align-self:flex-end;">${avatarHtml}</div>

          <!-- Bubble + name -->
          <div style="max-width:70%;display:flex;flex-direction:column;align-items:${isSelf?'flex-end':'flex-start'};">
            ${nameRow}
            <div style="padding:8px 13px;font-size:13px;line-height:1.55;word-break:break-word;${bubbleStyle}">
              ${_esc(r.content)}
            </div>
            ${timestamp}
          </div>
        </div>`;
    });

    listEl.innerHTML = bubbles.join('');

    // Scroll to bottom of reply list
    listEl.scrollTop = listEl.scrollHeight;

  } catch (err) {
    console.error('loadReplies:', err.message);
    listEl.innerHTML = `
      <p style="color:var(--red);font-size:11px">
        Failed to load replies: ${_esc(err.message)}
      </p>`;
  }
}

// ============================================================
//  5. SUBMIT REPLY
// ============================================================
async function submitReply(threadId) {
  const textarea = document.getElementById(`replyText_${threadId}`);
  const body     = textarea?.value?.trim();
  if (!body) { toast('Please write a reply first', 'w'); return; }

  const btn = document.getElementById(`replyBtn_${threadId}`);
  if (btn) {
    btn.disabled  = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  }

  const db = supabaseClient;

  try {
    const { data: { user } } = await db.auth.getUser();

    const { error } = await db
      .from('discussion_replies')
      .insert({
        thread_id:  threadId,
        content:    body,
        author_id:  user?.id,
        created_at: new Date().toISOString(),
      });

    if (error) throw error;

    // Update local cache count
    const thread = discussionsCache.find(d => String(d.id) === String(threadId));
    if (thread) thread.replyCount++;

    textarea.value = '';
    toast('Reply sent! ✅');

    // Refresh reply list in-place
    await loadReplies(threadId);

    // Update reply count chip in the thread card footer
    const countEl = document.querySelector(`#disc_${threadId} .disc-f span:nth-child(2)`);
    if (countEl && thread) {
      countEl.innerHTML = `
        <i class="fas fa-comments"></i>
        ${thread.replyCount} repl${thread.replyCount === 1 ? 'y' : 'ies'}`;
    }

  } catch (err) {
    console.error('submitReply:', err.message);
    toast('Failed to send reply: ' + _esc(err.message), 'e');
  } finally {
    if (btn) {
      btn.disabled  = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Reply';
    }
  }
}

// ============================================================
//  6. MARK SOLVED / REOPEN
// ============================================================
async function markDiscussionSolved(threadId, solved) {
  const db = supabaseClient;

  try {
    const { error } = await db
      .from('discussion_threads')
      .update({ is_solved: solved })
      .eq('id', threadId);

    if (error) throw error;

    const thread = discussionsCache.find(d => String(d.id) === String(threadId));
    if (thread) thread.solved = solved;

    toast(solved ? 'Marked as solved ✓' : 'Thread reopened');
    renderDiscussions();

    if (openThreadId === threadId) {
      setTimeout(() => toggleReplies(threadId), 60);
    }

  } catch (err) {
    console.error('markDiscussionSolved:', err.message);
    toast('Failed to update: ' + _esc(err.message), 'e');
  }
}

// ============================================================
//  7. DELETE THREAD
// ============================================================
async function _tDeleteThread(threadId) {
    if (!confirm('Delete this discussion? This cannot be undone.')) return;

    const db = window.supabaseClient;
    try {
        await db.from('discussion_replies').delete().eq('thread_id', threadId);
        const { error } = await db.from('discussion_threads').delete().eq('id', threadId);
        if (error) throw error;

        _tDiscUI.active = null;

        // Remove from cache
if (typeof discussionsCache !== 'undefined') {
    const idx = discussionsCache.findIndex(d => String(d.id) === String(threadId));
    if (idx > -1) discussionsCache.splice(idx, 1);
    }
_tRenderList();

        // Hide chat panel, show empty state
        document.getElementById('_tdChatInner').style.display = 'none';
        document.getElementById('_tdEmpty').style.display     = 'flex';

        // Re-render list immediately
        _tRenderList();

        // Also reload from DB to stay in sync

        _tToast('Discussion deleted', 'success');

    } catch (err) {
        _tToast('Failed to delete: ' + err.message, 'error');
    }
}

// ============================================================
//  8. INJECT STYLES for compose box + message list
// ============================================================
function _injectTeacherDiscStyles() {
  if (document.getElementById('_tdc-css')) return;
  const s = document.createElement('style');
  s.id = '_tdc-css';
  s.textContent = `
    ._tdc-msgs {
      display: flex;
      flex-direction: column;
      gap: 0;
      max-height: 340px;
      overflow-y: auto;
      padding: 8px 4px;
      scrollbar-width: thin;
      scrollbar-color: #e5e7eb transparent;
    }
    ._tdc-compose {
      margin-top: 10px;
      background: #f8f7ff;
      border: 1.5px solid #e5e7eb;
      border-radius: 12px;
      padding: 10px 12px;
    }
    ._tdc-ta {
      width: 100%;
      border: none;
      background: transparent;
      font-size: 13px;
      font-family: inherit;
      color: #1f2937;
      resize: vertical;
      outline: none;
      line-height: 1.5;
      min-height: 48px;
      box-sizing: border-box;
    }
    ._tdc-ta::placeholder { color: #9ca3af; }
    ._tdc-compose-row {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }
  `;
  document.head.appendChild(s);
}

console.log('✅ teacher-discussions.js loaded (group-chat fix applied)');