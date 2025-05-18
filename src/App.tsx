import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard/Dashboard';
import ImportData from './pages/ImportData/ImportData';
import Products from './pages/Products/Products';
import Suppliers from './pages/Suppliers/Suppliers';
import SupplierDetail from './pages/Suppliers/SupplierDetail';
import CustomAttributes from './pages/CustomAttributes/CustomAttributes';
import ProfitAnalysis from './pages/ProfitAnalysis/ProfitAnalysis';
import Settings from './pages/Settings/Settings';
import ProductDetail from './pages/Products/ProductDetail';
import ImportedProducts from './pages/ImportData/ImportedProducts';
import { AppProvider } from './context/AppContext';
import { ProfitFormulaProvider } from './context/ProfitFormulaContext';
import { AuthProvider } from './context/AuthContext';
import Login from './pages/Login/Login';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';

// Admin-only route component
const AdminRoute = () => {
  const { isAdmin, loading } = useAuth();
  
  // While checking authentication status, show loading spinner
  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  // If not admin, redirect to the dashboard
  if (!isAdmin) {
    return <Navigate to="/" />;
  }
  
  // If admin, render the child routes
  return <Outlet />;
};

function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <ProfitFormulaProvider>
          <Router>
            <Routes>
              {/* Public route */}
              <Route path="/login" element={<Login />} />
              
              {/* Protected routes - for all authenticated users */}
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Layout><Dashboard /></Layout>} />
                <Route path="/import-data" element={<Layout><ImportData /></Layout>} />
                <Route path="/products" element={<Layout><Products /></Layout>} />
                <Route path="/products/:id" element={<Layout><ProductDetail /></Layout>} />
                <Route path="/products/imported" element={<Layout><ImportedProducts /></Layout>} />
                <Route path="/suppliers" element={<Layout><Suppliers /></Layout>} />
                <Route path="/suppliers/:id" element={<Layout><SupplierDetail /></Layout>} />
                
                {/* Admin-only routes */}
                <Route element={<AdminRoute />}>
                  <Route path="/attributes" element={<Layout><CustomAttributes /></Layout>} />
                  <Route path="/profit-analysis" element={<Layout><ProfitAnalysis /></Layout>} />
                  <Route path="/settings" element={<Layout><Settings /></Layout>} />
                </Route>
              </Route>
            </Routes>
          </Router>
          <Toaster 
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: '#363636',
                color: '#fff',
              },
              success: {
                duration: 3000,
                iconTheme: {
                  primary: '#10B981',
                  secondary: '#fff',
                },
              },
              error: {
                duration: 4000,
                iconTheme: {
                  primary: '#EF4444',
                  secondary: '#fff',
                },
              },
            }}
          />
        </ProfitFormulaProvider>
      </AppProvider>
    </AuthProvider>
  );
}

export default App;