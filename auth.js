// ============================================
// ASAI — AUTH.JS
// All Authentication & User Management Functions
// Depends on: supabase-config.js (load it first)
// ============================================

// ─────────────────────────────────────────────
// 1. REGISTER NEW USER
// Called when student submits the Sign Up form
// ─────────────────────────────────────────────
async function registerUser({ firstName, lastName, email, phone, country, password }) {
    try {
        // Step 1: Create auth account in Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: email.trim().toLowerCase(),
            password: password,
options: {
    data: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: `${firstName.trim()} ${lastName.trim()}`,
        phone: phone.trim(),
        country: country
    }
}
        });

        if (authError) throw authError;

        return {
            success: true,
            user: authData.user,
          message: 'Account created successfully! You can now log in.'
        };

    } catch (error) {
        console.error('❌ Registration error:', error.message);
        return {
            success: false,
            error: getFriendlyError(error.message)
        };
    }
}

// ─────────────────────────────────────────────
// 2. LOGIN USER
// Called when student submits the Login form
// ─────────────────────────────────────────────
async function loginUser({ email, password, rememberMe = false }) {
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password: password
        });

        if (error) throw error;

        // Fetch their profile from our profiles table
        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .maybeSingle();

  if (profileError) throw profileError;

        // ✅ Guard: profile may not exist yet (email not confirmed)
        if (!profile) {
            throw new Error('Profile not found. Please confirm your email first, then log in.');
        }

        // Save to sessionStorage so dashboard pages can read it
        sessionStorage.setItem('userEmail', profile.email);
        sessionStorage.setItem('userName', `${profile.first_name} ${profile.last_name}`);
       
        // Save profile for dashboard profile page
        localStorage.setItem('userProfileData', JSON.stringify({
            firstName: profile.first_name,
            lastName: profile.last_name,
            email: profile.email,
            phone: profile.phone,
            country: profile.country,
            profilePicture: profile.avatar_url || null,
            role: profile.role
        }));

        // If "Remember Me" is checked, persist longer
        if (rememberMe) {
            localStorage.setItem('rememberMe', 'true');
        }

        return {
            success: true,
            user: data.user,
            profile: profile,
            role: profile.role
        };

    } catch (error) {
        console.error('❌ Login error:', error.message);
        return {
            success: false,
            error: getFriendlyError(error.message)
        };
    }
}

// ─────────────────────────────────────────────
// 3. LOGOUT USER
// Called from student dashboard & admin panel
// ─────────────────────────────────────────────
async function logoutUser() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;

        // Clear all local session data
        sessionStorage.clear();
        localStorage.removeItem('userProfileData');
        localStorage.removeItem('rememberMe');

        return { success: true };

    } catch (error) {
        console.error('❌ Logout error:', error.message);
        // Even if Supabase call fails, clear local data
        sessionStorage.clear();
        localStorage.removeItem('userProfileData');
        return { success: true }; // still redirect
    }
}

// ─────────────────────────────────────────────
// 4. FORGOT PASSWORD
// Sends a password reset email via Supabase
// ─────────────────────────────────────────────
async function forgotPassword(email) {
    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(
            email.trim().toLowerCase(),
            {
                // Where Supabase redirects after clicking reset link
                // Change this to your actual domain when deploying
                redirectTo: `${window.location.origin}/reset-password.html`
            }
        );

        if (error) throw error;

        return {
            success: true,
            message: `Password reset link sent to ${email}`
        };

    } catch (error) {
        console.error('❌ Forgot password error:', error.message);
        return {
            success: false,
            error: getFriendlyError(error.message)
        };
    }
}

// ─────────────────────────────────────────────
// 5. RESET PASSWORD (after clicking email link)
// User arrives on reset-password.html with token
// ─────────────────────────────────────────────
async function resetPassword(newPassword) {
    try {
        const { error } = await supabaseClient.auth.updateUser({
            password: newPassword
        });

        if (error) throw error;

        return {
            success: true,
            message: 'Password updated successfully!'
        };

    } catch (error) {
        console.error('❌ Reset password error:', error.message);
        return {
            success: false,
            error: getFriendlyError(error.message)
        };
    }
}

