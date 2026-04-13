// ============================================================
//  discussions-ui.js  — Student Real-Time Discussion Chat UI
//  FIXED: Proper group-chat layout (left/right bubbles, sender
//         names shown, messages clearly attributed)
// ============================================================

'use strict';

const _discUI = {
    threads:         [],
    active:          null,
    channel:         null,
    typingTimer:     null,
    typingUsers:     {},
    filter:          'all',
    search:          '',
    sending:         false,
    currentUser:     null,
    currentProfile:  null,
};

// ── Avatar helpers ────────────────────────────────────────────
const _AV_COLORS = ['#7c3aed','#2563eb','#059669','#d97706','#dc2626','#0891b2','#be185d','#9333ea'];
function _avColor(s) { s=s||''; let h=0; for(let i=0;i<s.length;i++) h+=s.charCodeAt(i); return _AV_COLORS[h%_AV_COLORS.length]; }
function _avInit(n) { return (n||'U').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase(); }
function _ago(iso) {
    if (!iso) return '—';
    const s = Math.floor((Date.now()-new Date(iso))/1000);
    if (s<60)    return 'just now';
    if (s<3600)  return Math.floor(s/60)+'m ago';
    if (s<86400) return Math.floor(s/3600)+'h ago';
    return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric'});
}
function _safe(str) {
    const d=document.createElement('div');
    d.appendChild(document.createTextNode(str||''));
    return d.innerHTML;
}
function _discToast(msg, type='success') {
    if (typeof showToast==='function') showToast(msg, type);
    else if (typeof toast==='function') toast(msg, type==='error'?'e':type==='warning'?'w':'s');
    else console.log('[disc]', msg);
}

// ============================================================
//  ENTRY
// ============================================================
async function loadDiscussions() {
    const db = window.supabaseClient;
    if (!db) return;

    const { data:{ user } } = await db.auth.getUser();
    if (!user) return;
    _discUI.currentUser = user;

    const { data: profile } = await db
        .from('profiles').select('first_name,last_name,role,avatar_url')
        .eq('id', user.id).maybeSingle();
    _discUI.currentProfile = profile;

    _injectDiscStyles();
    _renderShell();
    await _fetchAndRender();
}

// ============================================================
//  FETCH THREADS
// ============================================================
async function _fetchAndRender(filters={}) {
    const el = document.getElementById('_discThreadList');
    if (el) el.innerHTML = '<div class="_disc-loading"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';

    if (typeof getAllDiscussions === 'undefined') {
        console.error('❌ getAllDiscussions is not defined. Make sure discussions.js is loaded before discussions-ui.js');
        if (el) el.innerHTML = '<div class="_disc-err"><i class="fas fa-exclamation-circle"></i> Could not load discussions. Please refresh.</div>';
        return;
    }

    const result = await getAllDiscussions(filters);
    // ── FIX: deduplicate by id to prevent double threads ──
    const seen = new Set();
    _discUI.threads = (result.threads || []).filter(t => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
    });

    _renderThreadList();
}

// ============================================================
//  SHELL HTML
// ============================================================
function _renderShell() {
    const section = document.getElementById('discussionsSection');
    if (!section) return;

    section.innerHTML = `
    <div class="_disc-root">

      <!-- ── Sidebar ── -->
      <div class="_disc-sb">
        <div class="_disc-sb-hdr">
          <div class="_disc-sb-top">
            <span class="_disc-sb-title"><i class="fas fa-comments"></i> Discussions</span>
            <button class="_disc-newbtn" onclick="_discOpenModal()">
              <i class="fas fa-plus"></i> New
            </button>
          </div>
          <div class="_disc-srch-wrap">
            <i class="fas fa-search _disc-srch-ico"></i>
            <input class="_disc-srch" id="_discSearch" type="text"
                   placeholder="Search threads…"
                   oninput="_discSearch(this.value)"/>
          </div>
          <div class="_disc-tabs">
            <button class="_disc-tab active" onclick="_discFilter('all',this)">All</button>
            <button class="_disc-tab" onclick="_discFilter('my',this)">Mine</button>
            <button class="_disc-tab" onclick="_discFilter('open',this)">Open</button>
            <button class="_disc-tab" onclick="_discFilter('solved',this)">Solved</button>
          </div>
        </div>
        <div class="_disc-tlist" id="_discThreadList">
          <div class="_disc-loading"><i class="fas fa-spinner fa-spin"></i></div>
        </div>
      </div>

      <!-- ── Chat ── -->
      <div class="_disc-chat">

        <div class="_disc-empty" id="_discEmpty">
          <div style="font-size:52px;margin-bottom:14px">💬</div>
          <h3>Select a discussion</h3>
          <p>Choose a thread or start a new one.</p>
          <button class="_disc-newbtn-lg" onclick="_discOpenModal()">
            <i class="fas fa-plus"></i> Start New Discussion
          </button>
        </div>

        <div class="_disc-chat-inner" id="_discChatInner" style="display:none">
          <div class="_disc-chat-hdr" id="_discChatHdr"></div>
          <div class="_disc-msgs" id="_discMsgs"></div>
          <div class="_disc-typing" id="_discTyping" style="display:none">
            <div class="_disc-dots"><span></span><span></span><span></span></div>
            <span id="_discTypingTxt">Someone is typing…</span>
          </div>
          <div class="_disc-input-area">
            <div class="_disc-input-wrap">
              <textarea id="_discInput" class="_disc-ta" rows="1"
                placeholder="Type a reply… (Enter to send)"
                oninput="_discHandleInput(this)"
                onkeydown="_discKeydown(event)"></textarea>
              <button class="_disc-sendbtn" id="_discSendBtn" onclick="_discSend()">
                <i class="fas fa-paper-plane"></i>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- ── New Thread Modal ── -->
    <div class="_disc-overlay" id="_discOverlay" onclick="_discBgClose(event)">
      <div class="_disc-modal">
        <div class="_disc-mhdr">
          <h3><i class="fas fa-plus-circle"></i> New Discussion</h3>
          <button class="_disc-mclose" onclick="_discCloseModal()"><i class="fas fa-times"></i></button>
        </div>
        <div class="_disc-mbody">
          <div class="_disc-fg">
            <label>Title <span style="color:#ef4444">*</span></label>
            <input type="text" id="_discTitle" class="_disc-fi"
                   placeholder="What do you want to discuss?" maxlength="120"/>
          </div>
          <div class="_disc-fg">
            <label>Course <span style="color:#ef4444">*</span></label>
            <select id="_discCourse" class="_disc-fi">
              <option value="">Select a course…</option>
            </select>
          </div>
          <div class="_disc-fg">
            <label>Category</label>
            <select id="_discCat" class="_disc-fi">
              <option value="general">💬 General</option>
              <option value="question">❓ Question</option>
              <option value="help">🆘 Help Needed</option>
              <option value="resource">📚 Resource Share</option>
            </select>
          </div>
          <div class="_disc-fg">
            <label>Opening message <span style="color:#ef4444">*</span></label>
            <textarea id="_discContent" class="_disc-fi _disc-fta"
                      placeholder="Describe your question or topic…" rows="4"></textarea>
          </div>
        </div>
        <div class="_disc-mftr">
          <button class="_disc-mcancel" onclick="_discCloseModal()">Cancel</button>
          <button class="_disc-msubmit" id="_discSubmit" onclick="_discCreate()">
            <i class="fas fa-rocket"></i> Post Discussion
          </button>
        </div>
      </div>
    </div>`;

    _populateCourseDropdown();
}

