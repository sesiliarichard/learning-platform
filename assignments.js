// ============================================
// ASAI — ASSIGNMENTS.JS  (FINAL COMPLETE VERSION)
// ============================================

// ─────────────────────────────────────────────
// 1. CREATE ASSIGNMENT (Admin only)
// ─────────────────────────────────────────────
async function createAssignment({ title, courseId, instructions, dueDate, maxPoints, submissionType }) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        if (!title?.trim())        throw new Error('Assignment title is required');
        if (!courseId)             throw new Error('Course is required');
        if (!instructions ||      instructions.replace(/<[^>]*>/g, '').trim() === '') throw new Error('Instructions are required');
        if (!dueDate)              throw new Error('Due date is required');

        const { data, error } = await supabaseClient
            .from('assignments')
            .insert({
                course_id:       courseId,
                title:           title.trim(),
                instructions:    instructions.trim(),
                due_date:        dueDate,
                max_points:      maxPoints || 100,
                submission_type: submissionType || 'file',
                created_by:      user.id,
                created_at:      new Date().toISOString()
            })
            .select()
            .maybeSingle();

        if (error) throw error;

        return { success: true, assignment: data, message: 'Assignment created successfully!' };

    } catch (error) {
        console.error('❌ createAssignment error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 2. GET ASSIGNMENTS FOR A COURSE
// ─────────────────────────────────────────────
async function getCourseAssignments(courseId) {
    try {
        const { data: authData, error: authError } = await supabaseClient
            .auth.getUser();

        if (authError || !authData?.user) {
            return { success: false, error: 'Not authenticated', assignments: [] };
        }

        const userId = authData.user.id;

        if (!courseId) {
            return { success: false, error: 'Course ID missing', assignments: [] };
        }

        // ── Fetch assignments ──────────────────────────────
        const { data, error } = await supabaseClient
            .from('assignments')
            .select('*')
            .eq('course_id', courseId)
            .eq('published', true)
            .order('due_date', { ascending: true });

        if (error) throw error;
        if (!data || data.length === 0) return { success: true, assignments: [] };

        // ── Fetch ALL submissions in ONE query ─────────────
        const assignmentIds = data.map(a => a.id);

        const { data: allSubs } = await supabaseClient
            .from('assignment_submissions')
            .select('id, assignment_id, submitted_at, score, graded_at, grade')
            .eq('student_id', userId)
            .in('assignment_id', assignmentIds);

        // Build a map for quick lookup
        const subsMap = {};
        (allSubs || []).forEach(sub => {
            subsMap[sub.assignment_id] = sub;
        });

        // ── Merge assignments with their submission ────────
        const assignments = data.map(assignment => {
            const submission = subsMap[assignment.id] || null;
            return {
                ...assignment,
                isSubmitted: !!submission,
                submission:  submission
            };
        });

        return { success: true, assignments };

    } catch (error) {
        console.error('❌ getCourseAssignments error:', error.message);
        return { success: false, error: error.message, assignments: [] };
    }
}
// ─────────────────────────────────────────────
// 3. SUBMIT ASSIGNMENT
// ─────────────────────────────────────────────
async function submitAssignment(assignmentId, { fileUrl, textResponse }) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data: existing } = await supabaseClient
            .from('assignment_submissions')
            .select('id')
            .eq('assignment_id', assignmentId)
            .eq('student_id', user.id)
            .maybeSingle();

        if (existing) {
            return { success: false, error: 'You have already submitted this assignment' };
        }

        const { data: assignment } = await supabaseClient
            .from('assignments')
            .select('course_id, max_points')
            .eq('id', assignmentId)
            .maybeSingle();

        if (!assignment) throw new Error('Assignment not found');

        const { data, error } = await supabaseClient
            .from('assignment_submissions')
            .insert({
                student_id:    user.id,
                assignment_id: assignmentId,
                course_id:     assignment.course_id,
                file_url:      fileUrl || null,
                text_response: textResponse || null,
                max_score:     assignment.max_points,
                submitted_at:  new Date().toISOString()
            })
            .select()
            .maybeSingle();

        if (error) throw error;

        return { success: true, submission: data, message: 'Assignment submitted successfully!' };

    } catch (error) {
        console.error('❌ submitAssignment error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 4. UPLOAD ASSIGNMENT FILE
// ─────────────────────────────────────────────
async function uploadAssignmentFile(file, assignmentId) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        if (!file) throw new Error('No file selected');
        if (file.size > 10 * 1024 * 1024) throw new Error('File must be under 10MB');

        const fileExt  = file.name.split('.').pop().toLowerCase();
        const fileName = `${user.id}/${assignmentId}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabaseClient.storage
            .from('assignments')
            .upload(fileName, file, { upsert: false, contentType: file.type });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabaseClient.storage
            .from('assignments')
            .getPublicUrl(fileName);

        return { success: true, fileUrl: urlData.publicUrl, message: 'File uploaded successfully!' };

    } catch (error) {
        console.error('❌ uploadAssignmentFile error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 5. GRADE ASSIGNMENT (Admin only)
// ─────────────────────────────────────────────
async function gradeAssignment(submissionId, { score, grade, feedback }) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabaseClient
            .from('assignment_submissions')
            .update({
                score:     score,
                grade:     grade || calculateLetterGrade(score),
                feedback:  feedback || '',
                graded_at: new Date().toISOString()
            })
            .eq('id', submissionId)
            .select()
            .maybeSingle();

        if (error) throw error;
        return { success: true, submission: data, message: 'Assignment graded successfully!' };

    } catch (error) {
        console.error('❌ gradeAssignment error:', error.message);
        return { success: false, error: error.message };
    }
}

function calculateLetterGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
}

// ─────────────────────────────────────────────
// 6. GET ASSIGNMENT FEEDBACK
// ─────────────────────────────────────────────
async function getAssignmentFeedback(assignmentId, studentId = null) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const id = studentId || user.id;

        const { data, error } = await supabaseClient
            .from('assignment_submissions')
            .select(`
                id, score, grade, feedback, file_url, text_response,
                submitted_at, graded_at, max_score,
                assignments (title, instructions, max_points)
            `)
            .eq('assignment_id', assignmentId)
            .eq('student_id', id)
            .maybeSingle();

        if (error) throw error;
        return { success: true, feedback: data };

    } catch (error) {
        console.error('❌ getAssignmentFeedback error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 7. GET ALL ASSIGNMENT SUBMISSIONS (Admin only)
// ─────────────────────────────────────────────
async function getAllAssignmentSubmissions() {
    try {
        const { data, error } = await supabaseClient
            .from('assignment_submissions')
            .select(`
                id, score, grade, submitted_at, graded_at, file_url,
                profiles (first_name, last_name, email),
                assignments (title, due_date, max_points, courses (title))
            `)
            .order('submitted_at', { ascending: false });

        if (error) throw error;

        const submissions = (data || []).map(sub => ({
            id:              sub.id,
            studentName:     `${sub.profiles.first_name} ${sub.profiles.last_name}`,
            studentEmail:    sub.profiles.email,
            assignmentTitle: sub.assignments.title,
            courseTitle:     sub.assignments.courses?.title || 'Unknown',
            score:           sub.score,
            grade:           sub.grade,
            maxPoints:       sub.assignments.max_points,
            submittedAt:     sub.submitted_at,
            gradedAt:        sub.graded_at,
            fileUrl:         sub.file_url,
            isGraded:        !!sub.graded_at
        }));

        return { success: true, submissions };

    } catch (error) {
        console.error('❌ getAllAssignmentSubmissions error:', error.message);
        return { success: false, error: error.message, submissions: [] };
    }
}

// ─────────────────────────────────────────────
// 8. DELETE ASSIGNMENT (Admin only)
// ─────────────────────────────────────────────
async function deleteAssignmentFromDB(assignmentId) {
    try {
        const { error: submissionsError } = await supabaseClient
            .from('assignment_submissions').delete().eq('assignment_id', assignmentId);
        if (submissionsError) throw submissionsError;

        const { error: assignmentError } = await supabaseClient
            .from('assignments').delete().eq('id', assignmentId);
        if (assignmentError) throw assignmentError;

        return { success: true, message: 'Assignment deleted successfully!' };

    } catch (error) {
        console.error('❌ deleteAssignment error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// ADMIN — LOAD ASSIGNMENTS LIST
// ─────────────────────────────────────────────
async function loadAdminAssignments() {
    const { data, error } = await supabaseClient
        .from('assignments')
        .select(`id, title, due_date, max_points, submission_type, published, created_at, courses (title)`)
        .order('created_at', { ascending: false });

    if (error) { console.error('Failed to load assignments:', error); return; }
    renderAdminAssignmentsList(data || []);
}

function renderAdminAssignmentsList(assignments) {
    const container = document.getElementById('assignmentsList');
    if (!container) return;

    if (assignments.length === 0) {
        container.innerHTML = '<div class="card"><p style="color:#6b7280;">No assignments created yet.</p></div>';
        return;
    }

    container.innerHTML = '';

    assignments.forEach(assignment => {
        const isPublished = assignment.published || false;
        const card = document.createElement('div');
        card.className = 'card';
        card.id = `assignment-card-${assignment.id}`;

        const dueDate = new Date(assignment.due_date).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });

        card.innerHTML = `
            <div class="card-header">
                <div>
                    <div class="card-title">${assignment.title}</div>
                    <div style="font-size:14px;color:#6b7280;margin-top:5px;">
                        ${assignment.courses?.title || 'Unknown Course'} •
                        Due: ${dueDate} •
                        ${assignment.max_points} points
                    </div>
                    <span class="badge ${isPublished ? 'active' : 'pending'}" style="margin-top:6px;display:inline-block;">
                        ${isPublished ? '✓ Published' : '⏳ Unpublished'}
                    </span>
                </div>
                <div class="action-buttons">
                    <button class="action-btn edit" onclick="openEditAssignmentModal('${assignment.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-primary" style="padding:7px 14px;font-size:12px;"
                        onclick="togglePublishAssignment('${assignment.id}', ${isPublished})">
                        <i class="fas fa-${isPublished ? 'eye-slash' : 'paper-plane'}"></i>
                        ${isPublished ? 'Unpublish' : 'Publish'}
                    </button>
                    <button class="action-btn delete" onclick="handleDeleteAssignment('${assignment.id}', '${assignment.title.replace(/'/g, "\\'")}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>`;
        container.appendChild(card);
    });
}

