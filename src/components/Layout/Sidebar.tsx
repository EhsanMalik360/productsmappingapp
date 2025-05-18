import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Upload, 
  Package, 
  Truck, 
  Tags, 
  TrendingUp, 
  Settings,
  LogOut,
  User
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';

const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, isAdmin } = useAuth();
  
  const isActive = (path: string) => {
    return location.pathname === path ? 'bg-blue-800 text-white' : 'text-white hover:text-blue-200';
  };

  const handleSignOut = async () => {
    try {
      const { error } = await signOut();
      if (error) {
        throw error;
      }
      toast.success('Successfully signed out');
      navigate('/login');
    } catch (error: any) {
      toast.error(error.message || 'Failed to sign out');
    }
  };

  return (
    <div className="sidebar fixed left-0 top-0 w-64 h-full bg-blue-900 z-10 flex flex-col">
      <div className="p-4 flex-grow">
        <h2 className="text-xl font-bold mb-8 text-white">Amazon Product & Supplier Analysis</h2>
        <ul>
          <li className="mb-4">
            <Link to="/dashboard" className={`flex items-center ${isActive('/dashboard')} p-2 rounded-md transition-colors`}>
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
          
          {isAdmin && (
            <>
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
            </>
          )}
          
          <li className="mb-4">
            <Link to="/settings" className={`flex items-center ${isActive('/settings')} p-2 rounded-md transition-colors`}>
              <Settings className="w-5 h-5 mr-3" />
              Settings
            </Link>
          </li>
        </ul>
      </div>

      {/* User info and logout */}
      <div className="mt-auto p-4 border-t border-blue-800">
        <div className="flex items-center text-white mb-2">
          <User className="w-5 h-5 mr-2" />
          <div>
            <div className="text-sm font-medium">{user?.email}</div>
            <div className="text-xs opacity-75">
              {isAdmin ? 'Admin Account' : 'User Account'}
            </div>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center p-2 mt-2 bg-blue-800 text-white rounded hover:bg-blue-700 transition-colors"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </button>
      </div>
    </div>
  );
};

export default Sidebar;