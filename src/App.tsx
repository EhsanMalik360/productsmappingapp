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
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/Login';
import UserManagement from './pages/Settings/UserManagement';
import { Toaster } from 'react-hot-toast';

// Wrapper component for Layout
const LayoutWrapper = () => {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <ProfitFormulaProvider>
          <Router>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected routes */}
              <Route element={<ProtectedRoute />}>
                <Route element={<LayoutWrapper />}>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/import-data" element={<ImportData />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/products/:id" element={<ProductDetail />} />
                  <Route path="/products/imported" element={<ImportedProducts />} />
                  <Route path="/suppliers" element={<Suppliers />} />
                  <Route path="/suppliers/:id" element={<SupplierDetail />} />
                
                  {/* Admin only routes */}
                  <Route element={<ProtectedRoute requireAdmin={true} />}>
                    <Route path="/attributes" element={<CustomAttributes />} />
                    <Route path="/profit-analysis" element={<ProfitAnalysis />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/settings/users" element={<UserManagement />} />
                  </Route>
                </Route>
              </Route>

              {/* Catch all route */}
              <Route path="*" element={<Navigate to="/login" replace />} />
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