async function togglePublishAssignment(assignmentId, currentlyPublished) {
    const newStatus = !currentlyPublished;
    if (!confirm(`Are you sure you want to ${newStatus ? 'publish' : 'unpublish'} this assignment?`)) return;

    const { error } = await supabaseClient.from('assignments').update({ published: newStatus }).eq('id', assignmentId);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }

    showToast(newStatus ? '✅ Assignment published!' : '❌ Assignment unpublished.');
    loadAdminAssignments();
}

async function openEditAssignmentModal(assignmentId) {
    const { data: assignment, error } = await supabaseClient
        .from('assignments').select('*').eq('id', assignmentId).maybeSingle();

    if (error) { showToast('Could not load assignment', 'error'); return; }

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'editAssignmentModal';

    modal.innerHTML = `
        <div class="modal-content modal-content-wide">
            <div class="modal-header">
                <h2><i class="fas fa-edit"></i> Edit Assignment</h2>
                <button class="modal-close" onclick="document.getElementById('editAssignmentModal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="form-group">
                <label>Assignment Title *</label>
                <input type="text" id="editAssignmentTitle" value="${assignment.title}"
                    style="width:100%;padding:12px;border:1.5px solid #e5e7eb;border-radius:10px;font-family:inherit;font-size:14px;">
            </div>
            <div class="form-group">
                <label>Instructions *</label>
                <textarea id="editAssignmentInstructions" rows="6"
                    style="width:100%;padding:12px;border:1.5px solid #e5e7eb;border-radius:10px;font-family:inherit;font-size:14px;">${assignment.instructions}</textarea>
            </div>
            <div style="display:flex;gap:15px;">
                <div class="form-group" style="flex:1;">
                    <label>Due Date *</label>
                    <input type="date" id="editAssignmentDueDate" value="${assignment.due_date?.split('T')[0] || ''}"
                        style="width:100%;padding:12px;border:1.5px solid #e5e7eb;border-radius:10px;font-family:inherit;font-size:14px;">
                </div>
                <div class="form-group" style="flex:1;">
                    <label>Max Points</label>
                    <input type="number" id="editAssignmentMaxPoints" value="${assignment.max_points || 100}" min="1"
                        style="width:100%;padding:12px;border:1.5px solid #e5e7eb;border-radius:10px;font-family:inherit;font-size:14px;">
                </div>
            </div>
            <div class="form-group">
                <label>Submission Type</label>
                <select id="editAssignmentSubmissionType"
                    style="width:100%;padding:12px;border:1.5px solid #e5e7eb;border-radius:10px;font-family:inherit;font-size:14px;">
                    <option value="file" ${assignment.submission_type === 'file' ? 'selected' : ''}>File Upload</option>
                    <option value="text" ${assignment.submission_type === 'text' ? 'selected' : ''}>Text Response</option>
                    <option value="both" ${assignment.submission_type === 'both' ? 'selected' : ''}>Both</option>
                </select>
            </div>
            <div style="display:flex;gap:10px;margin-top:20px;">
                <button class="btn-secondary" onclick="document.getElementById('editAssignmentModal').remove()" style="flex:1;">Cancel</button>
                <button class="btn-primary" onclick="saveEditedAssignment('${assignmentId}')" style="flex:1;">
                    <i class="fas fa-save"></i> Save Changes
                </button>
                <button class="btn-primary" style="flex:1;background:linear-gradient(135deg,#10b981,#059669);"
                    onclick="saveEditedAssignment('${assignmentId}', true)">
                    <i class="fas fa-paper-plane"></i> Save & Publish
                </button>
            </div>
        </div>`;

    document.body.appendChild(modal);
}

async function saveEditedAssignment(assignmentId, publishAfterSave = false) {
    const title        = document.getElementById('editAssignmentTitle')?.value?.trim();
    const instructions = document.getElementById('editAssignmentInstructions')?.value?.trim();
    const dueDate      = document.getElementById('editAssignmentDueDate')?.value;
    const maxPoints    = parseInt(document.getElementById('editAssignmentMaxPoints')?.value) || 100;
    const subType      = document.getElementById('editAssignmentSubmissionType')?.value;

    if (!title)        { showToast('Title cannot be empty', 'error'); return; }
    if (!instructions) { showToast('Instructions cannot be empty', 'error'); return; }
    if (!dueDate)      { showToast('Due date is required', 'error'); return; }

    const updateData = { title, instructions, due_date: dueDate, max_points: maxPoints, submission_type: subType };
    if (publishAfterSave) updateData.published = true;

    const { error } = await supabaseClient.from('assignments').update(updateData).eq('id', assignmentId);
    if (error) { showToast('Error saving: ' + error.message, 'error'); return; }

    document.getElementById('editAssignmentModal')?.remove();
    showToast(publishAfterSave ? '✅ Assignment saved and published!' : '✅ Assignment updated successfully!');
    loadAdminAssignments();
}

