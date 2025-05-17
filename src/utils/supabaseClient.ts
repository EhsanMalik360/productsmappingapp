import { createClient } from '@supabase/supabase-js';

// Get environment variables
let supabaseUrl = '';
let supabaseKey = '';

// Try to get from window if available (set by server)
// @ts-ignore
if (typeof window !== 'undefined' && window.__ENV__) {
  // @ts-ignore
  supabaseUrl = window.__ENV__.SUPABASE_URL || '';
  // @ts-ignore
  supabaseKey = window.__ENV__.SUPABASE_KEY || '';
}

// Fallback to environment variables
if (!supabaseUrl) supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
if (!supabaseKey) supabaseKey = import.meta.env.VITE_SUPABASE_KEY || '';

// Create supabase client
export const supabaseClient = createClient(supabaseUrl, supabaseKey);

// Export default client
export default supabaseClient; 