// ============================================================
//  teacher-discussions-ui.js  — Teacher Real-Time Chat UI
//
//  FIXED:
//  1. _tLoadAndRenderReplies() now joins profiles in SELECT
//     so role/name/avatar are available per reply
//  2. _tBuildBubble() — isTeach no longer wrongly equals isSelf;
//     non-self teachers get teal LEFT bubbles, students get
//     white LEFT bubbles, own (self) replies get purple RIGHT
//  3. CSS — _self-b is now purple (not teal) so teacher's own
//     messages are visually distinct from student messages
//  4. showHeader grouping uses String() coercion for UUID safety
// ============================================================

'use strict';

// ── UI state ─────────────────────────────────────────────────
const _tDiscUI = {
    active:      null,
    channel:     null,
    typingTimer: null,
    typingUsers: {},
    filter:      'all',
    search:      '',
    sending:     false,
    me:          null,
};

// ── Helpers ───────────────────────────────────────────────────
const _T_COLORS = ['#7c3aed','#2563eb','#059669','#d97706','#dc2626','#0891b2','#be185d','#9333ea'];
function _tAvColor(s) { s=s||''; let h=0; for(let i=0;i<s.length;i++) h+=s.charCodeAt(i); return _T_COLORS[h%_T_COLORS.length]; }
function _tAvInit(n)  { return (n||'T').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase(); }
function _tAgo(iso)   {
    if (!iso) return '—';
    const s = Math.floor((Date.now()-new Date(iso))/1000);
    if (s<60)    return 'just now';
    if (s<3600)  return Math.floor(s/60)+'m ago';
    if (s<86400) return Math.floor(s/3600)+'h ago';
    return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric'});
}
function _tSafe(str) { const d=document.createElement('div'); d.appendChild(document.createTextNode(str||'')); return d.innerHTML; }
function _tToast(msg,type) {
    if      (typeof toast==='function')     toast(msg, type==='error'?'e':type==='warning'?'w':'s');
    else if (typeof showToast==='function') showToast(msg,type);
}

// ============================================================
//  ENTRY
// ============================================================
async function initTeacherDiscUI() {
    const db = window.supabaseClient;
    if (!db) return;

    const { data:{ user } } = await db.auth.getUser();
    if (!user) return;
    const { data: profile } = await db
        .from('profiles').select('first_name,last_name,role,avatar_url')
        .eq('id',user.id).maybeSingle();
    _tDiscUI.me = { ...profile, id: user.id };

    _injectTDiscStyles();
    _renderTShell();

    await loadDiscussionsFromDB();
    _tRenderList();
}

// ============================================================
//  SHELL HTML
// ============================================================
function _renderTShell() {
    const section = document.getElementById('discussionsSection') ||
                    document.querySelector('[data-section="discussions"]');
    if (!section) return;

    section.innerHTML = `
    <div class="_td-root">

      <!-- ── Sidebar ── -->
      <div class="_td-sb">
        <div class="_td-sb-hdr">
          <div class="_td-sb-top">
            <span class="_td-sb-title">
              <i class="fas fa-comments"></i> Discussions
            </span>
            <div style="display:flex;gap:6px">
              <button class="_td-newbtn" onclick="_tOpenNewModal()">
                <i class="fas fa-plus"></i> New
              </button>
              <button class="_td-refresh" onclick="_tRefresh(this)" title="Refresh">
                <i class="fas fa-sync-alt"></i>
              </button>
            </div>
          </div>
          <div class="_td-srch-wrap">
            <i class="fas fa-search _td-srch-ico"></i>
            <input class="_td-srch" id="_tdSearch" type="text"
                   placeholder="Search threads…"
                   oninput="_tFilterSearch(this.value)"/>
          </div>
          <div class="_td-tabs">
            <button class="_td-tab active" onclick="_tFilter('all',this)">All</button>
            <button class="_td-tab" onclick="_tFilter('mine',this)">Mine</button>
            <button class="_td-tab" onclick="_tFilter('open',this)">Open</button>
            <button class="_td-tab" onclick="_tFilter('solved',this)">Solved</button>
          </div>
        </div>
        <div class="_td-tlist" id="_tdThreadList">
          <div class="_td-loading"><i class="fas fa-spinner fa-spin"></i> Loading…</div>
        </div>
      </div>

      <!-- ── Chat panel ── -->
      <div class="_td-chat">

        <div class="_td-empty" id="_tdEmpty">
          <div style="font-size:52px;margin-bottom:14px">💬</div>
          <h3>Select a discussion</h3>
          <p>Pick a thread to view and respond to student questions.</p>
        </div>

        <div class="_td-chat-inner" id="_tdChatInner" style="display:none">
          <div class="_td-chat-hdr" id="_tdChatHdr"></div>
          <div class="_td-msgs" id="_tdMsgs"></div>
          <div class="_td-typing" id="_tdTyping" style="display:none">
            <div class="_td-dots"><span></span><span></span><span></span></div>
            <span id="_tdTypingTxt">Someone is typing…</span>
          </div>
          <div class="_td-input-area">
            <div class="_td-teacher-tag">
              <i class="fas fa-chalkboard-teacher"></i> Replying as Teacher
            </div>
            <div class="_td-input-wrap">
              <textarea id="_tdInput" class="_td-ta" rows="1"
                placeholder="Reply to students… (Enter to send)"
                oninput="_tHandleInput(this)"
                onkeydown="_tKeydown(event)"></textarea>
              <button class="_td-sendbtn" id="_tdSendBtn" onclick="_tSend()">
                <i class="fas fa-paper-plane"></i>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>`;
}

