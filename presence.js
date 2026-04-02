window.onlineUserIds = new Set();

async function initPresenceTracking() {
    const sb = window.supabaseClient || window.db;
    if (!sb) return;

    const presenceChannel = sb.channel('online-users', {
        config: { presence: { key: 'user_id' } }
    });

    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel.presenceState();
            window.onlineUserIds = new Set(
                Object.values(state).flat().map(p => p.user_id).filter(Boolean)
            );
            if (document.getElementById('usersSection')?.classList.contains('active')) {
                renderTable();
            }
        })
        .on('presence', { event: 'join' }, ({ newPresences }) => {
            newPresences.forEach(p => p.user_id && window.onlineUserIds.add(p.user_id));
            if (document.getElementById('usersSection')?.classList.contains('active')) {
                renderTable();
            }
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }) => {
            leftPresences.forEach(p => p.user_id && window.onlineUserIds.delete(p.user_id));
            if (document.getElementById('usersSection')?.classList.contains('active')) {
                renderTable();
            }
        })
        .subscribe();
}

initPresenceTracking();