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

// Create a single instance of Supabase client
// Use a default value if env vars are undefined to prevent crashes
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://wvgiaeuvyfsdhoxrjmib.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2Z2lhZXV2eWZzZGhveHJqbWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY2ODI4NTgsImV4cCI6MjA2MjI1ODg1OH0.Mr3FSXDZibMJBCWp-QdszbEPY9wxtC7M361WPuM2aiw';

// Create a singleton Supabase client to prevent multiple instances
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});

console.log('Supabase client initialized with URL:', SUPABASE_URL);

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
    console.log('AuthProvider initializing...');
    let isMounted = true;
    
    // Safety timeout to prevent loading state from getting stuck
    const safetyTimer = setTimeout(() => {
      if (isMounted && loading) {
        console.log('Safety timeout triggered - forcing loading state to false');
        setLoading(false);
      }
    }, 5000);

    const initializeAuth = async () => {
      try {
        console.log('Getting session...');
        setLoading(true);
        
        // Get the session
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Error getting session:', sessionError);
          setLoading(false);
          return;
        }
        
        console.log('Current session:', currentSession ? 'Session found' : 'No session found');

        if (!isMounted) return;

        if (currentSession) {
          setSession(currentSession);
          
          // Get the user
          console.log('Getting user data...');
          const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
          
          if (userError) {
            console.error('Error getting user data:', userError);
            setLoading(false);
            return;
          }
          
          console.log('Current user:', currentUser ? 'User found' : 'No user found');
          
          if (!isMounted) return;
          
          if (currentUser) {
            // Get the user's profile
            console.log('Getting user profile for user ID:', currentUser.id);
            try {
              const { data: profileData, error: profileError } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('user_id', currentUser.id)
                .single();
              
              console.log('User profile query completed');
              
              if (profileError) {
                console.error('User profile error:', profileError);
                // Still set the user even if profile retrieval fails
                setUser(currentUser);
                setIsAdmin(false);
                console.log('Setting user without profile due to profile error');
              } else {
                console.log('User profile data:', profileData);
                
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
                  console.log('No profile data found, setting user without profile');
                  setUser(currentUser);
                  setIsAdmin(false);
                  console.log('No profile data found, setting isAdmin to false');
                }
              }
            } catch (profileQueryError) {
              console.error('Unexpected error during profile query:', profileQueryError);
              setUser(currentUser);
              setIsAdmin(false);
            }
          }
        } else {
          console.log('No session found, user is not authenticated');
          setUser(null);
          setSession(null);
          setIsAdmin(false);
        }
      } catch (error) {
        console.error('Error in initializeAuth:', error);
      } finally {
        if (isMounted) {
          console.log('Setting loading to false...');
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Set up listener for auth changes
    console.log('Setting up auth state change listener...');
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        console.log('Auth state changed:', event);
        
        if (!isMounted) return;
        
        if (event === 'SIGNED_IN' && newSession) {
          console.log('Handling SIGNED_IN event');
          setSession(newSession);
          
          try {
            // Get the user
            console.log('Getting user data after sign in...');
            const { data: { user: newUser }, error: userError } = await supabase.auth.getUser();
            
            if (userError) {
              console.error('Error getting user after sign in:', userError);
              setLoading(false);
              return;
            }
            
            console.log('New user on sign in:', newUser ? 'User found' : 'No user found');
            
            if (!isMounted) return;
            
            if (newUser) {
              // Get the user's profile
              console.log('Getting user profile on sign in for ID:', newUser.id);
              
              try {
                const { data: profileData, error: profileError } = await supabase
                  .from('user_profiles')
                  .select('*')
                  .eq('user_id', newUser.id)
                  .single();
                
                console.log('User profile query completed on sign in');
                
                if (profileError) {
                  console.error('Profile error on sign in:', profileError);
                  
                  // Even if there's a profile error, we still set the user
                  setUser(newUser);
                  setIsAdmin(false);
                  console.log('Setting user without profile due to profile error');
                } else {
                  console.log('User profile on sign in:', profileData);
                  
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
                    console.log('No profile data found on sign in, setting user without profile');
                    setUser(newUser);
                    setIsAdmin(false);
                    console.log('No profile data found on sign in, isAdmin set to false');
                  }
                }
              } catch (profileQueryError) {
                console.error('Unexpected error during profile query:', profileQueryError);
                setUser(newUser);
                setIsAdmin(false);
              }
            }
          } catch (error) {
            console.error('Error handling auth state change:', error);
          } finally {
            setLoading(false);
          }
        } else if (event === 'SIGNED_OUT') {
          console.log('Handling SIGNED_OUT event');
          setSession(null);
          setUser(null);
          setIsAdmin(false);
          setLoading(false);
        } else {
          // Ensure loading state is set to false for other events
          setLoading(false);
        }
      }
    );

    // Clean up the subscription when the component unmounts
    return () => {
      console.log('AuthProvider cleaning up...');
      isMounted = false;
      subscription?.unsubscribe();
      clearTimeout(safetyTimer);
    };
  }, []);

  // Sign in function
  const signIn = async (email: string, password: string) => {
    console.log('Sign in attempt for email:', email);
    try {
      setLoading(true);
      
      // Clear any previous user/session before attempting login
      setUser(null);
      setSession(null);
      setIsAdmin(false);
      
      console.log('Sending sign in request to Supabase...');
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Sign in error:', error);
        setLoading(false);
        return { error };
      }

      console.log('Sign in successful, session established:', !!data.session);
      
      // We don't need to set user data here as it will be handled by the auth listener
      // Just return the result
      return { data, error: null };
    } catch (error) {
      console.error('Unexpected error during sign in:', error);
      setLoading(false);
      return { error };
    }
  };

  // Sign out function
  const signOut = async () => {
    console.log('Sign out attempt');
    try {
      setLoading(true);
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('Sign out error:', error);
      } else {
        console.log('Sign out successful');
      }
      
      return { error };
    } catch (error) {
      console.error('Unexpected error during sign out:', error);
      return { error };
    } finally {
      // Don't set loading to false here as the auth state change listener will handle it
    }
  };

  console.log('AuthProvider current state:', { 
    isAuthenticated: !!user, 
    isAdmin, 
    loading,
    userEmail: user?.email
  });

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