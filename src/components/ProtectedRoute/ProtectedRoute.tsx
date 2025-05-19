import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { RefreshCw } from 'lucide-react';

const ProtectedRoute: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();
  const [loadingTime, setLoadingTime] = useState(0);
  const [showFallback, setShowFallback] = useState(false);
  
  // Set up a timer to track loading time
  useEffect(() => {
    if (!loading) return;
    
    const timer = setInterval(() => {
      setLoadingTime(prev => prev + 1);
    }, 1000);
    
    // After 15 seconds of loading, show the fallback UI
    const fallbackTimer = setTimeout(() => {
      if (loading) {
        setShowFallback(true);
      }
    }, 15000);
    
    return () => {
      clearInterval(timer);
      clearTimeout(fallbackTimer);
    };
  }, [loading]);
  
  // Function to clear localStorage and reload
  const handleClearCache = () => {
    console.log('Clearing auth cache and reloading...');
    
    // Clear only Supabase-related items
    if (typeof window !== 'undefined') {
      Object.keys(localStorage).forEach(key => {
        if (key.includes('supabase') || key.includes('sb-')) {
          console.log('Removing item:', key);
          localStorage.removeItem(key);
        }
      });
    }
    
    // Force reload the page
    window.location.reload();
  };
  
  // While checking authentication status, show spinner and potentially fallback UI
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mb-6"></div>
        
        <div className="text-center max-w-md">
          <p className="text-gray-600 mb-2">Authenticating... ({loadingTime}s)</p>
          
          {showFallback && (
            <div className="mt-8 p-4 border border-amber-200 bg-amber-50 rounded-lg">
              <p className="text-amber-800 font-medium mb-3">Taking longer than expected</p>
              <p className="text-gray-600 mb-4 text-sm">
                If you're stuck on this screen, you may have a cached authentication state issue.
              </p>
              
              <button
                onClick={handleClearCache}
                className="bg-amber-100 hover:bg-amber-200 text-amber-800 font-medium py-2 px-4 rounded-full inline-flex items-center transition-colors"
              >
                <RefreshCw size={16} className="mr-2" />
                Clear Auth Cache & Reload
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
  
  // If not authenticated, redirect to the login page
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  // If authenticated, render the child routes
  return <Outlet />;
};

export default ProtectedRoute; 