// ─────────────────────────────────────────────
// 6. CHANGE PASSWORD (from inside dashboard)
// User must know their current password
// ─────────────────────────────────────────────
async function changePassword(currentPassword, newPassword) {
    try {
        // Re-authenticate first to verify current password
        const currentUser = await getCurrentUser();
        if (!currentUser.success) throw new Error('Not logged in');

        const { error: reAuthError } = await supabaseClient.auth.signInWithPassword({
            email: currentUser.user.email,
            password: currentPassword
        });

        if (reAuthError) throw new Error('Current password is incorrect');

        // Now update to new password
        const { error } = await supabaseClient.auth.updateUser({
            password: newPassword
        });

        if (error) throw error;

        return {
            success: true,
            message: 'Password changed successfully!'
        };

    } catch (error) {
        console.error('❌ Change password error:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// ─────────────────────────────────────────────
// 7. GET CURRENT SESSION
// Check if a user is logged in
// Use this at the top of dashboard pages
// ─────────────────────────────────────────────
async function getSession() {
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error) throw error;

        return {
            success: true,
            session: session,
            isLoggedIn: !!session
        };

    } catch (error) {
        console.error('❌ Session error:', error.message);
        return {
            success: false,
            session: null,
            isLoggedIn: false
        };
    }
}

// ─────────────────────────────────────────────
// 8. GET CURRENT USER + PROFILE
// Fetches full user object and their profile row
// ─────────────────────────────────────────────
async function getCurrentUser() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
        if (authError || !user) throw new Error('Not authenticated');

        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

        if (profileError) throw profileError;

        return {
            success: true,
            user: user,
            profile: profile
        };

    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// ─────────────────────────────────────────────
// 9. UPDATE PROFILE
// Update name, phone, country, avatar_url
// ─────────────────────────────────────────────
async function updateProfile(updates) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabaseClient
            .from('profiles')
            .update({
                first_name: updates.firstName,
                last_name: updates.lastName,
                phone: updates.phone,
                country: updates.country,
                avatar_url: updates.avatarUrl,
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id)
            .select()
            .maybeSingle();

        if (error) throw error;

        // Keep localStorage in sync
        localStorage.setItem('userProfileData', JSON.stringify({
            firstName: data.first_name,
            lastName: data.last_name,
            email: data.email,
            phone: data.phone,
            country: data.country,
            profilePicture: data.avatar_url || null,
            role: data.role
        }));

        return { success: true, profile: data };

    } catch (error) {
        console.error('❌ Update profile error:', error.message);
        return {
            success: false,
            error: getFriendlyError(error.message)
        };
    }
}

