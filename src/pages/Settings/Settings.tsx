import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import { Save, FileDown, AlertTriangle, RefreshCcw, Users } from 'lucide-react';
import { useSettings } from '../../hooks/useSettings';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';

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
      <h1 className="text-3xl font-bold mb-8">Settings</h1>
      
      {isAdmin && (
        <Card className="mb-6">
          <h2 className="text-xl font-semibold mb-4">User Management</h2>
          <p className="text-gray-600 mb-4">
            Manage user accounts, roles, and permissions. Create new users and control access levels.
          </p>
          <Link to="/settings/users">
            <Button variant="primary" className="flex items-center">
              <Users size={16} className="mr-2" />
              Manage Users
            </Button>
          </Link>
        </Card>
      )}
      
      <div className="grid grid-cols-1 gap-6 mb-6">
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
                  id="stockAlerts"
                  name="stockAlerts"
                  checked={localNotificationSettings.stockAlerts}
                  onChange={handleNotificationSettingsChange}
                  className="mr-2"
                />
                <label htmlFor="stockAlerts" className="text-sm font-medium text-gray-700">
                  Stock Level Alerts
                </label>
              </div>
              
              <div className="flex items-center mb-2">
                <input 
                  type="checkbox"
                  id="priceAlerts"
                  name="priceAlerts"
                  checked={localNotificationSettings.priceAlerts}
                  onChange={handleNotificationSettingsChange}
                  className="mr-2"
                />
                <label htmlFor="priceAlerts" className="text-sm font-medium text-gray-700">
                  Price Change Alerts
                </label>
              </div>
            </div>
            
            <div>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Alert Threshold (%)
                </label>
                <input
                  type="number"
                  name="alertThreshold"
                  className="w-full border p-2 rounded"
                  value={localNotificationSettings.alertThreshold}
                  onChange={handleNotificationSettingsChange}
                  min="1"
                  max="100"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Trigger alerts when prices change by this percentage
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Low Stock Threshold
                </label>
                <input
                  type="number"
                  name="lowStockThreshold"
                  className="w-full border p-2 rounded"
                  value={localNotificationSettings.lowStockThreshold}
                  onChange={handleNotificationSettingsChange}
                  min="1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Trigger alerts when stock level falls below this number
                </p>
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
        
        <Card>
          <h2 className="text-xl font-semibold mb-4">Data Management</h2>
          
          <div className="mb-6">
            <h3 className="text-md font-medium mb-2">Export Data</h3>
            <p className="text-sm text-gray-600 mb-3">
              Export your data in CSV format for backup or analysis
            </p>
            
            <div className="flex gap-2">
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
          
          <div className="border-t border-gray-200 pt-6 mb-6">
            <h3 className="text-md font-medium mb-2 text-amber-700">Clear Product Data</h3>
            <p className="text-sm text-gray-600 mb-3">
              Remove all product data from the system. This action cannot be undone.
            </p>
            
            {showClearConfirm ? (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-3">
                <div className="flex items-start">
                  <AlertTriangle size={20} className="text-amber-500 mr-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800">Are you sure you want to clear all products?</p>
                    <p className="text-sm text-amber-700 mt-1">This will permanently delete all product data and cannot be undone.</p>
                    
                    <div className="flex gap-2 mt-3">
                      <Button 
                        variant="secondary" 
                        className="text-amber-800 bg-white border-amber-300 hover:bg-amber-50"
                        onClick={() => setShowClearConfirm(false)}
                      >
                        Cancel
                      </Button>
                      
                      <Button 
                        variant="secondary" 
                        className="bg-amber-600 text-white border-amber-700 hover:bg-amber-700"
                        onClick={handleClearProducts}
                        disabled={clearingProducts}
                      >
                        {clearingProducts ? 'Clearing...' : 'Yes, Clear All Products'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <Button 
                variant="secondary" 
                className="flex items-center bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                onClick={() => setShowClearConfirm(true)}
              >
                <AlertTriangle size={16} className="mr-2" />
                Clear All Products
              </Button>
            )}
          </div>
          
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-md font-medium mb-2 text-red-700">Reset Application</h3>
            <p className="text-sm text-gray-600 mb-3">
              Reset the entire application to its initial state. This will delete all data.
            </p>
            
            {showResetConfirm ? (
              <div className="bg-red-50 border border-red-200 rounded p-3 mb-3">
                <div className="flex items-start">
                  <AlertTriangle size={20} className="text-red-500 mr-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-800">Are you sure you want to reset the application?</p>
                    <p className="text-sm text-red-700 mt-1">This will permanently delete all data and cannot be undone.</p>
                    
                    <div className="flex gap-2 mt-3">
                      <Button 
                        variant="secondary" 
                        className="text-red-800 bg-white border-red-300 hover:bg-red-50"
                        onClick={() => setShowResetConfirm(false)}
                      >
                        Cancel
                      </Button>
                      
                      <Button 
                        variant="secondary" 
                        className="bg-red-600 text-white border-red-700 hover:bg-red-700"
                        onClick={handleResetApplication}
                        disabled={resetting}
                      >
                        {resetting ? 'Resetting...' : 'Yes, Reset Application'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <Button 
                variant="secondary" 
                className="flex items-center bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                onClick={() => setShowResetConfirm(true)}
              >
                <AlertTriangle size={16} className="mr-2" />
                Reset Application
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Settings;