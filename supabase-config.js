// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = 'https://tnuztjayhzkrjhxjtgkf.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_nGNcyhaeIbVPqAgLiFnrtA_EATCLCnI';

function initSupabase() {
    if (typeof window.supabase !== 'undefined') {

        // Clear corrupted tokens before initializing
        try {
            const tokenKey = 'sb-tnuztjayhzkrjhxjtgkf-auth-token';
            const raw = localStorage.getItem(tokenKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                // If token exists but has no refresh_token, it's corrupted — clear it
                if (!parsed?.refresh_token) {
                    localStorage.removeItem(tokenKey);
                    console.warn('🧹 Cleared corrupted auth token');
                }
            }
        } catch(e) {
            // If JSON parse fails, token is corrupted — clear all auth data
            localStorage.clear();
            console.warn('🧹 Cleared invalid auth storage');
        }

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