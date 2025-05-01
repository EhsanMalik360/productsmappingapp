import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Papa from 'papaparse';

export interface GeneralSettings {
  companyName: string;
  currency: string;
  dateFormat: string;
  defaultProductView: string;
}

export interface NotificationSettings {
  lowProfitAlert: boolean;
  lowProfitThreshold: number;
  priceChangeAlert: boolean;
  priceChangeThreshold: number;
  emailNotifications: boolean;
  emailAddress: string;
}

export function useSettings() {
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>({
    companyName: 'Your Company',
    currency: 'USD',
    dateFormat: 'MM/DD/YYYY',
    defaultProductView: 'list'
  });
  
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    lowProfitAlert: true,
    lowProfitThreshold: 15,
    priceChangeAlert: true,
    priceChangeThreshold: 5,
    emailNotifications: true,
    emailAddress: 'user@example.com'
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch settings from database
  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      
      // Fetch general settings
      const { data: generalData, error: generalError } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'general')
        .single();
      
      if (generalError && generalError.code !== 'PGRST116') { // PGRST116 is "no rows returned" error
        throw generalError;
      }
      
      if (generalData?.value) {
        setGeneralSettings(generalData.value as GeneralSettings);
      }
      
      // Fetch notification settings
      const { data: notificationData, error: notificationError } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'notifications')
        .single();
      
      if (notificationError && notificationError.code !== 'PGRST116') {
        throw notificationError;
      }
      
      if (notificationData?.value) {
        setNotificationSettings(notificationData.value as NotificationSettings);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
      setError(err instanceof Error ? err : new Error('Failed to load settings'));
    } finally {
      setLoading(false);
    }
  }

  async function saveGeneralSettings(settings: GeneralSettings) {
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({ 
          key: 'general',
          value: settings,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'key'
        });
      
      if (error) throw error;
      
      setGeneralSettings(settings);
      return true;
    } catch (err) {
      console.error('Error saving general settings:', err);
      throw err instanceof Error ? err : new Error('Failed to save general settings');
    }
  }

  async function saveNotificationSettings(settings: NotificationSettings) {
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({ 
          key: 'notifications',
          value: settings,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'key'
        });
      
      if (error) throw error;
      
      setNotificationSettings(settings);
      return true;
    } catch (err) {
      console.error('Error saving notification settings:', err);
      throw err instanceof Error ? err : new Error('Failed to save notification settings');
    }
  }

  async function exportData(dataType: 'products' | 'suppliers' | 'all'): Promise<{ blob: Blob, filename: string }> {
    try {
      let csvData: string = '';
      let filename = `export-${dataType}-${new Date().toISOString().split('T')[0]}.csv`;
      
      if (dataType === 'products' || dataType === 'all') {
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('*');
        
        if (productsError) throw productsError;
        
        if (productsData && productsData.length > 0) {
          if (dataType === 'products') {
            // For products only export, convert to CSV
            csvData = Papa.unparse(productsData);
          } else if (dataType === 'all') {
            // For all data, we'll handle products separately below
            const productsCsv = Papa.unparse(productsData);
            csvData += `# PRODUCTS\n${productsCsv}\n\n`;
          }
        } else if (dataType === 'products') {
          // Empty products data
          csvData = 'No product data available';
        }
      }
      
      if (dataType === 'suppliers' || dataType === 'all') {
        const { data: suppliersData, error: suppliersError } = await supabase
          .from('suppliers')
          .select('*');
        
        if (suppliersError) throw suppliersError;
        
        if (suppliersData && suppliersData.length > 0) {
          if (dataType === 'suppliers') {
            // For suppliers only export, convert to CSV
            csvData = Papa.unparse(suppliersData);
          } else if (dataType === 'all') {
            // For all data, append suppliers section
            const suppliersCsv = Papa.unparse(suppliersData);
            csvData += `# SUPPLIERS\n${suppliersCsv}\n\n`;
          }
        } else if (dataType === 'suppliers') {
          // Empty suppliers data
          csvData = 'No supplier data available';
        }
        
        if (dataType === 'all') {
          // Also fetch supplier_products for all data export
          const { data: supplierProductsData, error: supplierProductsError } = await supabase
            .from('supplier_products')
            .select('*');
          
          if (supplierProductsError) throw supplierProductsError;
          
          if (supplierProductsData && supplierProductsData.length > 0) {
            const supplierProductsCsv = Papa.unparse(supplierProductsData);
            csvData += `# SUPPLIER_PRODUCTS\n${supplierProductsCsv}\n\n`;
          }
          
          // Custom attributes for all data export 
          const { data: customAttributesData, error: customAttributesError } = await supabase
            .from('custom_attributes')
            .select('*');
          
          if (customAttributesError) throw customAttributesError;
          
          if (customAttributesData && customAttributesData.length > 0) {
            const customAttributesCsv = Papa.unparse(customAttributesData);
            csvData += `# CUSTOM_ATTRIBUTES\n${customAttributesCsv}\n\n`;
          }
        }
      }
      
      // Return the CSV data as a Blob
      return {
        blob: new Blob([csvData], { type: 'text/csv' }),
        filename
      };
    } catch (err) {
      console.error('Error exporting data:', err);
      throw err instanceof Error ? err : new Error('Failed to export data');
    }
  }

  async function clearProducts() {
    try {
      // First delete all supplier_products as they reference products
      const { error: supplierProductsError } = await supabase
        .from('supplier_products')
        .delete()
        .neq('id', 'none'); // Delete all rows
      
      if (supplierProductsError) throw supplierProductsError;
      
      // Now delete all products
      const { error: productsError } = await supabase
        .from('products')
        .delete()
        .neq('id', 'none'); // Delete all rows
      
      if (productsError) throw productsError;
      
      return true;
    } catch (err) {
      console.error('Error clearing products:', err);
      throw err instanceof Error ? err : new Error('Failed to clear products');
    }
  }

  async function resetApplication() {
    try {
      // Delete all data in the right order due to foreign key constraints
      const { error: supplierProductsError } = await supabase
        .from('supplier_products')
        .delete()
        .neq('id', 'none');
      
      if (supplierProductsError) throw supplierProductsError;
      
      // Remove custom attribute values
      const { error: attributeValuesError } = await supabase
        .from('custom_attribute_values')
        .delete()
        .neq('id', 'none');
      
      if (attributeValuesError) throw attributeValuesError;
      
      // Delete tables that don't have dependencies
      await Promise.all([
        supabase.from('products').delete().neq('id', 'none'),
        supabase.from('suppliers').delete().neq('id', 'none'),
        supabase.from('custom_attributes').delete().neq('id', 'none'),
        supabase.from('import_history').delete().neq('id', 'none')
      ]);
      
      // Reset settings to defaults
      await supabase
        .from('settings')
        .upsert([
          { 
            key: 'general', 
            value: {
              companyName: 'Your Company',
              currency: 'USD',
              dateFormat: 'MM/DD/YYYY',
              defaultProductView: 'list'
            },
            updated_at: new Date().toISOString()
          },
          {
            key: 'notifications',
            value: {
              lowProfitAlert: true,
              lowProfitThreshold: 15,
              priceChangeAlert: true,
              priceChangeThreshold: 5,
              emailNotifications: true,
              emailAddress: 'user@example.com'
            },
            updated_at: new Date().toISOString()
          }
        ], {
          onConflict: 'key'
        });
      
      // Refresh local settings
      await fetchSettings();
      
      return true;
    } catch (err) {
      console.error('Error resetting application:', err);
      throw err instanceof Error ? err : new Error('Failed to reset application');
    }
  }

  return {
    generalSettings,
    notificationSettings,
    loading,
    error,
    saveGeneralSettings,
    saveNotificationSettings,
    exportData,
    clearProducts,
    resetApplication,
    refreshSettings: fetchSettings
  };
} 