async function handleDeleteAssignment(assignmentId, title) {
    if (!confirm(`Delete assignment "${title}"?`)) return;
    const result = await deleteAssignmentFromDB(assignmentId);
    if (!result.success) { showToast('Error: ' + result.error, 'error'); return; }
    showToast('Assignment deleted successfully');
    loadAdminAssignments();
}

async function handleCreateAssignmentDB(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    
    // Get is_coding checkbox value
    const isCoding = document.getElementById('assignmentIsCoding')?.checked || false;

    const result = await createAssignment({
        title:          formData.get('title'),
        courseId:       formData.get('courseId'),
       instructions:   document.getElementById('assignInstr')?.innerHTML?.trim() || '',
        dueDate:        formData.get('dueDate'),
        maxPoints:      parseInt(formData.get('maxPoints')) || 100,
        submissionType: formData.get('submissionType'),
        isCoding:       isCoding  
    });

    if (!result.success) { showToast('Error: ' + result.error, 'error'); return; }

    showToast('Assignment created successfully! ✅');
    closeModal('createAssignmentModal');
    event.target.reset();
    loadAdminAssignments();
}

// ─────────────────────────────────────────────
// RENDER ASSIGNMENT CARDS IN STUDENT DASHBOARD
// ─────────────────────────────────────────────
async function loadCourseAssignmentsUI(courseId) {
    const container = document.getElementById('courseAssignmentsGrid');

    if (container) {
        container.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:40px;color:#9ca3af;">
                <i class="fas fa-spinner fa-spin" style="font-size:28px;color:#10b981;
                   display:block;margin-bottom:12px;"></i>
                Loading assignments...
            </div>`;
    }

    const result = await getCourseAssignments(courseId);

    console.log('Assignments result:', result);

    if (!result.success) {
        if (container) {
            container.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:40px;color:#ef4444;">
                    <i class="fas fa-exclamation-circle" style="font-size:28px;
                       display:block;margin-bottom:12px;"></i>
                    Error loading assignments: ${result.error}
                </div>`;
        }
        return;
    }

    console.log('Assignments to render:', result.assignments.length);
    renderAssignmentsInUI(result.assignments);
}

function renderAssignmentsInUI(assignments) {
    const container = document.getElementById('courseAssignmentsGrid') || document.getElementById('assignmentsList');
    if (!container) return;

    if (assignments.length === 0) {
        container.innerHTML = `
            <div class="course-empty-state" style="grid-column:1/-1">
                <i class="fas fa-tasks"></i>
                <h3>No assignments yet</h3>
                <p>Your instructor hasn't posted assignments for this course yet.</p>
            </div>`;
        return;
    }

    container.innerHTML = '';

    assignments.forEach(assignment => {
        const courseId   = window.currentCourseId || window.currentCourse || '';
        const courseName = (window.coursesData && window.coursesData[courseId]?.title) || 'Course';

        const dueDate   = new Date(assignment.due_date);
        const now       = new Date();
        const diffHours = (dueDate - now) / 3600000;

        let status = 'due';
        if (assignment.submission?.graded_at)  status = 'graded';
        else if (assignment.isSubmitted)        status = 'submitted';
        else if (diffHours < 0)                 status = 'late';
        else if (diffHours < 24)                status = 'urgent';

        const cardVariant = {
            urgent: 'urgent-card', submitted: 'submitted-card',
            graded: 'graded-card', late: 'urgent-card'
        }[status] || '';

        const statusMap = {
            due:       { text: 'Due Soon',   icon: 'fa-clock',              cls: 'due'       },
            urgent:    { text: 'Due Today!', icon: 'fa-exclamation-circle', cls: 'urgent'    },
            submitted: { text: 'Submitted',  icon: 'fa-check-circle',       cls: 'submitted' },
            graded:    { text: 'Graded',     icon: 'fa-star',               cls: 'graded'    },
            late:      { text: 'Late',       icon: 'fa-times-circle',       cls: 'late'      }
        };
        const s = statusMap[status] || statusMap.due;

        const meta1 = (status === 'graded' || status === 'submitted')
            ? `<div class="assign-meta-item"><i class="fas fa-star"></i>${assignment.submission?.grade ? 'Grade: ' + assignment.submission.grade : 'Awaiting grade'}</div>`
            : `<div class="assign-meta-item"><i class="fas fa-star"></i>Points: ${assignment.max_points || '--'}</div>`;

        const dateLabel = (status === 'submitted' || status === 'graded')
            ? `Submitted: ${assignment.submission?.submitted_at
                ? new Date(assignment.submission.submitted_at).toLocaleDateString('en-US', { month:'short', day:'numeric' })
                : '—'}`
            : `Due: ${assignment.due_date
                ? new Date(assignment.due_date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
                : 'TBD'}`;

               let btnHtml = '';
        if (status === 'submitted' || status === 'graded') {
            btnHtml = `
                <button class="assignment-btn feedback-btn"
                        onclick="viewAssignmentFeedback('${assignment.id}')">
                    <i class="fas fa-comment-dots"></i>
                    ${assignment.submission?.grade ? 'Grade: ' + assignment.submission.grade + ' — ' : ''}View Feedback
                </button>`;
        } else {
            const btnCls = (status === 'urgent' || status === 'late') ? 'urgent-btn' : '';
            btnHtml = `
                <button class="assignment-btn ${btnCls}"
                        style="margin-bottom:8px;"
                        onclick="openAssignmentDetail('${assignment.id}')">
                    <i class="fas fa-eye"></i> View Assignment
                </button>
                ${assignment.is_coding ? `
                <button class="assignment-btn" style="background:#7c3aed;margin-bottom:8px;"
                        onclick="openCodingEnvironment('${assignment.id}', '${escapeHtml(assignment.instructions || 'Write code to solve this problem')}')">
                    <i class="fas fa-code"></i> Open Coding Environment
                </button>
                ` : `
                <button class="assignment-btn ${btnCls}"
                        onclick="window.submitAssignmentModal('${assignment.id}')">
                    <i class="fas fa-upload"></i>
                    ${status === 'urgent' ? 'Submit Now' : 'Submit Assignment'}
                </button>
                `}
            `;
        }

        const rawDesc = assignment.instructions || assignment.description || 'Complete this assignment to apply your learning.';
        const desc = escapeHtml(rawDesc.substring(0, 110)) + (rawDesc.length > 110 ? '…' : '');

        container.innerHTML += `
            <div class="course-assignment-card ${cardVariant}">
                <div class="assign-card-header">
                    <span class="assign-course-pill"><i class="fas fa-book"></i> ${escapeHtml(courseName)}</span>
                    <h4>${escapeHtml(assignment.title)}</h4>
                </div>
                <div class="assign-card-body">
                    <span class="assignment-status ${s.cls}">
                        <i class="fas ${s.icon}"></i> ${s.text}
                    </span>
                    <div class="assign-meta-row">
                        ${meta1}
                        <div class="assign-meta-item"><i class="fas fa-calendar-alt"></i>${dateLabel}</div>
                    </div>
                    <p class="assign-desc">${desc}</p>
                    ${btnHtml}
                </div>
            </div>`;
    });
}