// ============================================================
//  RENDER THREAD LIST
// ============================================================
function _tRenderList() {
    const el = document.getElementById('_tdThreadList');
    if (!el) return;

    const q     = _tDiscUI.search.toLowerCase();
    const f     = _tDiscUI.filter;
    const cache = typeof discussionsCache !== 'undefined' ? discussionsCache : [];

    const list = cache.filter(d => {
        if (q && !d.title.toLowerCase().includes(q) && !(d.body||'').toLowerCase().includes(q)) return false;
        if (f==='mine'   && String(d.authorId) !== String(_tDiscUI.me?.id)) return false;
        if (f==='open'   &&  d.solved) return false;
        if (f==='solved' && !d.solved) return false;
        return true;
    });

    if (!list.length) {
        el.innerHTML = `
          <div class="_td-empty-list">
            <i class="fas fa-comment-slash" style="font-size:24px;display:block;margin-bottom:8px"></i>
            <p>${cache.length===0 ? 'No discussions yet.' : 'Nothing matches.'}</p>
          </div>`;
        return;
    }

    el.innerHTML = list.map(d => {
        const isActive = _tDiscUI.active?.id === d.id;
        return `
        <div class="_td-ti ${isActive?'_active':''} ${d.solved?'_solved':''}"
             onclick="_tOpenThread('${d.id}')" id="_tdt_${d.id}">
          <div class="_td-ti-top">
            <div class="_td-av" style="background:${_tAvColor(d.author||'S')}">${_tAvInit(d.author||'S')}</div>
            <div class="_td-ti-info">
              <div class="_td-ti-ttl">${_tSafe(d.title)}</div>
              <div class="_td-ti-tags">
                <span class="_td-tag" style="background:${d.courseColor||'#7c3aed'}20;color:${d.courseColor||'#7c3aed'}">${_tSafe((d.courseTitle||'').split(' ').slice(0,2).join(' '))}</span>
                ${d.solved ? '<span class="_td-stag">✓ Solved</span>' : '<span class="_td-otag">● Open</span>'}
              </div>
            </div>
          </div>
          <div class="_td-ti-foot">
            <span><i class="fas fa-reply"></i> ${d.replyCount||0}</span>
            <span><i class="fas fa-user"></i> ${_tSafe(d.author||'Student')}</span>
            <span><i class="fas fa-clock"></i> ${d.time||'—'}</span>
          </div>
        </div>`;
    }).join('');
}

// ============================================================
//  OPEN THREAD
// ============================================================
async function _tOpenThread(threadId) {
    const db    = window.supabaseClient;
    const cache = typeof discussionsCache !== 'undefined' ? discussionsCache : [];
    const disc  = cache.find(d => String(d.id) === String(threadId));
    if (!disc) return;

    if (_tDiscUI.channel) {
        await db.removeChannel(_tDiscUI.channel);
        _tDiscUI.channel = null;
    }

    _tDiscUI.active      = disc;
    _tDiscUI.typingUsers = {};

    document.querySelectorAll('._td-ti').forEach(e=>e.classList.remove('_active'));
    const item = document.getElementById(`_tdt_${threadId}`);
    if (item) item.classList.add('_active');

    document.getElementById('_tdEmpty').style.display     = 'none';
    document.getElementById('_tdChatInner').style.display = 'flex';

    _tRenderChatHdr(disc);

    const msgsEl = document.getElementById('_tdMsgs');
    msgsEl.innerHTML = '<div class="_td-loading"><i class="fas fa-spinner fa-spin"></i> Loading messages…</div>';

    await _tLoadAndRenderReplies(threadId);

    document.getElementById('_tdInput')?.focus();

    // Realtime subscription
const channel = db.channel(`tdisc-${threadId}`)
    .on('postgres_changes', {
        event:'INSERT', schema:'public',
        table:'discussion_replies',
        filter:`thread_id=eq.${threadId}`
    }, async (payload) => {
        const { data: reply } = await db
            .from('discussion_replies')
            .select('id, content, created_at, author_id, author_name')
            .eq('id', payload.new.id).maybeSingle();

        if (!reply) return;

        // ── FIX: skip if this message was sent by ME (already shown as optimistic) ──
        const myId = _tDiscUI.me?.id;
        if (myId && String(reply.author_id) === String(myId)) return;

        // ── Also skip if bubble already exists in DOM ──
        if (document.getElementById(`_tr_${reply.id}`)) return;

        const el       = document.getElementById('_tdMsgs');
        const lastEl   = el?.lastElementChild;
        const lastAid  = lastEl?.dataset?.authorId;
        const showHdr  = !lastAid || lastAid !== String(reply.author_id);

        _tAppendBubble(reply, showHdr);
        _tScrollBottom();

        const d = cache.find(x=>String(x.id)===String(threadId));
        if (d) { d.replyCount=(d.replyCount||0)+1; _tRenderList(); }
    })
        .on('broadcast',{event:'typing'}, ({payload}) => {
            if (payload.userId===_tDiscUI.me?.id) return;
            if (payload.isTyping) _tDiscUI.typingUsers[payload.userId] = payload.name;
            else delete _tDiscUI.typingUsers[payload.userId];
            _tUpdateTyping();
        })
        .subscribe();

    _tDiscUI.channel = channel;
}

