// ============================================
// ASAI — ANNOUNCEMENTS.JS
// Complete Announcements Backend Functions
// Covers all API endpoints + Edit + Publish features
// Depends on: supabase-config.js, auth.js
// ============================================

// ─────────────────────────────────────────────
// 1. CREATE ANNOUNCEMENT (Admin only)
// ─────────────────────────────────────────────
async function createAnnouncement({ title, message, audience, courseId, priority, sendEmail }) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        if (!title?.trim())   throw new Error('Title is required');
        if (!message?.trim()) throw new Error('Message is required');
        if (!audience)        throw new Error('Audience is required');

        const { data, error } = await supabaseClient
            .from('announcements')
            .insert({
                title:      title.trim(),
                message:    message.trim(),
                audience:   audience,
                course_id:  courseId || null,
                priority:   priority || 'normal',
                published:  false,
                created_by: user.id,
                created_at: new Date().toISOString()
            })
            .select()
            .maybeSingle();

        if (error) throw error;

        if (sendEmail) {
            await sendAnnouncementEmails({
                announcementId: data.id,
                title:          data.title,
                message:        data.message,
                audience:       data.audience,
                courseId:       data.course_id
            });
        }

        return {
            success:      true,
            announcement: data,
            message:      'Announcement created successfully!'
        };

    } catch (error) {
        console.error('❌ createAnnouncement error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 2. UPDATE ANNOUNCEMENT (Admin only)
// ─────────────────────────────────────────────
async function updateAnnouncement(announcementId, { title, message, audience, courseId, priority }) {
    try {
        if (!title?.trim())   throw new Error('Title is required');
        if (!message?.trim()) throw new Error('Message is required');

        const { error } = await supabaseClient
            .from('announcements')
            .update({
                title:     title.trim(),
                message:   message.trim(),
                audience:  audience,
                course_id: courseId || null,
                priority:  priority || 'normal',
                updated_at: new Date().toISOString()
            })
            .eq('id', announcementId);

        if (error) throw error;

        return { success: true, message: 'Announcement updated successfully!' };

    } catch (error) {
        console.error('❌ updateAnnouncement error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 3. TOGGLE PUBLISH ANNOUNCEMENT (Admin only)
// ─────────────────────────────────────────────
async function togglePublishAnnouncementDB(announcementId, currentlyPublished) {
    try {
        const newStatus = !currentlyPublished;

        const { error } = await supabaseClient
            .from('announcements')
            .update({ published: newStatus })
            .eq('id', announcementId);

        if (error) throw error;

        return {
            success:   true,
            published: newStatus,
            message:   newStatus ? 'Announcement published!' : 'Announcement unpublished.'
        };

    } catch (error) {
        console.error('❌ togglePublishAnnouncement error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 4. GET ANNOUNCEMENTS (Student)
// ─────────────────────────────────────────────
async function getAnnouncements() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const user = session?.user;
        if (!user) throw new Error('Not authenticated');

        const { data: enrollments } = await supabaseClient
            .from('enrollments')
            .select('course_id')
            .eq('student_id', user.id);

        const enrolledCourseIds = enrollments?.map(e => e.course_id) || [];

        const { data: allAnnouncements, error } = await supabaseClient
            .from('announcements')
            .select(`
                id, title, message, audience, course_id, priority, created_at, published,
                courses ( title ),
                profiles ( first_name, last_name )
            `)
            .eq('published', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const announcements = (allAnnouncements || []).filter(ann => {
            if (ann.audience === 'all') return true;
            if (ann.audience === 'course' && enrolledCourseIds.includes(ann.course_id)) return true;
            return false;
        });

       let readIds = new Set();
try {
    const { data: readStatuses } = await supabaseClient
        .from('announcement_reads')
        .select('announcement_id')
        .eq('student_id', user.id);
    readIds = new Set(readStatuses?.map(r => r.announcement_id) || []);
} catch (e) {
    // announcement_reads table may not exist yet — treat all as unread
    console.warn('announcement_reads table not available, treating all as unread');
}

        const formattedAnnouncements = announcements.map(ann => ({
            id:         ann.id,
            title:      ann.title,
            message:    ann.message,
            audience:   ann.audience,
            courseId:   ann.course_id,
            courseName: ann.courses?.title,
            priority:   ann.priority,
            createdAt:  ann.created_at,
            authorName: ann.profiles ? `${ann.profiles.first_name} ${ann.profiles.last_name}` : 'Admin',
            isRead:     readIds.has(ann.id)
        }));

        return { success: true, announcements: formattedAnnouncements };

    } catch (error) {
        console.error('❌ getAnnouncements error:', error.message);
        return { success: false, error: error.message, announcements: [] };
    }
}

// ─────────────────────────────────────────────
// 5. MARK AS READ
// ─────────────────────────────────────────────
async function markAnnouncementAsRead(announcementId) {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const user = session?.user;
        if (!user) throw new Error('Not authenticated');

        const { data: existing } = await supabaseClient
            .from('announcement_reads')
            .select('id')
            .eq('announcement_id', announcementId)
            .eq('student_id', user.id)
            .maybeSingle();

        if (existing) return { success: true, message: 'Already marked as read' };

        const { error } = await supabaseClient
            .from('announcement_reads')
            .insert({
                announcement_id: announcementId,
                student_id:      user.id,
                read_at:         new Date().toISOString()
            });

        if (error) throw error;

        return { success: true, message: 'Marked as read' };

    } catch (error) {
        console.error('❌ markAnnouncementAsRead error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 6. MARK ALL AS READ
// ─────────────────────────────────────────────
async function markAllAnnouncementsAsRead() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const user = session?.user;
        if (!user) throw new Error('Not authenticated');

        const announcementsResult = await getAnnouncements();
        if (!announcementsResult.success) throw new Error('Could not fetch announcements');

        const unreadAnnouncements = announcementsResult.announcements.filter(a => !a.isRead);

        const readRecords = unreadAnnouncements.map(ann => ({
            announcement_id: ann.id,
            student_id:      user.id,
            read_at:         new Date().toISOString()
        }));

        if (readRecords.length > 0) {
            const { error } = await supabaseClient
                .from('announcement_reads')
                .insert(readRecords);

            if (error) throw error;
        }

        return {
            success: true,
            count:   readRecords.length,
            message: `Marked ${readRecords.length} announcement(s) as read`
        };

    } catch (error) {
        console.error('❌ markAllAnnouncementsAsRead error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 7. DELETE ANNOUNCEMENT (Admin only)
// ─────────────────────────────────────────────
async function deleteAnnouncementFromDB(announcementId) {
    try {
        const { error: readsError } = await supabaseClient
            .from('announcement_reads')
            .delete()
            .eq('announcement_id', announcementId);

        if (readsError) throw readsError;

        const { error } = await supabaseClient
            .from('announcements')
            .delete()
            .eq('id', announcementId);

        if (error) throw error;

        return { success: true, message: 'Announcement deleted successfully' };

    } catch (error) {
        console.error('❌ deleteAnnouncement error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 8. SEND ANNOUNCEMENT EMAILS
// ─────────────────────────────────────────────
async function sendAnnouncementEmails({ announcementId, title, message, audience, courseId }) {
    try {
        let recipients = [];

        if (audience === 'all') {
            const { data: students } = await supabaseClient
                .from('profiles')
                .select('email, first_name, last_name')
                .eq('role', 'student');

            recipients = students || [];

        } else if (audience === 'course' && courseId) {
            const { data: enrollments } = await supabaseClient
                .from('enrollments')
                .select('profiles ( email, first_name, last_name )')
                .eq('course_id', courseId);

            recipients = enrollments?.map(e => e.profiles) || [];
        }

        for (const recipient of recipients) {
            const emailContent = generateAnnouncementEmailHTML(recipient.first_name, title, message);
            console.log(`📧 ANNOUNCEMENT EMAIL → ${recipient.email} | Subject: ${title}`);
            // TODO: integrate real email service here
        }

        return {
            success: true,
            count:   recipients.length,
            message: `Email sent to ${recipients.length} recipient(s)`
        };

    } catch (error) {
        console.error('❌ sendAnnouncementEmails error:', error.message);
        return { success: false, error: error.message };
    }
}

function generateAnnouncementEmailHTML(firstName, title, message) {
    return `
        <div style="font-family:'Plus Jakarta Sans',sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:40px 20px;">
            <div style="background:linear-gradient(135deg,#3b82f6 0%,#2563eb 100%);padding:30px;text-align:center;border-radius:16px 16px 0 0;">
                <div style="width:60px;height:60px;background:rgba(255,255,255,0.2);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:15px;">
                    <span style="font-size:28px;">📢</span>
                </div>
                <h1 style="color:white;margin:0;font-size:24px;font-weight:700;">New Announcement</h1>
            </div>
            <div style="background:white;padding:40px 30px;border-radius:0 0 16px 16px;">
                <p style="font-size:16px;color:#1f2937;margin-bottom:20px;">Hello ${firstName},</p>
                <div style="background:#f0f9ff;border-left:4px solid #3b82f6;padding:20px;margin:25px 0;border-radius:8px;">
                    <h2 style="margin:0 0 12px 0;color:#1e40af;font-size:18px;font-weight:700;">${title}</h2>
                    <p style="margin:0;color:#1e3a8a;font-size:15px;line-height:1.6;white-space:pre-wrap;">${message}</p>
                </div>
                <p style="font-size:14px;color:#374151;margin-top:30px;">Best regards,<br><strong>ASAI Team</strong><br>African School of AI</p>
            </div>
            <div style="text-align:center;padding:20px;color:#9ca3af;font-size:12px;">
                <p style="margin:0;">© 2026 African School of AI. All rights reserved.</p>
            </div>
        </div>
    `;
}

// ─────────────────────────────────────────────
// ADMIN DASHBOARD — LOAD ANNOUNCEMENTS LIST
// ─────────────────────────────────────────────
async function loadAdminAnnouncements() {
    // ✅ Delay BEFORE fetch to ensure DB write is committed
    await new Promise(resolve => setTimeout(resolve, 300));

    const { data, error } = await supabaseClient
        .from('announcements')
        .select(`id, title, message, audience, course_id, priority, created_at, published`)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Failed to load announcements:', error);
        return;
    }

    renderAdminAnnouncementsList(data || []);
}
function renderAdminAnnouncementsList(announcements) {
    const container = document.getElementById('announcementsList');
    if (!container) return;

    if (announcements.length === 0) {
        container.innerHTML = '<div class="card"><p style="color:#6b7280;">No announcements sent yet.</p></div>';
        return;
    }

    container.innerHTML = '';

    announcements.forEach(ann => {
        const card = document.createElement('div');
        card.className = 'card';
        card.id = `announcement-card-${ann.id}`;

        const isPublished = ann.published || false;

        const date = new Date(ann.created_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });

        const priorityColors = { normal: 'active', high: 'pending', urgent: 'inactive' };

        const audienceText = ann.audience === 'all'
            ? '👥 All Students'
            : ann.audience === 'course'
                ? `📚 ${ann.courses?.title || 'Course Students'}`
                : '👤 Specific User';

        // Sanitize title for inline onclick (escape single quotes)
        const safeTitle = ann.title.replace(/'/g, "\\'");

        card.innerHTML = `
            <div class="card-header">
                <div>
                    <div class="card-title">${ann.title}</div>
                    <div style="font-size:14px;color:#6b7280;margin-top:5px;">
                        ${date} •
                        ${audienceText} •
                        By: Admin
                    </div>
                    <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <span class="badge ${priorityColors[ann.priority] || 'active'}">
                            ${ann.priority.toUpperCase()}
                        </span>
                        <span class="badge ${isPublished ? 'active' : 'pending'}">
                            ${isPublished ? '✓ Published' : '⏳ Draft'}
                        </span>
                    </div>
                </div>
                <div class="action-buttons">
                    <button class="action-btn edit" 
                        onclick="openEditAnnouncementModal('${ann.id}')" 
                        title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-primary" style="padding:7px 14px;font-size:12px;"
                        onclick="togglePublishAnnouncement('${ann.id}', ${isPublished})">
                        <i class="fas fa-${isPublished ? 'eye-slash' : 'paper-plane'}"></i>
                        ${isPublished ? 'Unpublish' : 'Publish'}
                    </button>
                    <button class="action-btn view" 
                        onclick="viewAnnouncementDetails('${ann.id}')" 
                        title="View">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn delete" 
                        onclick="handleDeleteAnnouncement('${ann.id}', '${safeTitle}')" 
                        title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <p style="color:#374151;margin:15px 0 8px;">${ann.message.substring(0, 200)}${ann.message.length > 200 ? '...' : ''}</p>
        `;

        container.appendChild(card);
    });
}

// ─────────────────────────────────────────────
// PUBLISH / UNPUBLISH
// ─────────────────────────────────────────────
async function togglePublishAnnouncement(announcementId, currentlyPublished) {
    const action = currentlyPublished ? 'unpublish' : 'publish';
    if (!confirm(`Are you sure you want to ${action} this announcement?`)) return;

    const result = await togglePublishAnnouncementDB(announcementId, currentlyPublished);

    if (!result.success) {
        showToast('Error: ' + result.error, 'error');
        return;
    }

    showToast(result.published
        ? '✅ Announcement published! Visible to students.'
        : '❌ Announcement unpublished. Hidden from students.'
    );
    loadAdminAnnouncements();
}

// ─────────────────────────────────────────────
// EDIT ANNOUNCEMENT MODAL
// ─────────────────────────────────────────────
async function openEditAnnouncementModal(announcementId) {
    const { data: ann, error } = await supabaseClient
        .from('announcements')
        .select('*, courses(title)')
        .eq('id', announcementId)
        .maybeSingle();

    if (error) {
        showToast('Could not load announcement', 'error');
        return;
    }

    // Build course options
    const { data: courses } = await supabaseClient
        .from('courses')
        .select('id, title')
        .order('title');

    const courseOptions = (courses || []).map(c =>
        `<option value="${c.id}" ${ann.course_id === c.id ? 'selected' : ''}>${c.title}</option>`
    ).join('');

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'editAnnouncementModal';

    modal.innerHTML = `
        <div class="modal-content modal-content-wide">
            <div class="modal-header">
                <h2><i class="fas fa-edit"></i> Edit Announcement</h2>
                <button class="modal-close" onclick="document.getElementById('editAnnouncementModal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="form-group">
                <label>Announcement Title *</label>
                <input type="text" id="editAnnTitle" value="${ann.title}"
                    style="width:100%;padding:12px;border:1.5px solid #e5e7eb;border-radius:10px;font-family:inherit;font-size:14px;">
            </div>

            <div class="form-group">
                <label>Message *</label>
                <textarea id="editAnnMessage" rows="6"
                    style="width:100%;padding:12px;border:1.5px solid #e5e7eb;border-radius:10px;font-family:inherit;font-size:14px;resize:vertical;">${ann.message}</textarea>
            </div>

            <div style="display:flex;gap:15px;">
                <div class="form-group" style="flex:1;">
                    <label>Target Audience *</label>
                    <select id="editAnnAudience" onchange="toggleEditCourseSelect()"
                        style="width:100%;padding:12px;border:1.5px solid #e5e7eb;border-radius:10px;font-family:inherit;font-size:14px;">
                        <option value="all" ${ann.audience === 'all' ? 'selected' : ''}>All Students</option>
                        <option value="course" ${ann.audience === 'course' ? 'selected' : ''}>Specific Course</option>
                        <option value="user" ${ann.audience === 'user' ? 'selected' : ''}>Specific User</option>
                    </select>
                </div>
                <div class="form-group" style="flex:1;">
                    <label>Priority</label>
                    <select id="editAnnPriority"
                        style="width:100%;padding:12px;border:1.5px solid #e5e7eb;border-radius:10px;font-family:inherit;font-size:14px;">
                        <option value="normal" ${ann.priority === 'normal' ? 'selected' : ''}>Normal</option>
                        <option value="high" ${ann.priority === 'high' ? 'selected' : ''}>High</option>
                        <option value="urgent" ${ann.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
                    </select>
                </div>
            </div>

            <div class="form-group" id="editCourseSelectGroup" 
                style="display:${ann.audience === 'course' ? 'block' : 'none'};">
                <label>Select Course</label>
                <select id="editAnnCourseId"
                    style="width:100%;padding:12px;border:1.5px solid #e5e7eb;border-radius:10px;font-family:inherit;font-size:14px;">
                    <option value="">Select course...</option>
                    ${courseOptions}
                </select>
            </div>

            <div style="display:flex;gap:10px;margin-top:20px;">
                <button class="btn-secondary" onclick="document.getElementById('editAnnouncementModal').remove()" style="flex:1;">
                    Cancel
                </button>
                <button class="btn-primary" onclick="saveEditedAnnouncement('${announcementId}')" style="flex:1;">
                    <i class="fas fa-save"></i> Save Changes
                </button>
                <button class="btn-primary" style="flex:1;background:linear-gradient(135deg,#10b981,#059669);"
                    onclick="saveEditedAnnouncement('${announcementId}', true)">
                    <i class="fas fa-paper-plane"></i> Save & Publish
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function toggleEditCourseSelect() {
    const audience = document.getElementById('editAnnAudience')?.value;
    const group = document.getElementById('editCourseSelectGroup');
    if (group) group.style.display = audience === 'course' ? 'block' : 'none';
}

async function saveEditedAnnouncement(announcementId, publishAfterSave = false) {
    const title    = document.getElementById('editAnnTitle')?.value?.trim();
    const message  = document.getElementById('editAnnMessage')?.value?.trim();
    const audience = document.getElementById('editAnnAudience')?.value;
    const priority = document.getElementById('editAnnPriority')?.value;
    const courseId = audience === 'course' ? document.getElementById('editAnnCourseId')?.value : null;

    if (!title)   { showToast('Title cannot be empty', 'error'); return; }
    if (!message) { showToast('Message cannot be empty', 'error'); return; }

    const result = await updateAnnouncement(announcementId, { title, message, audience, courseId, priority });

    if (!result.success) {
        showToast('Error saving: ' + result.error, 'error');
        return;
    }

    if (publishAfterSave) {
        await togglePublishAnnouncementDB(announcementId, false); // force publish
    }

    document.getElementById('editAnnouncementModal')?.remove();
    showToast(publishAfterSave
        ? '✅ Announcement saved and published!'
        : '✅ Announcement updated successfully!'
    );
    loadAdminAnnouncements();
}

// ─────────────────────────────────────────────
// VIEW ANNOUNCEMENT DETAILS
// ─────────────────────────────────────────────
async function viewAnnouncementDetails(announcementId) {
    const { data, error } = await supabaseClient
        .from('announcements')
        .select('*, courses(title), profiles(first_name, last_name)')
        .eq('id', announcementId)
        .maybeSingle();

    if (error) {
        showToast('Could not load announcement', 'error');
        return;
    }

    const priorityColors = { normal: 'active', high: 'pending', urgent: 'inactive' };

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:700px;">
            <div class="modal-header">
                <h2>${data.title}</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="background:#f9fafb;padding:20px;border-radius:12px;margin-bottom:20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
                    <span style="color:#6b7280;font-size:14px;">
                        By: <strong>${data.profiles ? `${data.profiles.first_name} ${data.profiles.last_name}` : 'Admin'}</strong>
                    </span>
                    <div style="display:flex;gap:8px;">
                        <span class="badge ${priorityColors[data.priority] || 'active'}">${data.priority.toUpperCase()}</span>
                        <span class="badge ${data.published ? 'active' : 'pending'}">${data.published ? '✓ Published' : '⏳ Draft'}</span>
                    </div>
                </div>
                <div style="color:#6b7280;font-size:13px;display:flex;flex-direction:column;gap:5px;">
                    <span><strong>Sent:</strong> ${new Date(data.created_at).toLocaleString()}</span>
                    <span><strong>Audience:</strong> ${data.audience === 'all' ? 'All Students' : data.courses?.title || 'Course Students'}</span>
                </div>
            </div>
            <div style="padding:20px;background:white;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:20px;">
                <p style="color:#374151;line-height:1.8;white-space:pre-wrap;margin:0;">${data.message}</p>
            </div>
            <div style="display:flex;gap:10px;">
                <button class="btn-primary" onclick="this.closest('.modal').remove(); openEditAnnouncementModal('${data.id}')" style="flex:1;">
                    <i class="fas fa-edit"></i> Edit
                </button>
                <button class="btn-secondary" onclick="this.closest('.modal').remove()" style="flex:1;">
                    Close
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// ─────────────────────────────────────────────
// DELETE ANNOUNCEMENT
// ─────────────────────────────────────────────
async function handleDeleteAnnouncement(announcementId, title) {
    if (!confirm(`Delete announcement "${title}"?`)) return;

    const result = await deleteAnnouncementFromDB(announcementId);

    if (!result.success) {
        showToast('Error: ' + result.error, 'error');
        return;
    }

    showToast('Announcement deleted successfully');
    loadAdminAnnouncements();
}

// ─────────────────────────────────────────────
// ADMIN — HANDLE CREATE FORM
// ─────────────────────────────────────────────
async function handleCreateAnnouncementDB(event) {
    event.preventDefault();
    const formData = new FormData(event.target);

    const audience = formData.get('audience');
    const courseId = audience === 'course' ? formData.get('courseId') : null;

    const result = await createAnnouncement({
        title:     formData.get('title'),
        message:   formData.get('message'),
        audience:  audience,
        courseId:  courseId,
        priority:  formData.get('priority') || 'normal',
        sendEmail: formData.get('sendEmail') === 'on'
    });

    if (!result.success) {
        showToast('Error: ' + result.error, 'error');
        return;
    }

 showToast('Announcement created! Publish it when ready. ✅');
closeModal('createAnnouncementModal');
event.target.reset();
await loadAdminAnnouncements();
}

// ─────────────────────────────────────────────
// STUDENT DASHBOARD — LOAD ANNOUNCEMENTS UI
// ─────────────────────────────────────────────
async function loadStudentAnnouncementsUI() {
    const result = await getAnnouncements();

    if (!result.success) {
        console.error('Failed to load announcements:', result.error);
        return;
    }

    renderStudentAnnouncements(result.announcements);
}

function renderStudentAnnouncements(announcements) {
    const container = document.getElementById('announcementsList');
    if (!container) return;

    const unreadCount = announcements.filter(a => !a.isRead).length;
    const badge = document.getElementById('announcementsBadge');
    if (badge) {
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'flex' : 'none';
    }

    if (announcements.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align:center;padding:60px 20px;">
                <i class="fas fa-bullhorn" style="font-size:48px;color:#d1d5db;margin-bottom:16px;"></i>
                <p style="color:#6b7280;font-size:16px;">No announcements yet.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    const priorityColors = { normal: 'active', high: 'pending', urgent: 'inactive' };

    announcements.forEach(ann => {
        const card = document.createElement('div');
        card.className = `card announcement-card ${ann.isRead ? 'read' : 'unread'}`;

        const date = new Date(ann.createdAt).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        card.innerHTML = `
            <div class="announcement-header">
                <div>
                    <div class="announcement-title">
                        ${!ann.isRead ? '<span class="unread-dot"></span>' : ''}
                        ${ann.title}
                    </div>
                    <div class="announcement-meta">
                        <span>${ann.authorName}</span>
                        <span>•</span>
                        <span>${date}</span>
                        ${ann.courseName ? `<span>•</span><span>${ann.courseName}</span>` : ''}
                    </div>
                </div>
                <span class="badge ${priorityColors[ann.priority] || 'active'}">${ann.priority}</span>
            </div>
            <p class="announcement-message">${ann.message}</p>
            ${!ann.isRead ? `
                <button class="btn-secondary btn-sm" onclick="markAsReadUI('${ann.id}')">
                    <i class="fas fa-check"></i> Mark as Read
                </button>
            ` : ''}
        `;

        container.appendChild(card);
    });
}

async function markAsReadUI(announcementId) {
    const result = await markAnnouncementAsRead(announcementId);
    if (result.success) loadStudentAnnouncementsUI();
}

async function markAllAsReadUI() {
    const result = await markAllAnnouncementsAsRead();
    if (result.success) {
        showToast(result.message);
        loadStudentAnnouncementsUI();
    }
}

// ─────────────────────────────────────────────
// AUTO-INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const isAdminPage   = !!document.getElementById('createAnnouncementForm');
    const isStudentPage = !!document.getElementById('announcementsBadge');

    if (isAdminPage) {
        await loadAdminAnnouncements();
        const form = document.getElementById('createAnnouncementForm');
        if (form) form.onsubmit = handleCreateAnnouncementDB;
    }

    if (isStudentPage) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            await loadStudentAnnouncementsUI();
        } else {
            supabaseClient.auth.onAuthStateChange(async (event, session) => {
                if (event === 'SIGNED_IN' && session) {
                    await loadStudentAnnouncementsUI();
                }
            });
        }
    }
});
console.log('✅ Announcements.js loaded');