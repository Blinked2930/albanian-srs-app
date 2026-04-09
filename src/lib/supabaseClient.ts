import { createClient } from '@supabase/supabase-js';

// The VIP switch for Ghost Mode
export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// This creates ONE single instance of the client that survives page navigations
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // Forces Supabase to save the login to local storage
    autoRefreshToken: true, // Automatically keeps you logged in in the background
    detectSessionInUrl: true,
  },
});