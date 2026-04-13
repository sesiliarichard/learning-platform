// ============================================================
//  discussions.js — Supabase API functions for discussions
// ============================================================

// ── 1. Get all discussion threads ────────────────────────────
async function getAllDiscussions(filters = {}) {
    try {
        const db = window.supabaseClient;

        let query = db
            .from('discussion_threads')
            .select(`
                id, title, content, category, is_solved, is_pinned,
                author_id, author_name, created_at, last_reply_at,
                replies_count,
                courses ( id, title, thumbnail_color )
            `)
            .order('is_pinned', { ascending: false })
            .order('last_reply_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });

        if (filters.courseId) query = query.eq('course_id', filters.courseId);
        if (filters.category) query = query.eq('category', filters.category);

        const { data, error } = await query;
        if (error) throw error;

        return { success: true, threads: data || [] };

    } catch (err) {
        console.error('❌ getAllDiscussions error:', err.message);
        return { success: false, error: err.message, threads: [] };
    }
}

// ── 2. Get single thread with replies ────────────────────────
async function getDiscussionById(threadId) {
    try {
        const db = window.supabaseClient;

        const { data: thread, error } = await db
            .from('discussion_threads')
            .select(`
                id, title, content, category, is_solved, is_pinned,
                author_id, author_name, created_at, last_reply_at,
                courses ( id, title, thumbnail_color )
            `)
            .eq('id', threadId)
            .maybeSingle();

        if (error) throw error;
        if (!thread) throw new Error('Thread not found');

        const { data: replies, error: repliesError } = await db
            .from('discussion_replies')
            .select(`
                id, content, created_at, author_id, author_name,
                profiles:author_id ( first_name, last_name, role, avatar_url )
            `)
            .eq('thread_id', threadId)
            .order('created_at', { ascending: true });

        if (repliesError) throw repliesError;

        thread.replies = replies || [];

        return { success: true, thread };

    } catch (err) {
        console.error('❌ getDiscussionById error:', err.message);
        return { success: false, error: err.message };
    }
}

// ── 3. Create a new discussion thread ────────────────────────
async function createDiscussion({ courseId, title, content, category = 'general' }) {
    try {
        const db = window.supabaseClient;

        const { data: { user } } = await db.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data: profile } = await db
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', user.id)
            .maybeSingle();

        const authorName = profile
            ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
            : (user.email?.split('@')[0] || 'Student');

        const { data: thread, error } = await db
            .from('discussion_threads')
            .insert({
                course_id:     courseId,
                title:         title.trim(),
                content:       content.trim(),
                category,
                author_id:     user.id,
                author_name:   authorName,
                is_solved:     false,
                is_pinned:     false,
                replies_count: 0,
                last_reply_at: new Date().toISOString()
            })
            .select()
            .maybeSingle();

        if (error) throw error;

        return { success: true, thread, message: 'Discussion created! 💬' };

    } catch (err) {
        console.error('❌ createDiscussion error:', err.message);
        return { success: false, error: err.message };
    }
}

// ── 4. Reply to a thread ─────────────────────────────────────
async function replyToDiscussion(threadId, content) {
    try {
        const db = window.supabaseClient;

        const { data: { user } } = await db.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data: profile } = await db
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', user.id)
            .maybeSingle();

        const authorName = profile
            ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
            : (user.email?.split('@')[0] || 'Student');

        const { data: reply, error } = await db
            .from('discussion_replies')
            .insert({
                thread_id:   threadId,
                content:     content.trim(),
                author_id:   user.id,
                author_name: authorName
            })
            .select()
            .maybeSingle();

        if (error) throw error;

        // Update replies_count and last_reply_at on the thread
        await db
            .from('discussion_threads')
            .update({
                last_reply_at: new Date().toISOString(),
                replies_count: db.rpc
                    ? undefined  // handled by trigger if exists
                    : undefined
            })
            .eq('id', threadId);

        // Manually increment replies_count
        const { data: threadData } = await db
            .from('discussion_threads')
            .select('replies_count')
            .eq('id', threadId)
            .maybeSingle();

        await db
            .from('discussion_threads')
            .update({
                replies_count: (threadData?.replies_count || 0) + 1,
                last_reply_at: new Date().toISOString()
            })
            .eq('id', threadId);

        return { success: true, reply, message: 'Reply posted! ✅' };

    } catch (err) {
        console.error('❌ replyToDiscussion error:', err.message);
        return { success: false, error: err.message };
    }
}

// ── 5. Mark thread as solved / reopen ────────────────────────
async function markThreadSolved(threadId, isSolved) {
    try {
        const db = window.supabaseClient;

        const { data, error } = await db
            .from('discussion_threads')
            .update({ is_solved: isSolved })
            .eq('id', threadId)
            .select()
            .maybeSingle();

        if (error) throw error;

        return {
            success: true,
            thread:  data,
            message: isSolved ? 'Marked as solved ✅' : 'Reopened 🔄'
        };

    } catch (err) {
        console.error('❌ markThreadSolved error:', err.message);
        return { success: false, error: err.message };
    }
}

console.log('✅ discussions.js loaded');