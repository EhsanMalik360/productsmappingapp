import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';

// Define types
type UserRole = 'admin' | 'user';

interface UserProfile {
  role: UserRole;
  is_active: boolean;
}

export interface AuthUser extends User {
  profile?: UserProfile;
}

interface AuthContextProps {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  supabase: SupabaseClient;
  signIn: (email: string, password: string) => Promise<{ error: any | null; data?: any }>;
  signOut: () => Promise<{ error: any | null }>;
  isAdmin: boolean;
}

// Create the context
const AuthContext = createContext<AuthContextProps | undefined>(undefined);

// Get the Supabase URL and anon key from env variables
console.log('Environment variables:', {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
});

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://wvgiaeuvyfsdhoxrjmib.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2Z2lhZXV2eWZzZGhveHJqbWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY2ODI4NTgsImV4cCI6MjA2MjI1ODg1OH0.Mr3FSXDZibMJBCWp-QdszbEPY9wxtC7M361WPuM2aiw';

// Create the Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Function to determine if a role is admin
const isAdminRole = (role: any): boolean => {
  if (!role) return false;
  
  // Handle string or object with toString
  const roleStr = typeof role === 'string' ? role : String(role);
  // Normalize: trim whitespace and convert to lowercase
  const normalizedRole = roleStr.trim().toLowerCase();
  
  return normalizedRole === 'admin';
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Initialize the auth state
  useEffect(() => {
    const initializeAuth = async () => {
      setLoading(true);
      
      // Get the session
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      console.log('Current session:', currentSession);

      if (currentSession) {
        setSession(currentSession);
        
        // Get the user
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        console.log('Current user:', currentUser);
        
        if (currentUser) {
          // Get the user's profile
          const { data: profileData, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', currentUser.id)
            .single();
          
          console.log('User profile data:', profileData);
          console.log('User profile error:', profileError);
          
          if (profileData) {
            console.log('User role from profile (raw):', profileData.role);
            console.log('Role type:', typeof profileData.role);
            console.log('Role stringified:', JSON.stringify(profileData.role));
            
            const isUserAdmin = isAdminRole(profileData.role);
            
            const authUser = { ...currentUser, profile: profileData } as AuthUser;
            setUser(authUser);
            setIsAdmin(isUserAdmin);
            console.log('Setting isAdmin to:', isUserAdmin, '(Based on role:', profileData.role, ')');
          } else {
            setUser(currentUser);
            setIsAdmin(false);
            console.log('No profile data found, setting isAdmin to false');
          }
        }
      }
      
      setLoading(false);
    };

    initializeAuth();

    // Set up listener for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        console.log('Auth state changed:', event);
        if (event === 'SIGNED_IN' && newSession) {
          setSession(newSession);
          const { data: { user: newUser } } = await supabase.auth.getUser();
          console.log('New user on sign in:', newUser);
          
          if (newUser) {
            // Get the user's profile
            const { data: profileData, error: profileError } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('user_id', newUser.id)
              .single();
            
            console.log('User profile on sign in:', profileData);
            console.log('Profile error on sign in:', profileError);
            
            if (profileData) {
              console.log('User role on sign in (raw):', profileData.role);
              console.log('Role type on sign in:', typeof profileData.role);
              console.log('Role stringified on sign in:', JSON.stringify(profileData.role));
              
              const isUserAdmin = isAdminRole(profileData.role);
              
              const authUser = { ...newUser, profile: profileData } as AuthUser;
              setUser(authUser);
              setIsAdmin(isUserAdmin);
              console.log('Setting isAdmin to:', isUserAdmin, '(Based on role:', profileData.role, ')');
            } else {
              setUser(newUser);
              setIsAdmin(false);
              console.log('No profile data found on sign in, isAdmin set to false');
            }
          }
        } else if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setIsAdmin(false);
        }
      }
    );

    // Clean up the subscription when the component unmounts
    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Sign in function
  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error };
      }

      return { data, error: null };
    } catch (error) {
      return { error };
    }
  };

  // Sign out function
  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      return { error };
    } catch (error) {
      return { error };
    }
  };

  const value = {
    user,
    session,
    loading,
    supabase,
    signIn,
    signOut,
    isAdmin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 