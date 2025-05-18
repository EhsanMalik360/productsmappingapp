import React from 'react';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="app-container bg-gray-100 min-h-screen">
      <Sidebar />
      <div className="ml-64">
        <header className="bg-white shadow p-4">
          <h1 className="text-xl font-semibold text-gray-800">Products Mapping Dashboard</h1>
        </header>
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;