// ─────────────────────────────────────────────
// VIEW ASSIGNMENT DETAIL MODAL
// ─────────────────────────────────────────────
window.openAssignmentDetail = async function(assignmentId) {
    document.getElementById('assignViewModal')?.remove();

    const loader = document.createElement('div');
    loader.id = 'assignViewModal';
    loader.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;
        justify-content:center;padding:20px;backdrop-filter:blur(5px);`;
    loader.innerHTML = `<div style="background:white;border-radius:20px;padding:40px;text-align:center;color:#6b7280;">
        <i class="fas fa-spinner fa-spin" style="font-size:28px;color:#10b981;"></i>
        <p style="margin-top:12px;font-weight:600;">Loading assignment…</p>
    </div>`;
    document.body.appendChild(loader);

    const { data: a, error } = await supabaseClient
        .from('assignments').select('*').eq('id', assignmentId).maybeSingle();

    loader.remove();

    if (error || !a) { showToast('Could not load assignment', 'error'); return; }

    const dueDate = a.due_date
        ? new Date(a.due_date).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })
        : 'No due date';

    const createdAt = a.created_at
        ? new Date(a.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
        : '';

    const now     = new Date();
    const due     = new Date(a.due_date);
    const diffHrs = (due - now) / 3600000;
    let urgencyBadge = '';
    if (diffHrs < 0)       urgencyBadge = `<span style="background:#fee2e2;color:#dc2626;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;"><i class="fas fa-times-circle"></i> Late</span>`;
    else if (diffHrs < 24) urgencyBadge = `<span style="background:#fef3c7;color:#d97706;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;"><i class="fas fa-exclamation-circle"></i> Due Today</span>`;
    else                   urgencyBadge = `<span style="background:#d1fae5;color:#065f46;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;"><i class="fas fa-clock"></i> Upcoming</span>`;

    const typeLabel = { file:'File Upload', text:'Text Response', both:'File + Text' }[a.submission_type] || 'File Upload';

    const modal = document.createElement('div');
    modal.id = 'assignViewModal';
    modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;
        justify-content:center;padding:20px;backdrop-filter:blur(5px);animation:fadeIn 0.25s ease;`;

    modal.innerHTML = `
        <div style="background:white;border-radius:24px;width:100%;max-width:680px;
                    max-height:90vh;overflow:hidden;display:flex;flex-direction:column;
                    box-shadow:0 30px 80px rgba(0,0,0,0.3);">

            <!-- Green gradient header -->
            <div style="background:linear-gradient(135deg,#10b981,#047857);
                        padding:28px 30px;color:white;flex-shrink:0;position:relative;overflow:hidden;">
                <div style="position:absolute;right:-30px;top:-30px;width:130px;height:130px;
                            border-radius:50%;background:rgba(255,255,255,0.1);"></div>
                <div style="position:relative;">
                    <div style="font-size:11px;font-weight:700;letter-spacing:2px;
                                text-transform:uppercase;opacity:0.8;margin-bottom:8px;">
                        <i class="fas fa-tasks"></i> Assignment Details
                    </div>
                    <div style="font-size:22px;font-weight:800;line-height:1.3;margin-bottom:12px;">
                        ${escapeHtml(a.title)}
                    </div>
                    <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px;opacity:0.9;">
                        <span><i class="fas fa-star"></i> ${a.max_points || 100} Points</span>
                        <span><i class="fas fa-calendar-alt"></i> Due: ${dueDate}</span>
                        <span><i class="fas fa-upload"></i> ${typeLabel}</span>
                        ${createdAt ? `<span><i class="fas fa-plus-circle"></i> Posted: ${createdAt}</span>` : ''}
                    </div>
                </div>
                <button onclick="document.getElementById('assignViewModal').remove()"
                        style="position:absolute;top:20px;right:20px;background:rgba(255,255,255,0.2);
                               border:none;color:white;width:36px;height:36px;border-radius:50%;
                               cursor:pointer;font-size:16px;display:flex;align-items:center;
                               justify-content:center;transition:background 0.2s;"
                        onmouseover="this.style.background='rgba(255,255,255,0.35)'"
                        onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <!-- Status bar -->
            <div style="background:#f0fdf4;padding:12px 30px;border-bottom:1px solid #d1fae5;
                        display:flex;align-items:center;gap:12px;flex-shrink:0;">
                ${urgencyBadge}
            </div>

            <!-- Scrollable body -->
            <div style="padding:28px 30px;overflow-y:auto;flex:1;">
                <div style="margin-bottom:28px;">
                    <div style="font-size:13px;font-weight:700;color:#10b981;
                                text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">
                        <i class="fas fa-file-alt"></i> Instructions
                    </div>
                    <div style="background:#f8fafc;border-left:4px solid #10b981;
                                border-radius:0 12px 12px 0;padding:20px 22px;
                                font-size:14px;color:#374151;line-height:1.8;white-space:pre-line;">
                        ${escapeHtml(a.instructions || 'No instructions provided.')}
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:28px;">
                    <div style="background:#f0fdf4;border-radius:12px;padding:16px;">
                        <div style="font-size:11px;font-weight:700;color:#10b981;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Max Points</div>
                        <div style="font-size:24px;font-weight:800;color:#1f2937;">${a.max_points || 100}</div>
                    </div>
                    <div style="background:#fef3c7;border-radius:12px;padding:16px;">
                        <div style="font-size:11px;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Due Date</div>
                        <div style="font-size:14px;font-weight:700;color:#1f2937;">${dueDate}</div>
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div style="padding:18px 30px;background:#f9fafb;border-top:2px solid #f3f4f6;
                        display:flex;gap:12px;flex-shrink:0;">
                <button onclick="document.getElementById('assignViewModal').remove()"
                        style="flex:1;padding:13px;border:2px solid #e5e7eb;border-radius:12px;
                               background:white;color:#6b7280;font-weight:700;cursor:pointer;
                               font-family:inherit;font-size:14px;transition:all 0.2s;"
                        onmouseover="this.style.borderColor='#10b981';this.style.color='#10b981'"
                        onmouseout="this.style.borderColor='#e5e7eb';this.style.color='#6b7280'">
                    Close
                </button>
                <button onclick="document.getElementById('assignViewModal').remove(); window.submitAssignmentModal('${assignmentId}')"
                        style="flex:2;padding:13px;background:linear-gradient(135deg,#10b981,#059669);
                               border:none;border-radius:12px;color:white;font-weight:800;cursor:pointer;
                               font-family:inherit;font-size:14px;display:flex;align-items:center;
                               justify-content:center;gap:8px;box-shadow:0 4px 14px rgba(16,185,129,0.35);
                               transition:all 0.3s;"
                        onmouseover="this.style.transform='translateY(-2px)'"
                        onmouseout="this.style.transform='translateY(0)'">
                    <i class="fas fa-upload"></i> Submit Assignment
                </button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
};

// ─────────────────────────────────────────────
// SUBMIT ASSIGNMENT MODAL (with drag & drop)
// ─────────────────────────────────────────────
window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.remove();
};

window.submitAssignmentModal = async function(assignmentId) {
    try {
        const { data, error } = await supabaseClient
            .from('assignments')
            .select('title, submission_type, instructions, max_points, due_date, is_coding')
            .eq('id', assignmentId)
            .maybeSingle();

        if (error || !data) { showToast('Could not load assignment details', 'error'); return; }
        openSubmitAssignmentModal(assignmentId, data.submission_type || 'file', data);
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
};

// Global variable to store current draft content
let currentDraftContent = null;
let currentDraftAssignmentId = null;

function openSubmitAssignmentModal(assignmentId, submissionType, assignmentData) {
    document.getElementById('submitAssignmentModal')?.remove();

    // Redirect coding assignments to the coding environment
    if (assignmentData?.is_coding) {
        if (typeof openCodingEnvironment === 'function') {
            openCodingEnvironment(assignmentId, assignmentData.instructions || 'Write code to solve this problem.');
        }
        return;
    }

    currentDraftAssignmentId = assignmentId;
    
    const dueDate = assignmentData?.due_date
        ? new Date(assignmentData.due_date).toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })
        : '';

    // Load existing draft if any
    loadExistingDraft(assignmentId);

    let inputHTML = `

    <!-- Save Draft Status Bar -->
    <div id="draftStatusBar" style="margin-bottom:20px;
                                      background:linear-gradient(135deg,#fef3c7,#fffbeb);
                                      border:1px solid #f59e0b;
                                      border-radius:16px;
                                      padding:14px 20px;
                                      display:none;
                                      align-items:center;
                                      justify-content:space-between;
                                      flex-wrap:wrap;
                                      gap:10px;">
        <div style="display:flex;align-items:center;gap:12px;">
            <div style="background:#f59e0b;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;">
                <i class="fas fa-save" style="color:white;font-size:16px;"></i>
            </div>
            <div>
                <div style="font-weight:700;color:#92400e;font-size:14px;">Draft Saved</div>
                <div style="font-size:12px;color:#78350f;" id="draftSavedTime">Last saved just now</div>
            </div>
        </div>
        <div style="display:flex;gap:10px;">
            <button onclick="deleteCurrentDraft()" style="background:#fef3c7;border:1px solid #f59e0b;border-radius:30px;padding:6px 14px;font-size:12px;color:#92400e;cursor:pointer;">
                <i class="fas fa-trash-alt"></i> Delete Draft
            </button>
            <button onclick="loadDraftIntoEditor()" style="background:#f59e0b;border:none;border-radius:30px;padding:6px 14px;font-size:12px;color:white;cursor:pointer;">
                <i class="fas fa-undo-alt"></i> Restore Draft
            </button>
        </div>
    </div>

    <!-- Assignment Brief Card -->
    <div style="margin-bottom:25px;">
        <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);
                    border:2px solid #10b981;
                    border-radius:20px;
                    padding:24px 28px;
                    margin-bottom:24px;
                    width:100%;
                    box-sizing:border-box;">
            
            <div style="display:flex;
                        align-items:center;
                        gap:12px;
                        margin-bottom:20px;
                        border-bottom:2px solid #bbf7d0;
                        padding-bottom:16px;">
                <div style="background:#10b981;
                            width:44px;
                            height:44px;
                            border-radius:50%;
                            display:flex;
                            align-items:center;
                            justify-content:center;">
                    <i class="fas fa-file-alt" style="color:white;font-size:20px;"></i>
                </div>
                <div>
                    <div style="font-size:12px;
                                font-weight:700;
                                letter-spacing:2px;
                                text-transform:uppercase;
                                color:#059669;">
                        ${assignmentData?.due_date && new Date(assignmentData.due_date) > new Date() ? 'UPCOMING ASSIGNMENT' : 'ASSIGNMENT'}
                    </div>
                    <div style="font-size:20px;
                                font-weight:800;
                                color:#1f2937;">
                        ${escapeHtml(assignmentData?.title || 'Assignment')}
                    </div>
                </div>
                <div style="margin-left:auto;">
                    <span style="background:#fef3c7;
                                 color:#d97706;
                                 padding:6px 16px;
                                 border-radius:30px;
                                 font-size:13px;
                                 font-weight:700;">
                        ${assignmentData?.max_points || 100} pts
                    </span>
                </div>
            </div>

            <div style="margin-bottom:20px;">
                <div style="font-size:13px;
                            font-weight:700;
                            color:#059669;
                            margin-bottom:10px;
                            display:flex;
                            align-items:center;
                            gap:8px;">
                    <i class="fas fa-question-circle"></i> QUESTION
                </div>
                <div style="background:white;
                            border-radius:16px;
                            padding:20px 24px;
                            font-size:15px;
                            color:#374151;
                            line-height:1.8;
                            border-left:4px solid #10b981;">
                    ${assignmentData?.instructions ? 
                        assignmentData.instructions
                            .split('\n')
                            .map(line => `<p style="margin:0 0 12px 0;">${escapeHtml(line)}</p>`)
                            .join('') 
                        : '<p>No instructions provided.</p>'}
                </div>
            </div>

            <div style="display:flex;
                        gap:20px;
                        flex-wrap:wrap;
                        padding-top:12px;
                        border-top:1px solid #d1fae5;
                        font-size:13px;
                        color:#6b7280;">
                ${assignmentData?.due_date ? `
                <div style="display:flex;align-items:center;gap:6px;">
                    <i class="fas fa-calendar-alt" style="color:#10b981;"></i>
                    <span>Due: ${new Date(assignmentData.due_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
                </div>` : ''}
                <div style="display:flex;align-items:center;gap:6px;">
                    <i class="fas fa-star" style="color:#f59e0b;"></i>
                    <span>${assignmentData?.max_points || 100} points possible</span>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <i class="fas fa-pen-fancy" style="color:#7c3aed;"></i>
                    <span>Written Response Required</span>
                </div>
            </div>
        </div>

        <div style="display:flex;
                    align-items:center;
                    justify-content:space-between;
                    margin-bottom:12px;">
            <label style="font-weight:700;
                         color:#1f2937;
                         font-size:15px;">
                <i class="fas fa-pen-nib" style="color:#10b981;margin-right:8px;"></i>
                Your Answer
            </label>
            <span style="font-size:12px;
                         color:#9ca3af;
                         background:#f3f4f6;
                         padding:4px 12px;
                         border-radius:30px;">
                <i class="fas fa-lightbulb"></i> Use headings and bullet points
            </span>
        </div>

        <div style="display:flex;
                    gap:6px;
                    flex-wrap:wrap;
                    padding:12px 16px;
                    background:#1a1a2e;
                    border-radius:16px 16px 0 0;
                    border:1.5px solid #2d2d44;
                    border-bottom:none;">

            <button type="button" onclick="execRichCmd('bold')" title="Bold"
                style="padding:6px 14px;
                       border:1px solid #3d3d5c;
                       border-radius:8px;
                       background:#2d2d44;
                       font-size:13px;
                       font-weight:700;
                       cursor:pointer;
                       color:#e5e7eb;
                       transition:all 0.15s;"
                onmouseover="this.style.background='#10b981';this.style.borderColor='#10b981';this.style.color='white'"
                onmouseout="this.style.background='#2d2d44';this.style.borderColor='#3d3d5c';this.style.color='#e5e7eb'">
                <b>Bold</b>
            </button>

            <button type="button" onclick="execRichCmd('italic')" title="Italic"
                style="padding:6px 14px;
                       border:1px solid #3d3d5c;
                       border-radius:8px;
                       background:#2d2d44;
                       font-size:13px;
                       cursor:pointer;
                       color:#e5e7eb;
                       transition:all 0.15s;"
                onmouseover="this.style.background='#10b981';this.style.borderColor='#10b981';this.style.color='white'"
                onmouseout="this.style.background='#2d2d44';this.style.borderColor='#3d3d5c';this.style.color='#e5e7eb'">
                <i>Italic</i>
            </button>

            <div style="width:1px;background:#3d3d5c;margin:0 6px;"></div>

            <button type="button" onclick="execRichCmd('formatBlock','h1')" title="Heading 1"
                style="padding:6px 14px;
                       border:1px solid #3d3d5c;
                       border-radius:8px;
                       background:#2d2d44;
                       font-size:12px;
                       font-weight:700;
                       cursor:pointer;
                       color:#a5b4fc;
                       transition:all 0.15s;"
                onmouseover="this.style.background='#10b981';this.style.borderColor='#10b981';this.style.color='white'"
                onmouseout="this.style.background='#2d2d44';this.style.borderColor='#3d3d5c';this.style.color='#a5b4fc'">
                Heading 1
            </button>

            <button type="button" onclick="execRichCmd('formatBlock','h2')" title="Heading 2"
                style="padding:6px 14px;
                       border:1px solid #3d3d5c;
                       border-radius:8px;
                       background:#2d2d44;
                       font-size:12px;
                       font-weight:700;
                       cursor:pointer;
                       color:#a5b4fc;
                       transition:all 0.15s;"
                onmouseover="this.style.background='#10b981';this.style.borderColor='#10b981';this.style.color='white'"
                onmouseout="this.style.background='#2d2d44';this.style.borderColor='#3d3d5c';this.style.color='#a5b4fc'">
                Heading 2
            </button>

            <div style="width:1px;background:#3d3d5c;margin:0 6px;"></div>

            <button type="button" onclick="execRichCmd('insertUnorderedList')" title="Bullet list"
                style="padding:6px 14px;
                       border:1px solid #3d3d5c;
                       border-radius:8px;
                       background:#2d2d44;
                       font-size:12px;
                       cursor:pointer;
                       color:#e5e7eb;
                       transition:all 0.15s;"
                onmouseover="this.style.background='#10b981';this.style.borderColor='#10b981';this.style.color='white'"
                onmouseout="this.style.background='#2d2d44';this.style.borderColor='#3d3d5c';this.style.color='#e5e7eb'">
                • Bullet List
            </button>

            <button type="button" onclick="execRichCmd('insertOrderedList')" title="Numbered list"
                style="padding:6px 14px;
                       border:1px solid #3d3d5c;
                       border-radius:8px;
                       background:#2d2d44;
                       font-size:12px;
                       cursor:pointer;
                       color:#e5e7eb;
                       transition:all 0.15s;"
                onmouseover="this.style.background='#10b981';this.style.borderColor='#10b981';this.style.color='white'"
                onmouseout="this.style.background='#2d2d44';this.style.borderColor='#3d3d5c';this.style.color='#e5e7eb'">
                1. Numbered List
            </button>

            <div style="flex:1;"></div>

            <button type="button" onclick="clearRichEditor()" title="Clear all"
                style="padding:6px 14px;
                       border:1px solid #7f1d1d;
                       border-radius:8px;
                       background:#2d2d44;
                       font-size:12px;
                       cursor:pointer;
                       color:#fca5a5;
                       transition:all 0.15s;"
                onmouseover="this.style.background='#ef4444';this.style.borderColor='#ef4444';this.style.color='white'"
                onmouseout="this.style.background='#2d2d44';this.style.borderColor='#7f1d1d';this.style.color='#fca5a5'">
                <i class="fas fa-trash-alt"></i> Clear
            </button>
        </div>

        <div id="richTextEditor"
             contenteditable="true"
             spellcheck="true"
             oninput="updateWordCount(); autoSaveDraft('${assignmentId}')"
             style="min-height:350px;
                    width:100%;
                    padding:24px 28px;
                    border:1.5px solid #2d2d44;
                    border-radius:0 0 16px 16px;
                    font-size:15px;
                    color:#e5e7eb;
                    line-height:1.9;
                    outline:none;
                    background:#0f0f1a;
                    font-family:'Plus Jakarta Sans',sans-serif;
                    transition:border-color 0.2s;
                    caret-color:#10b981;
                    box-sizing:border-box;"
             onfocus="this.style.borderColor='#10b981';this.style.boxShadow='0 0 0 3px rgba(16,185,129,0.15)'"
             onblur="this.style.borderColor='#2d2d44';this.style.boxShadow='none'"
             data-placeholder="Write your answer here..."></div>

        <div style="display:flex;
                    align-items:center;
                    justify-content:space-between;
                    margin-top:12px;
                    padding:8px 4px;">
            <span style="font-size:12px;
                         color:#6b7280;">
                <i class="fas fa-lightbulb" style="color:#f59e0b;margin-right:8px;"></i>
                <strong>Tip:</strong> Use headings and bullet points to structure your answer
            </span>
            <span id="richWordCount"
                  style="font-size:13px;
                         font-weight:800;
                         color:#10b981;
                         background:#f0fdf4;
                         padding:5px 14px;
                         border-radius:30px;">
                0 words
            </span>
        </div>
    </div>`;

    const modal = document.createElement('div');
    modal.id = 'submitAssignmentModal';
    modal.style.cssText = `position:fixed;
                           top:0;
                           left:0;
                           width:100%;
                           height:100%;
                           background:rgba(0,0,0,0.85);
                           z-index:10000;
                           display:flex;
                           align-items:center;
                           justify-content:center;
                           padding:20px;
                           backdrop-filter:blur(5px);
                           animation:fadeIn 0.25s ease;`;

    modal.innerHTML = `
        <div style="background:white;
                    border-radius:28px;
                    width:100%;
                    max-width:950px;
                    max-height:90vh;
                    overflow:hidden;
                    display:flex;
                    flex-direction:column;
                    box-shadow:0 30px 80px rgba(0,0,0,0.4);">
            
            <div style="background:linear-gradient(135deg,#10b981,#047857);
                        padding:28px 32px;
                        color:white;
                        flex-shrink:0;">
                <div style="display:flex;
                            justify-content:space-between;
                            align-items:flex-start;">
                    <div>
                        <div style="font-size:11px;
                                    font-weight:700;
                                    letter-spacing:2px;
                                    text-transform:uppercase;
                                    opacity:0.8;
                                    margin-bottom:8px;">
                            <i class="fas fa-tasks"></i> SUBMIT ASSIGNMENT
                        </div>
                        <div style="font-size:22px;
                                    font-weight:800;
                                    line-height:1.3;">
                            ${escapeHtml(assignmentData?.title || 'Assignment')}
                        </div>
                        ${dueDate ? `<div style="font-size:13px;
                                                opacity:0.85;
                                                margin-top:8px;">
                            <i class="fas fa-calendar-alt"></i> Due: ${dueDate}
                        </div>` : ''}
                    </div>
                    <button onclick="document.getElementById('submitAssignmentModal').remove()"
                            style="background:rgba(255,255,255,0.2);
                                   border:none;
                                   color:white;
                                   width:42px;
                                   height:42px;
                                   border-radius:50%;
                                   cursor:pointer;
                                   font-size:18px;
                                   display:flex;
                                   align-items:center;
                                   justify-content:center;
                                   flex-shrink:0;
                                   transition:all 0.2s;"
                            onmouseover="this.style.background='rgba(255,255,255,0.35)'"
                            onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>

            <div style="padding:28px 32px;
                        overflow-y:auto;
                        flex:1;
                        background:#fafafa;">
                ${inputHTML}
            </div>

            <div style="padding:20px 32px;
                        background:white;
                        border-top:2px solid #f3f4f6;
                        display:flex;
                        gap:16px;
                        flex-shrink:0;">
                <button onclick="saveDraft('${assignmentId}')"
                        style="flex:1;
                               padding:14px;
                               background:#fef3c7;
                               border:2px solid #f59e0b;
                               border-radius:14px;
                               color:#92400e;
                               font-weight:800;
                               cursor:pointer;
                               font-family:inherit;
                               font-size:14px;
                               display:flex;
                               align-items:center;
                               justify-content:center;
                               gap:8px;
                               transition:all 0.2s;"
                        onmouseover="this.style.background='#fde68a';this.style.transform='translateY(-1px)'"
                        onmouseout="this.style.background='#fef3c7';this.style.transform='translateY(0)'">
                    <i class="fas fa-save"></i> Save Draft
                </button>
                <button onclick="document.getElementById('submitAssignmentModal').remove()"
                        style="flex:1;
                               padding:14px;
                               border:2px solid #e5e7eb;
                               border-radius:14px;
                               background:white;
                               color:#6b7280;
                               font-weight:700;
                               cursor:pointer;
                               font-family:inherit;
                               font-size:14px;
                               transition:all 0.2s;"
                        onmouseover="this.style.borderColor='#10b981';this.style.color='#10b981'"
                        onmouseout="this.style.borderColor='#e5e7eb';this.style.color='#6b7280'">
                    Cancel
                </button>
                <button onclick="handleSubmitAssignment('${assignmentId}', '${submissionType}')"
                        style="flex:2;
                               padding:14px;
                               background:linear-gradient(135deg,#10b981,#059669);
                               border:none;
                               border-radius:14px;
                               color:white;
                               font-weight:800;
                               cursor:pointer;
                               font-family:inherit;
                               font-size:15px;
                               display:flex;
                               align-items:center;
                               justify-content:center;
                               gap:10px;
                               box-shadow:0 4px 14px rgba(16,185,129,0.4);
                               transition:all 0.3s;"
                        onmouseover="this.style.transform='translateY(-2px)'"
                        onmouseout="this.style.transform='translateY(0)'">
                    <i class="fas fa-paper-plane"></i> Submit Final
                </button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ─────────────────────────────────────────────
// DRAFT FUNCTIONS
// ─────────────────────────────────────────────

async function loadExistingDraft(assignmentId) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        const { data, error } = await supabaseClient
            .from('draft_assignments')
            .select('content, saved_at')
            .eq('assignment_id', assignmentId)
            .eq('student_id', user.id)
            .maybeSingle();

        if (error) throw error;

        if (data && data.content) {
            currentDraftContent = data.content;
            
            // Show draft status bar
            const statusBar = document.getElementById('draftStatusBar');
            if (statusBar) {
                statusBar.style.display = 'flex';
                const timeEl = document.getElementById('draftSavedTime');
                if (timeEl && data.saved_at) {
                    const savedDate = new Date(data.saved_at);
                    timeEl.textContent = 'Saved ' + savedDate.toLocaleDateString() + ' ' + savedDate.toLocaleTimeString();
                }
            }
            
            // Wait for editor to be ready then restore automatically
            const waitForEditor = setInterval(() => {
                const editor = document.getElementById('richTextEditor');
                if (editor) {
                    clearInterval(waitForEditor);
                    editor.innerHTML = currentDraftContent;
                    updateWordCount();
                    showToast('Draft restored!', 'success');
                }
            }, 100);
            
            setTimeout(() => clearInterval(waitForEditor), 3000);
        }
    } catch (err) {
        console.error('Error loading draft:', err);
    }
}

