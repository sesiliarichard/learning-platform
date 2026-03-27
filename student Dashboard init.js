

// ─────────────────────────────────────────────
// RUNS ON PAGE LOAD
// Checks auth, loads profile, fills the UI
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

    // ── STEP 1: Check if user is logged in ──
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        // Not logged in — send to login page
        window.location.href = 'login.html';
        return;
    }

    // ── STEP 2: Fetch profile from Supabase ──
    const { data: profile, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
         .maybeSingle();

    if (error || !profile) {
        console.error('Could not load profile:', error);
        window.location.href = 'login.html';
        return;
    }

    // ── STEP 3: Fill profile into the dashboard UI ──
    loadProfileIntoUI(profile);

    // ── STEP 4: Save to localStorage so other functions can use it ──
    localStorage.setItem('userProfileData', JSON.stringify({
        firstName:      profile.first_name,
        lastName:       profile.last_name,
        email:          profile.email,
        phone:          profile.phone,
        country:        profile.country,
        profilePicture: profile.avatar_url || null,
        role:           profile.role,
        createdAt:      profile.created_at
    }));

    // ── STEP 5: Set Member Since date from real account creation ──
    if (profile.created_at) {
        const date = new Date(profile.created_at);
        const formatted = date.toLocaleDateString('en-US', {
            month: 'long',
            year:  'numeric'
        });
        const el = document.getElementById('memberSince');
        if (el) el.textContent = formatted;
    }

    console.log('✅ Profile loaded from Supabase:', profile.first_name, profile.last_name);
});

// ─────────────────────────────────────────────
// FILL PROFILE DATA INTO THE UI
// Updates every element that shows user info
// ─────────────────────────────────────────────
function loadProfileIntoUI(profile) {
    const firstName = profile.first_name || '';
    const lastName  = profile.last_name  || '';
    const fullName  = `${firstName} ${lastName}`.trim();
    const email     = profile.email      || '';
    const initials  = ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || '?';

    // ── Header (top of dashboard) ──
    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = fullName;

    const headerAvatarEl = document.getElementById('headerAvatar');
    if (headerAvatarEl) headerAvatarEl.textContent = initials;

    // ── Profile Section ──
    const profileNameEl = document.getElementById('profileName');
    if (profileNameEl) profileNameEl.textContent = fullName;

    const profileEmailEl = document.getElementById('profileEmail');
    if (profileEmailEl) profileEmailEl.textContent = email;

    const emailDisplayEl = document.getElementById('emailDisplay');
    if (emailDisplayEl) emailDisplayEl.textContent = email;

    const profileInitialsEl = document.getElementById('profileInitials');
    if (profileInitialsEl) profileInitialsEl.textContent = initials;

    // ── Profile Picture (if saved in Supabase Storage) ──
    if (profile.avatar_url) {
        const profileImageEl = document.getElementById('profileImage');
        if (profileImageEl) {
            profileImageEl.src = profile.avatar_url;
            profileImageEl.style.display = 'block';
            if (profileInitialsEl) profileInitialsEl.style.display = 'none';
        }
    }

    // ── Also update the userData object used by existing dashboard code ──
    if (typeof userData !== 'undefined') {
        userData.firstName      = firstName;
        userData.lastName       = lastName;
        userData.email          = email;
        userData.profilePicture = profile.avatar_url || null;
    }
}

// ─────────────────────────────────────────────
// REAL LOGOUT — replaces the fake one in dashboard
// Calls Supabase signOut then redirects
// ─────────────────────────────────────────────
async function logout() {
    try {
        showToast('Logging out...', 'warning');

        // Sign out from Supabase
        await supabaseClient.auth.signOut();

        // Clear all local data
        sessionStorage.clear();
        localStorage.removeItem('userProfileData');
        localStorage.removeItem('themePreference');
        localStorage.removeItem('sidebarCollapsed');

        // Redirect to login
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1000);

    } catch (error) {
        console.error('Logout error:', error);
        // Redirect anyway
        window.location.href = 'login.html';
    }
}

// ─────────────────────────────────────────────
// REAL CHANGE PASSWORD — replaces the fake one
// Uses Supabase Auth to update password
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (!changePasswordForm) return;

    // Remove existing listener by cloning the form
    const newForm = changePasswordForm.cloneNode(true);
    changePasswordForm.parentNode.replaceChild(newForm, changePasswordForm);

    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const currentPassword    = document.getElementById('currentPassword').value;
        const newPassword        = document.getElementById('newPassword').value;
        const confirmNewPassword = document.getElementById('confirmNewPassword').value;

        // Validate
        if (newPassword.length < 8) {
            showToast('New password must be at least 8 characters', 'error');
            return;
        }

        if (newPassword !== confirmNewPassword) {
            showToast('New passwords do not match', 'error');
            return;
        }

        // Re-verify current password first
        const { data: { user } } = await supabaseClient.auth.getUser();
        const { error: reAuthError } = await supabaseClient.auth.signInWithPassword({
            email:    user.email,
            password: currentPassword
        });

        if (reAuthError) {
            showToast('Current password is incorrect', 'error');
            return;
        }

        // Update to new password
        const { error } = await supabaseClient.auth.updateUser({
            password: newPassword
        });

        if (error) {
            showToast('Error: ' + error.message, 'error');
            return;
        }

        showToast('Password changed successfully! ✅', 'success');
        closeChangePasswordModal();
        newForm.reset();
    });
});

// ─────────────────────────────────────────────
// REAL PROFILE PICTURE UPLOAD
// Uploads to Supabase Storage & saves URL
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('profilePictureInput');
    if (!input) return;

    // Override the existing file change handler
    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showToast('Please select an image file', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showToast('Image must be under 5MB', 'error');
            return;
        }

        showToast('Uploading profile picture...', 'success');

        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}/avatar.${fileExt}`;

            // Upload to Supabase Storage
            const { error: uploadError } = await supabaseClient.storage
                .from('avatars')
                .upload(fileName, file, { upsert: true });

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: urlData } = supabaseClient.storage
                .from('avatars')
                .getPublicUrl(fileName);

            const avatarUrl = urlData.publicUrl;

            // Save URL to profiles table
            await supabaseClient
                .from('profiles')
                .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
                .eq('id', user.id);

            // Show in UI immediately
            const profileImageEl = document.getElementById('profileImage');
            const profileInitialsEl = document.getElementById('profileInitials');

            if (profileImageEl) {
                profileImageEl.src = avatarUrl;
                profileImageEl.style.display = 'block';
            }
            if (profileInitialsEl) {
                profileInitialsEl.style.display = 'none';
            }

            // Update localStorage
            const saved = JSON.parse(localStorage.getItem('userProfileData') || '{}');
            saved.profilePicture = avatarUrl;
            localStorage.setItem('userProfileData', JSON.stringify(saved));

            showToast('Profile picture updated! ✅', 'success');

        } catch (err) {
            console.error('Upload error:', err);
            showToast('Upload failed: ' + err.message, 'error');
        }
    }, { once: false });
});

console.log('✅ Dashboard-init.js loaded');