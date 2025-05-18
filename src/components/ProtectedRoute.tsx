import React, { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  requireAdmin?: boolean;
  redirectTo?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  requireAdmin = false,
  redirectTo = '/login',
}) => {
  const { user, loading, isAdmin } = useAuth();
  
  useEffect(() => {
    console.log('ProtectedRoute render state:', {
      loading,
      isAuthenticated: !!user,
      isAdmin,
      requireAdmin,
    });
  }, [loading, user, isAdmin, requireAdmin]);

  // If auth is still loading, show a loading state
  if (loading) {
    console.log('ProtectedRoute: Still loading authentication state...');
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <div className="ml-3 text-blue-500">Loading authentication...</div>
      </div>
    );
  }

  // If not authenticated, redirect to login
  if (!user) {
    console.log('ProtectedRoute: User not authenticated, redirecting to', redirectTo);
    return <Navigate to={redirectTo} replace />;
  }

  // If route requires admin role and user is not admin, redirect
  if (requireAdmin && !isAdmin) {
    console.log('ProtectedRoute: User is not an admin, redirecting to dashboard');
    return <Navigate to="/dashboard" replace />;
  }

  // Otherwise, render the child routes
  console.log('ProtectedRoute: Rendering protected content');
  return <Outlet />;
};

export default ProtectedRoute; 