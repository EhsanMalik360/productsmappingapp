import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

// Define user profile with role
interface UserProfile {
  id: string;
  role: 'admin' | 'regular';
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
      
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('Error fetching user profile:', error);
        
        // Special case for admin user - hardcode profile if needed
        if (userId === '9f85f9f8-854e-46e4-9f6a-67d26c102d6a') {
          console.log('Using hardcoded admin profile as fallback');
          return {
            id: userId,
            role: 'admin'
          } as UserProfile;
        }
        
        return null;
      }
      
      console.log('Successfully fetched profile:', data);
      return data as UserProfile;
    } catch (err) {
      console.error('Error in fetchUserProfile:', err);
      return null;
    }
  };

  useEffect(() => {
    // Check active session on page load
    const getSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      
      if (!error && data.session) {
        setUser(data.session.user);
        
        // Fetch user profile with role
        const profile = await fetchUserProfile(data.session.user.id);
        setUserProfile(profile);
      }
      
      setLoading(false);
    };

    getSession();

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session) {
          setUser(session.user);
          
          // Fetch user profile with role
          const profile = await fetchUserProfile(session.user.id);
          setUserProfile(profile);
        } else {
          setUser(null);
          setUserProfile(null);
        }
        setLoading(false);
      }
    );

    // Cleanup subscription
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        throw error;
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

      // Create the user in Auth
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

      if (error) {
        throw error;
      }
      
      // Create profile entry for the new user
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([
          { 
            id: data.user.id,
            role: 'regular',
            created_at: new Date().toISOString()
          }
        ]);
        
      if (profileError) {
        throw profileError;
      }

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