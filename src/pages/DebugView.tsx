import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const DebugView: React.FC = () => {
  const { supabase } = useAuth();
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const testCreateProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      // Get the current user first
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setError('No authenticated user found');
        setLoading(false);
        return;
      }

      // Try to create a profile for the current user
      const { data, error: insertError } = await supabase
        .from('user_profiles')
        .upsert({
          user_id: userData.user.id,
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

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-4">Database Debug View</h1>
        
        <div className="grid grid-cols-3 gap-4 mb-6">
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
            Check Auth Users
          </button>
          
          <button 
            className="bg-purple-500 text-white py-2 px-4 rounded hover:bg-purple-600 disabled:opacity-50"
            onClick={testCreateProfile}
            disabled={loading}
          >
            Create Admin Profile
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