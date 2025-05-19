import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCcw, Edit, Save, X, Loader2 } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import EmptyState from '../../components/Dashboard/EmptyState';
import SupplierModal from './SupplierModal';
import SupplierProducts from '../../components/Suppliers/SupplierProducts';
import toast from 'react-hot-toast';

const SupplierDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { 
    suppliers, 
    supplierProducts, 
    products, 
    loading, 
    refreshData,
    getEntityAttributes,
    setAttributeValue,
    updateSupplier,
    fetchSupplierProducts
  } = useAppContext();
  
  // State for component
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [supplierNotFound, setSupplierNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dataFetched, setDataFetched] = useState(false);
  const [totalProductCount, setTotalProductCount] = useState(0);
  const [countLoading, setCountLoading] = useState(false);
  
  // Edit mode states
  const [isEditing, setIsEditing] = useState(false);
  const [editedSupplier, setEditedSupplier] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Add progressive loading states - initialize as false to show content immediately
  const [headerLoaded, setHeaderLoaded] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [attributesLoading, setAttributesLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);

  // Ensure ID is properly formatted - remove any UUID format issues
  const normalizedId = useMemo(() => {
    if (!id) return '';
    // Return the full ID without any processing that might truncate it
    return String(id); // Convert to string to ensure it's a string type
  }, [id]);

  // Get the actual count of all supplier products from the server
  const fetchTotalProductCount = useCallback(async () => {
    if (!normalizedId) return;
    
    try {
      // Track loading state for the count specifically
      setCountLoading(true);
      
      // Fetch the total, matched, and unmatched counts from the server
      const totalResult = await fetchSupplierProducts(normalizedId, 1, 1);
      
      // Update state with the accurate count
      setTotalProductCount(totalResult.count);
    } catch (error) {
      console.error('Error fetching total product count:', error);
    } finally {
      setCountLoading(false);
    }
  }, [normalizedId, fetchSupplierProducts]);

  // Memoize the fetchLatestData function to prevent it from changing on every render
  const fetchLatestData = useCallback(async () => {
    try {
      console.log('SupplierDetail: Loading data for supplier ID:', normalizedId);
      setIsRefreshing(true);
      setErrorMessage(null);
      await refreshData();
      
      // Fetch accurate product count
      await fetchTotalProductCount();
      
      // Check if the supplier exists after data refresh
      const supplierExists = suppliers.some(s => s.id === normalizedId);
      setSupplierNotFound(!supplierExists);
      
      if (!supplierExists) {
        console.error(`Supplier with ID ${normalizedId} not found after data refresh`);
        setErrorMessage(`Supplier with ID ${normalizedId} not found in the database.`);
      }
      
      setDataFetched(true);
    } catch (error) {
      console.error('Error refreshing data in SupplierDetail:', error);
      setErrorMessage('Failed to load supplier data. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  }, [normalizedId, refreshData, suppliers, fetchTotalProductCount]);

  // Refresh data when component mounts to ensure we have the latest supplier products
  useEffect(() => {
    let isMounted = true;
    
    // Only fetch data if we haven't fetched it yet or if manually refreshing
    if (!dataFetched && normalizedId && isMounted) {
      console.log('SupplierDetail: Starting data fetch for ID:', normalizedId);
      fetchLatestData();
    }
    
    return () => {
      isMounted = false;
    };
  }, [normalizedId, fetchLatestData, dataFetched]);

  // Progress loading state for faster perceived performance
  useEffect(() => {
    // When we get a supplier, immediately set all sections as loaded
    const supplier = suppliers.find(s => s.id === normalizedId);
    if (supplier) {
      setHeaderLoaded(true);
      setStatsLoading(false);
      setAttributesLoading(false);
      setProductsLoading(false);
    }
  }, [suppliers, normalizedId]);

  // Add additional logging for debugging - only run once after data is loaded
  useEffect(() => {
    if (dataFetched && suppliers.length > 0) {
      console.log('SupplierDetail: Current suppliers list:', suppliers);
      console.log('SupplierDetail: Looking for supplier with ID:', normalizedId);
      
      const found = suppliers.find(s => s.id === normalizedId);
      if (found) {
        console.log('SupplierDetail: Found supplier:', found);
      } else {
        console.error('SupplierDetail: Supplier not found in suppliers list');
      }
    }
  }, [dataFetched, suppliers, normalizedId]);

  // Get supplier data
  const supplier = suppliers.find(s => s.id === normalizedId);
  
  // Get supplier products for statistics calculation
  const supplierProductsList = supplierProducts.filter(sp => sp.supplier_id === normalizedId);
  
  // Join with product data for statistics
  const productsWithDetails = useMemo(() => {
    if (!supplierProductsList || !products || !Array.isArray(supplierProductsList) || !Array.isArray(products)) {
      return [];
    }
    
    return supplierProductsList
      .filter(sp => sp && sp.product_id) // Only consider matched products with valid product_id
      .map(sp => {
        const product = products.find(p => p && p.id === sp.product_id);
        if (!product) return null;
        
        // Updated profit margin calculation using Buy Box Price instead of Sale Price
        const buyBoxPrice = product.buyBoxPrice || 0;
        const amazonFee = product.amazonFee || 0;
        const referralFee = product.referralFee || 0;
        const cost = sp.cost || 0;
        
        const margin = buyBoxPrice - amazonFee - referralFee - cost;
        const profitMargin = buyBoxPrice > 0 ? (margin / buyBoxPrice) * 100 : 0;
        
        return {
          ...sp,
          product,
          margin,
          profitMargin
        };
      })
      .filter(Boolean); // Remove null values
  }, [supplierProductsList, products]);
  
  // When supplier data is loaded, initialize editedSupplier
  useEffect(() => {
    if (supplier && (isEditing || !editedSupplier)) {
      setEditedSupplier({
        ...supplier,
        name: supplier.name
      });
    }
  }, [supplier, isEditing, editedSupplier]);

  const handleEditChange = (field: string, value: any) => {
    setEditedSupplier((prev: any) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    if (!editedSupplier) return;
    
    try {
      setIsSaving(true);
      
      // Validate required fields
      if (!editedSupplier.name) {
        toast.error('Supplier name is required');
        return;
      }
      
      // Update the supplier
      await updateSupplier(normalizedId, {
        name: editedSupplier.name
      });
      
      // Refresh data to get updated state
      await refreshData();
      
      toast.success('Supplier updated successfully');
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating supplier:', error);
      toast.error('Failed to update supplier');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (supplier) {
      setEditedSupplier({
        ...supplier,
        name: supplier.name
      });
    }
    setIsEditing(false);
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      setDataFetched(false); // Reset to trigger a fresh data fetch
      await fetchLatestData();
    } catch (error) {
      console.error('Error refreshing data:', error);
      setIsRefreshing(false);
    }
  };
  
  const openEditModal = () => {
    setIsModalOpen(true);
  };
  
  const closeModal = () => {
    setIsModalOpen(false);
  };
  
  // If no supplier found and done loading, show error state
  if (!loading && !isRefreshing && !isSaving && dataFetched && supplierNotFound) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-300 rounded-md p-4 mb-6">
          <h2 className="text-xl font-semibold text-red-700 mb-2">Supplier Not Found</h2>
          <p className="text-red-600">{errorMessage || 'The supplier you are looking for could not be found.'}</p>
          <Button 
            onClick={() => navigate('/suppliers')} 
            className="mt-4 flex items-center"
          >
            <ArrowLeft size={16} className="mr-2" /> Back to Suppliers
          </Button>
        </div>
      </div>
    );
  }
  
  // Calculate statistics
  const matchedProducts = supplierProductsList.filter(sp => sp.product_id).length;
  const avgCost = supplierProductsList.length > 0 
    ? supplierProductsList.reduce((sum, sp) => sum + sp.cost, 0) / supplierProductsList.length
    : 0;

  // Calculate average profit margin
  const avgProfitMargin = productsWithDetails.length > 0 
    ? productsWithDetails.reduce((sum, item) => sum + (item?.profitMargin || 0), 0) / productsWithDetails.length
    : 0;

  // Get custom attributes for this supplier
  const customAttributes = useMemo(() => {
    if (!supplier || !supplier.id || typeof getEntityAttributes !== 'function') return [];
    try {
      return getEntityAttributes(supplier.id, 'supplier') || [];
    } catch (error) {
      console.error('Error getting entity attributes:', error);
      return [];
    }
  }, [supplier, getEntityAttributes]);

  // Start rendering the UI with a progressive loading approach
  return (
    <div className="p-6">
      {/* Header - always show */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button 
            variant="secondary" 
            className="mr-3"
            onClick={() => navigate('/suppliers')}
          >
            <ArrowLeft size={16} className="mr-2" /> Back to Suppliers
          </Button>
          
          {!headerLoaded ? (
            <div className="h-8 bg-gray-200 rounded animate-pulse w-48"></div>
          ) : isEditing ? (
            <input
              type="text"
              value={editedSupplier?.name || ''}
              onChange={(e) => handleEditChange('name', e.target.value)}
              className="text-2xl font-bold border border-blue-300 rounded px-2 py-1 w-64"
              placeholder="Supplier Name"
            />
          ) : (
            <h1 className="text-2xl font-bold">{supplier?.name || "Loading..."}</h1>
          )}
        </div>
        
        <div className="flex space-x-2">
          {loading || isRefreshing || isSaving ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="animate-spin h-4 w-4 text-blue-600 mr-1">
                <RefreshCcw size={16} />
              </div>
              <span>
                {isSaving ? "Saving..." : isRefreshing ? "Refreshing..." : "Loading..."}
              </span>
            </div>
          ) : isEditing ? (
            <>
              <Button 
                variant="secondary" 
                onClick={handleCancelEdit}
                className="flex items-center"
              >
                <X size={16} className="mr-2" /> Cancel
              </Button>
              <Button 
                onClick={handleSave}
                className="flex items-center"
              >
                <Save size={16} className="mr-2" /> Save
              </Button>
            </>
          ) : (
            <>
              <Button 
                variant="secondary" 
                onClick={() => setIsEditing(true)} 
                className="flex items-center" 
              >
                <Edit size={16} className="mr-2" /> Edit
              </Button>
              <Button 
                variant="secondary" 
                onClick={handleRefresh}
                className="flex items-center"
              >
                <RefreshCcw size={16} className="mr-2" /> Refresh
              </Button>
            </>
          )}
        </div>
      </div>
      
      {/* Overview Card */}
      <Card className="mb-6">
        <h2 className="text-xl font-semibold mb-4">Supplier Overview</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="text-sm text-blue-700 mb-1">Total Products</div>
            <div className="text-2xl font-bold flex items-center">
              {totalProductCount || supplierProductsList.length}
              {countLoading && (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin ml-2" />
              )}
            </div>
          </div>
      
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-sm text-green-700 mb-1">Matched Products</div>
            <div className="text-2xl font-bold">{matchedProducts}</div>
            <div className="text-sm text-green-700">
              ({totalProductCount > 0 ? Math.round((matchedProducts / totalProductCount) * 100) : 0}%)
            </div>
          </div>
    
          <div className="bg-amber-50 p-4 rounded-lg">
            <div className="text-sm text-amber-700 mb-1">Average Cost</div>
            <div className="text-2xl font-bold">${avgCost.toFixed(2)}</div>
          </div>
          
          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="text-sm text-purple-700 mb-1">Avg Profit Margin</div>
            <div className="text-2xl font-bold">{avgProfitMargin.toFixed(1)}%</div>
          </div>
        </div>
        
        {/* Custom Attributes Section */}
        {customAttributes.length > 0 && (
          <div className="border-t border-gray-200 pt-4 mt-2">
            <h3 className="text-lg font-medium mb-3">Custom Attributes</h3>
            
            {attributesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="border rounded-lg p-3 relative bg-gray-50 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                    <div className="h-6 bg-gray-200 rounded w-full"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {customAttributes.map(({ attribute, value }) => {
                  const displayValue = value === null || value === undefined 
                    ? "Not set" 
                    : attribute.type === 'Yes/No' 
                      ? value ? 'Yes' : 'No'
                      : value.toString();
                      
                    const handleValueChange = async (newValue: any) => {
                      try {
                      // Convert the value to the appropriate type
                      let typedValue = newValue;
                      if (attribute.type === 'Number') {
                        typedValue = parseFloat(newValue);
                      } else if (attribute.type === 'Yes/No') {
                        typedValue = newValue === 'true' || newValue === true;
                      }
                      
                      if (supplier) {
                        await setAttributeValue(attribute.id, supplier.id, typedValue);
                        toast.success(`Updated ${attribute.name}`);
                      }
                    } catch (error) {
                      console.error('Error updating attribute:', error);
                      toast.error('Failed to update attribute');
                    }
                  };
                  
                  return (
                    <div key={attribute.id} className="border rounded-lg p-3 relative bg-gray-50">
                      <div className="text-sm font-medium text-gray-700 mb-1">{attribute.name}</div>
                      
                      {isEditing ? (
                        <>
                          {attribute.type === 'Text' && (
                            <input
                              type="text"
                              className="w-full border rounded p-1.5"
                              value={value === null ? '' : value.toString()}
                              onChange={(e) => handleValueChange(e.target.value)}
                            />
                          )}
                          
                          {attribute.type === 'Number' && (
                            <input
                              type="number"
                              className="w-full border rounded p-1.5"
                              value={value === null ? '' : value.toString()}
                              onChange={(e) => handleValueChange(e.target.value)}
                            />
                          )}
                          
                          {attribute.type === 'Date' && (
                            <input
                              type="date"
                              className="w-full border rounded p-1.5"
                              value={value === null ? '' : value.toString()}
                              onChange={(e) => handleValueChange(e.target.value)}
                            />
                          )}
                          
                          {attribute.type === 'Yes/No' && (
                            <select
                              className="w-full border rounded p-1.5"
                              value={value === null ? '' : value ? 'true' : 'false'}
                              onChange={(e) => handleValueChange(e.target.value === 'true')}
                            >
                              <option value="true">Yes</option>
                              <option value="false">No</option>
                            </select>
                          )}
                          
                          {attribute.type === 'Selection' && (
                            <input
                              type="text"
                              className="w-full border rounded p-1.5"
                              value={value === null ? '' : value.toString()}
                              onChange={(e) => handleValueChange(e.target.value)}
                            />
                          )}
                        </>
                      ) : (
                        <div className="font-medium">{displayValue}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>
      
      {/* Complete Supplier Data Section - Moved above Supplier Products Section */}
      {!productsLoading && supplier && (
        <Card className="mb-6">
          <h3 className="text-lg font-medium mb-2">Supplier Data</h3>
          
          <div className="bg-gray-50 rounded border border-gray-200 overflow-x-auto">
            <table className="min-w-full text-xs">
              <tbody>
                <tr className="border-b border-gray-200">
                  <td className="px-2 py-1.5 font-medium">Name</td>
                  <td className="px-2 py-1.5">{supplier?.name}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="px-2 py-1.5 font-medium">ID</td>
                  <td className="px-2 py-1.5">{supplier?.id}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="px-2 py-1.5 font-medium">Total Products</td>
                  <td className="px-2 py-1.5 flex items-center">
                    {totalProductCount || supplierProductsList.length}
                    {countLoading && (
                      <Loader2 className="w-3 h-3 text-blue-500 animate-spin ml-2" />
                    )}
                  </td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="px-2 py-1.5 font-medium">Matched Products</td>
                  <td className="px-2 py-1.5">{matchedProducts}</td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="px-2 py-1.5 font-medium">Average Cost</td>
                  <td className="px-2 py-1.5">${avgCost.toFixed(2)}</td>
                </tr>
                
                {/* Map all custom attributes */}
                {customAttributes && customAttributes.length > 0 && customAttributes.map(({ attribute, value }) => {
                  if (!attribute) return null;
                  
                  let displayValue: string;
                  
                  try {
                    switch (attribute.type) {
                      case 'Number':
                        displayValue = typeof value === 'number' ? value.toFixed(2) : 'N/A';
                        break;
                      case 'Date':
                        displayValue = value ? new Date(value).toLocaleDateString() : 'N/A';
                        break;
                      case 'Yes/No':
                        displayValue = value === true ? 'Yes' : value === false ? 'No' : 'N/A';
                        break;
                      default:
                        displayValue = value ? String(value) : 'N/A';
                    }
                  } catch (error) {
                    console.error("Error formatting attribute value:", error);
                    displayValue = 'Error';
                    }
                    
                    return (
                    <tr key={attribute.id} className="border-b border-gray-200">
                      <td className="px-2 py-1.5 font-medium">{attribute.name}</td>
                      <td className="px-2 py-1.5">{displayValue}</td>
                    </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      
      {/* Supplier Products Section */}
      {productsLoading ? (
        <Card>
          <div className="h-7 bg-gray-200 rounded animate-pulse w-40 mb-4"></div>
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-gray-200 rounded"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
          </div>
        </Card>
      ) : (
        supplier && <SupplierProducts supplierId={supplier.id} />
      )}
      
      {isModalOpen && supplier && (
        <SupplierModal
          isOpen={isModalOpen}
          onClose={closeModal}
          supplier={supplier}
        />
      )}
    </div>
  );
};

export default SupplierDetail; 