async function saveDraft(assignmentId) {
    const editor = document.getElementById('richTextEditor');
    if (!editor) return;

    const content = editor.innerHTML;
    
    if (!content || content.trim() === '' || content === '<br>') {
        showToast('Cannot save empty draft', 'warning');
        return;
    }

    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) {
            showToast('Please login to save drafts', 'error');
            return;
        }

        // First check if draft exists
        const { data: existing } = await supabaseClient
            .from('draft_assignments')
            .select('id')
            .eq('assignment_id', assignmentId)
            .eq('student_id', user.id)
            .maybeSingle();

        if (existing) {
            // Update existing
            const { error } = await supabaseClient
                .from('draft_assignments')
                .update({
                    content: content,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);
            if (error) throw error;
        } else {
            // Insert new
            const { error } = await supabaseClient
                .from('draft_assignments')
                .insert({
                    student_id: user.id,
                    assignment_id: assignmentId,
                    content: content,
                    saved_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            if (error) throw error;
        }

        currentDraftContent = content;
        
        const statusBar = document.getElementById('draftStatusBar');
        if (statusBar) {
            statusBar.style.display = 'flex';
            const timeEl = document.getElementById('draftSavedTime');
            if (timeEl) timeEl.textContent = 'Saved just now';
        }
        
        showToast('✅ Draft saved!', 'success');

    } catch (err) {
        console.error('Save error:', err);
        showToast('Error saving draft', 'error');
    }
}
function autoSaveDraft(assignmentId) {
    // Auto-save after 3 seconds of no typing
    if (window._autoSaveTimeout) clearTimeout(window._autoSaveTimeout);
    
    window._autoSaveTimeout = setTimeout(() => {
        const editor = document.getElementById('richTextEditor');
        if (editor && editor.innerHTML.trim() && editor.innerHTML !== '<br>') {
            saveDraft(assignmentId);
        }
    }, 3000);
}

async function loadDraftIntoEditor() {
    const editor = document.getElementById('richTextEditor');
    if (!editor || !currentDraftContent) return;

    editor.innerHTML = currentDraftContent;
    updateWordCount();
    editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Highlight effect
    editor.style.background = '#1a3a2a';
    setTimeout(() => { editor.style.background = '#0f0f1a'; }, 500);
    
    showToast('Draft restored!', 'success');
}
async function deleteCurrentDraft() {
    if (!confirm('Delete this draft?')) return;
    
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        const { error } = await supabaseClient
            .from('draft_assignments')
            .delete()
            .eq('assignment_id', currentDraftAssignmentId)
            .eq('student_id', user.id);

        if (error) throw error;

        currentDraftContent = null;
        
        const statusBar = document.getElementById('draftStatusBar');
        if (statusBar) statusBar.style.display = 'none';
        
        const editor = document.getElementById('richTextEditor');
        if (editor) editor.innerHTML = '';
        
        showToast('Draft deleted', 'success');
        
    } catch (err) {
        console.error('Delete error:', err);
        showToast('Error deleting draft', 'error');
    }
}
// ─────────────────────────────────────────────
// RICH TEXT HELPER FUNCTIONS
// ─────────────────────────────────────────────

