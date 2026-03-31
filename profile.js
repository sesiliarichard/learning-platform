// ============================================
// ASAI — PROFILE.JS
// Student Profile Backend Functions
// Covers all 4 API endpoints:
//   GET  /api/students/:id/profile
//   PUT  /api/students/:id/profile
//   POST /api/students/:id/avatar
//   GET  /api/students/:id/stats
// Depends on: supabase-config.js, auth.js
// ============================================

// ─────────────────────────────────────────────
// 1. GET STUDENT PROFILE
//    Fetches full profile data from Supabase
//    Equivalent to: GET /api/students/:id/profile
// ─────────────────────────────────────────────
async function getStudentProfile(userId = null) {
    try {
        // If no userId passed, get the currently logged-in user
        if (!userId) {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) throw new Error('Not authenticated');
            const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
            if (authError || !user) throw new Error('Not authenticated');
            userId = user.id;
        }

        const { data: profile, error } = await supabaseClient
            .from('profiles')
            .select(`
                id,
                first_name,
                last_name,
                email,
                phone,
                country,
                role,
                status,
                avatar_url,
                created_at,
                updated_at
            `)
            .eq('id', userId)
             .maybeSingle();

        if (error) throw error;

        return {
            success: true,
            profile: {
                id:          profile.id,
                firstName:   profile.first_name,
                lastName:    profile.last_name,
                fullName:    `${profile.first_name} ${profile.last_name}`,
                email:       profile.email,
                phone:       profile.phone        || '',
                country:     profile.country      || '',
                role:        profile.role         || 'student',
                status:      profile.status       || 'active',
                avatarUrl:   profile.avatar_url   || null,
                createdAt:   profile.created_at,
                updatedAt:   profile.updated_at,
                memberSince: formatMemberSince(profile.created_at)
            }
        };

    } catch (error) {
        console.error('❌ getStudentProfile error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 2. UPDATE STUDENT PROFILE
//    Updates name, phone, country in Supabase
//    Equivalent to: PUT /api/students/:id/profile
// ─────────────────────────────────────────────
async function updateStudentProfile({ firstName, lastName, phone, country }) {
    try {
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !user) throw new Error('Not authenticated');

        // Validate inputs
        if (!firstName?.trim()) throw new Error('First name is required');
        if (!lastName?.trim())  throw new Error('Last name is required');

        const { data, error } = await supabaseClient
            .from('profiles')
            .update({
                first_name: firstName.trim(),
                last_name:  lastName.trim(),
                phone:      phone?.trim()   || '',
                country:    country?.trim() || '',
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id)
            .select()
            .maybeSingle();

        if (error) throw error;

        // Keep localStorage in sync so dashboard shows updated name immediately
        const saved = JSON.parse(localStorage.getItem('userProfileData') || '{}');
        saved.firstName = data.first_name;
        saved.lastName  = data.last_name;
        saved.phone     = data.phone;
        saved.country   = data.country;
        localStorage.setItem('userProfileData', JSON.stringify(saved));

        // Update UI immediately
        updateProfileUI({
            firstName:  data.first_name,
            lastName:   data.last_name,
            email:      data.email,
            avatarUrl:  data.avatar_url
        });

        return {
            success: true,
            profile: data,
            message: 'Profile updated successfully!'
        };

    } catch (error) {
        console.error('❌ updateStudentProfile error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 3. UPLOAD / CHANGE PROFILE AVATAR
//    Uploads image to Supabase Storage
//    Saves public URL to profiles table
//    Equivalent to: POST /api/students/:id/avatar
// ─────────────────────────────────────────────
async function uploadStudentAvatar(file) {
    try {
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !user) throw new Error('Not authenticated');

        // Validate file
        if (!file)                          throw new Error('No file selected');
        if (!file.type.startsWith('image/')) throw new Error('Please select an image file (JPG, PNG, etc.)');
        if (file.size > 5 * 1024 * 1024)    throw new Error('Image must be under 5MB');

        // Build file path: avatars/USER_ID/avatar.jpg
        const fileExt  = file.name.split('.').pop().toLowerCase();
        const fileName = `${user.id}/avatar.${fileExt}`;

        // Upload to Supabase Storage bucket "avatars"
        const { error: uploadError } = await supabaseClient.storage
            .from('avatars')
            .upload(fileName, file, {
                upsert:      true,       // Overwrite if exists
                contentType: file.type
            });

        if (uploadError) throw uploadError;

        // Get the public URL
        const { data: urlData } = supabaseClient.storage
            .from('avatars')
            .getPublicUrl(fileName);

        // Add cache-buster so browser shows new image immediately
        const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

        // Save URL to profiles table
        const { error: updateError } = await supabaseClient
            .from('profiles')
            .update({
                avatar_url: avatarUrl,
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id);

        if (updateError) throw updateError;

        // Update localStorage
        const saved = JSON.parse(localStorage.getItem('userProfileData') || '{}');
        saved.profilePicture = avatarUrl;
        localStorage.setItem('userProfileData', JSON.stringify(saved));

        // Show new image in UI immediately
        showAvatarInUI(avatarUrl);

        return {
            success:   true,
            avatarUrl: avatarUrl,
            message:   'Profile picture updated!'
        };

    } catch (error) {
        console.error('❌ uploadStudentAvatar error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 4. GET STUDENT STATS

// ─────────────────────────────────────────────
async function getStudentStats(userId = null) {
    try {
        if (!userId) {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) throw new Error('Not authenticated');
            const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
            if (authError || !user) throw new Error('Not authenticated');
            userId = user.id;
        }

 const [certificatesResult, quizScoresResult, assignmentScoresResult] = 
await Promise.all([

    supabaseClient
        .from('certificates')
        .select('id')
        .eq('student_id', userId),    

    supabaseClient
        .from('quiz_submissions')
        .select('score')
        .eq('student_id', userId),    

    supabaseClient
        .from('assignment_submissions')
        .select('score, max_score')
        .eq('student_id', userId)     
        .not('score', 'is', null)
]);

        // ✅ Safely handle errors - empty array if table missing
        const certificates     = certificatesResult.error     ? [] : (certificatesResult.data     || []);
        const quizScores       = quizScoresResult.error       ? [] : (quizScoresResult.data       || []);
        const assignmentScores = assignmentScoresResult.error ? [] : (assignmentScoresResult.data || []);

        // Log warnings but don't crash
        if (certificatesResult.error)     console.warn('certificates:', certificatesResult.error.message);
        if (quizScoresResult.error)       console.warn('quiz_submissions:', quizScoresResult.error.message);
        if (assignmentScoresResult.error) console.warn('assignment_submissions:', assignmentScoresResult.error.message);

        // ✅ Calculate stats from courses loaded in dashboard
        const coursesEnrolled  = Object.keys(window.coursesData || {}).length;
        const coursesCompleted = Object.values(window.coursesData || {})
                                       .filter(c => (c.progress || 0) >= 90).length;
        const certificatesCount = certificates.length;

        // Average score
        const allScores = [];
        quizScores.forEach(q => { if (q.score !== null) allScores.push(q.score); });
        assignmentScores.forEach(a => {
            if (a.score !== null && a.max_score > 0) {
                allScores.push(Math.round((a.score / a.max_score) * 100));
            }
        });

        const averageScore = allScores.length > 0
            ? Math.round(allScores.reduce((sum, s) => sum + s, 0) / allScores.length)
            : 0;

        const overallProgress = coursesEnrolled > 0
            ? Math.round(
                Object.values(window.coursesData || {})
                      .reduce((sum, c) => sum + (c.progress || 0), 0) / coursesEnrolled
              )
            : 0;

        const stats = {
            coursesEnrolled,
            coursesCompleted,
            certificatesCount,
            averageScore,
            overallProgress
        };

        updateStatsUI(stats);
        return { success: true, stats };

    } catch (error) {
        console.error('❌ getStudentStats error:', error.message);
        return { success: false, error: error.message };
    }
}
// ─────────────────────────────────────────────
// UI HELPERS
// These update the dashboard profile section
// ─────────────────────────────────────────────

// Update name/email/initials throughout the dashboard
function updateProfileUI({ firstName, lastName, email, avatarUrl }) {
    const fullName = `${firstName} ${lastName}`.trim();
    const initials = ((firstName?.[0] || '') + (lastName?.[0] || '')).toUpperCase();

    const els = {
        userName:        document.getElementById('userName'),
        profileName:     document.getElementById('profileName'),
        profileEmail:    document.getElementById('profileEmail'),
        emailDisplay:    document.getElementById('emailDisplay'),
        profileInitials: document.getElementById('profileInitials'),
        headerAvatar:    document.getElementById('headerAvatar')
    };

    if (els.userName)        els.userName.textContent        = fullName;
    if (els.profileName)     els.profileName.textContent     = fullName;
    if (els.profileEmail)    els.profileEmail.textContent    = email;
    if (els.emailDisplay)    els.emailDisplay.textContent    = email;
    if (els.profileInitials) els.profileInitials.textContent = initials;
    if (els.headerAvatar)    els.headerAvatar.textContent    = initials;

    if (avatarUrl) showAvatarInUI(avatarUrl);
}

// Show avatar image, hide initials
function showAvatarInUI(avatarUrl) {
    // ── Profile section ──────────────────────────
    const profileImage    = document.getElementById('profileImage');
    const profileInitials = document.getElementById('profileInitials');

    if (profileImage) {
        profileImage.src           = avatarUrl;
        profileImage.style.display = 'block';
    }
    if (profileInitials) {
        profileInitials.style.display = 'none';
    }

    // ── Header avatar (top-left circle) ──────────
    const headerAvatar = document.getElementById('headerAvatar');
    if (headerAvatar) {
        // Clear the initials text
        headerAvatar.textContent = '';

        // Check if image already exists inside header avatar
        let headerImg = document.getElementById('headerAvatarImg');
        if (!headerImg) {
            headerImg = document.createElement('img');
            headerImg.id = 'headerAvatarImg';
            headerImg.style.cssText = `
                width: 100%;
                height: 100%;
                object-fit: cover;
                border-radius: 50%;
                display: block;
            `;
            headerAvatar.appendChild(headerImg);
        }

        headerImg.src = avatarUrl;
        headerAvatar.style.padding    = '0';
        headerAvatar.style.overflow   = 'hidden';
    }
}
// Update the 4 stats cards in the profile section
function updateStatsUI({ coursesEnrolled, coursesCompleted, certificatesCount, averageScore, overallProgress }) {
    const els = {
        enrolledCoursesCount:  document.getElementById('enrolledCoursesCount'),
        completedCoursesCount: document.getElementById('completedCoursesCount'),
        certificatesEarned:    document.getElementById('certificatesEarnedCount'),
        certCount:             document.getElementById('certCount'),
        averageScore:          document.getElementById('averageScore'),
        overallProgress:       document.getElementById('overallProgress')
    };

    if (els.enrolledCoursesCount)  els.enrolledCoursesCount.textContent  = coursesEnrolled;
    if (els.completedCoursesCount) els.completedCoursesCount.textContent = coursesCompleted;
    if (els.certificatesEarned)    els.certificatesEarned.textContent    = certificatesCount;
    if (els.certCount)             els.certCount.textContent             = certificatesCount;
    if (els.averageScore)          els.averageScore.textContent          = averageScore + '%';
    if (els.overallProgress)       els.overallProgress.textContent       = overallProgress + '%';
}

// ─────────────────────────────────────────────
// HELPER: Format "Member Since" date
// ─────────────────────────────────────────────
function formatMemberSince(dateString) {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('en-US', {
        month: 'long',
        year:  'numeric'
    });
}

// ─────────────────────────────────────────────
// AUTO-INIT: Runs when page loads
// Loads profile + stats into the dashboard
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Check session before loading anything
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return; // Not logged in — skip profile loading

    // Load profile
    const profileResult = await getStudentProfile();
    if (profileResult.success) {
        const p = profileResult.profile;
        updateProfileUI({
            firstName: p.firstName,
            lastName:  p.lastName,
            email:     p.email,
            avatarUrl: p.avatarUrl
        });

        // Set member since
        const memberSinceEl = document.getElementById('memberSince');
        if (memberSinceEl) memberSinceEl.textContent = p.memberSince;
    }

    // Load stats (will show 0s until courses/quizzes sections are built)
    await getStudentStats();
});

// ─────────────────────────────────────────────
// EDIT PROFILE FORM HANDLER
// Attach this to your edit profile form/modal
// ─────────────────────────────────────────────
async function handleEditProfileSubmit(e) {
    e.preventDefault();

    // Get values from your form fields
    // Adjust these IDs to match your actual form input IDs
    const firstName = document.getElementById('editFirstName')?.value
                   || document.getElementById('firstName')?.value || '';
    const lastName  = document.getElementById('editLastName')?.value
                   || document.getElementById('lastName')?.value  || '';
    const phone     = document.getElementById('editPhone')?.value
                   || document.getElementById('phoneNumber')?.value || '';
    const country   = document.getElementById('editCountry')?.value
                   || document.getElementById('country')?.value   || '';

    // Show loading state
    const submitBtn = e.target.querySelector('[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled     = true;
        submitBtn.textContent  = 'Saving...';
    }

    const result = await updateStudentProfile({ firstName, lastName, phone, country });

    // Restore button
    if (submitBtn) {
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Save Changes';
    }

    if (result.success) {
        showToast('Profile updated successfully! ✅', 'success');
    } else {
        showToast('Error: ' + result.error, 'error');
    }
}

// ─────────────────────────────────────────────
// AVATAR UPLOAD HANDLER
// Attach to your profile picture input
// ─────────────────────────────────────────────
async function handleAvatarChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    showToast('Uploading picture...', 'success');

    const result = await uploadStudentAvatar(file);

    if (result.success) {
        showToast('Profile picture updated! ✅', 'success');
    } else {
        showToast('Upload failed: ' + result.error, 'error');
    }
}

// Wire up the profile picture input automatically
document.addEventListener('DOMContentLoaded', () => {
    const avatarInput = document.getElementById('profilePictureInput');
    if (avatarInput) {
        avatarInput.addEventListener('change', handleAvatarChange);
    }
});

console.log('✅ Profile.js loaded');