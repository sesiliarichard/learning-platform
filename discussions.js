// ============================================
// discussions.js — Forum/Discussions Backend
// FIXED: getDiscussionById now joins profiles
//        so reply.profiles.role is available
//        for correct bubble styling on both
//        student and teacher dashboards.
// ============================================

// ─────────────────────────────────────────────
// 1. GET ALL DISCUSSIONS
// ─────────────────────────────────────────────
async function getAllDiscussions(filters = {}) {
    try {
        let query = supabaseClient
            .from('discussion_threads')
            .select(`
                id,
                course_id,
                author_id,
                author_name,
                title,
                content,
                category,
                is_solved,
                is_pinned,
                views_count,
                replies_count,
                last_reply_at,
                created_at,
                courses (
                    title,
                    thumbnail_color,
                    icon
                )
            `)
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false });

        if (filters.courseId)              query = query.eq('course_id', filters.courseId);
        if (filters.category)             query = query.eq('category', filters.category);
        if (filters.isSolved !== undefined) query = query.eq('is_solved', filters.isSolved);
        if (filters.authorId)             query = query.eq('author_id', filters.authorId);
        if (filters.search) {
            query = query.or(`title.ilike.%${filters.search}%,content.ilike.%${filters.search}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        return { success: true, threads: data || [], count: data?.length || 0 };

    } catch (error) {
        console.error('❌ getAllDiscussions error:', error.message);
        return { success: false, error: error.message, threads: [] };
    }
}

// ─────────────────────────────────────────────
// 2. CREATE DISCUSSION THREAD
// ─────────────────────────────────────────────
async function createDiscussion({ courseId, title, content, category = 'general' }) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        if (!title?.trim())   throw new Error('Title is required');
        if (!content?.trim()) throw new Error('Content is required');

        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', user.id)
            .maybeSingle();

        const authorName = profile
            ? `${profile.first_name} ${profile.last_name}`.trim()
            : user.email.split('@')[0];

        const { data, error } = await supabaseClient
            .from('discussion_threads')
            .insert({
                course_id:   courseId,
                author_id:   user.id,
                author_name: authorName,
                title:       title.trim(),
                content:     content.trim(),
                category:    category || 'general'
            })
            .select()
            .maybeSingle();

        if (error) throw error;

        return { success: true, thread: data, message: 'Discussion thread created! 💬' };

    } catch (error) {
        console.error('❌ createDiscussion error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 3. GET SINGLE THREAD WITH REPLIES
//
// FIXED: replies now join `profiles` so that
//   reply.profiles.role  → 'teacher' | 'student'
//   reply.profiles.first_name / last_name
//   reply.profiles.avatar_url
// are all available for correct bubble rendering.
// ─────────────────────────────────────────────
async function getDiscussionById(threadId) {
    try {
        // Fetch the thread
        const { data: thread, error: threadError } = await supabaseClient
            .from('discussion_threads')
            .select(`
                id,
                course_id,
                author_id,
                author_name,
                title,
                content,
                category,
                is_solved,
                is_pinned,
                views_count,
                replies_count,
                created_at,
                updated_at,
                courses (
                    title,
                    thumbnail_color
                )
            `)
            .eq('id', threadId)
            .maybeSingle();

        if (threadError) throw threadError;
        if (!thread)     throw new Error('Thread not found');

        // ── FIXED: join profiles so role + name + avatar are available ──
const { data: replies, error: repliesError } = await supabaseClient
    .from('discussion_replies')
    .select(`
        id,
        content,
        created_at,
        author_id,
        author_name,
        profiles:author_id (
            first_name,
            last_name,
            role,
            avatar_url
        )
    `)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

        if (repliesError) throw repliesError;

        // Increment view count (fire and forget)
        supabaseClient
            .from('discussion_threads')
            .update({ views_count: (thread.views_count || 0) + 1, updated_at: new Date().toISOString() })
            .eq('id', threadId)
            .then(() => {});

        return {
            success: true,
            thread:  { ...thread, replies: replies || [] }
        };

    } catch (error) {
        console.error('❌ getDiscussionById error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 4. REPLY TO DISCUSSION
// ─────────────────────────────────────────────
async function replyToDiscussion(threadId, content) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        if (!content?.trim()) throw new Error('Reply content is required');

        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', user.id)
            .maybeSingle();

        const authorName = profile
            ? `${profile.first_name} ${profile.last_name}`.trim()
            : user.email.split('@')[0];

        const { data, error } = await supabaseClient
            .from('discussion_replies')
            .insert({
                thread_id:   threadId,
                author_id:   user.id,
                author_name: authorName,
                content:     content.trim()
            })
            .select()
            .maybeSingle();

        if (error) throw error;

        return { success: true, reply: data, message: 'Reply posted! 💬' };

    } catch (error) {
        console.error('❌ replyToDiscussion error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 5. MARK THREAD SOLVED / UNSOLVED
// ─────────────────────────────────────────────
async function markThreadSolved(threadId, isSolved = true) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data: thread } = await supabaseClient
            .from('discussion_threads')
            .select('author_id')
            .eq('id', threadId)
            .maybeSingle();

        if (!thread) throw new Error('Thread not found');

        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

        const isAdmin  = profile?.role === 'admin';
        const isTeacher = profile?.role === 'teacher' || profile?.role === 'instructor';
        const isAuthor = String(thread.author_id) === String(user.id);

        // Teachers and admins can mark any thread solved
        if (!isAdmin && !isTeacher && !isAuthor) {
            throw new Error('Only the thread author or teacher can mark as solved');
        }

        const { data, error } = await supabaseClient
            .from('discussion_threads')
            .update({ is_solved: isSolved, updated_at: new Date().toISOString() })
            .eq('id', threadId)
            .select()
            .maybeSingle();

        if (error) throw error;

        return {
            success: true,
            thread:  data,
            message: isSolved ? 'Thread marked as solved! ✅' : 'Thread marked as unsolved'
        };

    } catch (error) {
        console.error('❌ markThreadSolved error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// BONUS: PIN THREAD
// ─────────────────────────────────────────────
async function pinThread(threadId, isPinned = true) {
    try {
        const { data, error } = await supabaseClient
            .from('discussion_threads')
            .update({ is_pinned: isPinned, updated_at: new Date().toISOString() })
            .eq('id', threadId)
            .select()
            .maybeSingle();

        if (error) throw error;
        return { success: true, thread: data, message: isPinned ? 'Thread pinned! 📌' : 'Thread unpinned' };

    } catch (error) {
        console.error('❌ pinThread error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// BONUS: DELETE THREAD
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// BONUS: DELETE REPLY
// ─────────────────────────────────────────────
async function deleteReply(replyId) {
    try {
        const { error } = await supabaseClient.from('discussion_replies').delete().eq('id', replyId);
        if (error) throw error;
        return { success: true, message: 'Reply deleted successfully' };
    } catch (error) {
        console.error('❌ deleteReply error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// BONUS: MARK REPLY AS SOLUTION
// ─────────────────────────────────────────────
async function markReplyAsSolution(replyId, threadId) {
    try {
        await supabaseClient
            .from('discussion_replies')
            .update({ is_solution: false })
            .eq('thread_id', threadId);

        const { data, error } = await supabaseClient
            .from('discussion_replies')
            .update({ is_solution: true, updated_at: new Date().toISOString() })
            .eq('id', replyId)
            .select()
            .maybeSingle();

        if (error) throw error;

        await markThreadSolved(threadId, true);

        return { success: true, reply: data, message: 'Marked as solution! ✅' };

    } catch (error) {
        console.error('❌ markReplyAsSolution error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// BONUS: VOTE ON CONTENT
// ─────────────────────────────────────────────
async function voteOnContent(contentId, contentType, voteType) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const voteData = { student_id: user.id, vote_type: voteType };
        if (contentType === 'thread') { voteData.thread_id = contentId; voteData.reply_id = null; }
        else                          { voteData.reply_id  = contentId; voteData.thread_id = null; }

        const { data: existing } = await supabaseClient
            .from('discussion_votes')
            .select('id, vote_type')
            .eq('student_id', user.id)
            .eq(contentType === 'thread' ? 'thread_id' : 'reply_id', contentId)
            .maybeSingle();

        if (existing) {
            if (existing.vote_type === voteType) {
                await supabaseClient.from('discussion_votes').delete().eq('id', existing.id);
                return { success: true, action: 'unvoted' };
            } else {
                await supabaseClient.from('discussion_votes').update({ vote_type: voteType }).eq('id', existing.id);
                return { success: true, action: 'changed' };
            }
        } else {
            await supabaseClient.from('discussion_votes').insert(voteData);
            return { success: true, action: 'voted' };
        }

    } catch (error) {
        console.error('❌ voteOnContent error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// BONUS: GET VOTE COUNTS
// ─────────────────────────────────────────────
async function getVoteCounts(contentId, contentType) {
    try {
        const field = contentType === 'thread' ? 'thread_id' : 'reply_id';
        const { data, error } = await supabaseClient
            .from('discussion_votes').select('vote_type').eq(field, contentId);
        if (error) throw error;

        const upvotes   = (data || []).filter(v => v.vote_type === 'upvote').length;
        const downvotes = (data || []).filter(v => v.vote_type === 'downvote').length;
        return { success: true, upvotes, downvotes, score: upvotes - downvotes };

    } catch (error) {
        console.error('❌ getVoteCounts error:', error.message);
        return { success: false, upvotes: 0, downvotes: 0, score: 0 };
    }
}

console.log('✅ discussions.js loaded');
