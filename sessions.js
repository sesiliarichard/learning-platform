
// ─────────────────────────────────────────────
// 1. POST /api/sessions/start
// Admin/Instructor starts a new live session
// Returns meeting ID for PeerJS/Jitsi
// ─────────────────────────────────────────────
async function startSession({ courseId, title, description, scheduledAt, maxParticipants = 100 }) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Generate unique meeting ID
        const meetingId = `asai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Get instructor name from profiles
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', user.id)
             .maybeSingle();

        const instructorName = profile 
            ? `${profile.first_name} ${profile.last_name}` 
            : 'ASAI Instructor';

        const { data, error } = await supabaseClient
            .from('sessions')
            .insert({
                course_id:        courseId,
                meeting_id:       meetingId,
                title:            title.trim(),
                description:      description?.trim() || '',
                instructor_id:    user.id,
                instructor_name:  instructorName,
                status:           'live',
                scheduled_at:     scheduledAt || new Date().toISOString(),
                started_at:       new Date().toISOString(),
                max_participants: maxParticipants,
                join_url:         `https://your-domain.com/join/${meetingId}` // customize this
            })
            .select()
            .maybeSingle();

        if (error) throw error;

        return {
            success:    true,
            session:    data,
            meetingId:  meetingId,
            message:    'Live session started! 🎥'
        };

    } catch (error) {
        console.error('❌ startSession error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 2. POST /api/sessions/:id/end
// End a live session, calculate duration
// ─────────────────────────────────────────────
async function endSession(sessionId) {
    try {
        // Get the session to calculate duration
        const { data: session } = await supabaseClient
            .from('sessions')
            .select('started_at')
            .eq('id', sessionId)
            .maybeSingle();

        if (!session) throw new Error('Session not found');

        // Calculate duration in minutes
        const startTime  = new Date(session.started_at);
        const endTime    = new Date();
        const durationMs = endTime - startTime;
        const durationMins = Math.round(durationMs / 1000 / 60);

        const { data, error } = await supabaseClient
            .from('sessions')
            .update({
                status:        'ended',
                ended_at:      endTime.toISOString(),
                duration_mins: durationMins,
                updated_at:    endTime.toISOString()
            })
            .eq('id', sessionId)
            .select()
            .maybeSingle();

        if (error) throw error;

        // Also update all participants' leave time if not set
        await supabaseClient
            .from('session_participants')
            .update({ 
                left_at: endTime.toISOString(),
                duration_mins: durationMins
            })
            .eq('session_id', sessionId)
            .is('left_at', null);

        return {
            success:      true,
            session:      data,
            durationMins: durationMins,
            message:      `Session ended. Duration: ${durationMins} minutes`
        };

    } catch (error) {
        console.error('❌ endSession error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 3. GET /api/sessions/active
// List all currently LIVE sessions
// ─────────────────────────────────────────────
async function getActiveSessions() {
    try {
        const { data, error } = await supabaseClient
            .from('sessions')
            .select(`
                id,
                course_id,
                meeting_id,
                title,
                description,
                instructor_name,
                started_at,
                max_participants,
                join_url,
                courses (
                    title,
                    thumbnail_color,
                    icon
                )
            `)
            .eq('status', 'live')
            .order('started_at', { ascending: false });

        if (error) throw error;

        // Count participants for each session
        const sessionsWithCounts = await Promise.all(
            (data || []).map(async (session) => {
                const { count } = await supabaseClient
                    .from('session_participants')
                    .select('*', { count: 'exact', head: true })
                    .eq('session_id', session.id)
                    .is('left_at', null);

                return {
                    ...session,
                    currentParticipants: count || 0
                };
            })
        );

        return { success: true, sessions: sessionsWithCounts };

    } catch (error) {
        console.error('❌ getActiveSessions error:', error.message);
        return { success: false, error: error.message, sessions: [] };
    }
}

// ─────────────────────────────────────────────
// 4. GET /api/sessions/history
// List past (ended) sessions
// ─────────────────────────────────────────────
async function getSessionHistory(courseId = null) {
    try {
        let query = supabaseClient
            .from('sessions')
            .select(`
                id,
                course_id,
                title,
                description,
                instructor_name,
                started_at,
                ended_at,
                duration_mins,
                courses (
                    title
                )
            `)
            .eq('status', 'ended')
            .order('ended_at', { ascending: false });

        if (courseId) query = query.eq('course_id', courseId);

        const { data, error } = await query;

        if (error) throw error;

        // Get participant count for each session
        const sessionsWithCounts = await Promise.all(
            (data || []).map(async (session) => {
                const { count } = await supabaseClient
                    .from('session_participants')
                    .select('*', { count: 'exact', head: true })
                    .eq('session_id', session.id);

                return {
                    ...session,
                    totalParticipants: count || 0
                };
            })
        );

        return { success: true, sessions: sessionsWithCounts };

    } catch (error) {
        console.error('❌ getSessionHistory error:', error.message);
        return { success: false, error: error.message, sessions: [] };
    }
}

// ─────────────────────────────────────────────
// 5. POST /api/sessions/schedule
// Admin schedules a future session
// ─────────────────────────────────────────────
async function scheduleSession({ courseId, title, description, scheduledAt, maxParticipants = 100 }) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Generate meeting ID in advance
        const meetingId = `asai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', user.id)
             .maybeSingle();

        const instructorName = profile 
            ? `${profile.first_name} ${profile.last_name}` 
            : 'ASAI Instructor';

        const { data, error } = await supabaseClient
            .from('sessions')
            .insert({
                course_id:        courseId,
                meeting_id:       meetingId,
                title:            title.trim(),
                description:      description?.trim() || '',
                instructor_id:    user.id,
                instructor_name:  instructorName,
                status:           'scheduled',
                scheduled_at:     scheduledAt,
                max_participants: maxParticipants,
                join_url:         `https://your-domain.com/join/${meetingId}`
            })
            .select()
            .maybeSingle();

        if (error) throw error;

        return {
            success:   true,
            session:   data,
            message:   'Session scheduled successfully! 📅'
        };

    } catch (error) {
        console.error('❌ scheduleSession error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 6. POST /api/recordings
// Upload a new recording (after session ends)
// ─────────────────────────────────────────────
async function saveRecording({ courseId, sessionId = null, title, description, videoUrl, thumbnailUrl, durationMins, fileSizeMb }) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabaseClient
            .from('recordings')
            .insert({
                course_id:     courseId,
                session_id:    sessionId,
                title:         title.trim(),
                description:   description?.trim() || '',
                video_url:     videoUrl,
                thumbnail_url: thumbnailUrl || null,
                duration_mins: durationMins || 0,
                file_size_mb:  fileSizeMb || 0,
                is_published:  false, // unpublished by default
                uploaded_by:   user.id
            })
            .select()
            .maybeSingle();

        if (error) throw error;

        return {
            success:   true,
            recording: data,
            message:   'Recording saved! 🎬 (Unpublished)'
        };

    } catch (error) {
        console.error('❌ saveRecording error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 7. PUT /api/recordings/:id/publish
// Admin publishes a recording (makes visible to students)
// ─────────────────────────────────────────────
async function publishRecording(recordingId) {
    try {
        const { data, error } = await supabaseClient
            .from('recordings')
            .update({
                is_published: true,
                published_at: new Date().toISOString(),
                updated_at:   new Date().toISOString()
            })
            .eq('id', recordingId)
            .select()
            .maybeSingle();

        if (error) throw error;

        return {
            success:   true,
            recording: data,
            message:   'Recording published! ✅ Students can now watch it.'
        };

    } catch (error) {
        console.error('❌ publishRecording error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 8. GET /api/courses/:id/recordings
// Students fetch all PUBLISHED recordings for a course
// ─────────────────────────────────────────────
async function getCourseRecordings(courseId) {
    try {
        const { data, error } = await supabaseClient
            .from('recordings')
            .select('*')
            .eq('course_id', courseId)
            .eq('is_published', true)
            .order('uploaded_at', { ascending: false });

        if (error) throw error;

        return { success: true, recordings: data || [] };

    } catch (error) {
        console.error('❌ getCourseRecordings error:', error.message);
        return { success: false, error: error.message, recordings: [] };
    }
}

// ─────────────────────────────────────────────
// 9. DELETE /api/recordings/:id
// Admin deletes a recording permanently
// ─────────────────────────────────────────────
async function deleteRecording(recordingId) {
    try {
        const { error } = await supabaseClient
            .from('recordings')
            .delete()
            .eq('id', recordingId);

        if (error) throw error;

        return {
            success: true,
            message: 'Recording deleted successfully'
        };

    } catch (error) {
        console.error('❌ deleteRecording error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// BONUS: JOIN SESSION (student joins a live session)
// Creates a participant record
// ─────────────────────────────────────────────
async function joinSession(sessionId) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Check if already joined
        const { data: existing } = await supabaseClient
            .from('session_participants')
            .select('id')
            .eq('session_id', sessionId)
            .eq('student_id', user.id)
            .maybeSingle();

        if (existing && existing.id) {
            return { success: true, alreadyJoined: true };
        }

        const { data, error } = await supabaseClient
            .from('session_participants')
            .insert({
                session_id: sessionId,
                user_id: user.id
            })
            .select()
            .maybeSingle();

        if (error) throw error;

        return {
            success:     true,
            participant: data,
            message:     'Joined session! 🎥'
        };

    } catch (error) {
        console.error('❌ joinSession error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// BONUS: LEAVE SESSION
// Records when student leaves
// ─────────────────────────────────────────────
async function leaveSession(sessionId) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        // Get join time to calculate duration
        const { data: participant } = await supabaseClient
            .from('session_participants')
            .select('joined_at')
            .eq('session_id', sessionId)
            .eq('student_id', user.id)
            .maybeSingle();

        if (!participant || !participant.id) return;

        const joinTime     = new Date(participant.joined_at);
        const leaveTime    = new Date();
        const durationMs   = leaveTime - joinTime;
        const durationMins = Math.round(durationMs / 1000 / 60);

        await supabaseClient
            .from('session_participants')
            .update({
                left_at:       leaveTime.toISOString(),
                duration_mins: durationMins
            })
            .eq('session_id', sessionId)
            .eq('student_id', user.id);

        return { success: true };

    } catch (error) {
        console.error('❌ leaveSession error:', error.message);
        return { success: false };
    }
}

// ─────────────────────────────────────────────
// BONUS: TRACK RECORDING VIEW
// Student watches a recording
// ─────────────────────────────────────────────
async function trackRecordingView(recordingId, watchDurationMins, completed = false) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        // Check if already has a view record
        const { data: existing } = await supabaseClient
            .from('recording_views')
            .select('id')
            .eq('recording_id', recordingId)
            .eq('student_id', user.id)
            .maybeSingle();

        if (existing && existing.id) {
            // Update existing view
            await supabaseClient
                .from('recording_views')
                .update({
                    watch_duration_mins: watchDurationMins,
                    completed:           completed,
                    watched_at:          new Date().toISOString()
                })
                .eq('id', existing.id);
        } else {
            // Create new view record
            await supabaseClient
                .from('recording_views')
                .insert({
                    recording_id:        recordingId,
                    user_id:          user.id,
                    watch_duration_mins: watchDurationMins,
                    completed:           completed
                });
        }

        // Increment views count on recording
        await supabaseClient.rpc('increment_views', { recording_id: recordingId });

        return { success: true };

    } catch (error) {
        console.error('❌ trackRecordingView error:', error.message);
        return { success: false };
    }
}

console.log('✅ Sessions.js loaded');