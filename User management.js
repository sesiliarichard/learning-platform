// ============================================
// USER MANAGEMENT — Full Supabase Version
// Replace your existing loadUsers, viewUser,
// editUser, deleteUser functions with these
// ============================================

let _cachedUsers = []; // cache for search/filter

// ─── LOAD ALL USERS FROM SUPABASE ───────────
async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    // Show loading state
    tbody.innerHTML = `
        <tr>
            <td colspan="6" style="text-align:center;padding:50px;color:#9ca3af;">
                <i class="fas fa-spinner fa-spin" style="font-size:28px;display:block;margin-bottom:12px;"></i>
                Loading users...
            </td>
        </tr>`;

    try {
        const roleFilter   = document.getElementById('userRoleFilter')?.value   || '';
        const searchFilter = document.getElementById('userSearchInput')?.value?.toLowerCase() || '';

        let query = db
            .from('profiles')
            .select('id, first_name, last_name, email, role, created_at, teacher_status')
            .order('created_at', { ascending: false });

        if (roleFilter) query = query.eq('role', roleFilter);

        const { data: users, error } = await query;
        if (error) throw error;

        // Cache for search
        _cachedUsers = users || [];

        // Apply client-side search filter
        const filtered = searchFilter
            ? _cachedUsers.filter(u =>
                `${u.first_name} ${u.last_name} ${u.email} ${u.role}`
                    .toLowerCase()
                    .includes(searchFilter))
            : _cachedUsers;

        renderUsersTable(filtered);
        updateAnalytics();

    } catch (err) {
        console.error('loadUsers error:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center;padding:40px;color:#ef4444;">
                    <i class="fas fa-exclamation-circle" style="font-size:28px;display:block;margin-bottom:10px;"></i>
                    Error loading users: ${err.message}
                </td>
            </tr>`;
    }
}

// ─── RENDER TABLE ROWS ───────────────────────
function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    if (!users || users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center;padding:60px;color:#9ca3af;">
                    <i class="fas fa-users-slash" style="font-size:36px;display:block;margin-bottom:12px;opacity:0.3;"></i>
                    No users found.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = '';

    users.forEach(user => {
        const firstName = user.first_name || '';
        const lastName  = user.last_name  || '';
        const initials  = ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || '?';
        const fullName  = `${firstName} ${lastName}`.trim() || 'Unknown';
        const date      = user.created_at
            ? new Date(user.created_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric'
              })
            : '—';

        // Avatar gradient per role
        const avatarGrad = {
            student:    'linear-gradient(135deg,#0099ff,#0066cc)',
            teacher:    'linear-gradient(135deg,#10b981,#059669)',
            admin:      'linear-gradient(135deg,#7c3aed,#5b21b6)',
            instructor: 'linear-gradient(135deg,#f59e0b,#d97706)'
        }[user.role] || 'linear-gradient(135deg,#6b7280,#4b5563)';

        // Role badge
        const roleBadgeClass = {
            student:    'active',
            teacher:    'pending',
            admin:      'inactive',
            instructor: 'pending'
        }[user.role] || 'active';

        // Status badge
        let statusHTML = '';
        if (user.role === 'teacher' || user.role === 'instructor') {
            const statusMap = {
                pending:  `<span class="badge pending" style="font-size:11px;">⏳ Pending</span>`,
                approved: `<span class="badge active"  style="font-size:11px;">✓ Approved</span>`,
                rejected: `<span class="badge inactive" style="font-size:11px;">✗ Rejected</span>`
            };
            statusHTML = statusMap[user.teacher_status] || statusMap.pending;
        } else if (user.role === 'admin') {
            statusHTML = `<span class="badge inactive" style="font-size:11px;background:#ede9fe;color:#5b21b6;">👑 Admin</span>`;
        } else {
            statusHTML = `<span class="badge active" style="font-size:11px;">● Active</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="user-info">
                    <div class="user-avatar" style="background:${avatarGrad};flex-shrink:0;">
                        ${initials}
                    </div>
                    <div>
                        <div style="font-weight:600;color:#1f2937;margin-bottom:2px;">${fullName}</div>
                        <div style="font-size:11px;color:#9ca3af;font-family:monospace;">
                            ${user.id.substring(0, 12)}…
                        </div>
                    </div>
                </div>
            </td>
            <td style="color:#6b7280;font-size:13px;">${user.email || '—'}</td>
            <td>
                <span class="badge ${roleBadgeClass}" style="text-transform:capitalize;">
                    ${user.role || '—'}
                </span>
            </td>
            <td>${statusHTML}</td>
            <td style="color:#6b7280;font-size:13px;">${date}</td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn view"
                        onclick="viewUser('${user.id}')" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn edit"
                        onclick="editUser('${user.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete"
                        onclick="deleteUser('${user.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Update count badge
    const countEl = document.getElementById('usersCount');
    if (countEl) countEl.textContent = users.length;
}

// ─── SEARCH HANDLER ──────────────────────────
function searchUsers(query) {
    if (!_cachedUsers.length) return;
    const q = query.toLowerCase();
    const filtered = q
        ? _cachedUsers.filter(u =>
            `${u.first_name} ${u.last_name} ${u.email} ${u.role}`
                .toLowerCase().includes(q))
        : _cachedUsers;
    renderUsersTable(filtered);
}

// ─── VIEW USER MODAL ─────────────────────────
async function viewUser(userId) {
    const { data: user, error } = await db
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

    if (error || !user) { showToast('User not found', 'error'); return; }

    const firstName = user.first_name || '';
    const lastName  = user.last_name  || '';
    const initials  = ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || '?';
    const fullName  = `${firstName} ${lastName}`.trim() || 'Unknown';

    const avatarGrad = {
        student:    'linear-gradient(135deg,#0099ff,#0066cc)',
        teacher:    'linear-gradient(135deg,#10b981,#059669)',
        admin:      'linear-gradient(135deg,#7c3aed,#5b21b6)',
        instructor: 'linear-gradient(135deg,#f59e0b,#d97706)'
    }[user.role] || 'linear-gradient(135deg,#6b7280,#4b5563)';

    const joined = user.created_at
        ? new Date(user.created_at).toLocaleDateString('en-US',
            { month: 'long', day: 'numeric', year: 'numeric' })
        : '—';

    // Get flag for view modal
function codeToFlag(code) {
    if (!code || code.length !== 2) return '🌍';
    return code.toUpperCase().replace(/./g,
        c => String.fromCodePoint(127397 + c.charCodeAt(0))
    );
}
let userFlag = '🌍';
let userCountryLabel = user.country || '—';
if (user.country?.length === 2) {
    userFlag = codeToFlag(user.country);
} else if (user.country?.length > 2) {
    const m = window._countryCache?.find(
        c => c.name.toLowerCase() === user.country.toLowerCase()
    );
    if (m) userFlag = codeToFlag(m.code);
}

const fields = [
    ['📧 Email',   user.email          || '—'],
    ['🎭 Role',    user.role           || '—'],
    ['✅ Status',  user.teacher_status || 'active'],
    ['🌍 Country', `${userFlag} ${userCountryLabel}`],
    ['📅 Joined',  joined],
    ['🔑 User ID', user.id]
];

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.style.zIndex = '4000';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:480px;">
            <div class="modal-header">
                <h2>User Details</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <!-- Avatar + Name -->
            <div style="display:flex;align-items:center;gap:16px;
                padding:20px;background:#f9fafb;border-radius:14px;margin-bottom:24px;">
                <div style="width:64px;height:64px;border-radius:50%;
                    background:${avatarGrad};display:flex;align-items:center;
                    justify-content:center;color:white;font-size:24px;
                    font-weight:700;flex-shrink:0;">
                    ${initials}
                </div>
                <div>
                    <div style="font-size:20px;font-weight:700;color:#0d1b3e;margin-bottom:4px;">
                        ${fullName}
                    </div>
                    <span class="badge active" style="text-transform:capitalize;">
                        ${user.role || 'user'}
                    </span>
                </div>
            </div>

            <!-- Fields -->
            <div style="display:flex;flex-direction:column;gap:10px;">
                ${fields.map(([label, value]) => `
                    <div style="display:flex;justify-content:space-between;align-items:center;
                        padding:12px 16px;background:#f9fafb;border-radius:10px;
                        border:1px solid #f3f4f6;">
                        <span style="font-weight:600;color:#6b7280;font-size:13px;">${label}</span>
                        <span style="color:#0d1b3e;font-size:13px;font-weight:500;
                            max-width:260px;word-break:break-all;text-align:right;">
                            ${value}
                        </span>
                    </div>`).join('')}
            </div>

            <div class="modal-actions">
                <button class="btn-secondary" style="flex:1;"
                    onclick="this.closest('.modal').remove()">Close</button>
                <button class="btn-primary" style="flex:1;"
                    onclick="this.closest('.modal').remove(); editUser('${user.id}')">
                    <i class="fas fa-edit"></i> Edit User
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

// ─── EDIT USER MODAL ─────────────────────────
async function editUser(userId) {
    const { data: user, error } = await db
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

    if (error || !user) { showToast('User not found', 'error'); return; }

    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.style.zIndex = '4000';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:460px;">
            <div class="modal-header">
                <h2>Edit User</h2>
                <button class="modal-close" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div style="padding:14px 16px;background:#f0f9ff;border:1px solid #bae6fd;
                border-radius:10px;margin-bottom:20px;font-size:14px;color:#0369a1;">
                <i class="fas fa-user" style="margin-right:8px;"></i>
                <strong>${fullName}</strong> &nbsp;·&nbsp; ${user.email || ''}
            </div>

            <div class="form-group">
                <label>First Name</label>
                <input type="text" id="editFirstName" value="${user.first_name || ''}">
            </div>
            <div class="form-group">
                <label>Last Name</label>
                <input type="text" id="editLastName" value="${user.last_name || ''}">
            </div>
            <div class="form-group">
                <label>Role</label>
                <select id="editUserRole">
                    <option value="student"  ${user.role === 'student'     ? 'selected' : ''}>Student</option>
                    <option value="teacher"  ${user.role === 'teacher'     ? 'selected' : ''}>Teacher</option>
                    <option value="instructor" ${user.role === 'instructor' ? 'selected' : ''}>Instructor</option>
                    <option value="admin"    ${user.role === 'admin'       ? 'selected' : ''}>Admin</option>
                </select>
            </div>
            <div class="form-group" id="editTeacherStatusGroup"
                style="display:${(user.role === 'teacher' || user.role === 'instructor') ? 'block' : 'none'}">
                <label>Teacher Approval Status</label>
                <select id="editTeacherStatus">
                    <option value="pending"  ${user.teacher_status === 'pending'  ? 'selected' : ''}>⏳ Pending</option>
                    <option value="approved" ${user.teacher_status === 'approved' ? 'selected' : ''}>✓ Approved</option>
                    <option value="rejected" ${user.teacher_status === 'rejected' ? 'selected' : ''}>✗ Rejected</option>
                </select>
            </div>

            <div class="modal-actions">
                <button class="btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                <button class="btn-primary" id="saveUserEditBtn"
                    onclick="saveUserEdit('${userId}', this)">
                    <i class="fas fa-save"></i> Save Changes
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    // Show/hide teacher status field based on role selection
    document.getElementById('editUserRole').addEventListener('change', function() {
        const show = this.value === 'teacher' || this.value === 'instructor';
        document.getElementById('editTeacherStatusGroup').style.display = show ? 'block' : 'none';
    });
}

// ─── SAVE USER EDIT ──────────────────────────
async function saveUserEdit(userId, btn) {
    const role        = document.getElementById('editUserRole')?.value;
    const firstName   = document.getElementById('editFirstName')?.value?.trim();
    const lastName    = document.getElementById('editLastName')?.value?.trim();
    const statusEl    = document.getElementById('editTeacherStatus');

    btn.disabled     = true;
    btn.innerHTML    = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const updates = { role };
    if (firstName !== undefined) updates.first_name = firstName;
    if (lastName  !== undefined) updates.last_name  = lastName;
    if (statusEl && (role === 'teacher' || role === 'instructor')) {
        updates.teacher_status = statusEl.value;
    }

    const { error } = await db.from('profiles').update(updates).eq('id', userId);

    if (error) {
        showToast('Error saving: ' + error.message, 'error');
        btn.disabled  = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
        return;
    }

    showToast('User updated successfully! ✅');
    btn.closest('.modal').remove();
    loadUsers();
}

// ─── DELETE USER ─────────────────────────────
async function deleteUser(userId) {
    // Fetch name first for the confirmation message
    const { data: user } = await db
        .from('profiles')
        .select('first_name, last_name, email, role')
        .eq('id', userId)
        .maybeSingle();

    const name  = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'this user';
    const email = user?.email || '';

    // Safety: prevent deleting own account
    const { data: { user: me } } = await db.auth.getUser();
    if (me?.id === userId) {
        showToast('You cannot delete your own account!', 'error');
        return;
    }

    if (!confirm(
        `Delete "${name}"?\n\nEmail: ${email}\nRole: ${user?.role || '—'}\n\n` +
        `This removes their profile from the database.\n` +
        `Their login account must be deleted separately in Supabase Auth if needed.`
    )) return;

    // ✅ Step 1: Delete related records in announcements first
    const { error: announcementsError } = await db
        .from('announcements')
        .delete()
        .eq('created_by', userId);

    if (announcementsError) {
        showToast('Error removing user announcements: ' + announcementsError.message, 'error');
        return;
    }

    // ✅ Step 2: Now safe to delete the profile
    const { error } = await db.from('profiles').delete().eq('id', userId);

    if (error) {
        showToast('Delete failed: ' + error.message, 'error');
        return;
    }

    showToast(`"${name}" deleted successfully`);
    loadUsers();
    updateAnalytics();
}