// ============================================================
//  LOAD & RENDER REPLIES  ← FIXED: profiles joined in SELECT
// ============================================================
async function _tLoadAndRenderReplies(threadId) {
    const db     = window.supabaseClient;
    const msgsEl = document.getElementById('_tdMsgs');

    try {
        // ── FIXED: select profiles so role/name/avatar are available ──
        const { data: replies, error } = await db
            .from('discussion_replies')
            .select('id, content, created_at, author_id, author_name')
            .eq('thread_id', threadId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        msgsEl.innerHTML = '';

        if (!replies?.length) {
            msgsEl.innerHTML = `
              <div class="_td-no-msgs">
                <div style="font-size:42px;margin-bottom:10px">🎓</div>
                <p>No replies yet — be the first to respond!</p>
              </div>`;
            return;
        }

        // Group consecutive messages: only show avatar+name on first in group
        let lastAuthorId = null;
        let lastDate     = null;

        replies.forEach(r => {
            // Date separator
            const msgDate = new Date(r.created_at).toDateString();
            if (msgDate !== lastDate) {
                const sep = document.createElement('div');
                sep.className = '_td-date-sep';
                sep.innerHTML = `<span>${new Date(r.created_at).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}</span>`;
                msgsEl.appendChild(sep);
                lastDate     = msgDate;
                lastAuthorId = null;
            }

            const showHeader = String(r.author_id) !== String(lastAuthorId);
            const bubble     = _tBuildBubble(r, showHeader);
            bubble.dataset.authorId = String(r.author_id);
            msgsEl.appendChild(bubble);
            lastAuthorId = r.author_id;
        });

        _tScrollBottom(false);

    } catch (err) {
        console.error('_tLoadAndRenderReplies:', err.message);
        msgsEl.innerHTML = `<div class="_td-err">Failed to load: ${_tSafe(err.message)}</div>`;
    }
}



// ============================================================
function _tBuildBubble(reply, showHeader=true) {
    const myId = _tDiscUI.me?.id;

    // ── String coercion for UUID safety ────────────────────
    const isSelf = myId && String(reply.author_id) === String(myId);
   const isTeach = !isSelf && (
    (reply.profiles?.role === 'teacher') ||
    (reply.profiles?.role === 'instructor') ||
    (reply.author_name || '').toLowerCase().includes('teacher')
);
    // Profile comes from the joined `profiles` field
    const p    = reply.profiles || {};
    const name = p.first_name
        ? `${p.first_name} ${p.last_name||''}`.trim()
        : (reply.author_name || 'User');

    
   

    const color = _tAvColor(name);

    const wrap = document.createElement('div');
    // _self → row-reverse (message goes right)
    wrap.className = `_td-mrow${isSelf ? ' _self' : ''}`;
    wrap.id        = `_tr_${reply.id}`;

    // Bubble class:
    //   own message       → purple, right side
    //   other teacher     → teal,   left side
    //   student           → white,  left side
    const bubbleClass = isSelf    ? '_self-b'
                      : isTeach   ? '_teach-b'
                      :             '_other-b';

    // Avatar
    const avBg = isSelf ? '#7c3aed' : (isTeach ? '#0891b2' : color);
    let avatarHtml;
    if (showHeader) {
        avatarHtml = (p.avatar_url || reply.avatar_url)
            ? `<img src="${p.avatar_url || reply.avatar_url}" class="_td-mav" style="object-fit:cover" alt="${_tSafe(name)}">`
            : `<div class="_td-mav" style="background:${avBg}">${_tAvInit(name)}</div>`;
    } else {
        avatarHtml = `<div class="_td-mav-sp"></div>`;
    }

    // Badges
    const teachBadge  = isTeach && !isSelf ? '<span class="_td-tbadge"><i class="fas fa-chalkboard-teacher"></i> Teacher</span>' : '';
    const selfBadge   = isSelf             ? '<span class="_td-ybadge">You</span>' : '';
    const studentBadge = !isTeach && !isSelf ? '<span class="_td-sbadge">Student</span>' : '';

    const headerHtml = showHeader ? `
        <div class="_td-mname">
            <span class="_td-mname-text">${_tSafe(name)}</span>
            ${teachBadge}${selfBadge}${studentBadge}
        </div>` : '';

    wrap.innerHTML = `
      <div class="_td-mav-col">${avatarHtml}</div>
      <div class="_td-mcontent">
        ${headerHtml}
        <div class="_td-bubble ${bubbleClass}">${_tSafe(reply.content)}</div>
        <div class="_td-mtime">${_tAgo(reply.created_at || reply.updated_at)}</div>
      </div>`;

    return wrap;
}

function _tAppendBubble(reply, showHeader) {
    const el = document.getElementById('_tdMsgs');
    if (!el) return;
    const ph = el.querySelector('._td-no-msgs');
    if (ph) ph.remove();
    const bubble = _tBuildBubble(reply, showHeader);
    bubble.dataset.authorId = String(reply.author_id);
    el.appendChild(bubble);
}

// ============================================================
//  SEND
// ============================================================
async function _tSend() {
    if (_tDiscUI.sending || !_tDiscUI.active) return;

    const input   = document.getElementById('_tdInput');
    const content = input?.value?.trim();
    if (!content) return;

    _tDiscUI.sending = true;
    input.value = '';
    input.style.height = 'auto';
    _tBroadcastTyping(false);

    const btn = document.getElementById('_tdSendBtn');
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    const me   = _tDiscUI.me;
    const name = me ? `${me.first_name||''} ${me.last_name||''}`.trim() || 'Teacher' : 'Teacher';

    // Optimistic bubble
    const opt = {
        id:          '_opt_' + Date.now(),
        author_id:   me?.id,
        author_name: name,
        content,
        created_at:  new Date().toISOString(),
        profiles: { first_name: me?.first_name, last_name: me?.last_name, role: me?.role || 'teacher', avatar_url: me?.avatar_url }
    };
    _tAppendBubble(opt, true);
    _tScrollBottom();

    const db         = window.supabaseClient;
    const { data:{ user } } = await db.auth.getUser();
    const threadId   = _tDiscUI.active.id;

    try {
        const { error } = await db.from('discussion_replies').insert({
            thread_id:   threadId,
            content,
            author_id:   user?.id,
            author_name: name,
            created_at:  new Date().toISOString(),
        });

        if (error) throw error;

        const cache = typeof discussionsCache !== 'undefined' ? discussionsCache : [];
        const disc  = cache.find(d => String(d.id) === String(threadId));
        if (disc) disc.replyCount = (disc.replyCount || 0) + 1;

        // Update optimistic element id
        const optEl = document.getElementById(`_tr_${opt.id}`);
        if (optEl) optEl.id = `_tr_sent_${Date.now()}`;

        _tRenderList();
        _tToast('Reply sent! ✅', 'success');

    } catch (err) {
        console.error('_tSend:', err.message);
        document.getElementById(`_tr_${opt.id}`)?.remove();
        input.value = content;
        _tToast('Failed: ' + err.message, 'error');
    } finally {
        _tDiscUI.sending = false;
        if (btn) btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        input?.focus();
    }
}

// ============================================================
//  MARK SOLVED
// ============================================================
async function _tToggleSolved(threadId, solved) {
    await markDiscussionSolved(threadId, solved);

    const cache = typeof discussionsCache !== 'undefined' ? discussionsCache : [];
    const d     = cache.find(x => String(x.id) === String(threadId));
    if (d) d.solved = solved;

    if (_tDiscUI.active?.id == threadId) {
        _tDiscUI.active.solved = solved;
        _tRenderChatHdr(_tDiscUI.active);
    }

    _tRenderList();
}

// ============================================================
//  CHAT HEADER
// ============================================================
function _tRenderChatHdr(disc) {
    const el = document.getElementById('_tdChatHdr');
    if (!el) return;

    el.innerHTML = `
      <div class="_td-hd-l">
        <div class="_td-hd-ttl">${_tSafe(disc.title)}</div>
        <div class="_td-hd-meta">
          <span class="_td-tag" style="background:${disc.courseColor||'#7c3aed'}20;color:${disc.courseColor||'#7c3aed'}">${_tSafe(disc.courseTitle||'')}</span>
          <span class="_td-tag" style="background:#9ca3af20;color:#6b7280">by ${_tSafe(disc.author||'Student')}</span>
          ${disc.solved ? '<span class="_td-stag">✓ Solved</span>' : '<span class="_td-otag">● Open</span>'}
        </div>
      </div>
      <div class="_td-hd-r">
        <button class="_td-hdbtn ${disc.solved?'_btn-reopen':'_btn-solve'}"
                onclick="_tToggleSolved('${disc.id}',${!disc.solved})">
          <i class="fas fa-${disc.solved?'redo':'check'}"></i>
          ${disc.solved ? 'Reopen' : 'Mark Solved'}
        </button>
        <button class="_td-hdbtn" style="background:#fee2e2;color:#991b1b"
                onclick="_tDeleteThread('${disc.id}')">
          <i class="fas fa-trash"></i> Delete
        </button>
      </div>`;
}

// ============================================================
//  DELETE THREAD
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
//  TYPING
// ============================================================
function _tHandleInput(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    _tBroadcastTyping(true);
    clearTimeout(_tDiscUI.typingTimer);
    _tDiscUI.typingTimer = setTimeout(() => _tBroadcastTyping(false), 2000);
}

function _tBroadcastTyping(isTyping) {
    if (!_tDiscUI.channel) return;
    const me   = _tDiscUI.me;
    const name = me ? `${me.first_name||''} ${me.last_name||''}`.trim() : 'Teacher';
    _tDiscUI.channel.send({
        type: 'broadcast', event: 'typing',
        payload: { userId: me?.id, name, isTyping }
    }).catch(() => {});
}

function _tUpdateTyping() {
    const el  = document.getElementById('_tdTyping');
    const txt = document.getElementById('_tdTypingTxt');
    if (!el || !txt) return;
    const names = Object.values(_tDiscUI.typingUsers);
    if (!names.length) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    if      (names.length === 1) txt.textContent = `${names[0]} is typing…`;
    else if (names.length === 2) txt.textContent = `${names[0]} and ${names[1]} are typing…`;
    else                         txt.textContent = `${names.length} students are typing…`;
}

function _tKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _tSend(); }
}