// ============================================================
//  THREAD LIST
// ============================================================
function _renderThreadList() {
    const el  = document.getElementById('_discThreadList');
    if (!el) return;

    const q   = _discUI.search.toLowerCase();
    const f   = _discUI.filter;
    const uid = _discUI.currentUser?.id;

    const CAT = { question:'#3b82f6', help:'#ef4444', resource:'#10b981', announcement:'#f59e0b', general:'#8b5cf6' };

    const list = _discUI.threads.filter(t => {
        if (q && !t.title.toLowerCase().includes(q) && !(t.content||'').toLowerCase().includes(q)) return false;
        if (f==='my'     && t.author_id !== uid) return false;
        if (f==='open'   && t.is_solved)         return false;
        if (f==='solved' && !t.is_solved)        return false;
        return true;
    });

    if (!list.length) {
        el.innerHTML = `
          <div class="_disc-empty-list">
            <i class="fas fa-comment-slash" style="font-size:26px;display:block;margin-bottom:8px"></i>
            <p>${_discUI.threads.length===0 ? 'No discussions yet.' : 'Nothing matches.'}</p>
            <button class="_disc-newbtn" onclick="_discOpenModal()">+ New Thread</button>
          </div>`;
        return;
    }

    el.innerHTML = list.map(t => {
        const isActive = _discUI.active?.id === t.id;
        const author   = t.author_name || 'Student';
        const cTitle   = t.courses?.title || '';
        const cColor   = t.courses?.thumbnail_color || _avColor(cTitle);
        const catColor = CAT[t.category] || '#8b5cf6';
        const count    = t.replies_count || 0;
        const time     = _ago(t.last_reply_at || t.created_at);

        return `
        <div class="_disc-ti ${isActive?'_active':''} ${t.is_pinned?'_pinned':''}"
             onclick="_discOpen('${t.id}')" id="_dt_${t.id}">
          ${t.is_pinned?'<div class="_disc-pin"><i class="fas fa-thumbtack"></i></div>':''}
          <div class="_disc-ti-top">
            <div class="_disc-av" style="background:${_avColor(author)}">${_avInit(author)}</div>
            <div class="_disc-ti-info">
              <div class="_disc-ti-ttl">${_safe(t.title)}</div>
              <div class="_disc-ti-tags">
                ${cTitle ? `<span class="_disc-tag" style="background:${cColor}20;color:${cColor}">${_safe(cTitle.split(' ').slice(0,2).join(' '))}</span>` : ''}
                <span class="_disc-tag" style="background:${catColor}20;color:${catColor}">${t.category||'general'}</span>
                ${t.is_solved ? '<span class="_disc-stag">✓ Solved</span>' : ''}
              </div>
            </div>
          </div>
          <div class="_disc-ti-foot">
            <span><i class="fas fa-reply"></i> ${count}</span>
            <span><i class="fas fa-clock"></i> ${time}</span>
          </div>
        </div>`;
    }).join('');
}