window.execRichCmd = function(command, value = null) {
    const editor = document.getElementById('richTextEditor');
    if (!editor) return;
    editor.focus();
    
    if (command === 'formatBlock') {
        document.execCommand(command, false, value);
    } else {
        document.execCommand(command, false, value);
    }
    updateWordCount();
    if (currentDraftAssignmentId) autoSaveDraft(currentDraftAssignmentId);
};

window.clearRichEditor = function() {
    if (confirm('Clear all your writing? This cannot be undone unless you have a saved draft.')) {
        const ed = document.getElementById('richTextEditor');
        if (ed) { ed.innerHTML = ''; updateWordCount(); }
    }
};

window.updateWordCount = function() {
    const ed = document.getElementById('richTextEditor');
    const counter = document.getElementById('richWordCount');
    if (!ed || !counter) return;
    
    // Get plain text without HTML tags
    const text = ed.innerText.trim();
    const words = text ? text.split(/\s+/).filter(word => word.length > 0).length : 0;
    counter.textContent = words + ' word' + (words !== 1 ? 's' : '');
    
    // Change color based on length
    if (words === 0) {
        counter.style.background = '#fee2e2';
        counter.style.color = '#ef4444';
    } else if (words < 50) {
        counter.style.background = '#fef3c7';
        counter.style.color = '#d97706';
    } else {
        counter.style.background = '#d1fae5';
        counter.style.color = '#065f46';
    }
};
window.handleAssignmentFileDrop = function(event) {
    event.preventDefault();
    const zone = document.getElementById('assignDropZone');
    if (zone) { zone.style.borderColor = '#d1d5db'; zone.style.background = '#f9fafb'; }
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const input = document.getElementById('assignmentFileInput');
    if (input) { const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; }
    showAssignmentFileName({ files: [file] });
};

