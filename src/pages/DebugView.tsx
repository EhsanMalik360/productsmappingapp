import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const DebugView: React.FC = () => {
  const { supabase } = useAuth();
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');

  const checkProfiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: profileError } = await supabase
        .from('user_profiles')
        .select('*');
      
      if (profileError) {
        setError(`Error fetching profiles: ${profileError.message}`);
        console.error('Error fetching profiles:', profileError);
      } else {
        setResults({ profiles: data });
        console.log('Profiles found:', data);
      }
    } catch (err: any) {
      setError(`Unexpected error: ${err.message}`);
      console.error('Unexpected error during profile check:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      // First check if we're logged in
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (sessionData.session) {
        const { data: userData } = await supabase.auth.getUser();
        setResults({ 
          sessionFound: true, 
          currentUser: userData.user 
        });
        console.log('Current user found:', userData.user);
        
        // Set the current user's ID for convenience
        if (userData.user) {
          setUserId(userData.user.id);
          setEmail(userData.user.email || '');
        }
      } else {
        setResults({ sessionFound: false });
        console.log('No active session found');
      }
    } catch (err: any) {
      setError(`Unexpected error: ${err.message}`);
      console.error('Unexpected error during user check:', err);
    } finally {
      setLoading(false);
    }
  };

  const createUserProfilesTable = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('Attempting to create user_profiles table...');
      
      // Create the user_profiles table using SQL
      const { error: createTableError } = await supabase.rpc('create_user_profiles_table');
      
      if (createTableError) {
        // If the RPC call fails, try a direct SQL approach
        console.log('RPC method failed, trying direct SQL...');
        
        const { error: sqlError } = await supabase.from('user_profiles').select('count(*)');
        
        if (sqlError && sqlError.message.includes('relation "user_profiles" does not exist')) {
          console.log('Table does not exist, attempting to create it directly...');
          
          setError('Cannot create table directly from client. Please check server logs and create table manually.');
          setLoading(false);
          return;
        } else {
          setResults({ message: 'Table already exists or check succeeded' });
        }
      } else {
        setResults({ message: 'Table created successfully via RPC' });
      }
    } catch (err: any) {
      setError(`Unexpected error: ${err.message}`);
      console.error('Unexpected error during table creation:', err);
    } finally {
      setLoading(false);
    }
  };

  const testCreateProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      // Use either the provided ID or get the current user
      let id = userId;
      
      if (!id) {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          setError('No authenticated user found and no ID provided');
          setLoading(false);
          return;
        }
        id = userData.user.id;
      }

      // Try to create a profile for the specified user
      const { data, error: insertError } = await supabase
        .from('user_profiles')
        .upsert({
          user_id: id,
          role: 'admin',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select();
      
      if (insertError) {
        setError(`Error creating profile: ${insertError.message}`);
        console.error('Error creating profile:', insertError);
      } else {
        setResults({ createdProfile: data });
        console.log('Profile created:', data);
      }
    } catch (err: any) {
      setError(`Unexpected error: ${err.message}`);
      console.error('Unexpected error during profile creation:', err);
    } finally {
      setLoading(false);
    }
  };

  const createCustomProfile = async () => {
    setLoading(true);
    setError(null);
    
    if (!userId || !email) {
      setError('User ID and email are required');
      setLoading(false);
      return;
    }
    
    try {
      // Create or update a profile with the specified user ID
      const { data, error: insertError } = await supabase
        .from('user_profiles')
        .upsert({
          user_id: userId,
          role: 'admin',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select();
      
      if (insertError) {
        setError(`Error creating profile: ${insertError.message}`);
        console.error('Error creating profile:', insertError);
      } else {
        setResults({ 
          createdProfile: data,
          message: `Profile created for ${email} with ID ${userId}`
        });
        console.log('Custom profile created:', data);
      }
    } catch (err: any) {
      setError(`Unexpected error: ${err.message}`);
      console.error('Unexpected error during profile creation:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-4">Database Debug View</h1>
        
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button 
            className="bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 disabled:opacity-50"
            onClick={checkProfiles}
            disabled={loading}
          >
            Check User Profiles
          </button>
          
          <button 
            className="bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 disabled:opacity-50"
            onClick={checkUsers}
            disabled={loading}
          >
            Check Current User
          </button>
          
          <button 
            className="bg-purple-500 text-white py-2 px-4 rounded hover:bg-purple-600 disabled:opacity-50"
            onClick={testCreateProfile}
            disabled={loading}
          >
            Create Profile for Current User
          </button>
          
          <button 
            className="bg-yellow-500 text-white py-2 px-4 rounded hover:bg-yellow-600 disabled:opacity-50"
            onClick={createUserProfilesTable}
            disabled={loading}
          >
            Verify/Create Profiles Table
          </button>
        </div>
        
        <div className="mb-6 p-4 border rounded">
          <h2 className="text-lg font-semibold mb-3">Create Profile for Specific User</h2>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">User ID</label>
              <input 
                type="text" 
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="User ID"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Email (for reference only)</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="Email"
              />
            </div>
          </div>
          
          <button 
            className="bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600 disabled:opacity-50"
            onClick={createCustomProfile}
            disabled={loading || !userId}
          >
            Create Admin Profile for User ID
          </button>
        </div>
        
        {loading && (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-2">Loading...</p>
          </div>
        )}
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        {results && (
          <div className="mt-6">
            <h2 className="text-xl font-semibold mb-2">Results</h2>
            <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-sm">
              {JSON.stringify(results, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default DebugView; 