// ============================================================
//  OPEN THREAD
// ============================================================
async function _discOpen(threadId) {
    const db = window.supabaseClient;

    if (_discUI.channel) {
        await db.removeChannel(_discUI.channel);
        _discUI.channel = null;
    }

    _discUI.typingUsers = {};

    document.querySelectorAll('._disc-ti').forEach(e=>e.classList.remove('_active'));
    const item = document.getElementById(`_dt_${threadId}`);
    if (item) item.classList.add('_active');

    document.getElementById('_discEmpty').style.display     = 'none';
    document.getElementById('_discChatInner').style.display = 'flex';

    const msgsEl = document.getElementById('_discMsgs');
    msgsEl.innerHTML = '<div class="_disc-loading"><i class="fas fa-spinner fa-spin"></i> Loading messages…</div>';

    const result = await getDiscussionById(threadId);
    if (!result.success) {
        msgsEl.innerHTML = `<div class="_disc-err">Failed to load: ${_safe(result.error)}</div>`;
        return;
    }

    _discUI.active = result.thread;
    _renderChatHeader(result.thread);
    _renderMessages(result.thread.replies || []);
    _scrollBottom(false);

    document.getElementById('_discInput')?.focus();

    // ── Realtime ─────────────────────────────────────────────
    const channel = db.channel(`disc-ui-${threadId}`)
        .on('postgres_changes', {
            event:'INSERT', schema:'public',
            table:'discussion_replies',
            filter:`thread_id=eq.${threadId}`
}, async (payload) => {
    const { data: reply } = await db
        .from('discussion_replies')
        .select(`
            id, content, created_at, author_id, author_name,
            profiles:author_id (first_name, last_name, role, avatar_url)
        `)
        .eq('id', payload.new.id).maybeSingle();

    if (!reply) return;

    // ── Skip if bubble already in DOM ──
    if (document.getElementById(`_r_${reply.id}`)) return;

    // ── If this is my own message, update optimistic bubble ID instead ──
    const myId = _discUI.currentUser?.id;
    if (myId && String(reply.author_id) === String(myId)) {
        // Find the optimistic bubble and update its ID
        const optEl = document.querySelector('[id^="_r__opt_"]');
        if (optEl) {
            optEl.id = `_r_${reply.id}`;
            // Update in replies array too
            const existing = _discUI.active?.replies || [];
            const optReply = existing.find(r => String(r.id).startsWith('_opt_'));
            if (optReply) optReply.id = reply.id;
        }
        return;
    }

    const existing = _discUI.active?.replies || [];
    existing.push(reply);

    const last   = existing[existing.length-2];
    const showAv = !last || String(last.author_id) !== String(reply.author_id);
    _appendBubble(reply, showAv);
    _scrollBottom();

    const t = _discUI.threads.find(x=>x.id==payload.new.thread_id);
    if (t) { 
        t.replies_count=(t.replies_count||0)+1; 
        t.last_reply_at=reply.created_at; 
        _renderThreadList(); 
    }
})
        .on('broadcast',{event:'typing'}, ({payload}) => {
            if (payload.userId === _discUI.currentUser?.id) return;
            if (payload.isTyping) _discUI.typingUsers[payload.userId] = payload.name;
            else delete _discUI.typingUsers[payload.userId];
            _updateTyping();
        })
        .subscribe();

    _discUI.channel = channel;
}

// ============================================================
//  RENDER MESSAGES  ← FIXED: proper group-chat layout
// ============================================================
function _renderMessages(replies) {
    const el = document.getElementById('_discMsgs');
    if (!el) return;

    el.innerHTML = '';

    if (!replies.length) {
        el.innerHTML = `
          <div class="_disc-no-msgs">
            <div style="font-size:42px;margin-bottom:10px">👋</div>
            <p>No replies yet — be the first!</p>
          </div>`;
        return;
    }

    // Group consecutive messages from the same author
    let lastAuthorId = null;
    let lastDate     = null;

    replies.forEach((r, idx) => {
        // ── Date separator ──────────────────────────────────
        const msgDate = new Date(r.created_at).toDateString();
        if (msgDate !== lastDate) {
            const sep = document.createElement('div');
            sep.className = '_disc-date-sep';
            sep.innerHTML = `<span>${new Date(r.created_at).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}</span>`;
            el.appendChild(sep);
            lastDate = msgDate;
            lastAuthorId = null; // reset grouping after date separator
        }

        // Show avatar + name only when sender changes
        const showHeader = String(r.author_id) !== String(lastAuthorId);
        el.appendChild(_buildBubble(r, showHeader));
        lastAuthorId = r.author_id;
    });
}