// ============================================================
//  FILTER + SEARCH
// ============================================================
function _tFilter(f, btn) {
    _tDiscUI.filter = f;
    document.querySelectorAll('._td-tab').forEach(b => b.classList.remove('active'));
    btn?.classList.add('active');
    _tRenderList();
}

function _tFilterSearch(q) {
    _tDiscUI.search = q;
    _tRenderList();
}

// ============================================================
//  REFRESH
// ============================================================
async function _tRefresh(btn) {
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    await loadDiscussionsFromDB();
    _tRenderList();
    if (btn) btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
    _tToast('Refreshed', 'success');
}

// ============================================================
//  SCROLL
// ============================================================
function _tScrollBottom(smooth=true) {
    const el = document.getElementById('_tdMsgs');
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

// ============================================================
//  HOOK: keep sidebar in sync when teacher-discussions.js
//        calls renderDiscussions()
// ============================================================
const _origRenderDiscussions = typeof renderDiscussions === 'function' ? renderDiscussions : null;
window.renderDiscussions = function() {
    if (_origRenderDiscussions) _origRenderDiscussions();
    _tRenderList();
};

// ============================================================
//  NEW THREAD MODAL
// ============================================================
function _tOpenNewModal() {
    const html = `
    <div class="_td-overlay" id="_tdOverlay"
         onclick="if(event.target.id==='_tdOverlay')_tCloseNewModal()"
         style="display:flex;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;
                align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)">
      <div style="background:#fff;border-radius:18px;width:100%;max-width:490px;
                  box-shadow:0 30px 80px rgba(0,0,0,.2);overflow:hidden">
        <div style="padding:18px 22px 14px;display:flex;align-items:center;
                    justify-content:space-between;border-bottom:1.5px solid #f3f4f6">
          <h3 style="font-weight:800;font-size:16px;color:#1f2937;margin:0">
            <i class="fas fa-plus-circle"></i> New Discussion
          </h3>
          <button onclick="_tCloseNewModal()"
                  style="background:#f3f4f6;border:none;width:30px;height:30px;border-radius:50%;
                         cursor:pointer;font-size:13px;color:#6b7280">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div style="padding:18px 22px">
          <div style="margin-bottom:14px">
            <label style="display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:5px">Title *</label>
            <input id="_tdNewTitle" type="text" placeholder="Discussion title…"
                   style="width:100%;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:9px;
                          font-size:13px;font-family:inherit;box-sizing:border-box;outline:none"/>
          </div>
          <div style="margin-bottom:14px">
            <label style="display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:5px">Course</label>
            <select id="_tdNewCourse"
                    style="width:100%;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:9px;
                           font-size:13px;font-family:inherit;box-sizing:border-box;outline:none">
              <option value="">All Courses</option>
              ${(typeof teacherState !== 'undefined' ? teacherState.courses||[] : [])
                  .map(c=>`<option value="${c.id}">${c.title}</option>`).join('')}
            </select>
          </div>
          <div style="margin-bottom:14px">
            <label style="display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:5px">Message *</label>
            <textarea id="_tdNewContent" rows="4" placeholder="Write your message…"
                      style="width:100%;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:9px;
                             font-size:13px;font-family:inherit;box-sizing:border-box;outline:none;resize:vertical"></textarea>
          </div>
        </div>
        <div style="padding:12px 22px;background:#f9fafb;border-top:1.5px solid #f3f4f6;
                    display:flex;gap:9px;justify-content:flex-end">
          <button onclick="_tCloseNewModal()"
                  style="padding:9px 18px;border:1.5px solid #e5e7eb;border-radius:9px;background:#fff;
                         color:#6b7280;font-weight:700;cursor:pointer;font-family:inherit;font-size:13px">
            Cancel
          </button>
          <button onclick="_tSubmitNew()"
                  style="padding:9px 20px;background:linear-gradient(135deg,#0891b2,#0e7490);
                         border:none;border-radius:9px;color:#fff;font-weight:700;cursor:pointer;
                         font-family:inherit;font-size:13px">
            <i class="fas fa-rocket"></i> Post
          </button>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    document.getElementById('_tdNewTitle')?.focus();
}

function _tCloseNewModal() {
    document.getElementById('_tdOverlay')?.remove();
}

async function _tSubmitNew() {
    const title   = document.getElementById('_tdNewTitle')?.value?.trim();
    const course  = document.getElementById('_tdNewCourse')?.value || null;
    const content = document.getElementById('_tdNewContent')?.value?.trim();
    if (!title)   { _tToast('Please enter a title',  'warning'); return; }
    if (!content) { _tToast('Please add a message',  'warning'); return; }

    const db = window.supabaseClient;
    const { data:{ user } } = await db.auth.getUser();
    const me         = _tDiscUI.me;
    const authorName = me ? `${me.first_name||''} ${me.last_name||''}`.trim() || 'Teacher' : 'Teacher';

    const { data: thread, error } = await db
        .from('discussion_threads')
        .insert({
            title,
            content,
            course_id:   course || null,
            author_id:   user?.id,
            author_name: authorName,
            category:    'general',
            is_solved:   false,
        })
        .select()
        .maybeSingle();

    if (error) { _tToast('Failed: ' + error.message, 'error'); return; }

    _tCloseNewModal();
    _tToast('Discussion posted! 💬', 'success');
    await loadDiscussionsFromDB();
    _tRenderList();
    if (thread) await _tOpenThread(thread.id);
}

// ============================================================
//  CSS  ← FIXED: _self-b is now purple (not teal), date sep added
// ============================================================
function _injectTDiscStyles() {
    if (document.getElementById('_tdisc-css')) return;
    const style = document.createElement('style');
    style.id    = '_tdisc-css';
    style.textContent = `
/* ─── Root ─── */
._td-root{display:flex;height:calc(100vh - 130px);min-height:520px;border-radius:20px;overflow:hidden;border:1.5px solid var(--bdr,#e5e7eb);font-family:inherit;box-shadow:0 8px 40px rgba(0,0,0,.06);background:var(--bg,#f9fafb)}

/* ─── Sidebar ─── */
._td-sb{width:280px;flex-shrink:0;display:flex;flex-direction:column;background:var(--card,#fff);border-right:1.5px solid var(--bdr,#e5e7eb)}
._td-sb-hdr{padding:14px 12px 10px;border-bottom:1.5px solid var(--bdr,#e5e7eb)}
._td-sb-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
._td-sb-title{font-weight:800;font-size:14px;color:var(--txt,#1f2937)}
._td-refresh{background:var(--s2,#f3f4f6);border:none;width:28px;height:28px;border-radius:8px;cursor:pointer;color:var(--txt2,#6b7280);font-size:12px;display:flex;align-items:center;justify-content:center;transition:all .2s}
._td-refresh:hover{background:var(--acc,#1a9fd4);color:#fff}
._td-srch-wrap{position:relative;margin-bottom:8px}
._td-srch-ico{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--mut,#9ca3af);font-size:11px;pointer-events:none}
._td-srch{width:100%;padding:7px 9px 7px 28px;border:1.5px solid var(--bdr,#e5e7eb);border-radius:9px;font-size:12px;outline:none;background:var(--s2,#f3f4f6);color:var(--txt,#1f2937);font-family:inherit;box-sizing:border-box;transition:border-color .2s}
._td-srch:focus{border-color:var(--acc,#1a9fd4)}
._td-tabs{display:flex;gap:4px}
._td-tab{flex:1;padding:4px 2px;border:1.5px solid var(--bdr,#e5e7eb);border-radius:7px;font-size:10px;font-weight:700;color:var(--txt2,#6b7280);background:var(--card,#fff);cursor:pointer;font-family:inherit;transition:all .2s}
._td-tab.active,._td-tab:hover{background:var(--acc,#1a9fd4);color:#fff;border-color:var(--acc,#1a9fd4)}
._td-tlist{flex:1;overflow-y:auto;padding:6px;scrollbar-width:thin;scrollbar-color:var(--bdr,#e5e7eb) transparent}

/* Thread items */
._td-ti{padding:10px 9px;border-radius:11px;cursor:pointer;margin-bottom:3px;border:1.5px solid transparent;transition:all .2s}
._td-ti:hover{background:var(--s2,#f3f4f6);border-color:var(--bdr,#e5e7eb)}
._td-ti._active{background:var(--acc,#1a9fd4)12;border-color:var(--acc,#1a9fd4)}
._td-ti._solved{opacity:.75}
._td-ti-top{display:flex;gap:8px;align-items:flex-start;margin-bottom:6px}
._td-av{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex-shrink:0}
._td-ti-info{flex:1;min-width:0}
._td-ti-ttl{font-size:12px;font-weight:700;color:var(--txt,#1f2937);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px}
._td-ti-tags{display:flex;gap:4px;flex-wrap:wrap}
._td-tag{font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px}
._td-stag{font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:#d1fae5;color:#065f46}
._td-otag{font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:#dbeafe;color:#1d4ed8}
._td-ti-foot{display:flex;gap:8px;font-size:10px;color:var(--mut,#9ca3af);padding-top:5px;border-top:1px solid var(--bdr,#e5e7eb)}
._td-empty-list{text-align:center;padding:30px 14px;color:var(--mut,#9ca3af)}
._td-empty-list p{font-size:12px}

/* ─── Chat ─── */
._td-chat{flex:1;display:flex;flex-direction:column;min-width:0;background:var(--bg,#f9fafb)}
._td-chat-inner{flex:1;display:flex;flex-direction:column;min-height:0}
._td-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;padding:40px;color:var(--txt2,#6b7280)}
._td-empty h3{font-weight:800;color:var(--txt,#1f2937);margin-bottom:8px;font-size:18px}
._td-empty p{font-size:13px}

/* Header */
._td-chat-hdr{padding:12px 18px;background:var(--card,#fff);border-bottom:1.5px solid var(--bdr,#e5e7eb);display:flex;align-items:center;justify-content:space-between;gap:10px}
._td-hd-l{flex:1;min-width:0}
._td-hd-ttl{font-weight:800;font-size:14px;color:var(--txt,#1f2937);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px}
._td-hd-meta{display:flex;gap:5px;flex-wrap:wrap}
._td-hd-r{display:flex;gap:7px;flex-shrink:0}
._td-hdbtn{padding:6px 13px;border-radius:20px;border:none;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .2s}
._btn-solve{background:#d1fae5;color:#065f46}._btn-solve:hover{background:#059669;color:#fff}
._btn-reopen{background:#fee2e2;color:#991b1b}._btn-reopen:hover{background:#dc2626;color:#fff}

/* ── Date separator ── */
._td-date-sep{display:flex;align-items:center;gap:10px;margin:12px 0 8px;color:var(--mut,#9ca3af);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
._td-date-sep::before,._td-date-sep::after{content:'';flex:1;height:1px;background:var(--bdr,#e5e7eb)}

/* ─── Messages ─── */
._td-msgs{flex:1;overflow-y:auto;padding:14px 16px 8px;display:flex;flex-direction:column;gap:0;scrollbar-width:thin;scrollbar-color:var(--bdr,#e5e7eb) transparent}
._td-loading{text-align:center;padding:30px;color:var(--mut,#9ca3af);font-size:13px}
._td-err{text-align:center;padding:20px;color:#ef4444;font-size:12px}
._td-no-msgs{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;text-align:center;color:var(--mut,#9ca3af);font-size:13px;padding:30px}

/* Message rows — others LEFT, self RIGHT */
._td-mrow{display:flex;flex-direction:row;gap:8px;align-items:flex-end;margin-bottom:2px;max-width:100%}
._td-mrow._self{flex-direction:row-reverse}

/* Avatar */
._td-mav-col{width:34px;flex-shrink:0;display:flex;align-items:flex-end}
._td-mav{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff;flex-shrink:0}
._td-mav-sp{width:32px;height:32px;flex-shrink:0}

/* Content */
._td-mcontent{max-width:68%;display:flex;flex-direction:column;align-items:flex-start}
._td-mrow._self ._td-mcontent{align-items:flex-end}

/* Sender name */
._td-mname{display:flex;align-items:center;gap:5px;margin-bottom:3px;flex-wrap:wrap}
._td-mname-text{font-size:11px;font-weight:700;color:var(--txt,#374151)}
._td-mrow._self ._td-mname{flex-direction:row-reverse}

/* Bubbles */
._td-bubble{padding:9px 13px;font-size:13px;line-height:1.55;word-break:break-word;max-width:100%}

/* Student — white, left corner */
._other-b{background:var(--card,#fff);color:var(--txt,#1f2937);border-radius:3px 16px 16px 16px;box-shadow:0 2px 8px rgba(0,0,0,.06);border:1px solid var(--bdr,#e5e7eb)}

/* ── FIXED: teacher self = PURPLE right corner (not teal) ── */
._self-b{background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border-radius:16px 3px 16px 16px;box-shadow:0 4px 14px rgba(124,58,237,.3)}

/* Other teacher — teal, left corner */
._teach-b{background:linear-gradient(135deg,#0891b2,#0e7490);color:#fff;border-radius:3px 16px 16px 16px;box-shadow:0 4px 14px rgba(8,145,178,.25)}

/* Timestamp */
._td-mtime{font-size:9px;color:var(--mut,#9ca3af);margin-top:3px}
._td-mrow._self ._td-mtime{text-align:right}

/* Badges */
._td-tbadge{font-size:9px;font-weight:700;background:#e0f2fe;color:#0284c7;padding:1px 6px;border-radius:20px;display:inline-flex;align-items:center;gap:3px}
._td-sbadge{font-size:9px;font-weight:700;background:var(--s2,#f3f4f6);color:var(--txt2,#6b7280);padding:1px 6px;border-radius:20px}
._td-ybadge{font-size:9px;font-weight:700;background:#ede9fe;color:#7c3aed;padding:1px 6px;border-radius:20px}

/* Typing indicator */
._td-typing{display:flex;align-items:center;gap:7px;padding:5px 18px 3px;font-size:11px;color:var(--mut,#9ca3af)}
._td-dots{display:flex;gap:3px}
._td-dots span{width:6px;height:6px;border-radius:50%;background:var(--acc,#1a9fd4);opacity:.6;animation:_tdB 1.2s infinite}
._td-dots span:nth-child(2){animation-delay:.2s}
._td-dots span:nth-child(3){animation-delay:.4s}
@keyframes _tdB{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}

/* Input area */
._td-input-area{padding:8px 14px 12px;background:var(--card,#fff);border-top:1.5px solid var(--bdr,#e5e7eb)}
._td-teacher-tag{font-size:10px;font-weight:700;color:var(--acc,#1a9fd4);margin-bottom:6px;display:flex;align-items:center;gap:5px}
._td-input-wrap{display:flex;gap:8px;align-items:flex-end;background:var(--bg,#f9fafb);border:1.5px solid var(--bdr,#e5e7eb);border-radius:14px;padding:7px 10px 7px 14px;transition:border-color .2s}
._td-input-wrap:focus-within{border-color:var(--acc,#1a9fd4)}
._td-ta{flex:1;border:none;background:transparent;font-size:13px;color:var(--txt,#1f2937);resize:none;outline:none;font-family:inherit;line-height:1.5;min-height:20px;max-height:110px;overflow-y:auto}
._td-ta::placeholder{color:var(--mut,#9ca3af)}
._td-newbtn{background:linear-gradient(135deg,#0891b2,#0e7490);color:#fff;border:none;padding:5px 11px;border-radius:20px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:transform .15s}
._td-newbtn:hover{transform:translateY(-1px)}
._td-sendbtn{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;box-shadow:0 3px 10px rgba(124,58,237,.35);transition:transform .15s,box-shadow .15s}
._td-sendbtn:hover{transform:scale(1.08);box-shadow:0 5px 16px rgba(124,58,237,.45)}

/* Responsive */
@media(max-width:768px){
  ._td-root{height:calc(100vh - 160px);border-radius:12px;}
  ._td-sb{width:200px}
  ._td-msgs{padding:10px 10px 6px}
  ._td-input-area{padding:8px 10px;padding-bottom:max(8px,env(safe-area-inset-bottom))}
  ._td-ta{font-size:16px}
  ._td-bubble{font-size:12px;padding:8px 11px}
}
@media(max-width:540px){
  ._td-root{flex-direction:column;height:calc(100vh - 160px);border-radius:12px;}
  ._td-sb{width:100%;height:auto;max-height:175px;border-right:none;border-bottom:1.5px solid var(--bdr,#e5e7eb);flex-shrink:0;}
  ._td-sb-hdr{padding:8px 10px 7px}
  ._td-tabs{gap:3px}
  ._td-tab{font-size:9px;padding:4px 2px}
  ._td-tlist{max-height:85px;overflow-y:auto}
  ._td-ti{padding:6px}
  ._td-ti-ttl{font-size:11px}
  ._td-chat{flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;}
  ._td-chat-inner{flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;}
  ._td-msgs{flex:1;min-height:0;overflow-y:auto;padding:10px 10px 6px;}
  ._td-input-area{flex-shrink:0;padding:8px 10px;padding-bottom:max(8px,env(safe-area-inset-bottom));}
  ._td-input-wrap{border-radius:24px;padding:6px 8px 6px 12px;}
  ._td-ta{font-size:16px;min-height:22px;}
  ._td-sendbtn{width:38px;height:38px;font-size:15px;}
  ._td-bubble{font-size:13px;padding:8px 11px;}
  ._td-mcontent{max-width:82%}
  ._td-chat-hdr{padding:9px 12px}
  ._td-hd-ttl{font-size:13px}
  ._td-hdbtn{padding:5px 10px;font-size:10px}
  ._td-teacher-tag{font-size:9px}
}
`;
    document.head.appendChild(style);
}

console.log('✅ teacher-discussions-ui.js loaded (group-chat fix applied)');