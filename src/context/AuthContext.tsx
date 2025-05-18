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

      if (currentSession) {
        setSession(currentSession);
        
        // Get the user
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        
        if (currentUser) {
          // Get the user's profile
          const { data: profileData } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', currentUser.id)
            .single();
          
          if (profileData) {
            const authUser = { ...currentUser, profile: profileData } as AuthUser;
            setUser(authUser);
            setIsAdmin(profileData.role === 'admin');
          } else {
            setUser(currentUser);
          }
        }
      }
      
      setLoading(false);
    };

    initializeAuth();

    // Set up listener for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (event === 'SIGNED_IN' && newSession) {
          setSession(newSession);
          const { data: { user: newUser } } = await supabase.auth.getUser();
          
          if (newUser) {
            // Get the user's profile
            const { data: profileData } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('user_id', newUser.id)
              .single();
            
            if (profileData) {
              const authUser = { ...newUser, profile: profileData } as AuthUser;
              setUser(authUser);
              setIsAdmin(profileData.role === 'admin');
            } else {
              setUser(newUser);
              setIsAdmin(false);
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