import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,      
  import.meta.env.VITE_SUPABASE_ANON_KEY  
);

console.log('✅ Supabase client initialized');