// ============================================================
//  BUILD BUBBLE  ← CORE FIX
//
//  Problems fixed:
//  1. author_id type coercion (String vs Number UUID mismatch)
//  2. "You" badge + self bubble always on RIGHT
//  3. Sender name shown above every new sender group
//  4. Teacher messages in teal on LEFT, own messages in purple on RIGHT
// ============================================================
function _buildBubble(reply, showHeader=true) {
    const uid    = _discUI.currentUser?.id;

    // ── FIX 1: Always compare as strings ───────────────────

    const p       = reply.profiles || {};
    const name    = p.first_name
        ? `${p.first_name} ${p.last_name||''}`.trim()
        : (reply.author_name || 'Student');

const isTeach = p.role==='teacher' || p.role==='instructor' || 
    (reply.author_name||'').toLowerCase().includes('teacher');

// If this is a teacher's message, it should NEVER be on the right
const isSelf = !isTeach && uid && String(reply.author_id) === String(uid);

    const color   = _avColor(name);

    const wrap = document.createElement('div');
    // ── FIX 2: _self class pushes row to the right ─────────
    wrap.className = `_disc-mrow${isSelf ? ' _self' : ''}`;
    wrap.id = `_r_${reply.id}`;

    // Determine bubble style
    let bubbleClass = '_other-b';
    if (isSelf)       bubbleClass = '_self-b';
    else if (isTeach) bubbleClass = '_teach-b';

    // Build sender label badges
    const badges = [];
    if (isTeach && !isSelf) badges.push('<span class="_disc-tbadge"><i class="fas fa-chalkboard-teacher"></i> Teacher</span>');
    if (isSelf)             badges.push('<span class="_disc-ybadge">You</span>');

    // Avatar HTML
    let avatarHtml;
    if (showHeader) {
        if (reply.profiles?.avatar_url) {
            avatarHtml = `<img src="${reply.profiles.avatar_url}" class="_disc-mav" style="object-fit:cover" alt="${_safe(name)}">`;
        } else {
            const avBg = isSelf ? '#7c3aed' : (isTeach ? '#0891b2' : color);
            avatarHtml = `<div class="_disc-mav" style="background:${avBg}">${_avInit(name)}</div>`;
        }
    } else {
        avatarHtml = `<div class="_disc-mav-sp"></div>`;
    }

    // ── FIX 3: Sender name always visible above first bubble in group ──
    const headerHtml = showHeader ? `
        <div class="_disc-mname">
            <span class="_disc-mname-text">${_safe(name)}</span>
            ${badges.join('')}
        </div>` : '';

    wrap.innerHTML = `
      <div class="_disc-mav-col">${avatarHtml}</div>
      <div class="_disc-mcontent">
        ${headerHtml}
        <div class="_disc-bubble ${bubbleClass}">${_safe(reply.content)}</div>
        <div class="_disc-mtime">${_ago(reply.created_at)}</div>
      </div>`;

    return wrap;
}

function _appendBubble(reply, showHeader) {
    const el = document.getElementById('_discMsgs');
    if (!el) return;
    const ph = el.querySelector('._disc-no-msgs');
    if (ph) ph.remove();
    el.appendChild(_buildBubble(reply, showHeader));
}

// ============================================================
//  SEND
// ============================================================
async function _discSend() {
    if (_discUI.sending || !_discUI.active) return;

    const input   = document.getElementById('_discInput');
    const content = input?.value?.trim();
    if (!content) return;

    _discUI.sending = true;
    input.value = '';
    input.style.height = 'auto';
    _discBroadcastTyping(false);

    const btn = document.getElementById('_discSendBtn');
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    const uid  = _discUI.currentUser?.id;
    const cp   = _discUI.currentProfile;
    const name = cp
        ? `${cp.first_name||''} ${cp.last_name||''}`.trim()
        : (_discUI.currentUser?.email?.split('@')[0]||'You');

    const optimistic = {
        id:          '_opt_' + Date.now(),
        author_id:   uid,
        author_name: name,
        content,
        created_at:  new Date().toISOString(),
        profiles: {
            first_name: cp?.first_name,
            last_name:  cp?.last_name,
            role:       cp?.role || 'student'
        }
    };

    const existing  = _discUI.active.replies;
    const last      = existing[existing.length-1];
    const showHeader = !last || String(last.author_id) !== String(uid);
    existing.push(optimistic);
    _appendBubble(optimistic, showHeader);
    _scrollBottom();

    const result = await replyToDiscussion(_discUI.active.id, content);

    if (!result.success) {
        document.getElementById(`_r_${optimistic.id}`)?.remove();
        existing.pop();
        input.value = content;
        _discToast('Failed to send: ' + result.error, 'error');
    } else {
        const realEl = document.getElementById(`_r_${optimistic.id}`);
        if (realEl && result.reply?.id) {
            realEl.id = `_r_${result.reply.id}`;
            optimistic.id = result.reply.id;
        }
    }

    _discUI.sending = false;
    if (btn) btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
    input?.focus();
}

// ============================================================
//  CREATE THREAD
// ============================================================
async function _discCreate() {
    const title   = document.getElementById('_discTitle')?.value?.trim();
    const course  = document.getElementById('_discCourse')?.value || null;
    const cat     = document.getElementById('_discCat')?.value || 'general';
    const content = document.getElementById('_discContent')?.value?.trim();

    if (!title)   { _discToast('Please enter a title','warning'); return; }
    if (!course)  { _discToast('Please select a course','warning'); return; }
    if (!content) { _discToast('Please add an opening message','warning'); return; }

    const btn = document.getElementById('_discSubmit');
    if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Posting…'; }

    const result = await createDiscussion({ courseId: course, title, content, category: cat });

    if (!result.success) {
        _discToast('Failed: ' + result.error, 'error');
    } else {
        _discCloseModal();
        _discToast('Discussion created! 💬', 'success');

        // ── FIX: fetch fresh list then deduplicate by id ──
        const fresh = await getAllDiscussions({});
        if (fresh.success) {
            // Deduplicate by id before setting
            const seen = new Set();
            _discUI.threads = (fresh.threads || []).filter(t => {
                if (seen.has(t.id)) return false;
                seen.add(t.id);
                return true;
            });
            _renderThreadList();
        }

        if (result.thread) await _discOpen(result.thread.id);
    }

    if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-rocket"></i> Post Discussion'; }
}
// ============================================================
//  MARK SOLVED
// ============================================================
async function _discToggleSolved(threadId, isSolved) {
    const result = await markThreadSolved(threadId, isSolved);
    if (result.success) {
        const t = _discUI.threads.find(x=>x.id==threadId);
        if (t) t.is_solved = isSolved;
        if (_discUI.active?.id==threadId) _discUI.active.is_solved = isSolved;
        _renderChatHeader(_discUI.active);
        _renderThreadList();
        _discToast(result.message, 'success');
    } else {
        _discToast(result.error, 'error');
    }
}