// ─────────────────────────────────────────────
// 10. UPLOAD PROFILE PICTURE
// Uploads image to Supabase Storage, saves URL
// ─────────────────────────────────────────────
async function uploadProfilePicture(file) {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Validate file
        if (!file.type.startsWith('image/')) throw new Error('Please select an image file');
        if (file.size > 5 * 1024 * 1024) throw new Error('Image must be under 5MB');

        // Upload to Supabase Storage bucket "avatars"
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/avatar.${fileExt}`;

        const { error: uploadError } = await supabaseClient.storage
            .from('avatars')
            .upload(fileName, file, { upsert: true });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabaseClient.storage
            .from('avatars')
            .getPublicUrl(fileName);

        const avatarUrl = urlData.publicUrl;

        // Save URL to profile
        await updateProfile({ avatarUrl });

        return { success: true, avatarUrl };

    } catch (error) {
        console.error('❌ Upload avatar error:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// ─────────────────────────────────────────────
// 11. PROTECT DASHBOARD PAGES
// Call this at top of student-dashboard.html
// Redirects to login if not authenticated
// ─────────────────────────────────────────────
// ✅ Fixed version
async function requireAuth(redirectUrl = 'login.html') {
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();

        if (error || !session) {
            sessionStorage.clear();
            localStorage.removeItem('userProfileData');
            window.location.replace(redirectUrl);
            return null;
        }
        return session;
    } catch (error) {
        console.error('❌ requireAuth error:', error.message);
        sessionStorage.clear();
        localStorage.removeItem('userProfileData');
        window.location.replace(redirectUrl);
        return null;
    }
}
// ─────────────────────────────────────────────
// 12. PROTECT ADMIN PAGES
// Call this at top of admin.html
// Redirects non-admins away
// ─────────────────────────────────────────────
async function requireAdmin(redirectUrl = 'login.html') {
    const session = await requireAuth(redirectUrl);
    if (!session) return false;

    const result = await getCurrentUser();

    if (!result.success || !result.profile) {
        window.location.replace(redirectUrl);
        return false;
    }

    const profile = result.profile;

    if (profile.role !== 'admin') {
        if (profile.role === 'teacher') {
            window.location.replace('Teachers.html');
            return false;
        }
        if (profile.role === 'student') {
            window.location.replace('student-dashboard.html');
            return false;
        }
        window.location.replace(redirectUrl);
        return false;
    }

    document.body.style.visibility = 'visible';
    return true;
}
// ─────────────────────────────────────────────
// 13. PROTECT TEACHER PAGES 
// Call this at top of teacher-dashboard.html
// ─────────────────────────────────────────────
async function requireTeacher(redirectUrl = 'teacher-login.html') {
    const session = await requireAuth(redirectUrl);
    if (!session) return false;

    const result = await getCurrentUser();

    if (!result.success || !result.profile) {
        window.location.replace(redirectUrl);
        return false;
    }

    const profile = result.profile;

    if (profile.role !== 'teacher' && profile.role !== 'instructor') {
        if (profile.role === 'student') {
            window.location.replace('student-dashboard.html');
            return false;
        }
        if (profile.role === 'admin') {
            window.location.replace('admin.html');
            return false;
        }
        window.location.replace(redirectUrl);
        return false;
    }

    document.body.style.visibility = 'visible';
    return true;
}

// ─────────────────────────────────────────────
// HELPER: Convert Supabase errors to friendly messages
// ─────────────────────────────────────────────
function getFriendlyError(message) {
    const errors = {
        'Invalid login credentials':       'Incorrect email or password. Please try again.',
        'Email not confirmed':             'Please check your email and confirm your account first.',
        'User already registered':         'An account with this email already exists. Try logging in.',
        'Password should be at least 6':   'Password must be at least 8 characters long.',
        'Unable to validate email':        'Please enter a valid email address.',
        'Email rate limit exceeded':       'Too many attempts. Please wait a few minutes and try again.',
        'Invalid email':                   'Please enter a valid email address.',
    };

    for (const [key, friendly] of Object.entries(errors)) {
        if (message.includes(key)) return friendly;
    }

    return message; // fallback to original if no match
}


// ─────────────────────────────────────────────
// AUTH STATE LISTENER
// Automatically keeps session in sync
// ─────────────────────────────────────────────
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        sessionStorage.clear();
        localStorage.removeItem('userProfileData');
    }

    if (event === 'TOKEN_REFRESHED') {
        if (!session) {
            console.warn('⚠️ Token refresh failed, clearing storage and redirecting');
            localStorage.removeItem('sb-tnuztjayhzkrjhxjtgkf-auth-token');
            sessionStorage.clear();
            localStorage.removeItem('userProfileData');
            // Only redirect if on a protected page
            const publicPages = ['login.html', 'index.html', 'homepage.html'];
            const currentPage = window.location.pathname.split('/').pop();
            if (!publicPages.includes(currentPage)) {
                window.location.replace('login.html');
            }
        } else {
            console.log('🔄 Session token refreshed');
        }
    }

    if (event === 'PASSWORD_RECOVERY') {
        console.log('🔑 Password recovery mode active');
    }
});

console.log('✅ Auth.js loaded');