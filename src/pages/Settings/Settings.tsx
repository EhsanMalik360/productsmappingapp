import React, { useState, useEffect } from 'react';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import { Save, FileDown, AlertTriangle } from 'lucide-react';
import { useSettings } from '../../hooks/useSettings';
import LoadingOverlay from '../../components/UI/LoadingOverlay';
import { toast } from 'react-hot-toast';

const Settings: React.FC = () => {
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
  
  if (loading) {
    return <LoadingOverlay message="Loading settings..." />;
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <h2 className="text-xl font-semibold text-red-700 mb-2">Error Loading Settings</h2>
        <p className="text-red-600">{error.message}</p>
      </div>
    );
  }
  
  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Settings</h1>
      
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
                value={localGeneralSettings.companyName}
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
                <option value="list">List View</option>
                <option value="grid">Grid View</option>
                <option value="detailed">Detailed View</option>
              </select>
            </div>
          </div>
          
          <Button 
            className="flex items-center" 
            onClick={handleSaveGeneralSettings}
            disabled={savingGeneral}
          >
            <Save size={16} className="mr-1" /> {savingGeneral ? 'Saving...' : 'Save Settings'}
          </Button>
        </Card>
        
        <Card>
          <h2 className="text-xl font-semibold mb-4">Notification Settings</h2>
          
          <div className="mb-4">
            <div className="flex items-center mb-2">
              <input
                type="checkbox"
                id="lowProfitAlert"
                name="lowProfitAlert"
                className="h-4 w-4 text-blue-600 rounded"
                checked={localNotificationSettings.lowProfitAlert}
                onChange={handleNotificationSettingsChange}
              />
              <label htmlFor="lowProfitAlert" className="ml-2 block text-sm text-gray-700">
                Alert me when products have low profit margins
              </label>
            </div>
            
            <div className="flex items-center ml-6 mb-4">
              <label htmlFor="lowProfitThreshold" className="block text-sm text-gray-700 mr-2">
                Threshold:
              </label>
              <input
                type="number"
                id="lowProfitThreshold"
                name="lowProfitThreshold"
                className="border p-1 rounded w-16"
                value={localNotificationSettings.lowProfitThreshold}
                onChange={handleNotificationSettingsChange}
                min="0"
                max="100"
              />
              <span className="ml-1 text-sm text-gray-700">%</span>
            </div>
            
            <div className="flex items-center mb-2">
              <input
                type="checkbox"
                id="priceChangeAlert"
                name="priceChangeAlert"
                className="h-4 w-4 text-blue-600 rounded"
                checked={localNotificationSettings.priceChangeAlert}
                onChange={handleNotificationSettingsChange}
              />
              <label htmlFor="priceChangeAlert" className="ml-2 block text-sm text-gray-700">
                Alert me when Buy Box price changes significantly
              </label>
            </div>
            
            <div className="flex items-center ml-6 mb-4">
              <label htmlFor="priceChangeThreshold" className="block text-sm text-gray-700 mr-2">
                Threshold:
              </label>
              <input
                type="number"
                id="priceChangeThreshold"
                name="priceChangeThreshold"
                className="border p-1 rounded w-16"
                value={localNotificationSettings.priceChangeThreshold}
                onChange={handleNotificationSettingsChange}
                min="0"
                max="100"
              />
              <span className="ml-1 text-sm text-gray-700">%</span>
            </div>
            
            <div className="flex items-center mb-2">
              <input
                type="checkbox"
                id="emailNotifications"
                name="emailNotifications"
                className="h-4 w-4 text-blue-600 rounded"
                checked={localNotificationSettings.emailNotifications}
                onChange={handleNotificationSettingsChange}
              />
              <label htmlFor="emailNotifications" className="ml-2 block text-sm text-gray-700">
                Send notifications to my email
              </label>
            </div>
            
            <div className="flex items-center ml-6 mb-4">
              <label htmlFor="emailAddress" className="block text-sm text-gray-700 mr-2">
                Email:
              </label>
              <input
                type="email"
                id="emailAddress"
                name="emailAddress"
                className="border p-1 rounded w-64"
                value={localNotificationSettings.emailAddress}
                onChange={handleNotificationSettingsChange}
              />
            </div>
          </div>
          
          <Button 
            className="flex items-center"
            onClick={handleSaveNotificationSettings}
            disabled={savingNotifications}
          >
            <Save size={16} className="mr-1" /> {savingNotifications ? 'Saving...' : 'Save Notification Settings'}
          </Button>
        </Card>
        
        <Card>
          <h2 className="text-xl font-semibold mb-4">Data Management</h2>
          
          <div className="mb-4">
            <h3 className="text-lg mb-2">Import/Export</h3>
            <p className="text-sm text-gray-600 mb-3">Manage your data by exporting it for backup or importing from file.</p>
            
            <div className="flex flex-wrap gap-2 mb-4">
              <Button 
                onClick={() => handleExportData('products')}
                disabled={exporting}
                className="flex items-center"
              >
                <FileDown size={16} className="mr-1" /> Export Products as CSV
              </Button>
              <Button 
                onClick={() => handleExportData('suppliers')}
                disabled={exporting}
                className="flex items-center"
              >
                <FileDown size={16} className="mr-1" /> Export Suppliers as CSV
              </Button>
              <Button 
                onClick={() => handleExportData('all')}
                disabled={exporting}
                className="flex items-center"
              >
                <FileDown size={16} className="mr-1" /> Export All Data as CSV
              </Button>
            </div>
          </div>
          
          <div className="border-t pt-4">
            <h3 className="text-lg mb-2 text-red-600">Danger Zone</h3>
            <p className="text-sm text-gray-600 mb-3">These actions cannot be undone. Please be certain.</p>
            
            {showClearConfirm ? (
              <div className="bg-red-50 border border-red-200 p-4 rounded-md mb-4">
                <div className="flex items-start">
                  <AlertTriangle className="text-red-500 mr-2 mt-0.5 flex-shrink-0" size={18} />
                  <div>
                    <h4 className="text-red-700 font-medium">Are you sure you want to clear all products?</h4>
                    <p className="text-sm text-red-600 mb-3">This will delete all products and their supplier relationships. This action cannot be undone.</p>
                    <div className="flex space-x-2">
                      <Button 
                        variant="danger" 
                        onClick={handleClearProducts}
                        disabled={clearingProducts}
                      >
                        {clearingProducts ? 'Clearing...' : 'Yes, Clear All Products'}
                      </Button>
                      <Button onClick={() => setShowClearConfirm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <Button 
                variant="danger" 
                onClick={() => setShowClearConfirm(true)}
                className="mr-2"
              >
                Clear All Products
              </Button>
            )}
            
            {showResetConfirm ? (
              <div className="bg-red-50 border border-red-200 p-4 rounded-md">
                <div className="flex items-start">
                  <AlertTriangle className="text-red-500 mr-2 mt-0.5 flex-shrink-0" size={18} />
                  <div>
                    <h4 className="text-red-700 font-medium">Are you sure you want to reset the application?</h4>
                    <p className="text-sm text-red-600 mb-3">This will delete ALL data including products, suppliers, custom attributes, and import history. Settings will be reset to defaults. This action cannot be undone.</p>
                    <div className="flex space-x-2">
                      <Button 
                        variant="danger" 
                        onClick={handleResetApplication}
                        disabled={resetting}
                      >
                        {resetting ? 'Resetting...' : 'Yes, Reset Everything'}
                      </Button>
                      <Button onClick={() => setShowResetConfirm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <Button variant="danger" onClick={() => setShowResetConfirm(true)}>
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