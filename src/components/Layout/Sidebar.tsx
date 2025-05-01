import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Upload, 
  Package, 
  Truck, 
  Tags, 
  TrendingUp, 
  Settings 
} from 'lucide-react';

const Sidebar: React.FC = () => {
  const location = useLocation();
  
  const isActive = (path: string) => {
    return location.pathname === path ? 'bg-blue-800 text-white' : 'text-white hover:text-blue-200';
  };

  return (
    <div className="sidebar fixed left-0 top-0 w-64 h-full bg-blue-900 z-10">
      <div className="p-4">
        <h2 className="text-xl font-bold mb-8 text-white">Amazon Product & Supplier Analysis</h2>
        <ul>
          <li className="mb-4">
            <Link to="/" className={`flex items-center ${isActive('/')} p-2 rounded-md transition-colors`}>
              <LayoutDashboard className="w-5 h-5 mr-3" />
              Dashboard
            </Link>
          </li>
          <li className="mb-4">
            <Link to="/import-data" className={`flex items-center ${isActive('/import-data')} p-2 rounded-md transition-colors`}>
              <Upload className="w-5 h-5 mr-3" />
              Import Data
            </Link>
          </li>
          <li className="mb-4">
            <Link to="/products" className={`flex items-center ${isActive('/products')} p-2 rounded-md transition-colors`}>
              <Package className="w-5 h-5 mr-3" />
              Products
            </Link>
          </li>
          <li className="mb-4">
            <Link to="/suppliers" className={`flex items-center ${isActive('/suppliers')} p-2 rounded-md transition-colors`}>
              <Truck className="w-5 h-5 mr-3" />
              Suppliers
            </Link>
          </li>
          <li className="mb-4">
            <Link to="/attributes" className={`flex items-center ${isActive('/attributes')} p-2 rounded-md transition-colors`}>
              <Tags className="w-5 h-5 mr-3" />
              Custom Attributes
            </Link>
          </li>
          <li className="mb-4">
            <Link to="/profit-analysis" className={`flex items-center ${isActive('/profit-analysis')} p-2 rounded-md transition-colors`}>
              <TrendingUp className="w-5 h-5 mr-3" />
              Profit Analysis
            </Link>
          </li>
          <li className="mb-4">
            <Link to="/settings" className={`flex items-center ${isActive('/settings')} p-2 rounded-md transition-colors`}>
              <Settings className="w-5 h-5 mr-3" />
              Settings
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default Sidebar;