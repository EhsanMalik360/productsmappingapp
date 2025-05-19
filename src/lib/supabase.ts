import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

// Add type definitions for global variables
declare global {
  interface Window {
    VITE_SUPABASE_URL?: string;
    VITE_SUPABASE_ANON_KEY?: string;
    __SUPABASE_CREDENTIALS__?: {
      url: string;
      key: string;
    };
  }
}

// First try to get from environment variables
let supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
let supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// If not available (e.g., after refresh in production), check for global variables
if (!supabaseUrl && typeof window !== 'undefined') {
  supabaseUrl = window.VITE_SUPABASE_URL || (window.__SUPABASE_CREDENTIALS__?.url);
  console.log('Using global Supabase URL:', supabaseUrl);
}

if (!supabaseAnonKey && typeof window !== 'undefined') {
  supabaseAnonKey = window.VITE_SUPABASE_ANON_KEY || (window.__SUPABASE_CREDENTIALS__?.key);
  console.log('Using global Supabase key');
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials');
  throw new Error('Missing Supabase credentials. Please check your configuration.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});