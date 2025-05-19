import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

// Define consistent storage key for Supabase credentials
const CREDENTIALS_STORAGE_KEY = 'app_supabase_credentials';

// Add type definitions for global variables
declare global {
  interface Window {
    VITE_SUPABASE_URL?: string;
    VITE_SUPABASE_ANON_KEY?: string;
    __SUPABASE_CREDENTIALS__?: {
      url: string;
      key: string;
    };
    supabaseClient?: any;
  }
}

console.log('Initializing Supabase client...');

// Function to get credentials from a reliable source
function getSupabaseCredentials() {
  let supabaseUrl: string | undefined;
  let supabaseAnonKey: string | undefined;
  
  // Try to get from local storage first (this is our most reliable source)
  try {
    const storedCredentials = localStorage.getItem(CREDENTIALS_STORAGE_KEY);
    if (storedCredentials) {
      const credentials = JSON.parse(storedCredentials);
      supabaseUrl = credentials.url;
      supabaseAnonKey = credentials.key;
      console.log('Using stored credentials from localStorage');
      return { supabaseUrl, supabaseAnonKey };
    }
  } catch (e) {
    console.error('Error reading stored credentials:', e);
  }
  
  // Then try from environment variables (will work on first load)
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  
  if (supabaseUrl && supabaseAnonKey) {
    console.log('Using environment variables for Supabase credentials');
    
    // Store these for future page loads
    try {
      localStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify({
        url: supabaseUrl,
        key: supabaseAnonKey
      }));
    } catch (e) {
      console.error('Error storing credentials:', e);
    }
    
    return { supabaseUrl, supabaseAnonKey };
  }
  
  // Try global variables set by the HTML template
  if (typeof window !== 'undefined') {
    if (window.VITE_SUPABASE_URL && window.VITE_SUPABASE_ANON_KEY) {
      supabaseUrl = window.VITE_SUPABASE_URL;
      supabaseAnonKey = window.VITE_SUPABASE_ANON_KEY;
      console.log('Using window global variables for Supabase credentials');
    } else if (window.__SUPABASE_CREDENTIALS__?.url && window.__SUPABASE_CREDENTIALS__?.key) {
      supabaseUrl = window.__SUPABASE_CREDENTIALS__.url;
      supabaseAnonKey = window.__SUPABASE_CREDENTIALS__.key;
      console.log('Using __SUPABASE_CREDENTIALS__ for Supabase configuration');
    }
    
    // Store these for future page loads if found
    if (supabaseUrl && supabaseAnonKey) {
      try {
        localStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify({
          url: supabaseUrl,
          key: supabaseAnonKey
        }));
      } catch (e) {
        console.error('Error storing credentials:', e);
      }
    }
  }
  
  return { supabaseUrl, supabaseAnonKey };
}

// Get credentials from the best available source
const { supabaseUrl, supabaseAnonKey } = getSupabaseCredentials();

// Create the Supabase client with persistent storage options
let supabaseClient: any = null;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials after trying all sources');
  throw new Error('Missing Supabase credentials. Please check your configuration or clear browser storage and try again.');
} else {
  console.log('Creating Supabase client with URL:', supabaseUrl);
  
  // Create client with optimal session handling options
  supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false // Disable session detection in URL to avoid issues with refreshes
    }
  });
  
  // Also make available globally for consistent access
  if (typeof window !== 'undefined') {
    window.supabaseClient = supabaseClient;
  }
}

// Export the client
export const supabase = supabaseClient;