// ============================================================
//  CHAT HEADER
// ============================================================
function _renderChatHeader(thread) {
    const el = document.getElementById('_discChatHdr');
    if (!el) return;

    const isSelf   = String(thread.author_id) === String(_discUI.currentUser?.id);
    const cTitle   = thread.courses?.title || '';
    const CAT      = { question:'#3b82f6',help:'#ef4444',resource:'#10b981',announcement:'#f59e0b',general:'#8b5cf6' };
    const catColor = CAT[thread.category]||'#8b5cf6';

    el.innerHTML = `
      <div class="_disc-hd-l">
        <div class="_disc-hd-ttl">${_safe(thread.title)}</div>
        <div class="_disc-hd-meta">
          ${cTitle?`<span class="_disc-tag" style="background:${_avColor(cTitle)}20;color:${_avColor(cTitle)}">${_safe(cTitle)}</span>`:''}
          <span class="_disc-tag" style="background:${catColor}20;color:${catColor}">${thread.category||'general'}</span>
          ${thread.is_solved
            ? '<span class="_disc-stag">✓ Solved</span>'
            : '<span class="_disc-otag">● Open</span>'}
        </div>
      </div>
      <div class="_disc-hd-r">
        ${isSelf ? `
          <button class="_disc-hdbtn ${thread.is_solved?'_btn-reopen':'_btn-solve'}"
                  onclick="_discToggleSolved('${thread.id}',${!thread.is_solved})">
            <i class="fas fa-${thread.is_solved?'redo':'check'}"></i>
            ${thread.is_solved?'Reopen':'Mark Solved'}
          </button>
          <button class="_disc-hdbtn" style="background:#fee2e2;color:#991b1b"
                  onclick="_deleteMyThread('${thread.id}')">
            <i class="fas fa-trash"></i> Delete
          </button>` : ''}
      </div>`;
}

// ============================================================
//  TYPING
// ============================================================
function _discHandleInput(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight,120)+'px';
    _discBroadcastTyping(true);
    clearTimeout(_discUI.typingTimer);
    _discUI.typingTimer = setTimeout(() => _discBroadcastTyping(false), 2000);
}

function _discBroadcastTyping(isTyping) {
    if (!_discUI.channel) return;
    const cp   = _discUI.currentProfile;
    const name = cp ? `${cp.first_name||''} ${cp.last_name||''}`.trim() : 'Someone';
    _discUI.channel.send({
        type:'broadcast', event:'typing',
        payload:{ userId:_discUI.currentUser?.id, name, isTyping }
    }).catch(()=>{});
}

function _updateTyping() {
    const el  = document.getElementById('_discTyping');
    const txt = document.getElementById('_discTypingTxt');
    if (!el||!txt) return;
    const names = Object.values(_discUI.typingUsers);
    if (!names.length) { el.style.display='none'; return; }
    el.style.display='flex';
    if      (names.length===1) txt.textContent=`${names[0]} is typing…`;
    else if (names.length===2) txt.textContent=`${names[0]} and ${names[1]} are typing…`;
    else                       txt.textContent=`${names.length} people are typing…`;
}

function _discKeydown(e) {
    if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); _discSend(); }
}

// ============================================================
//  FILTER + SEARCH
// ============================================================
function _discFilter(f, btn) {
    _discUI.filter = f;
    document.querySelectorAll('._disc-tab').forEach(b=>b.classList.remove('active'));
    btn?.classList.add('active');
    _renderThreadList();
}