window.showAssignmentFileName = function(inputOrEvent) {
    const file = inputOrEvent.files?.[0];
    if (!file) return;
    const zone  = document.getElementById('assignDropZone');
    const label = document.getElementById('assignDropFileName');
    if (zone)  { zone.style.borderColor = '#10b981'; zone.style.background = '#f0fdf4'; }
    if (label) { label.style.display = 'block'; label.innerHTML = `<i class="fas fa-check-circle"></i> ${file.name} (${(file.size / 1024).toFixed(1)} KB)`; }
};


window.handleSubmitAssignment = async function(assignmentId, submissionType) {
    const btn = document.querySelector('#submitAssignmentModal button[onclick*="handleSubmitAssignment"]');

    // Read from rich text editor only
    const richEditor = document.getElementById('richTextEditor');
    const textResponse = richEditor?.innerText?.trim() ? richEditor.innerHTML.trim() : null;

    if (!textResponse) {
        showToast('Please write your response before submitting', 'warning');
        return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...'; }

    const result = await submitAssignment(assignmentId, { fileUrl: null, textResponse });

    if (!result.success) {
        showToast('Submission failed: ' + result.error, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Assignment'; }
        return;
    }

    document.getElementById('submitAssignmentModal')?.remove();
    showToast('Assignment submitted successfully! ✅', 'success');

  const courseId = window.currentCourseId || window.currentCourse;
    if (courseId && typeof loadCourseAssignmentsUI === 'function') loadCourseAssignmentsUI(courseId);

    // ── sync progress even if courseId came from the assignment record ──
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
            let cid = courseId;
            if (!cid) {
                // fallback: read course_id from the assignment itself
                const { data: asgn } = await supabaseClient
                    .from('assignments').select('course_id').eq('id', assignmentId).maybeSingle();
                cid = asgn?.course_id;
            }
            if (cid && typeof syncCourseProgressToDB === 'function') {
                await syncCourseProgressToDB(user.id, cid);
            }
        }
    } catch(e) { console.error('Progress sync error:', e.message); }
};

