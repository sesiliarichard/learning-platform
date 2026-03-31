// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = 'https://tnuztjayhzkrjhxjtgkf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRudXp0amF5aHprcmpoeGp0Z2tmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMTQ5NzAsImV4cCI6MjA4Njg5MDk3MH0.2XmwU-e8FuYxdO0m2ZYKOU57bZe4AxOzZ36S_kH-vk4';

function initSupabase() {
    if (typeof window.supabase !== 'undefined') {
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: 'sb-tnuztjayhzkrjhxjtgkf-auth-token',
        storage: window.localStorage
    }
});
        window.db = window.supabaseClient;
        console.log('✅ Supabase client initialized');
    } else {
        console.error('❌ Supabase CDN not loaded');
    }
}

// If CDN already loaded, init now. Otherwise wait for it.
if (typeof window.supabase !== 'undefined') {
    initSupabase();
} else {
    window.addEventListener('load', initSupabase);
}