function _discSearch(q) {
    _discUI.search = q;
    _renderThreadList();
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


  async function _deleteMyThread(threadId) {
    if (!confirm('Delete this discussion? This cannot be undone.')) return;
    const db = window.supabaseClient;
    try {
        await db.from('discussion_replies').delete().eq('thread_id', threadId);
        const { error } = await db.from('discussion_threads').delete().eq('id', threadId);
        if (error) throw error;

        // Remove from cache
        if (typeof discussionsCache !== 'undefined') {
            const idx = discussionsCache.findIndex(d => String(d.id) === String(threadId));
            if (idx > -1) discussionsCache.splice(idx, 1);
        }

        // Hide chat, show empty state
        document.getElementById('_discChatInner').style.display = 'none';
        document.getElementById('_discEmpty').style.display     = 'flex';

        _renderThreadList();
        showToast('Discussion deleted ✅', 's');

    } catch(err) {
        showToast('Failed: ' + err.message, 'e');
    }
}
// ============================================================
//  MODAL
// ============================================================
function _discOpenModal() {
    const o = document.getElementById('_discOverlay');
    if (!o) return;
    o.style.display='flex';
    requestAnimationFrame(()=>o.classList.add('_open'));
    document.getElementById('_discTitle')?.focus();
}

function _discCloseModal() {
    const o = document.getElementById('_discOverlay');
    if (!o) return;
    o.classList.remove('_open');
    setTimeout(()=>{ o.style.display='none'; },260);
    ['_discTitle','_discContent'].forEach(id=>{ const e=document.getElementById(id); if(e) e.value=''; });
}

function _discBgClose(e) {
    if (e.target.id==='_discOverlay') _discCloseModal();
}

// ============================================================
//  COURSE DROPDOWN
// ============================================================
async function _populateCourseDropdown() {
    const sel = document.getElementById('_discCourse');
    if (!sel) return;
    const db = window.supabaseClient;
    const { data } = await db.from('courses').select('id,title').order('title');
    (data||[]).forEach(c=>{
        const opt=document.createElement('option');
        opt.value=c.id; opt.textContent=c.title;
        sel.appendChild(opt);
    });
}

// ============================================================
//  SCROLL
// ============================================================
function _scrollBottom(smooth=true) {
    const el=document.getElementById('_discMsgs');
    if (el) el.scrollTo({top:el.scrollHeight,behavior:smooth?'smooth':'auto'});
}

// ============================================================
//  CSS  ← FIXED: date separator + correct self/other alignment
// ============================================================
function _injectDiscStyles() {
    if (document.getElementById('_disc-css')) return;
    const style = document.createElement('style');
    style.id = '_disc-css';
    style.textContent = `
/* ─────────────────────────────── Root ── */
._disc-root{display:flex;height:calc(100vh - 130px);min-height:520px;background:#f8f7ff;border-radius:20px;overflow:hidden;border:1.5px solid #ede9fe;font-family:'Plus Jakarta Sans',sans-serif;box-shadow:0 8px 40px rgba(124,58,237,.08)}

/* ─────────────────────────── Sidebar ── */
._disc-sb{width:285px;flex-shrink:0;display:flex;flex-direction:column;background:#fff;border-right:1.5px solid #ede9fe}
._disc-sb-hdr{padding:14px 12px 10px;border-bottom:1.5px solid #f3f4f6}
._disc-sb-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
._disc-sb-title{font-weight:800;font-size:14px;color:#1f2937}
._disc-newbtn{background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;padding:5px 13px;border-radius:20px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:transform .15s,box-shadow .15s}
._disc-newbtn:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(124,58,237,.35)}
._disc-srch-wrap{position:relative;margin-bottom:8px}
._disc-srch-ico{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:#9ca3af;font-size:11px;pointer-events:none}
._disc-srch{width:100%;padding:7px 9px 7px 28px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:12px;outline:none;background:#f9fafb;color:#1f2937;font-family:inherit;box-sizing:border-box;transition:border-color .2s}
._disc-srch:focus{border-color:#7c3aed}
._disc-tabs{display:flex;gap:4px}
._disc-tab{flex:1;padding:4px 2px;border:1.5px solid #e5e7eb;border-radius:7px;font-size:10px;font-weight:700;color:#6b7280;background:#fff;cursor:pointer;font-family:inherit;transition:all .2s}
._disc-tab.active,._disc-tab:hover{background:#7c3aed;color:#fff;border-color:#7c3aed}
._disc-tlist{flex:1;overflow-y:auto;padding:6px;scrollbar-width:thin;scrollbar-color:#e5e7eb transparent}

/* ──────────────────────── Thread items ── */
._disc-ti{padding:10px 9px;border-radius:11px;cursor:pointer;margin-bottom:3px;border:1.5px solid transparent;transition:all .2s;position:relative}
._disc-ti:hover{background:#faf5ff;border-color:#ede9fe}
._disc-ti._active{background:#f5f3ff;border-color:#c4b5fd}
._disc-ti._pinned{border-color:#fde68a;background:#fffbeb}
._disc-pin{position:absolute;top:6px;right:7px;color:#d97706;font-size:9px}
._disc-ti-top{display:flex;gap:8px;align-items:flex-start;margin-bottom:6px}
._disc-av{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex-shrink:0}
._disc-ti-info{flex:1;min-width:0}
._disc-ti-ttl{font-size:12px;font-weight:700;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px}
._disc-ti-tags{display:flex;gap:4px;flex-wrap:wrap}
._disc-tag{font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px}
._disc-stag{font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:#d1fae5;color:#065f46}
._disc-otag{font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:#dbeafe;color:#1d4ed8}
._disc-ti-foot{display:flex;gap:10px;font-size:10px;color:#9ca3af;padding-top:5px;border-top:1px solid #f3f4f6}
._disc-empty-list{text-align:center;padding:30px 14px;color:#9ca3af}
._disc-empty-list p{font-size:12px;margin-bottom:12px}

/* ─────────────────────────────── Chat ── */
._disc-chat{flex:1;display:flex;flex-direction:column;min-width:0;background:#f8f7ff}
._disc-chat-inner{flex:1;display:flex;flex-direction:column;min-height:0}
._disc-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;padding:40px}
._disc-empty h3{font-weight:800;color:#1f2937;margin-bottom:8px;font-size:18px}
._disc-empty p{color:#9ca3af;font-size:13px;margin-bottom:20px}
._disc-newbtn-lg{background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;padding:12px 26px;border-radius:13px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 4px 18px rgba(124,58,237,.35);transition:transform .2s}
._disc-newbtn-lg:hover{transform:translateY(-2px)}

/* ─────────────────────────── Header ── */
._disc-chat-hdr{padding:12px 18px;background:#fff;border-bottom:1.5px solid #ede9fe;display:flex;align-items:center;justify-content:space-between;gap:10px}
._disc-hd-l{flex:1;min-width:0}
._disc-hd-ttl{font-weight:800;font-size:14px;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px}
._disc-hd-meta{display:flex;gap:5px;flex-wrap:wrap}
._disc-hd-r{display:flex;gap:7px;flex-shrink:0}
._disc-hdbtn{padding:6px 13px;border-radius:20px;border:none;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .2s}
._btn-solve{background:#d1fae5;color:#065f46}._btn-solve:hover{background:#059669;color:#fff}
._btn-reopen{background:#fee2e2;color:#991b1b}._btn-reopen:hover{background:#dc2626;color:#fff}

/* ── Date separator ── */
._disc-date-sep{display:flex;align-items:center;gap:10px;margin:12px 0 8px;color:#9ca3af;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
._disc-date-sep::before,._disc-date-sep::after{content:'';flex:1;height:1px;background:#e5e7eb}

/* ─────────────────────── Messages ── */
._disc-msgs{flex:1;overflow-y:auto;padding:14px 16px 8px;display:flex;flex-direction:column;gap:0;scrollbar-width:thin;scrollbar-color:#e5e7eb transparent}
._disc-loading{text-align:center;padding:30px;color:#9ca3af;font-size:13px}
._disc-err{text-align:center;padding:20px;color:#ef4444;font-size:12px}
._disc-no-msgs{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;text-align:center;color:#9ca3af;font-size:13px;padding:30px}

/* ── Message row: others on LEFT, self on RIGHT ── */
._disc-mrow{
    display:flex;
    flex-direction:row;       /* others: avatar LEFT, bubble RIGHT */
    gap:8px;
    align-items:flex-end;
    margin-bottom:2px;
    max-width:100%;
}
._disc-mrow._self{
    flex-direction:row-reverse; /* self: bubble RIGHT, avatar LEFT (reversed) */
}

/* Avatar column */
._disc-mav-col{width:34px;flex-shrink:0;display:flex;align-items:flex-end}
._disc-mav{
    width:32px;height:32px;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    font-size:10px;font-weight:800;color:#fff;
    flex-shrink:0;
}
._disc-mav-sp{width:32px;height:32px;flex-shrink:0} /* spacer when no avatar shown */

/* Content column */
._disc-mcontent{
    max-width:68%;
    display:flex;
    flex-direction:column;
    align-items:flex-start;  /* others: name + bubble left-aligned */
}
._disc-mrow._self ._disc-mcontent{
    align-items:flex-end;    /* self: name + bubble right-aligned */
}

/* Sender name row */
._disc-mname{
    display:flex;
    align-items:center;
    gap:5px;
    margin-bottom:3px;
    flex-wrap:wrap;
}
._disc-mname-text{
    font-size:11px;
    font-weight:700;
    color:#374151;
}
._disc-mrow._self ._disc-mname{
    flex-direction:row-reverse; /* badges on left for self */
}

/* Bubbles */
._disc-bubble{
    padding:9px 13px;
    font-size:13px;
    line-height:1.55;
    word-break:break-word;
    max-width:100%;
}
/* Other students: white bubble, left-opening corner */
._other-b{
    background:#fff;
    color:#1f2937;
    border-radius:3px 16px 16px 16px;
    box-shadow:0 2px 8px rgba(0,0,0,.06);
    border:1px solid #f3f4f6;
}
/* Current user: purple bubble, right-opening corner */
._self-b{
    background:linear-gradient(135deg,#7c3aed,#6d28d9);
    color:#fff;
    border-radius:16px 3px 16px 16px;
    box-shadow:0 4px 14px rgba(124,58,237,.3);
}
/* Teacher: teal bubble, left-opening corner */
._teach-b{
    background:linear-gradient(135deg,#0891b2,#0e7490);
    color:#fff;
    border-radius:3px 16px 16px 16px;
    box-shadow:0 4px 14px rgba(8,145,178,.25);
}

/* Timestamp */
._disc-mtime{font-size:9px;color:#9ca3af;margin-top:3px}
._disc-mrow._self ._disc-mtime{text-align:right}

/* Badges */
._disc-tbadge{
    font-size:9px;font-weight:700;
    background:#e0f2fe;color:#0369a1;
    padding:1px 6px;border-radius:20px;
    display:inline-flex;align-items:center;gap:3px;
}
._disc-ybadge{
    font-size:9px;font-weight:700;
    background:#f3f4f6;color:#6b7280;
    padding:1px 6px;border-radius:20px;
}

/* ─────────────────────────── Typing ── */
._disc-typing{display:flex;align-items:center;gap:7px;padding:5px 18px 3px;font-size:11px;color:#9ca3af}
._disc-dots{display:flex;gap:3px}
._disc-dots span{width:6px;height:6px;border-radius:50%;background:#c4b5fd;animation:_discB 1.2s infinite}
._disc-dots span:nth-child(2){animation-delay:.2s}
._disc-dots span:nth-child(3){animation-delay:.4s}
@keyframes _discB{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}

/* ─────────────────────────── Input ── */
._disc-input-area{padding:10px 14px;background:#fff;border-top:1.5px solid #ede9fe}
._disc-input-wrap{display:flex;gap:8px;align-items:flex-end;background:#f8f7ff;border:1.5px solid #e5e7eb;border-radius:14px;padding:7px 10px 7px 14px;transition:border-color .2s}
._disc-input-wrap:focus-within{border-color:#7c3aed}
._disc-ta{flex:1;border:none;background:transparent;font-size:13px;color:#1f2937;resize:none;outline:none;font-family:inherit;line-height:1.5;min-height:20px;max-height:110px;overflow-y:auto}
._disc-ta::placeholder{color:#9ca3af}
._disc-sendbtn{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;transition:transform .15s,box-shadow .15s;box-shadow:0 3px 10px rgba(124,58,237,.35)}
._disc-sendbtn:hover{transform:scale(1.08);box-shadow:0 5px 16px rgba(124,58,237,.45)}

/* ─────────────────────────── Modal ── */
._disc-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);opacity:0;transition:opacity .25s}
._disc-overlay._open{opacity:1}
._disc-modal{background:#fff;border-radius:18px;width:100%;max-width:490px;box-shadow:0 30px 80px rgba(0,0,0,.2);overflow:hidden;transform:translateY(18px);transition:transform .25s}
._disc-overlay._open ._disc-modal{transform:translateY(0)}
._disc-mhdr{padding:18px 22px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1.5px solid #f3f4f6}
._disc-mhdr h3{font-weight:800;font-size:16px;color:#1f2937;margin:0}
._disc-mclose{background:#f3f4f6;border:none;width:30px;height:30px;border-radius:50%;cursor:pointer;color:#6b7280;font-size:13px;display:flex;align-items:center;justify-content:center;transition:background .2s}
._disc-mclose:hover{background:#e5e7eb}
._disc-mbody{padding:18px 22px}
._disc-fg{margin-bottom:14px}
._disc-fg label{display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:5px}
._disc-fi{width:100%;padding:9px 12px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:13px;font-family:inherit;color:#1f2937;background:#f9fafb;outline:none;box-sizing:border-box;transition:border-color .2s}
._disc-fi:focus{border-color:#7c3aed;background:#fff}
._disc-fta{resize:vertical;min-height:80px}
._disc-mftr{padding:12px 22px;background:#f9fafb;border-top:1.5px solid #f3f4f6;display:flex;gap:9px;justify-content:flex-end}
._disc-mcancel{padding:9px 18px;border:1.5px solid #e5e7eb;border-radius:9px;background:#fff;color:#6b7280;font-weight:700;cursor:pointer;font-family:inherit;font-size:13px}
._disc-msubmit{padding:9px 20px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border:none;border-radius:9px;color:#fff;font-weight:700;cursor:pointer;font-family:inherit;font-size:13px;box-shadow:0 4px 14px rgba(124,58,237,.3);transition:transform .15s}
._disc-msubmit:hover{transform:translateY(-1px)}
._disc-msubmit:disabled{opacity:.6;transform:none}

/* ──────────────────────── Responsive ── */
@media(max-width:768px){
  ._disc-root{
    height:calc(100vh - 160px);
    border-radius:12px;
  }
  ._disc-sb{width:200px}
  ._disc-msgs{padding:10px 10px 6px}
  ._disc-input-area{padding:8px 10px;padding-bottom:max(8px,env(safe-area-inset-bottom))}
  ._disc-ta{font-size:16px}
  ._disc-bubble{font-size:12px;padding:8px 11px}
}

@media(max-width:540px){
  ._disc-root{
    flex-direction:column;
    height:calc(100vh - 160px);
    border-radius:12px;
  }
  ._disc-sb{
    width:100%;
    height:auto;
    max-height:180px;
    border-right:none;
    border-bottom:1.5px solid #ede9fe;
    flex-shrink:0;
  }
  ._disc-sb-hdr{padding:10px 10px 8px}
  ._disc-tabs{gap:3px}
  ._disc-tab{font-size:9px;padding:4px 2px}
  ._disc-tlist{max-height:90px;overflow-y:auto}
  ._disc-ti{padding:7px}
  ._disc-ti-ttl{font-size:11px}

  ._disc-chat{
    flex:1;
    display:flex;
    flex-direction:column;
    min-height:0;
    overflow:hidden;
  }
  ._disc-chat-inner{
    flex:1;
    display:flex;
    flex-direction:column;
    min-height:0;
    overflow:hidden;
  }
  ._disc-msgs{
    flex:1;
    min-height:0;
    overflow-y:auto;
    padding:10px 10px 6px;
  }
  ._disc-input-area{
    flex-shrink:0;
    padding:8px 10px;
    padding-bottom:max(8px,env(safe-area-inset-bottom));
  }
  ._disc-input-wrap{
    border-radius:24px;
    padding:6px 8px 6px 12px;
  }
  ._disc-ta{
    font-size:16px;
    min-height:22px;
  }
  ._disc-sendbtn{
    width:38px;
    height:38px;
    font-size:15px;
  }
  ._disc-bubble{
    font-size:13px;
    padding:8px 11px;
  }
  ._disc-mcontent{max-width:82%}
  ._disc-chat-hdr{padding:9px 12px}
  ._disc-hd-ttl{font-size:13px}
  ._disc-hdbtn{padding:5px 10px;font-size:10px}
}
`;
    document.head.appendChild(style);
}

console.log('✅ discussions-ui.js loaded (group-chat fix applied)');