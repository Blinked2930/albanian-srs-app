import { createClient } from '@supabase/supabase-js';

// The VIP switch for Ghost Mode
export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// This creates ONE single instance of the client that survives page navigations
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, 
    autoRefreshToken: true, 
    detectSessionInUrl: true,
    // explicitly tell iOS to use localStorage
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    // custom key so iOS doesn't accidentally wipe a generic 'supabase.auth.token'
    storageKey: 'albanian-srs-pwa-token', 
  },
});