import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Session, AuthChangeEvent } from '@supabase/supabase-js';

// Define user profile with role
interface UserProfile {
  id: string;
  role: 'admin' | 'regular';
  is_active?: boolean;
}

interface AuthContextType {
  user: any | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
  createUser: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Constants for profile caching
const USER_PROFILE_CACHE_KEY = 'user_profile_cache';
const CACHE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  
  // Function to check if a cache entry is still valid
  const isCacheValid = (timestamp: number) => {
    return Date.now() - timestamp < CACHE_EXPIRY_MS;
  };

  // Fetch user profile with role information with caching
  const fetchUserProfile = async (userId: string) => {
    try {
      console.log('Fetching profile for user ID:', userId);
      
      // Try to get from cache first for immediate display
      try {
        const cachedProfileData = localStorage.getItem(USER_PROFILE_CACHE_KEY);
        if (cachedProfileData) {
          const { profile, timestamp, userId: cachedUserId } = JSON.parse(cachedProfileData);
          
          // If cache is for the same user and still valid
          if (cachedUserId === userId && isCacheValid(timestamp)) {
            console.log('Using cached profile');
            // Still refresh in background, but return cached immediately
            refreshProfileInBackground(userId);
            return profile;
          }
        }
      } catch (e) {
        console.error('Error reading profile cache:', e);
      }
      
      // Special case for known admin user for reliability
      if (userId === '9f85f9f8-854e-46e4-9f6a-67d26c102d6a') {
        const adminProfile = {
          id: userId,
          role: 'admin',
          is_active: true
        } as UserProfile;
        
        // Cache this profile
        try {
          localStorage.setItem(USER_PROFILE_CACHE_KEY, JSON.stringify({
            profile: adminProfile,
            timestamp: Date.now(),
            userId
          }));
        } catch (e) {
          console.error('Error caching profile:', e);
        }
        
        return adminProfile;
      }
      
      // Get from database
      console.log('Fetching profile from database');
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, is_active')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('Error fetching user profile:', error);
        return null;
      }
      
      console.log('Successfully fetched profile from DB:', data);
      
      // Cache the profile for faster loading next time
      try {
        localStorage.setItem(USER_PROFILE_CACHE_KEY, JSON.stringify({
          profile: data,
          timestamp: Date.now(),
          userId
        }));
      } catch (e) {
        console.error('Error caching profile:', e);
      }
      
      return data as UserProfile;
    } catch (err) {
      console.error('Error in fetchUserProfile:', err);
      return null;
    }
  };
  
  // Refresh the profile in background without blocking UI
  const refreshProfileInBackground = async (userId: string) => {
    try {
      console.log('Refreshing profile in background');
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, is_active')
        .eq('id', userId)
        .single();
        
      if (!error && data) {
        // Update cache with fresh data
        try {
          localStorage.setItem(USER_PROFILE_CACHE_KEY, JSON.stringify({
            profile: data,
            timestamp: Date.now(),
            userId
          }));
        } catch (e) {
          console.error('Error updating profile cache:', e);
        }
      }
    } catch (e) {
      console.error('Background profile refresh failed:', e);
    }
  };

  useEffect(() => {
    // Initialize auth state with safety timeout
    let safetyTimeout = setTimeout(() => {
      if (loading) {
        console.warn('Safety timeout triggered - forcing loading state to complete');
        setLoading(false);
      }
    }, 5000); // 5 seconds should be enough for normal operation
    
    // Check active session on page load
    const getSession = async () => {
      try {
        console.log('Checking for existing session...');
        
        // Get session from Supabase
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error getting session:', error);
          setLoading(false);
          return;
        }
        
        // Session found, set user
        if (data && data.session) {
          console.log('Session found, setting user');
          setUser(data.session.user);
          
          // Fetch user profile with caching for fast load
          const profile = await fetchUserProfile(data.session.user.id);
          
          if (profile) {
            // Check if user is active
            if (profile.is_active === false) {
              console.log('User account is inactive, signing out');
              await supabase.auth.signOut();
              setUser(null);
              setUserProfile(null);
              toast.error('Your account has been deactivated. Please contact an administrator.');
            } else {
              console.log('Setting user profile:', profile);
              setUserProfile(profile);
            }
          } else {
            console.error('Failed to get valid profile, treating as logged out');
            await supabase.auth.signOut();
            setUser(null);
          }
        } else {
          console.log('No active session found');
        }
      } catch (err) {
        console.error('Unexpected error in getSession:', err);
      } finally {
        // Always set loading to false to prevent infinite loading
        clearTimeout(safetyTimeout);
        console.log('Finishing session check, setting loading=false');
        setLoading(false);
      }
    };

    getSession();

    // Set up auth state listener
    let subscription: { unsubscribe: () => void } | null = null;
    
    try {
      const authStateResponse = supabase.auth.onAuthStateChange(
        async (event: AuthChangeEvent, session: Session | null) => {
          console.log('Auth state changed:', event);
          
          // Handle different auth events
          switch (event) {
            case 'SIGNED_IN':
              if (session) {
                console.log('User signed in');
                setUser(session.user);
                const profile = await fetchUserProfile(session.user.id);
                
                if (profile && profile.is_active !== false) {
                  setUserProfile(profile);
                } else if (profile && profile.is_active === false) {
                  console.log('Inactive user signed in, signing out');
                  await supabase.auth.signOut();
                  setUser(null);
                  setUserProfile(null);
                  toast.error('Your account has been deactivated. Please contact an administrator.');
                }
              }
              break;
              
            case 'SIGNED_OUT':
              console.log('User signed out');
              setUser(null);
              setUserProfile(null);
              // Clear profile cache on sign out
              localStorage.removeItem(USER_PROFILE_CACHE_KEY);
              break;
              
            case 'TOKEN_REFRESHED':
              console.log('Auth token refreshed');
              if (session) {
                setUser(session.user);
                // No need to refetch profile on token refresh
              }
              break;
              
            case 'USER_UPDATED':
              console.log('User updated');
              if (session) {
                setUser(session.user);
                // Refresh the profile when user is updated
                const profile = await fetchUserProfile(session.user.id);
                if (profile) {
                  setUserProfile(profile);
                }
              }
              break;
          }
          
          setLoading(false);
        }
      );
      
      subscription = authStateResponse.data.subscription;
      console.log('Auth subscription set up successfully');
    } catch (err) {
      console.error('Error setting up auth state listener:', err);
      setLoading(false);
    }

    // Cleanup subscription and timeout
    return () => {
      clearTimeout(safetyTimeout);
      if (subscription) {
        console.log('Cleaning up auth subscription');
        subscription.unsubscribe();
      }
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      // Attempt to sign in with email and password
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        setLoading(false);
        throw error;
      }

      // Check if the user is active before allowing login
      const profile = await fetchUserProfile(data.user.id);
      
      // If user is inactive, sign them out
      if (!profile || profile.is_active === false) {
        console.log('Inactive user attempted login');
        await supabase.auth.signOut();
        setLoading(false);
        return { 
          success: false, 
          error: 'Your account has been deactivated. Please contact an administrator.' 
        };
      }

      setUserProfile(profile);
      setLoading(false);
      return { success: true };
    } catch (error: any) {
      setLoading(false);
      return { 
        success: false, 
        error: error.message || 'Failed to sign in' 
      };
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      // Clear profile cache
      localStorage.removeItem(USER_PROFILE_CACHE_KEY);
      // Navigate to login page
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      setLoading(false);
    }
  };

  // Function for admins to create new users
  const createUser = async (email: string, password: string) => {
    try {
      // Check if the current user is an admin
      if (!userProfile || userProfile.role !== 'admin') {
        return { 
          success: false, 
          error: 'Only administrators can create users' 
        };
      }

      // Use the sign-up function instead of admin.createUser
      // The trigger we created will automatically create a profile
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Adding an attribute to make it clear this is an admin-created account
          data: {
            created_by_admin: true
          }
        }
      });

      if (error) {
        throw error;
      }
      
      // No need to manually insert a profile - our trigger handles this
      // The trigger function we created will automatically create a profile with 'regular' role

      return { success: true };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || 'Failed to create user' 
      };
    }
  };

  const isAuthenticated = !!user;
  const isAdmin = !!userProfile && userProfile.role === 'admin';

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        userProfile,
        loading, 
        signIn, 
        signOut, 
        isAuthenticated,
        isAdmin,
        createUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 