// ─────────────────────────────────────────────
// VIEW FEEDBACK MODAL
// ─────────────────────────────────────────────
async function viewAssignmentFeedback(assignmentId) {
    const result = await getAssignmentFeedback(assignmentId);
    if (!result.success) { showToast('Could not load feedback', 'error'); return; }

    const f = result.feedback;
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:700px;">
            <div class="modal-header">
                <h2>Assignment Feedback</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="background:#f9fafb;padding:20px;border-radius:12px;margin-bottom:20px;">
                <div style="font-weight:600;font-size:18px;color:#1f2937;margin-bottom:10px;">
                    ${f.assignments.title}
                </div>
                <div style="display:flex;gap:20px;font-size:14px;color:#6b7280;">
                    <span>Score: <strong style="color:#1f2937;">${f.score}/${f.max_score}</strong></span>
                    <span>Grade: <strong style="color:#1f2937;">${f.grade}</strong></span>
                    <span>Submitted: ${new Date(f.submitted_at).toLocaleDateString()}</span>
                </div>
            </div>
            <div class="form-group">
                <label style="font-weight:600;color:#1f2937;">Instructor Feedback:</label>
                <div style="padding:15px;background:white;border:1px solid #e5e7eb;border-radius:8px;color:#374151;">
                    ${f.feedback || 'No feedback provided yet.'}
                </div>
            </div>
            ${f.file_url ? `
                <a href="${f.file_url}" target="_blank" class="btn-secondary" style="display:inline-block;margin-top:15px;">
                    <i class="fas fa-download"></i> Download Your Submission
                </a>` : ''}
            <button class="btn-secondary" onclick="this.closest('.modal').remove()" style="width:100%;margin-top:15px;">
                Close
            </button>
        </div>`;
    document.body.appendChild(modal);
}

// ─────────────────────────────────────────────
// escapeHtml helper (safe fallback)
// ─────────────────────────────────────────────
if (typeof escapeHtml === 'undefined') {
    window.escapeHtml = function(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    };
}
// ============================================
// CODING ASSIGNMENT SUPPORT
// ============================================

// Add is_coding field to createAssignment function
// REPLACE your existing createAssignment function with this one:
async function createAssignment({ title, courseId, instructions, dueDate, maxPoints, submissionType, isCoding = false }) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        if (!title?.trim())        throw new Error('Assignment title is required');
        if (!courseId)             throw new Error('Course is required');
        if (!instructions || instructions.replace(/<[^>]*>/g, '').trim() === '') throw new Error('Instructions are required');
        if (!dueDate)              throw new Error('Due date is required');

        const { data, error } = await supabaseClient
            .from('assignments')
            .insert({
                course_id:       courseId,
                title:           title.trim(),
                instructions:    instructions.trim(),
                due_date:        dueDate,
                max_points:      maxPoints || 100,
                submission_type: submissionType || 'file',
                is_coding:       isCoding,  
                created_by:      user.id,
                created_at:      new Date().toISOString()
            })
            .select()
            .maybeSingle();

        if (error) throw error;

        return { success: true, assignment: data, message: 'Assignment created successfully!' };

    } catch (error) {
        console.error('❌ createAssignment error:', error.message);
        return { success: false, error: error.message };
    }
}

// Add this new function to fetch coding submissions
async function getCodingSubmissions(assignmentId) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabaseClient
            .from('coding_submissions')
            .select('*')
            .eq('assignment_id', assignmentId)
            .eq('student_id', user.id)
            .order('submitted_at', { ascending: false })
            .maybeSingle();

        if (error) throw error;
        return { success: true, submission: data };

    } catch (error) {
        console.error('❌ getCodingSubmissions error:', error.message);
        return { success: false, error: error.message };
    }
}

// Add this function to submit coding assignment
async function submitCodingAssignment(assignmentId, code, language) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabaseClient
            .from('coding_submissions')
            .insert({
                assignment_id: assignmentId,
                student_id: user.id,
                code: code,
                language: language,
                submitted_at: new Date().toISOString()
            })
            .select()
            .maybeSingle();

        if (error) throw error;
        return { success: true, submission: data, message: 'Coding assignment submitted!' };

    } catch (error) {
        console.error('❌ submitCodingAssignment error:', error.message);
        return { success: false, error: error.message };
    }
}
// ── Rich text editor helpers ──────────────────────────────────
window.execRichCmd = function(command, value = null) {
    document.getElementById('richTextEditor')?.focus();
    document.execCommand(command, false, value);
};

window.clearRichEditor = function() {
    const ed = document.getElementById('richTextEditor');
    if (ed) { ed.innerHTML = ''; updateWordCount(); }
};

window.updateWordCount = function() {
    const ed = document.getElementById('richTextEditor');
    const counter = document.getElementById('richWordCount');
    if (!ed || !counter) return;
    const text = ed.innerText.trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    counter.textContent = words + ' word' + (words !== 1 ? 's' : '');
};
// ─────────────────────────────────────────────
// AUTO-INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const isAdmin = !!document.getElementById('assignmentsList');
    if (isAdmin) {
        loadAdminAssignments();
        const form = document.getElementById('createAssignmentForm');
        if (form) form.onsubmit = handleCreateAssignmentDB;
    }
});
window.loadCourseAssignmentsUI = loadCourseAssignmentsUI;

console.log('✅ Assignments.js loaded');