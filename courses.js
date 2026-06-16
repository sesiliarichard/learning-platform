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
        .select('id, title, description, duration_weeks, instructor, thumbnail_color, icon, status, created_at, order_num, lesson_count, student_count, category, admin_lock_override')
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
        
        // FIX: Clean the description properly
        let cleanDescription = description || '';
        
        // Remove all possible empty HTML patterns
        const emptyPatterns = [
            '<p><br></p>',
            '<p><br/>',
            '<p> </p>',
            '<p></p>',
            '<br>',
            '<br/>',
            '<div><br></div>',
            '<div><br/></div>',
            '<div></div>',
            '&nbsp;',
            '<p>&nbsp;</p>',
            '<div>&nbsp;</div>'
        ];
        
        // Check if description is empty after stripping HTML
        let isActuallyEmpty = false;
        let tempDescription = cleanDescription;
        
        // Remove all HTML tags to check if there's real text
        const textOnly = tempDescription.replace(/<[^>]*>/g, '').trim();
        
        if (textOnly === '') {
            isActuallyEmpty = true;
        }
        
        // Also check against empty patterns
        for (const pattern of emptyPatterns) {
            if (cleanDescription === pattern || cleanDescription === pattern.toLowerCase()) {
                isActuallyEmpty = true;
                break;
            }
        }
        
        // If empty, set to empty string
        if (isActuallyEmpty || !cleanDescription || cleanDescription.trim() === '') {
            cleanDescription = '';
        }
        
      const { data, error } = await supabaseClient
    .from('courses')
    .insert({
        title:           title.trim(),
        description:     cleanDescription,
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
async function updateCourse(courseId, { title, description, durationWeeks, instructor, status, orderNum }) {
    try {
        // FIX: Clean the description properly
        let cleanDescription = description || '';
        
        // Remove all possible empty HTML patterns
        const emptyPatterns = [
            '<p><br></p>', '<p><br/>', '<p> </p>', '<p></p>',
            '<br>', '<br/>', '<div><br></div>', '<div></div>',
            '&nbsp;', '<p>&nbsp;</p>', '<div>&nbsp;</div>'
        ];
        
        // Check if description has real text
        const textOnly = cleanDescription.replace(/<[^>]*>/g, '').trim();
        
        let isActuallyEmpty = textOnly === '';
        
        for (const pattern of emptyPatterns) {
            if (cleanDescription === pattern || cleanDescription === pattern.toLowerCase()) {
                isActuallyEmpty = true;
                break;
            }
        }
        
        if (isActuallyEmpty || !cleanDescription || cleanDescription.trim() === '') {
            cleanDescription = '';
        }
        
        const { data, error } = await supabaseClient
            .from('courses')
            .update({
                title:          title?.trim(),
                description:    cleanDescription,
                duration_weeks: durationWeeks,
                instructor:     instructor?.trim(),
                status:         status || 'active',
                order_num:      orderNum,
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

    // Fetch real topic counts per course
    const { data: topicRows } = await supabaseClient
        .from('topics')
        .select('course_id');
    const topicCountMap = {};
    (topicRows || []).forEach(t => {
        topicCountMap[t.course_id] = (topicCountMap[t.course_id] || 0) + 1;
    });

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
        id:           course.id,
        title:        course.title,
        instructor:   course.instructor || 'ASAI Instructor',
        description:  course.description || '',
        progress:     progressMap[course.id] || 0,
        order_num:    course.order_num ?? 999,
        lesson_count: course.lesson_count || 0,
        icon:         course.icon || null,
        student_count: course.student_count || null,
        notes:        [],
        videos:       [],
        quizzes:      [],
        assignments:  []
    };
});
window.coursesData = coursesData;
        console.log('✅ coursesData populated:', Object.keys(coursesData));
    }

 
    // ── Render course cards ──
    renderStudentCourseCards(result.courses, progressMap, topicCountMap);
}
// Renders cards into BOTH grids on the student dashboard
function renderStudentCourseCards(courses, progressMap = {}, topicCountMap = {}) {

    const thumbColors = {
        purple: '#7F77DD',
        orange: '#BA7517',
        violet: '#378ADD',
        green:  '#1D9E75'
    };

    const fallbackColors = ['#7F77DD', '#BA7517', '#378ADD', '#1D9E75'];

    const grids = [
        document.getElementById('courseSelection'),
        document.querySelector('#dashboardSection .courses-grid')
    ];

    grids.forEach(grid => {
        if (!grid) return;
        grid.innerHTML = '';

        courses.forEach((course, index) => {
            const progress    = progressMap[course.id] || 0;
            const thumbColor  = thumbColors[course.thumbnail_color] || fallbackColors[index % fallbackColors.length];
            const fallbackIcons       = ['fa-robot', 'fa-database', 'fa-code', 'fa-brain'];
            const fallbackStudents    = ['45+', '30+', '28+', '22+'];

            const icon        = course.icon          || fallbackIcons[index % fallbackIcons.length];
            const lessonCount = topicCountMap[course.id] || 0;
            const studentNum  = course.student_count || fallbackStudents[index % fallbackStudents.length];
            const instructor  = course.instructor    || 'ASAI Instructor';

          const isCompleted = progress >= 90;
const isStarted   = progress > 0 && !isCompleted;

const prevCourse = index > 0 ? courses[index - 1] : null;

let unlocked;
if (course.admin_lock_override === 'locked') {
    unlocked = false;
} else if (course.admin_lock_override === 'unlocked') {
    unlocked = true;
} else if (!prevCourse) {
    unlocked = true;
} else {
    const prevProgress = progressMap[prevCourse.id] || 0;
    unlocked = prevProgress >= 90;
}

const btnLabel = isCompleted ? '✓ Completed'
               : !unlocked  ? '🔒 Locked'//comment
               : isStarted  ? 'Continue'
               : 'Start';

const btnColor = isCompleted ? '#1D9E75'
               : !unlocked  ? '#9ca3af'
               : isStarted  ? '#378ADD'
               : '#7F77DD';

const progLabel = isCompleted
    ? '<span style="color:#1D9E75;">✓ Completed!</span>'
    : !unlocked
    ? '<span style="color:#9ca3af;"><i class="fas fa-lock" style="font-size:10px;"></i> Finish previous course to unlock</span>'
    : isStarted ? progress + '% complete'
    : 'Not started';

            const card = document.createElement('div');
            card.setAttribute('data-course', course.id);
            card.style.cssText = `
                background: white; border-radius: 16px; overflow: hidden;
                border: 1px solid #e5e7eb; cursor: pointer;
                transition: transform 0.25s ease, box-shadow 0.25s ease;
                display: flex; flex-direction: column; padding: 0;
            `;

            card.innerHTML = `
                <div style="
                    height:150px; background:${thumbColor};
                    display:flex; align-items:center; justify-content:center;
                    position:relative; overflow:hidden; flex-shrink:0;
                ">
                    ${lessonCount ? `
                    <span style="
                        position:absolute; top:11px; left:11px;
                        background:rgba(0,0,0,0.38); color:#fff;
                        font-size:10px; font-weight:600;
                        padding:3px 9px; border-radius:20px;
                        display:flex; align-items:center; gap:4px;
                    ">
                        <i class="fas fa-play-circle" style="font-size:10px;"></i> ${lessonCount}x lesson
                    </span>` : ''}

                    <i class="fas ${escapeHtml(icon)}" style="font-size:3rem;color:rgba(255,255,255,0.92);"></i>
${!unlocked ? `
<div style="position:absolute;inset:0;background:rgba(0,0,0,0.45);
            display:flex;flex-direction:column;align-items:center;
            justify-content:center;border-radius:inherit;">
    <i class="fas fa-lock" style="font-size:2rem;color:rgba(255,255,255,0.9);margin-bottom:6px;"></i>
    <span style="font-size:11px;color:rgba(255,255,255,0.75);font-weight:700;">Locked</span>
</div>` : ''}
</div>

                <div style="padding:14px 14px 16px; display:flex; flex-direction:column; flex:1;">
                    <div style="font-size:14px; font-weight:700; color:#1f2937; line-height:1.4; margin-bottom:12px;">
                        ${escapeHtml(course.title)}
                    </div>

                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div style="
                                width:30px; height:30px; border-radius:8px;
                                background:#E6F1FB; display:flex; align-items:center;
                                justify-content:center; flex-shrink:0;
                            ">
                                <i class="fas fa-user" style="font-size:13px;color:#378ADD;"></i>
                            </div>
                            <div style="font-size:12px; font-weight:600; color:#1f2937; line-height:1.2;">
                                ${escapeHtml(instructor)}
                            </div>
                        </div>
                        ${studentNum ? `
                        <div style="display:flex; align-items:center; gap:4px; font-size:11px; color:#6b7280;">
                            <i class="fas fa-users" style="font-size:11px;color:#7F77DD;"></i>
                            ${escapeHtml(studentNum)}
                        </div>` : ''}
                    </div>

                    <div style="height:5px; background:#f3f4f6; border-radius:99px; overflow:hidden; margin-bottom:4px;">
                        <div style="height:5px; border-radius:99px; background:${btnColor}; width:${progress}%; transition:width 0.5s ease;"></div>
                    </div>
                    <div style="font-size:10px; color:#6b7280; margin-bottom:12px;">${progLabel}</div>

                    <div style="
                        display:flex; align-items:center; justify-content:flex-end;
                        padding-top:10px; border-top:1px solid #f3f4f6; margin-top:auto;
                    ">
                        <button style="
                            padding:5px 14px; border-radius:20px;
                            font-size:11px; font-weight:700; cursor:pointer;
                            border:1.5px solid ${btnColor};
                            color:${btnColor}; background:transparent;
                            font-family:'Plus Jakarta Sans',sans-serif; transition:all 0.2s;
                        "
                        onmouseover="this.style.background='${btnColor}';this.style.color='white';"
                        onmouseout="this.style.background='transparent';this.style.color='${btnColor}';"
                        >${btnLabel}</button>
                    </div>
                </div>
            `;

            card.addEventListener('mouseenter', () => {
                card.style.transform = 'translateY(-5px)';
                card.style.boxShadow = '0 16px 40px rgba(0,0,0,0.10)';
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'translateY(0)';
                card.style.boxShadow = 'none';
            });

            card.addEventListener('click', function () {
    const id = this.getAttribute('data-course');
    if (!id) return;

    if (!unlocked) {
        const prevTitle = prevCourse?.title || 'the previous course';
        if (typeof showToast === 'function') {
    showToast(`🔒 Complete "${prevTitle}" first to unlock this course.`, 'warning');
    setTimeout(() => {
        const toast = document.querySelector('.toast, .toast-message, [class*="toast"]');
        if (toast) {
            toast.style.background = '#ffffff';
            toast.style.color = '#1f2937';
            toast.style.border = '1.5px solid #e5e7eb';
            toast.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)';
        }
    }, 10);
}
        return;
    }

    if (typeof selectCourse === 'function') {
                    selectCourse(id);
                } else {
                    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                    const nav = document.querySelector('.nav-item[data-section="courses"]');
                    if (nav) nav.classList.add('active');
                    document.querySelectorAll('.dashboard-section').forEach(s => s.classList.remove('active'));
                    const sec = document.getElementById('coursesSection');
                    if (sec) sec.classList.add('active');
                    setTimeout(() => selectCourse(id), 50);
                }
            });

            grid.appendChild(card);
        });

        console.log('✅ renderStudentCourseCards: rendered', courses.length, 'cards');
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
    const orderEl = document.getElementById('displayOrder');
    if (orderEl) orderEl.value = course.order_num || 1;
    
    // Clear and set description in editor
    const editor = document.getElementById('courseDescriptionEditor');
    if (editor) {
        editor.innerHTML = course.description || '';
    }
    const descHidden = document.getElementById('courseDescription');
    if (descHidden) descHidden.value = course.description || '';
    
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
    // Open the modal FIRST so all elements exist in DOM
    document.getElementById('addCourseModal')?.classList.add('active');

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
        const descHidden = document.getElementById('courseDescription');
        if (descHidden) descHidden.value = description;
        
        const fd = new FormData(e.target);
       const r = await updateCourse(window.editingCourseId, {
            title:         fd.get('title'),
            description:   description,
            durationWeeks: parseInt(fd.get('duration')) || 12,
            instructor:    fd.get('instructor'),
            orderNum:      parseInt(fd.get('order_num')) || 1
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

}
// Helper function to escape HTML for attributes
function escapeHtmlForAttr(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
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
// Patch renderStudentCourseCards to always preserve order_num
const _originalRender = window.renderStudentCourseCards;
window.renderStudentCourseCards = function(courses, progressMap) {
    courses.forEach(c => {
        if (window.coursesData[c.id]) {
            window.coursesData[c.id].order_num = c.order_num ?? 999;
        }
    });
    if (_originalRender) _originalRender(courses, progressMap);
};
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

    // Student dashboard rendering is now handled exclusively by
    // loadCoursesFromDB()/renderCourseCards() inside student-dashboard.html.
    // courses.js's loadStudentDashboardCourses() was rendering the same
    // grid a second time and overwriting the lock-overlay/lesson-count fixes.
    if (isStudentPage) {
        console.log('🎓 Student page detected — skipping courses.js render (handled by student-dashboard.html)');
    }
});
console.log('✅ Courses.js loaded');