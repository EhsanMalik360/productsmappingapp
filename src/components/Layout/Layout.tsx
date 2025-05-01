import React from 'react';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="app-container bg-gray-100 min-h-screen">
      <Sidebar />
      <main className="main-content ml-64 p-6">
        {children}
      </main>
    </div>
  );
};

export default Layout;