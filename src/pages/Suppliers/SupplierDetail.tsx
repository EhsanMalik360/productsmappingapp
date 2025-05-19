import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCcw, Edit, Save, X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import EmptyState from '../../components/Dashboard/EmptyState';
import SupplierModal from './SupplierModal';
import SupplierProducts from '../../components/Suppliers/SupplierProducts';
import toast from 'react-hot-toast';

// Create a statistics cache to store values between renders
const statsCache = new Map<string, {
  totalProducts: number;
  matchedProducts: number;
  unmatchedProducts: number;
  avgCost: number;
  timestamp: number;
}>();

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
  
  // Ensure ID is properly formatted - remove any UUID format issues
  const normalizedId = useMemo(() => {
    if (!id) return '';
    // Return the full ID without any processing that might truncate it
    return String(id); // Convert to string to ensure it's a string type
  }, [id]);
  
  // State for component
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [supplierNotFound, setSupplierNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dataFetched, setDataFetched] = useState(false);
  
  // Edit mode states
  const [isEditing, setIsEditing] = useState(false);
  const [editedSupplier, setEditedSupplier] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Add progressive loading states - initialize as false to show content immediately
  const [headerLoaded, setHeaderLoaded] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [attributesLoading, setAttributesLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);

  // Initialize product stats from cache if available
  const cachedStats = normalizedId ? statsCache.get(normalizedId) : undefined;
  const [productStats, setProductStats] = useState({
    totalProducts: cachedStats?.totalProducts || 0,
    matchedProducts: cachedStats?.matchedProducts || 0,
    unmatchedProducts: cachedStats?.unmatchedProducts || 0,
    avgCost: cachedStats?.avgCost || 0
  });
  const [loadingStats, setLoadingStats] = useState(!cachedStats);

  // Load product statistics from server
  const loadProductStats = useCallback(async () => {
    if (!normalizedId) return;
    
    try {
      // Set loading state only if we don't have cached data
      if (!statsCache.has(normalizedId)) {
        setLoadingStats(true);
      }
      
      // Get total count
      const totalResult = await fetchSupplierProducts(normalizedId, 1, 1);
      
      // Get matched count
      const matchedResult = await fetchSupplierProducts(normalizedId, 1, 1, { filterOption: 'matched' });
      
      // Calculate statistics
      const totalProducts = totalResult.count;
      const matchedProducts = matchedResult.count;
      const unmatchedProducts = totalProducts - matchedProducts;
      
      // For average cost, we need a separate endpoint or a sample
      let avgCost = 0;
      
      // Try to use the cost stats endpoint if available
      try {
        const response = await fetch(`/api/supplier-product-stats/${normalizedId}`)
          .then(res => {
            if (!res.ok) {
              throw new Error(`API returned ${res.status}: ${res.statusText}`);
            }
            return res.json();
          });
          
        if (response && response.data) {
          // If we have min and max cost, use their average as an approximation
          avgCost = (response.data.minCost + response.data.maxCost) / 2;
        }
      } catch (e) {
        console.error('Error fetching cost stats:', e);
        
        // Fallback to calculating from available data
        const sampleProducts = supplierProducts.filter(sp => sp.supplier_id === normalizedId);
        if (sampleProducts.length > 0) {
          avgCost = sampleProducts.reduce((sum, sp) => sum + sp.cost, 0) / sampleProducts.length;
        }
      }
      
      // Prepare new stats object
      const newStats = {
        totalProducts,
        matchedProducts,
        unmatchedProducts,
        avgCost,
        timestamp: Date.now()
      };
      
      // Update the cache
      statsCache.set(normalizedId, newStats);
      
      // Update state
      setProductStats({
        totalProducts: newStats.totalProducts,
        matchedProducts: newStats.matchedProducts,
        unmatchedProducts: newStats.unmatchedProducts,
        avgCost: newStats.avgCost
      });
      
    } catch (error) {
      console.error('Error loading product stats:', error);
    } finally {
      setLoadingStats(false);
    }
  }, [normalizedId, fetchSupplierProducts, supplierProducts]);

  // Immediately use cached values if available, then load fresh data
  useEffect(() => {
    if (normalizedId) {
      // If we have cached data, use it immediately
      const cachedData = statsCache.get(normalizedId);
      if (cachedData) {
        // Check if cache is still fresh (less than 30 min old)
        const isFresh = Date.now() - cachedData.timestamp < 30 * 60 * 1000;
        
        // Update state with cached data
        setProductStats({
          totalProducts: cachedData.totalProducts,
          matchedProducts: cachedData.matchedProducts,
          unmatchedProducts: cachedData.unmatchedProducts,
          avgCost: cachedData.avgCost
        });
        
        // Only set loading to false if the cache is fresh
        if (isFresh) {
          setLoadingStats(false);
        }
      }
      
      // Always load fresh data in the background
      loadProductStats();
    }
  }, [normalizedId, loadProductStats]);

  // Memoize the fetchLatestData function to prevent it from changing on every render
  const fetchLatestData = useCallback(async () => {
    try {
      console.log('SupplierDetail: Loading data for supplier ID:', normalizedId);
      setIsRefreshing(true);
      setErrorMessage(null);
      await refreshData();
      
      // Check if the supplier exists after data refresh
      const supplierExists = suppliers.some(s => s.id === normalizedId);
      setSupplierNotFound(!supplierExists);
      
      if (!supplierExists) {
        console.error(`Supplier with ID ${normalizedId} not found after data refresh`);
        setErrorMessage(`Supplier with ID ${normalizedId} not found in the database.`);
      }
      
      setDataFetched(true);
      
      // Load product statistics
      await loadProductStats();
      
    } catch (error) {
      console.error('Error refreshing data in SupplierDetail:', error);
      setErrorMessage('Failed to load supplier data. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  }, [normalizedId, refreshData, suppliers, loadProductStats]);

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
  
  // Get supplier products for display only (not for statistics calculation)
  const supplierProductsList = supplierProducts.filter(sp => sp.supplier_id === normalizedId);
  
  // Join with product data for display
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
  
  // Calculate profit margin based on the products we have loaded (for display only)
  const profitableProducts = productsWithDetails.filter(p => p && typeof p.profitMargin === 'number' && p.profitMargin > 0);
  const avgProfitMargin = profitableProducts.length > 0
    ? profitableProducts.reduce((sum, p) => sum + (p ? p.profitMargin : 0), 0) / profitableProducts.length
    : 0;
  
  return (
    <div className="p-6">
      {/* Header with navigation and actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button 
            onClick={() => navigate('/suppliers')} 
            variant="secondary" 
            className="mr-4 flex items-center"
          >
            <ArrowLeft size={16} className="mr-2" /> Back to Suppliers
          </Button>
          
          <h1 className="text-2xl font-bold">
            {isEditing ? (
            <input
              type="text"
              value={editedSupplier?.name || ''}
              onChange={(e) => handleEditChange('name', e.target.value)}
                className="border rounded px-2 py-1 w-64"
            />
          ) : (
              supplier?.name || 'Loading...'
          )}
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button 
                variant="primary" 
                onClick={handleSave}
                className="flex items-center"
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : (
                  <>
                    <Save size={16} className="mr-2" /> Save
                  </>
                )}
              </Button>
              <Button 
                variant="secondary" 
                onClick={handleCancelEdit}
                className="flex items-center"
              >
                <X size={16} className="mr-2" /> Cancel
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
                disabled={isRefreshing}
              >
                {isRefreshing ? 'Refreshing...' : (
                  <>
                <RefreshCcw size={16} className="mr-2" /> Refresh
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>
      
      {/* Supplier Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Card className="shadow-sm">
          <h3 className="text-lg font-semibold mb-2">Total Products</h3>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold">
              {productStats.totalProducts === 0 ? 
                <span className="text-gray-300">—</span> : 
                productStats.totalProducts.toLocaleString()}
            </span>
            {loadingStats && <span className="text-xs text-gray-400">(updating...)</span>}
          </div>
        </Card>
        
        <Card className="shadow-sm">
          <h3 className="text-lg font-semibold mb-2">Matched Products</h3>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-blue-600">
              {productStats.matchedProducts === 0 ? 
                <span className="text-gray-300">—</span> : 
                productStats.matchedProducts.toLocaleString()}
            </span>
            <span className="text-sm text-gray-500 mb-1">
              {productStats.totalProducts === 0 ? '' : 
                `(${Math.round((productStats.matchedProducts / productStats.totalProducts) * 100) || 0}%)`}
            </span>
            {loadingStats && <span className="text-xs text-gray-400">(updating...)</span>}
              </div>
        </Card>
        
        <Card className="shadow-sm">
          <h3 className="text-lg font-semibold mb-2">Average Cost</h3>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-green-600">
              {productStats.avgCost === 0 ? 
                <span className="text-gray-300">—</span> : 
                `$${productStats.avgCost.toFixed(2)}`}
            </span>
            {loadingStats && <span className="text-xs text-gray-400">(updating...)</span>}
              </div>
        </Card>
        
        <Card className="shadow-sm">
          <h3 className="text-lg font-semibold mb-2">Avg. Profit Margin</h3>
          <div className="flex items-end gap-2">
            <span className={`text-3xl font-bold ${avgProfitMargin > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {avgProfitMargin.toFixed(1)}%
            </span>
        </div>
        </Card>
      </div>
      
      {/* Supplier Custom Attributes */}
      {supplier && (
        <Card className="mb-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">Supplier Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {getEntityAttributes(supplier.id, 'supplier').map(({ attribute, value }) => (
              <div key={attribute.id}>
                <h4 className="text-sm font-medium text-gray-700 mb-1">{attribute.name}</h4>
                <div className="border rounded-md p-2 bg-gray-50">
                      {isEditing ? (
                            <input
                              type="text"
                      value={value || ''}
                      onChange={(e) => {
                        // Update attribute value
                        setAttributeValue(attribute.id, supplier.id, e.target.value);
                      }}
                      className="w-full px-2 py-1 border rounded"
                    />
                  ) : (
                    <p className="text-gray-800">{value || '-'}</p>
                      )}
                    </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      
      {/* Supplier Products */}
      <SupplierProducts supplierId={normalizedId} />
      
      {/* Edit Supplier Modal */}
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