import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loginStarted, setLoginStarted] = useState(false);
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();

  // Monitor auth state changes for redirect
  useEffect(() => {
    if (loginStarted && user && !loading) {
      console.log('Login successful, redirecting to dashboard');
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, loginStarted, navigate]);

  // If user is already logged in, redirect to dashboard
  if (user && !loading && !loginStarted) {
    console.log('User already logged in, redirecting to dashboard');
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoginStarted(true);
    
    console.log('Login form submitted for', email);

    try {
      const { error } = await signIn(email, password);
      
      if (error) {
        console.error('Login error:', error);
        setError(error.message || 'Failed to sign in');
        setLoginStarted(false);
        return;
      }
      
      // Don't navigate here - let the useEffect handle it
      // This avoids race conditions with auth state updates
      console.log('Sign in request completed successfully');
    } catch (err: any) {
      console.error('Unexpected login error:', err);
      setError(err.message || 'An unexpected error occurred');
      setLoginStarted(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-800">Welcome Back</h2>
          <p className="text-gray-600 mt-2">Sign in to your account</p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="email" className="block text-gray-700 text-sm font-bold mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="mb-6">
            <label htmlFor="password" className="block text-gray-700 text-sm font-bold mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || loginStarted}
            className={`w-full py-2 px-4 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              (loading || loginStarted) ? 'opacity-70 cursor-not-allowed' : ''
            }`}
          >
            {loading || loginStarted ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        
        {(loading || loginStarted) && (
          <div className="mt-4 text-center text-sm text-gray-600">
            Authenticating, please wait...
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginPage; 