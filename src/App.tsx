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
import { AppProvider } from './context/AppContext';
import { ProfitFormulaProvider } from './context/ProfitFormulaContext';
import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <AppProvider>
      <ProfitFormulaProvider>
        <Router>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/import-data" element={<ImportData />} />
              <Route path="/products" element={<Products />} />
              <Route path="/products/:id" element={<ProductDetail />} />
              <Route path="/suppliers" element={<Suppliers />} />
              <Route path="/suppliers/:id" element={<SupplierDetail />} />
              <Route path="/attributes" element={<CustomAttributes />} />
              <Route path="/profit-analysis" element={<ProfitAnalysis />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Layout>
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
  );
}

export default App;