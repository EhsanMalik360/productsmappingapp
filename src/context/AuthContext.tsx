import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

// Define user profile with role
interface UserProfile {
  id: string;
  role: 'admin' | 'regular';
  is_active?: boolean; // Added is_active property
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  // The email and password for the admin user
  const ADMIN_EMAIL = 'tahir@leverify.com';

  // Fetch user profile with role information
  const fetchUserProfile = async (userId: string) => {
    try {
      console.log('Fetching profile for user ID:', userId);
      
      // Add timeout for profile fetch
      const profilePromise = supabase
        .from('profiles')
        .select('id, role, is_active')
        .eq('id', userId)
        .single();
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Profile fetch timed out')), 3000)
      );
      
      // Use Promise.race to handle timeout
      const { data, error } = await Promise.race([profilePromise, timeoutPromise]) as any;
      
      if (error) {
        console.error('Error fetching user profile:', error);
        
        // Special case for admin user - hardcode profile if needed
        if (userId === '9f85f9f8-854e-46e4-9f6a-67d26c102d6a') {
          console.log('Using hardcoded admin profile as fallback');
          return {
            id: userId,
            role: 'admin',
            is_active: true
          } as UserProfile;
        }
        
        return null;
      }
      
      console.log('Successfully fetched profile:', data);
      return data as UserProfile;
    } catch (err) {
      console.error('Error in fetchUserProfile:', err);
      
      // Also use the fallback for admin in case of timeout or other errors
      if (userId === '9f85f9f8-854e-46e4-9f6a-67d26c102d6a') {
        console.log('Using hardcoded admin profile after error');
        return {
          id: userId,
          role: 'admin',
          is_active: true
        } as UserProfile;
      }
      
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;
    
    // Safety timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (isMounted && loading) {
        console.warn('Session check timed out after 10 seconds, forcing loading state to false');
        setLoading(false);
      }
    }, 10000);
    
    // Check active session on page load
    const getSession = async () => {
      try {
        console.log('Checking for existing session...');
        
        // Add a timeout to the getSession request
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Session fetch timed out')), 5000)
        );
        
        const { data, error } = await Promise.race([sessionPromise, timeoutPromise]) as any;
        
        if (!isMounted) return;
        
        if (error) {
          console.error('Error getting session:', error);
          setLoading(false);
          return;
        }
        
        if (data && data.session) {
          console.log('Session found, setting user');
          setUser(data.session.user);
          
          // Special handling for known admin user
          if (data.session.user.id === '9f85f9f8-854e-46e4-9f6a-67d26c102d6a') {
            console.log('Recognized admin user, using hardcoded profile');
            if (isMounted) {
              setUserProfile({
                id: data.session.user.id,
                role: 'admin',
                is_active: true
              });
              setLoading(false);
            }
            
            // Still try to fetch the profile in the background but don't block on it
            fetchUserProfile(data.session.user.id).then(profile => {
              if (profile && isMounted) {
                setUserProfile(profile);
              }
            }).catch(() => {
              // Ignore errors since we already set the hardcoded profile
            });
            
            return;
          }
          
          // For other users, try to fetch profile with role
          try {
            const profile = await fetchUserProfile(data.session.user.id);
            if (isMounted) {
              setUserProfile(profile);
            }
          } catch (profileErr) {
            console.error('Error fetching user profile:', profileErr);
          }
        } else {
          console.log('No active session found');
        }
      } catch (err) {
        console.error('Unexpected error in getSession:', err);
      } finally {
        // Always set loading to false to prevent infinite loading
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    getSession();

    // Set up auth state listener
    let subscription: { unsubscribe: () => void } | null = null;
    
    try {
      const authStateResponse = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log('Auth state changed:', event);
          
          if (!isMounted) return;
          
          if (session) {
            setUser(session.user);
            
            // Fetch user profile with role
            const profile = await fetchUserProfile(session.user.id);
            
            if (!isMounted) return;
            
            // If user is inactive, sign them out immediately
            if (profile && profile.is_active === false) {
              console.log('Inactive user detected, signing out');
              await supabase.auth.signOut();
              toast.error('Your account has been deactivated. Please contact an administrator.');
              setUser(null);
              setUserProfile(null);
            } else {
              setUserProfile(profile);
            }
          } else {
            setUser(null);
            setUserProfile(null);
          }
          setLoading(false);
        }
      );
      
      subscription = authStateResponse.data.subscription;
    } catch (err) {
      console.error('Error setting up auth state listener:', err);
      setLoading(false);
    }

    // Cleanup subscription and prevent state updates after unmount
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      // Attempt to sign in with email and password
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        throw error;
      }

      // Check if the user is active before allowing login
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', data.user.id)
        .single();
      
      if (profileError) {
        console.error('Error checking user active status:', profileError);
        throw new Error('Error verifying account status');
      }

      // If user is inactive, sign them out and return error
      if (profileData && profileData.is_active === false) {
        // Sign out the user immediately
        await supabase.auth.signOut();
        return { 
          success: false, 
          error: 'Your account has been deactivated. Please contact an administrator.' 
        };
      }

      return { success: true };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.message || 'Failed to sign in' 
      };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
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