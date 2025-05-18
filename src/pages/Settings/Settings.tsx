import React, { useState, useEffect } from 'react';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import { Save, FileDown, AlertTriangle, RefreshCcw, Users } from 'lucide-react';
import { useSettings } from '../../hooks/useSettings';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import UserManagement from './UserManagement';

const Settings: React.FC = () => {
  const { isAdmin } = useAuth();
  const {
    generalSettings,
    notificationSettings,
    loading,
    error,
    saveGeneralSettings,
    saveNotificationSettings,
    exportData,
    clearProducts,
    resetApplication
  } = useSettings();

  const [localGeneralSettings, setLocalGeneralSettings] = useState({ ...generalSettings });
  const [localNotificationSettings, setLocalNotificationSettings] = useState({ ...notificationSettings });
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [clearingProducts, setClearingProducts] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Update local state when settings are loaded
  useEffect(() => {
    setLocalGeneralSettings({ ...generalSettings });
    setLocalNotificationSettings({ ...notificationSettings });
  }, [generalSettings, notificationSettings]);
  
  const handleGeneralSettingsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setLocalGeneralSettings(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleNotificationSettingsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setLocalNotificationSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? parseInt(value) : value
    }));
  };

  const handleSaveGeneralSettings = async () => {
    try {
      setSavingGeneral(true);
      await saveGeneralSettings(localGeneralSettings);
      toast.success('General settings saved successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save general settings');
    } finally {
      setSavingGeneral(false);
    }
  };

  const handleSaveNotificationSettings = async () => {
    try {
      setSavingNotifications(true);
      await saveNotificationSettings(localNotificationSettings);
      toast.success('Notification settings saved successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save notification settings');
    } finally {
      setSavingNotifications(false);
    }
  };

  const handleExportData = async (type: 'products' | 'suppliers' | 'all') => {
    try {
      setExporting(true);
      const { blob, filename } = await exportData(type);
      
      // Create a download link and trigger it
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`${type === 'all' ? 'All data' : `${type.charAt(0).toUpperCase() + type.slice(1)}`} exported successfully in CSV format`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  const handleClearProducts = async () => {
    try {
      setClearingProducts(true);
      await clearProducts();
      toast.success('All products cleared successfully');
      setShowClearConfirm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to clear products');
    } finally {
      setClearingProducts(false);
    }
  };

  const handleResetApplication = async () => {
    try {
      setResetting(true);
      await resetApplication();
      toast.success('Application reset successfully');
      setShowResetConfirm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset application');
    } finally {
      setResetting(false);
    }
  };
  
  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <h2 className="text-xl font-semibold text-red-700 mb-2">Error Loading Settings</h2>
        <p className="text-red-600">{error.message}</p>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>
      
      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 border-b-2 font-medium text-sm ${
            activeTab === 'general' 
              ? 'border-blue-500 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          General
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`px-4 py-2 border-b-2 font-medium text-sm ${
            activeTab === 'notifications' 
              ? 'border-blue-500 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Notifications
        </button>
        <button
          onClick={() => setActiveTab('data')}
          className={`px-4 py-2 border-b-2 font-medium text-sm ${
            activeTab === 'data' 
              ? 'border-blue-500 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Data Management
        </button>
        
        {isAdmin && (
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 border-b-2 font-medium text-sm ${
              activeTab === 'users' 
                ? 'border-blue-500 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center">
              <Users size={16} className="mr-1" />
              User Management
            </div>
          </button>
        )}
      </div>
      
      <div className="grid grid-cols-1 gap-6 mb-6">
        {/* General Settings Tab */}
        {activeTab === 'general' && (
          <Card>
            <h2 className="text-xl font-semibold mb-4">General Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Name
                </label>
                <input
                  type="text"
                  name="companyName"
                  className="w-full border p-2 rounded"
                  value={localGeneralSettings.companyName || ''}
                  onChange={handleGeneralSettingsChange}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Currency
                </label>
                <select
                  name="currency"
                  className="w-full border p-2 rounded"
                  value={localGeneralSettings.currency}
                  onChange={handleGeneralSettingsChange}
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="CAD">CAD ($)</option>
                  <option value="AUD">AUD ($)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date Format
                </label>
                <select
                  name="dateFormat"
                  className="w-full border p-2 rounded"
                  value={localGeneralSettings.dateFormat}
                  onChange={handleGeneralSettingsChange}
                >
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Product View
                </label>
                <select
                  name="defaultProductView"
                  className="w-full border p-2 rounded"
                  value={localGeneralSettings.defaultProductView}
                  onChange={handleGeneralSettingsChange}
                >
                  <option value="grid">Grid</option>
                  <option value="list">List</option>
                  <option value="table">Table</option>
                </select>
              </div>
            </div>
            
            <Button 
              variant="primary" 
              className="flex items-center"
              onClick={handleSaveGeneralSettings}
              disabled={savingGeneral}
            >
              <Save size={16} className="mr-2" />
              {savingGeneral ? 'Saving...' : 'Save General Settings'}
            </Button>
          </Card>
        )}
        
        {/* Notifications Settings Tab */}
        {activeTab === 'notifications' && (
          <Card>
            <h2 className="text-xl font-semibold mb-4">Notification Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <div className="flex items-center mb-2">
                  <input 
                    type="checkbox"
                    id="emailNotifications"
                    name="emailNotifications"
                    checked={localNotificationSettings.emailNotifications}
                    onChange={handleNotificationSettingsChange}
                    className="mr-2"
                  />
                  <label htmlFor="emailNotifications" className="text-sm font-medium text-gray-700">
                    Enable Email Notifications
                  </label>
                </div>
                
                <div className="flex items-center mb-2">
                  <input 
                    type="checkbox"
                    id="lowProfitAlert"
                    name="lowProfitAlert"
                    checked={localNotificationSettings.lowProfitAlert}
                    onChange={handleNotificationSettingsChange}
                    className="mr-2"
                  />
                  <label htmlFor="lowProfitAlert" className="text-sm font-medium text-gray-700">
                    Low Profit Alerts
                  </label>
                </div>
                
                <div className="flex items-center mb-2">
                  <input 
                    type="checkbox"
                    id="priceChangeAlert"
                    name="priceChangeAlert"
                    checked={localNotificationSettings.priceChangeAlert}
                    onChange={handleNotificationSettingsChange}
                    className="mr-2"
                  />
                  <label htmlFor="priceChangeAlert" className="text-sm font-medium text-gray-700">
                    Price Change Alerts
                  </label>
                </div>
              </div>
              
              <div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Low Profit Threshold (%)
                  </label>
                  <input 
                    type="number"
                    name="lowProfitThreshold"
                    min="0"
                    max="100"
                    value={localNotificationSettings.lowProfitThreshold}
                    onChange={handleNotificationSettingsChange}
                    className="w-full border p-2 rounded"
                  />
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Price Change Threshold (%)
                  </label>
                  <input 
                    type="number"
                    name="priceChangeThreshold"
                    min="0"
                    max="100"
                    value={localNotificationSettings.priceChangeThreshold}
                    onChange={handleNotificationSettingsChange}
                    className="w-full border p-2 rounded"
                  />
                </div>
              </div>
            </div>
            
            <Button 
              variant="primary" 
              className="flex items-center"
              onClick={handleSaveNotificationSettings}
              disabled={savingNotifications}
            >
              <Save size={16} className="mr-2" />
              {savingNotifications ? 'Saving...' : 'Save Notification Settings'}
            </Button>
          </Card>
        )}
        
        {/* Data Management Tab */}
        {activeTab === 'data' && (
          <Card>
            <h2 className="text-xl font-semibold mb-4">Data Management</h2>
            
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-2">Export Data</h3>
              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="secondary" 
                  className="flex items-center"
                  onClick={() => handleExportData('products')}
                  disabled={exporting}
                >
                  <FileDown size={16} className="mr-2" />
                  {exporting ? 'Exporting...' : 'Export Products'}
                </Button>
                
                <Button 
                  variant="secondary" 
                  className="flex items-center"
                  onClick={() => handleExportData('suppliers')}
                  disabled={exporting}
                >
                  <FileDown size={16} className="mr-2" />
                  {exporting ? 'Exporting...' : 'Export Suppliers'}
                </Button>
                
                <Button 
                  variant="secondary" 
                  className="flex items-center"
                  onClick={() => handleExportData('all')}
                  disabled={exporting}
                >
                  <FileDown size={16} className="mr-2" />
                  {exporting ? 'Exporting...' : 'Export All Data'}
                </Button>
              </div>
            </div>
            
            <div className="border-t pt-6">
              <h3 className="text-lg font-medium mb-2 text-red-600">Danger Zone</h3>
              <div className="bg-red-50 border border-red-200 rounded p-4 mb-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-medium text-red-800">Clear All Products</h4>
                    <p className="text-sm text-red-600">This will remove all products from the system. This action cannot be undone.</p>
                  </div>
                  <Button 
                    variant="danger" 
                    className="flex items-center"
                    onClick={() => setShowClearConfirm(true)}
                  >
                    <AlertTriangle size={16} className="mr-2" />
                    Clear Products
                  </Button>
                </div>
              </div>
              
              <div className="bg-red-50 border border-red-200 rounded p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-medium text-red-800">Reset Application</h4>
                    <p className="text-sm text-red-600">This will reset the entire application to its default state. All data will be lost.</p>
                  </div>
                  <Button 
                    variant="danger" 
                    className="flex items-center"
                    onClick={() => setShowResetConfirm(true)}
                  >
                    <RefreshCcw size={16} className="mr-2" />
                    Reset App
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Confirmation modals */}
            {showClearConfirm && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
                  <h3 className="text-xl font-bold text-red-600 mb-4">Confirm Clear Products</h3>
                  <p className="mb-4">Are you sure you want to clear all products? This action cannot be undone.</p>
                  <div className="flex justify-end space-x-2">
                    <Button 
                      variant="secondary" 
                      onClick={() => setShowClearConfirm(false)}
                    >
                      Cancel
                    </Button>
                    <Button 
                      variant="danger"
                      onClick={handleClearProducts}
                      disabled={clearingProducts}
                    >
                      {clearingProducts ? 'Clearing...' : 'Yes, Clear All Products'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            
            {showResetConfirm && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
                  <h3 className="text-xl font-bold text-red-600 mb-4">Confirm Reset Application</h3>
                  <p className="mb-4">Are you sure you want to reset the entire application? All data will be permanently deleted.</p>
                  <div className="flex justify-end space-x-2">
                    <Button 
                      variant="secondary" 
                      onClick={() => setShowResetConfirm(false)}
                    >
                      Cancel
                    </Button>
                    <Button 
                      variant="danger"
                      onClick={handleResetApplication}
                      disabled={resetting}
                    >
                      {resetting ? 'Resetting...' : 'Yes, Reset Application'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}
        
        {/* User Management Tab (Admin Only) */}
        {activeTab === 'users' && isAdmin && (
          <UserManagement />
        )}
      </div>
    </div>
  );
};

export default Settings;