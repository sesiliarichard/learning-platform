// ============================================
// ASAI — COURSES.JS  (FIXED VERSION)
// ============================================

// ─────────────────────────────────────────────
// 1. GET ALL COURSES
// ─────────────────────────────────────────────
async function getAllCourses() {
    try {
       const { data, error } = await supabaseClient
            .from('courses')
            .select('id, title, description, duration_weeks, instructor, thumbnail_color, icon, status, created_at, order_num')
            .order('order_num', { ascending: true });

        if (error) throw error;
        return { success: true, courses: data || [] };
    } catch (error) {
        console.error('❌ getAllCourses error:', error.message);
        return { success: false, error: error.message, courses: [] };
    }
}

// ─────────────────────────────────────────────
// 2. GET SINGLE COURSE WITH PROGRESS
// ─────────────────────────────────────────────
async function getCourseById(courseId) {
    try {
        const { data: course, error: courseError } = await supabaseClient
            .from('courses')
            .select('*')
            .eq('id', courseId)
            .maybeSingle();

        if (courseError) throw courseError;
        if (!course) throw new Error('Course not found');

        return { success: true, course: { ...course, progress: 0 } };
    } catch (error) {
        console.error('❌ getCourseById error:', error.message);
        return { success: false, error: error.message };
    }
}
// ─────────────────────────────────────────────
// 3. CREATE COURSE (Admin only)
// ─────────────────────────────────────────────
async function createCourse({ title, description, durationWeeks, instructor, thumbnailColor, icon }) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');
        if (!title?.trim()) throw new Error('Course title is required');
        
        // FIX: Clean the description by removing empty HTML tags
        let cleanDescription = description || '';
        
        // Check if description is empty or just contains empty HTML
        const isEmpty = !cleanDescription || 
                        cleanDescription === '<p><br></p>' || 
                        cleanDescription === '<p> </p>' || 
                        cleanDescription === '<p></p>' || 
                        cleanDescription === '<br>' ||
                        cleanDescription === '<div><br></div>' ||
                        cleanDescription.trim() === '' ||
                        cleanDescription === '&nbsp;' ||
                        cleanDescription === '<p>&nbsp;</p>';
        
        // If empty, set to empty string instead of HTML tags
        if (isEmpty) {
            cleanDescription = '';
        }
        
        
        const { data, error } = await supabaseClient
            .from('courses')
            .insert({
                title:           title.trim(),
                description:     cleanDescription, // Use the cleaned description
                duration_weeks:  durationWeeks || 12,
                instructor:      instructor?.trim() || '',
                thumbnail_color: thumbnailColor || 'purple',
                icon:            icon || 'fa-book',
                status:          'active',
                created_by:      user.id,
                created_at:      new Date().toISOString()
            })
            .select()
            .maybeSingle();

        if (error) throw error;
        return { success: true, course: data, message: 'Course created successfully!' };
    } catch (error) {
        console.error('❌ createCourse error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 4. UPDATE COURSE (Admin only)
// ─────────────────────────────────────────────
async function updateCourse(courseId, { title, description, durationWeeks, instructor, status }) {
    try {
        const { data, error } = await supabaseClient
            .from('courses')
            .update({
                title:          title?.trim(),
                description:    description?.trim(),
                duration_weeks: durationWeeks,
                instructor:     instructor?.trim(),
                status:         status || 'active',
                updated_at:     new Date().toISOString()
            })
            .eq('id', courseId)
            .select()
            .maybeSingle();

        if (error) throw error;
        return { success: true, course: data, message: 'Course updated successfully!' };
    } catch (error) {
        console.error('❌ updateCourse error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 5. DELETE COURSE (Admin only)
// ─────────────────────────────────────────────
async function deleteCourseFromDB(courseId) {
    try {
        const { error } = await supabaseClient.from('courses').delete().eq('id', courseId);
        if (error) throw error;
        return { success: true, message: 'Course deleted successfully!' };
    } catch (error) {
        console.error('❌ deleteCourse error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 6. ENROLL STUDENT IN COURSE
// ─────────────────────────────────────────────
async function enrollInCourse(courseId) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data: existing } = await supabaseClient
            .from('enrollments')
            .select('id')
            .eq('student_id', user.id)
            .eq('course_id', courseId)
            .maybeSingle();

        if (existing) return { success: false, error: 'Already enrolled' };

        const { data, error } = await supabaseClient
            .from('enrollments')
            .insert({ student_id: user.id, user_id: user.id, course_id: courseId, progress: 0, enrolled_at: new Date().toISOString() })
            .select()
            .maybeSingle();

        if (error) throw error;
        return { success: true, enrollment: data, message: 'Successfully enrolled!' };
    } catch (error) {
        console.error('❌ enrollInCourse error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 7. GET STUDENT'S ENROLLED COURSES
// ─────────────────────────────────────────────
async function getStudentCourses(studentId = null) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const id = studentId || user.id;

        const { data, error } = await supabaseClient
            .from('enrollments')
            .select(`id, progress, enrolled_at, completed_at, courses (id, title, description, duration_weeks, instructor, thumbnail_color, icon)`)
            .eq('student_id', id)
            .order('enrolled_at', { ascending: true });

        if (error) throw error;

        const courses = (data || []).map(enrollment => ({
            enrollmentId: enrollment.id,
            progress:     enrollment.progress || 0,
            enrolledAt:   enrollment.enrolled_at,
            completedAt:  enrollment.completed_at,
            isCompleted:  !!enrollment.completed_at,
            ...enrollment.courses
        }));

        return { success: true, courses };
    } catch (error) {
        console.error('❌ getStudentCourses error:', error.message);
        return { success: false, error: error.message, courses: [] };
    }
}

// ─────────────────────────────────────────────
// 8. UPDATE COURSE PROGRESS
// ─────────────────────────────────────────────
async function updateCourseProgress(courseId, progressPercent) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const isCompleted = progressPercent >= 100;
        const { data, error } = await supabaseClient
            .from('enrollments')
            .update({ progress: Math.min(100, Math.max(0, progressPercent)), completed_at: isCompleted ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
            .eq('student_id', user.id)
            .eq('course_id', courseId)
            .select()
            .maybeSingle();

        if (error) throw error;
        return { success: true, enrollment: data };
    } catch (error) {
        console.error('❌ updateCourseProgress error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// STUDENT DASHBOARD — THE MAIN FIX
// This is the single source of truth for loading
// and clicking courses in the student dashboard
// ─────────────────────────────────────────────
async function loadStudentDashboardCourses() {
    console.log('🔄 loadStudentDashboardCourses called...');

    // Fetch ALL courses (not just enrolled) so student can see everything
    const result = await getAllCourses();

    if (!result.success || result.courses.length === 0) {
        console.warn('⚠️ No courses found in database');
        const grid = document.getElementById('courseSelection');
        if (grid) grid.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;">No courses available yet.</div>';
        return;
    }

    console.log('✅ Courses from DB:', result.courses.length, result.courses.map(c => c.title));

    // Also get enrollment progress if student is logged in
    // Also get enrollment progress if student is logged in
    let progressMap = {};
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (session && user) {
            const { data: enrollments } = await supabaseClient
                .from('enrollments')
                .select('course_id, progress')
                .eq('student_id', user.id);
            (enrollments || []).forEach(e => { progressMap[e.course_id] = e.progress || 0; });
        }
    } catch (e) {
        // progress stays 0 — not critical
    }

    // ── Build coursesData for the inline script to use ──
    // This bridges courses.js with the inline selectCourse() function
    if (typeof coursesData !== 'undefined') {
        result.courses.forEach(course => {
            coursesData[course.id] = {
                id:          course.id,
                title:       course.title,
                instructor:  course.instructor || 'ASAI Instructor',
                description: course.description || '',
                progress:    progressMap[course.id] || 0,
                notes:       [],
                videos:      [],
                quizzes:     [],
                assignments: []
            };
        });
        console.log('✅ coursesData populated:', Object.keys(coursesData));
    }

    // ── Render course cards ──
    renderStudentCourseCards(result.courses, progressMap);
}

// Renders cards into BOTH grids on the student dashboard
function renderStudentCourseCards(courses, progressMap = {}) {
    const colors = ['purple', 'orange', 'violet', 'green', 'blue', 'pink'];
    const icons  = ['fa-robot', 'fa-database', 'fa-code', 'fa-brain', 'fa-chart-bar', 'fa-laptop'];

    const grids = [
        document.getElementById('courseSelection'),
        document.querySelector('#dashboardSection .courses-grid')
    ];

    grids.forEach(grid => {
        if (!grid) return;

        grid.innerHTML = '';

        courses.forEach((course, index) => {
            const color    = course.thumbnail_color || colors[index % colors.length];
            const icon     = course.icon            || icons[index % icons.length];
            const progress = progressMap[course.id] || 0;
            const weeks    = course.duration_weeks  || 12;

            const card = document.createElement('div');
            card.className = 'course-card';
            // ★ KEY: store the real UUID
            card.setAttribute('data-course', course.id);
            card.style.cursor = 'pointer';

            card.innerHTML = `
                <div class="course-thumbnail ${color}">
                    <i class="fas ${icon} course-icon-large"></i>
                </div>
                <div class="course-title">${course.title}</div>
                <div class="course-meta">
                    <div class="meta-row">
                        <span>👨‍🏫</span>
                        <span>${course.instructor || 'ASAI Instructor'}</span>
                    </div>
                    <div class="meta-row">
                        <span>⏱️</span>
                        <span>${weeks} weeks</span>
                    </div>
                </div>
                <div class="progress-container">
                    <div class="progress-circle" data-progress="${progress}">
                        <span>${progress}%</span>
                    </div>
                    <div class="next-class">
                        ${progress === 0 ? 'Not started' : progress >= 100 ? '✅ Completed!' : `${progress}% complete`}
                    </div>
                </div>
            `;

            // ★ Single, clean click handler
            card.addEventListener('click', function () {
                const id = this.getAttribute('data-course');
                console.log('🖱️ Course card clicked, id =', id);
                if (!id) { console.error('No course id on card!'); return; }

                // Call the inline script's selectCourse()
                if (typeof selectCourse === 'function') {
                    selectCourse(id);
                } else {
                    console.error('selectCourse() not found! Check inline script loaded.');
                }
            });

            grid.appendChild(card);
        });

        console.log('✅ Rendered', courses.length, 'cards into grid:', grid.id || grid.className);
    });
}

// ─────────────────────────────────────────────
// ADMIN DASHBOARD FUNCTIONS
// ─────────────────────────────────────────────
async function loadAdminCourses() {
    const result = await getAllCourses();
    if (!result.success) { showToast('Could not load courses: ' + result.error, 'error'); return; }
    window.dbCourses = result.courses;
    renderAdminCourseList(result.courses);
    populateAdminCourseSelects(result.courses);
}

function renderAdminCourseList(courses) {
    const container = document.getElementById('coursesList');
    if (!container) return;

    if (courses.length === 0) {
        container.innerHTML = '<div class="card"><p style="color:#6b7280;">No courses yet. Click "Create Course".</p></div>';
        return;
    }

    container.innerHTML = '';
    courses.forEach(course => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-header">
                <div class="card-title">${course.title}</div>
                <div class="action-buttons">
                    <button class="action-btn edit" onclick="openEditCourseModal('${course.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" onclick="handleDeleteCourse('${course.id}', '${course.title.replace(/'/g,"\\'")}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <p style="color:#6b7280;margin-bottom:15px;">${course.description}</p>
            <div style="display:flex;gap:20px;font-size:14px;color:#6b7280;">
                <span><i class="fas fa-clock"></i> ${course.duration_weeks || 12} weeks</span>
                <span><i class="fas fa-user"></i> ${course.instructor || 'No instructor'}</span>
                <span class="badge ${course.status === 'active' ? 'active' : 'inactive'}">${course.status}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

function populateAdminCourseSelects(courses) {
    const selectIds = [
        'userCourseSelect', 'courseSelectNotes', 'chapterCourseSelect',
        'quizCourseSelect', 'assignmentCourseSelect', 'announcementCourseSelect',
        'certCourseFilter', 'adminResourceCourse', 'adminResourceCourseFilter'
    ];

    selectIds.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        while (select.options.length > 1) select.remove(1);
        courses.forEach(course => {
            const option = document.createElement('option');
            option.value       = course.id;
            option.textContent = course.title;
            select.appendChild(option);
        });
    });
}

async function handleAddCourseDB(event) {
    event.preventDefault();
    const formData   = new FormData(event.target);
    const submitBtn  = event.target.querySelector('[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating...'; }

    // Get the description and clean it
    let rawDescription = formData.get('description') || '';
    
    // Clean empty HTML tags
    const isEmpty = !rawDescription || 
                    rawDescription === '<p><br></p>' || 
                    rawDescription === '<p> </p>' || 
                    rawDescription === '<p></p>' || 
                    rawDescription === '<br>' ||
                    rawDescription === '<div><br></div>' ||
                    rawDescription.trim() === '';
    
    const cleanDescription = isEmpty ? '' : rawDescription;

    const result = await createCourse({
        title:         formData.get('title'),
        description:   cleanDescription, // Use cleaned description
        durationWeeks: parseInt(formData.get('duration')) || 12,
        instructor:    formData.get('instructor'),
        thumbnailColor:'purple',
        icon:          'fa-book'
    });

    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create Course'; }

    if (!result.success) { showToast('Error: ' + result.error, 'error'); return; }

    showToast('Course created! ✅');
    closeModal('addCourseModal');
    event.target.reset();
    await loadAdminCourses();
}

async function handleDeleteCourse(courseId, courseTitle) {
    if (!confirm(`Delete "${courseTitle}"?\nThis also removes all chapters and topics.`)) return;
    const result = await deleteCourseFromDB(courseId);
    if (!result.success) { showToast('Error: ' + result.error, 'error'); return; }
    showToast('Course deleted');
    await loadAdminCourses();
}

async function openEditCourseModal(courseId) {
    const result = await getCourseById(courseId);
    if (!result.success || !result.course) { 
        showToast('Could not load course: ' + (result.error || 'Unknown error'), 'error'); 
        return; 
    }

    const course = result.course;

    const titleEl      = document.getElementById('courseTitle');
    const durationEl   = document.getElementById('courseDuration');
    const instructorEl = document.getElementById('courseInstructor');

    if (!titleEl || !durationEl || !instructorEl) {
        showToast('Modal not ready. Please try again.', 'error');
        console.error('Missing modal inputs:', { titleEl, durationEl, instructorEl });
        return;
    }

    titleEl.value      = course.title || '';
    durationEl.value   = course.duration_weeks || '';
    instructorEl.value = course.instructor || '';
    
    // Clear and set description in editor
    const editor = document.getElementById('courseDescriptionEditor');
    if (editor) {
        editor.innerHTML = course.description || '';
    }
    document.getElementById('courseDescription').value = course.description || '';
    
    // ✅ CHANGE MODAL TITLE
    const modalTitle = document.querySelector('#addCourseModal .modal-header h2');
    if (modalTitle) {
        modalTitle.innerHTML = '<i class="fas fa-edit"></i> Edit Module';
    }
    
    // ✅ CHANGE SUBMIT BUTTON TEXT
    const submitBtn = document.querySelector('#addCourseModal .btn-primary');
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
    }
    
    // Store the course ID for update
    window.editingCourseId = courseId;
    
    // Change form handler for update
    const form = document.getElementById('addCourseForm');
    form.onsubmit = async (e) => {
        e.preventDefault();
        
        // Get editor content
        let editorContent = document.getElementById('courseDescriptionEditor').innerHTML;
        const isEmpty = !editorContent || 
                        editorContent === '<p><br></p>' || 
                        editorContent === '<p> </p>' || 
                        editorContent === '<p></p>' || 
                        editorContent === '<br>' ||
                        editorContent.trim() === '';
        
        const description = isEmpty ? '' : editorContent;
        document.getElementById('courseDescription').value = description;
        
        const fd = new FormData(e.target);
        const r = await updateCourse(window.editingCourseId, {
            title:         fd.get('title'),
            description:   description,
            durationWeeks: parseInt(fd.get('duration')) || 12,
            instructor:    fd.get('instructor')
        });
        
        if (!r.success) { 
            showToast('Error: ' + r.error, 'error'); 
            return; 
        }
        
        showToast('Course updated successfully! ✅');
        closeModal('addCourseModal');
        
        // Reset form for next use
        e.target.reset();
        if (editor) editor.innerHTML = '';
        form.onsubmit = handleAddCourseDB;
        window.editingCourseId = null;
        
        // ✅ RESET MODAL TITLE AND BUTTON BACK TO CREATE MODE
        if (modalTitle) modalTitle.innerHTML = '<i class="fas fa-plus"></i> Create New Module';
        if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-plus"></i> Create Module';
        
        await loadAdminCourses();
    };

    // Open the modal
    document.getElementById('addCourseModal')?.classList.add('active');
}
function openAddCourseModal() {
    // Reset form for new course
    const editor = document.getElementById('courseDescriptionEditor');
    if (editor) {
        editor.innerHTML = '';
    }
    
    // Reset hidden input
    const hiddenDesc = document.getElementById('courseDescription');
    if (hiddenDesc) {
        hiddenDesc.value = '';
    }
    
    // Reset form fields
    const form = document.getElementById('addCourseForm');
    if (form) {
        form.reset();
    }
    
    // Make sure we're not in edit mode
    window.editingCourseId = null;
    
    // ✅ RESET MODAL TITLE AND BUTTON
    const modalTitle = document.querySelector('#addCourseModal .modal-header h2');
    if (modalTitle) {
        modalTitle.innerHTML = '<i class="fas fa-plus"></i> Create New Module';
    }
    
    const submitBtn = document.querySelector('#addCourseModal .btn-primary');
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-plus"></i> Create Module';
    }
    
    // Make sure form handler is for create
    const addForm = document.getElementById('addCourseForm');
    if (addForm) {
        addForm.onsubmit = handleAddCourseDB;
    }
    
    document.getElementById('addCourseModal')?.classList.add('active');
}
// ─────────────────────────────────────────────
// AUTO-INIT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const isAdminPage   = !!document.getElementById('coursesList');
    const isStudentPage = !!document.getElementById('courseSelection');

    if (isAdminPage) {
        console.log('📋 Admin page detected — loading admin courses');
        await loadAdminCourses();
        const form = document.getElementById('addCourseForm');
        if (form) form.onsubmit = handleAddCourseDB;
    }

    if (isStudentPage) {
        console.log('🎓 Student page detected — loading student courses');
        // Small delay so the inline script's variables (coursesData, selectCourse) are ready
        setTimeout(async () => {
            await loadStudentDashboardCourses();
        }, 300);
    }
});

console.log('✅ Courses.js loaded');