// ============================================
// SUPABASE CONFIGURATION
// ============================================
window.SUPABASE_URL = 'https://tnuztjayhzkrjhxjtgkf.supabase.co'
const SUPABASE_URL = 'https://tnuztjayhzkrjhxjtgkf.supabase.co';     // url
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRudXp0amF5aHprcmpoeGp0Z2tmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMTQ5NzAsImV4cCI6MjA4Njg5MDk3MH0.2XmwU-e8FuYxdO0m2ZYKOU57bZe4AxOzZ36S_kH-vk4';   // public key

let supabaseClient;

try {
    if (typeof window !== 'undefined' && window.supabase) {
        window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        supabaseClient = window.supabaseClient; // keep local var too for backward compat
        console.log('✅ Supabase client initialized');
    } else {
        console.error('❌ Supabase CDN not loaded');
    }
} catch (error) {
    console.error('❌ Supabase init error:', error.message);
}