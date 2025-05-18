import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
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

function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <ProfitFormulaProvider>
          <Router>
            <Routes>
              {/* Public route */}
              <Route path="/login" element={<Login />} />
              
              {/* Protected routes */}
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Layout><Dashboard /></Layout>} />
                <Route path="/import-data" element={<Layout><ImportData /></Layout>} />
                <Route path="/products" element={<Layout><Products /></Layout>} />
                <Route path="/products/:id" element={<Layout><ProductDetail /></Layout>} />
                <Route path="/products/imported" element={<Layout><ImportedProducts /></Layout>} />
                <Route path="/suppliers" element={<Layout><Suppliers /></Layout>} />
                <Route path="/suppliers/:id" element={<Layout><SupplierDetail /></Layout>} />
                <Route path="/attributes" element={<Layout><CustomAttributes /></Layout>} />
                <Route path="/profit-analysis" element={<Layout><ProfitAnalysis /></Layout>} />
                <Route path="/settings" element={<Layout><Settings /></Layout>} />
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