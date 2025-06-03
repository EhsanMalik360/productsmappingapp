import React, { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, RefreshCcw, Edit, Save, X, DollarSign, Package, TrendingUp, BarChart } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import SupplierModal from './SupplierModal';
import SupplierProducts from '../../components/Suppliers/SupplierProducts';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import './SupplierDetail.css';

// Add CSS for smooth transitions
const styles = {
  fadeIn: {
    opacity: 1,
    transition: 'opacity 0.3s ease-in-out'
  },
  fadeOut: {
    opacity: 0.6,
    transition: 'opacity 0.3s ease-in-out'
  },
  contentTransition: {
    transition: 'all 0.25s ease-in-out'
  }
};

const SupplierDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    suppliers, 
    supplierProducts, 
    products, 
    refreshData,
    getEntityAttributes,
    setAttributeValue,
    updateSupplier,
    fetchSupplierProducts,
    supplierCache,
    cacheSupplierById
  } = useAppContext();
  
  // Component state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [supplierNotFound, setSupplierNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dataFetched, setDataFetched] = useState(false);
  const [totalProductCount, setTotalProductCount] = useState(0);
  const [hasAccurateCount, setHasAccurateCount] = useState(false);
  const [accurateStats, setAccurateStats] = useState<{
    totalCount: number;
    matchedCount: number;
    avgCost: number;
  } | null>(null);
  
  // Add states for visual transitions
  const [isContentVisible, setIsContentVisible] = useState(true);
  const [prefetchedProducts, setPrefetchedProducts] = useState<any[]>([]);
  
  // Edit mode states
  const [isEditing, setIsEditing] = useState(false);
  const [editedSupplier, setEditedSupplier] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Refs for height measurement
  const overviewRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const productsContainerRef = useRef<HTMLDivElement>(null);
  const [overviewHeight, setOverviewHeight] = useState<number>(200);
  const [detailsHeight, setDetailsHeight] = useState<number>(200);
  const [productsHeight, setProductsHeight] = useState<number>(400);

  // Format ID properly
  const normalizedId = useMemo(() => id ? String(id) : '', [id]);

  // Add direct database access for optimized loading
  const loadSupplierDirectly = async (supplierId: string) => {
    if (!supplierId) return null;
    
    try {
      console.log('Loading supplier data directly from database');
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', supplierId)
        .single();
        
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error loading supplier directly:', err);
      return null;
    }
  };
  
  // Pre-fetch supplier products to avoid flickering
  const prefetchSupplierProducts = async (supplierId: string) => {
    if (!supplierId) return;
    
    try {
      console.log('Pre-fetching supplier products');
      const { data, error } = await supabase
        .from('supplier_products')
        .select(`
          id,
          supplier_id,
          product_id,
          cost,
          moq,
          lead_time,
          payment_terms,
          ean,
          match_method,
          product_name,
          mpn,
          created_at,
          updated_at,
          suppliers (
            id,
            name
          )
        `)
        .eq('supplier_id', supplierId)
        .limit(50);
        
      if (error) throw error;
      if (data) {
        setPrefetchedProducts(data);
      }
    } catch (err) {
      console.error('Error pre-fetching supplier products:', err);
    }
  };

  // Get supplier data
  const supplier = useMemo(() => 
    suppliers.find(s => s.id === normalizedId), 
    [suppliers, normalizedId]
  );
  
  // Get supplier products with improved caching
  const supplierProductsList = useMemo(() => {
    // First try to use pre-fetched products for instant display
    if (prefetchedProducts.length > 0) {
      return prefetchedProducts;
    }
    
    // Then try cached products
    if (supplierCache[normalizedId]?.products?.length > 0) {
      return supplierCache[normalizedId].products;
    }
    
    // Finally fall back to filtered products from context
    return supplierProducts.filter(sp => sp.supplier_id === normalizedId);
  }, [supplierProducts, normalizedId, prefetchedProducts, supplierCache]);
  
  // Calculate statistics with smooth transitions - now using accurate database data
  const stats = useMemo(() => {
    // If we have accurate stats from database, use them
    if (accurateStats && hasAccurateCount) {
      return {
        productCount: accurateStats.totalCount,
        matchedCount: accurateStats.matchedCount,
        unmatchedCount: accurateStats.totalCount - accurateStats.matchedCount,
        matchedPercent: accurateStats.totalCount > 0 ? Math.round((accurateStats.matchedCount / accurateStats.totalCount) * 100) : 0,
        avgCost: accurateStats.avgCost
      };
    }
    
    // Fallback to client-side data for immediate display
    const clientCount = supplierProductsList.length;
    const matched = supplierProductsList.filter(sp => sp.product_id).length;
    const count = totalProductCount || clientCount;
    
    // Set initial count if needed
    if (clientCount > 0 && totalProductCount === 0 && !hasAccurateCount) {
      setTotalProductCount(clientCount);
    }
    
    return {
      productCount: count,
      matchedCount: matched,
      unmatchedCount: count - matched,
      matchedPercent: count > 0 ? Math.round((matched / count) * 100) : 0,
      avgCost: clientCount > 0 
        ? supplierProductsList.reduce((sum, sp) => sum + (sp.cost || 0), 0) / clientCount
        : 0
    };
  }, [supplierProductsList, totalProductCount, hasAccurateCount, accurateStats]);
  
  // Calculate profit metrics
  const productsWithDetails = useMemo(() => {
    if (!supplierProductsList.length || !products.length) return [];
    
    return supplierProductsList
      .filter(sp => sp && sp.product_id)
      .map(sp => {
        const product = products.find(p => p && p.id === sp.product_id);
        if (!product) return null;
        
        const buyBoxPrice = product.buyBoxPrice || 0;
        const amazonFee = product.amazonFee || 0;
        const referralFee = product.referralFee || 0;
        const cost = sp.cost || 0;
        
        const margin = buyBoxPrice - amazonFee - referralFee - cost;
        const profitMargin = buyBoxPrice > 0 ? (margin / buyBoxPrice) * 100 : 0;
        
        return { ...sp, product, margin, profitMargin };
      })
      .filter(Boolean); // Remove nulls
  }, [supplierProductsList, products]);
  
  // Average profit margin
  const avgProfitMargin = useMemo(() => {
    if (!productsWithDetails.length) return 0;
    const sum = productsWithDetails.reduce((acc, item) => {
      if (!item) return acc;
      return acc + (item.profitMargin || 0);
    }, 0);
    return sum / productsWithDetails.length;
  }, [productsWithDetails]);

  // Custom attributes
  const customAttributes = useMemo(() => {
    if (!supplier?.id) return [];
    try {
      return getEntityAttributes(supplier.id, 'supplier') || [];
    } catch (err) {
      console.error('Error getting attributes:', err);
      return [];
    }
  }, [supplier, getEntityAttributes]);
  
  // Fetch accurate product count with visual transitions
  const fetchTotalProductCount = useCallback(async () => {
    if (!normalizedId) return;
    
    try {
      console.log(`Fetching accurate stats for supplier ${normalizedId}`);
      
      // Get total count
      const { count: totalCount, error: countError } = await supabase
        .from('supplier_products')
        .select('*', { count: 'exact', head: true })
        .eq('supplier_id', normalizedId);
        
      if (countError) throw countError;
      
      // Get matched count
      const { count: matchedCount, error: matchedError } = await supabase
        .from('supplier_products')
        .select('*', { count: 'exact', head: true })
        .eq('supplier_id', normalizedId)
        .not('product_id', 'is', null);
        
      if (matchedError) throw matchedError;
      
      // Get average cost using the same approach as Suppliers page
      const { data: avgData, error: avgError } = await supabase
        .from('supplier_products')
        .select('cost')
        .eq('supplier_id', normalizedId);
        
      if (avgError) throw avgError;
      
      const avgCost = avgData && avgData.length > 0 
        ? avgData.reduce((sum, item) => sum + (item.cost || 0), 0) / avgData.length
        : 0;
      
      // Apply transition when updating the data
      setIsContentVisible(false);
      setTimeout(() => {
        setTotalProductCount(totalCount || 0);
        setAccurateStats({
          totalCount: totalCount || 0,
          matchedCount: matchedCount || 0,
          avgCost: avgCost
        });
        setHasAccurateCount(true);
        setIsContentVisible(true);
        
        console.log(`Supplier ${normalizedId}: ${totalCount} total, ${matchedCount} matched, $${avgCost.toFixed(2)} avg cost`);
      }, 150);
    } catch (err) {
      console.error('Error fetching accurate stats:', err);
      setHasAccurateCount(true); // Show client-side data on error
    }
  }, [normalizedId]);

  // Add a flag to track if we're coming back from product details
  const [isReturningFromProduct, setIsReturningFromProduct] = useState(false);

  // Update the fetchInitialData function with progressive loading
  const fetchInitialData = useCallback(async () => {
    if (!normalizedId || dataFetched) return;
    
    try {
      setIsRefreshing(true);
      
      // Stage 1: Check for cached data or returning from product details
      const cachedSupplierData = supplierCache[normalizedId];
      const isReturning = cachedSupplierData && 
        cachedSupplierData.supplier && 
        (Date.now() - cachedSupplierData.timestamp) < 2 * 60 * 1000;
      
      if (isReturning) {
        console.log('Using cached supplier data - returning from product details');
        setIsReturningFromProduct(true);
        setDataFetched(true);
        
        // Still pre-fetch to ensure fresh data without disrupting UI
        prefetchSupplierProducts(normalizedId);
        fetchTotalProductCount();
        setIsRefreshing(false);
        return;
      }
      
      // Stage 2: Start with direct database query for immediate supplier data
      const directSupplier = await loadSupplierDirectly(normalizedId);
      
      if (directSupplier) {
        // Fade in transition for immediate data display
        setIsContentVisible(false);
        setTimeout(() => {
          // Cache the direct supplier data
          cacheSupplierById(normalizedId);
          setDataFetched(true);
          setIsContentVisible(true);
        }, 150);
        
        // Stage 3: Start pre-fetching products data in parallel
        prefetchSupplierProducts(normalizedId);
      } else {
        // No direct data found, fall back to full refresh
        const existingSupplier = suppliers.find(s => s.id === normalizedId);
        
        if (!existingSupplier) {
          await refreshData();
        } else {
          // Cache the supplier for future use
          cacheSupplierById(normalizedId);
        }
      }
      
      // Stage 4: Get accurate statistics in background regardless of data source
      fetchTotalProductCount();
      
      // Check if supplier exists
      const supplierExists = !!directSupplier || 
        suppliers.some(s => s.id === normalizedId) || 
        (cachedSupplierData && cachedSupplierData.supplier);
        
      setSupplierNotFound(!supplierExists);
      
      if (!supplierExists) {
        setErrorMessage(`Supplier with ID ${normalizedId} not found.`);
      }
      
      setDataFetched(true);
    } catch (err) {
      console.error('Error loading data:', err);
      setErrorMessage('Failed to load supplier data.');
      setDataFetched(true);
    } finally {
      setIsRefreshing(false);
    }
  }, [normalizedId, suppliers, refreshData, fetchTotalProductCount, dataFetched, supplierCache, cacheSupplierById, prefetchSupplierProducts, loadSupplierDirectly]);

  // Load data on mount
  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);
  
  // Measure card heights to prevent layout shifts
  useLayoutEffect(() => {
    if (overviewRef.current) {
      setOverviewHeight(Math.max(overviewRef.current.offsetHeight, 200));
    }
    
    if (detailsRef.current) {
      setDetailsHeight(Math.max(detailsRef.current.offsetHeight, 200));
    }
  }, [supplier]);
  
  // Initialize edit form when supplier changes
  useEffect(() => {
    if (supplier && (isEditing || !editedSupplier)) {
      setEditedSupplier({ ...supplier });
    }
  }, [supplier, isEditing, editedSupplier]);

  // Form handling
  const handleEditChange = (field: string, value: any) => {
    setEditedSupplier((prev: Record<string, any>) => ({ ...prev, [field]: value }));
  };

  // Save changes
  const handleSave = async () => {
    if (!editedSupplier) return;
    
    try {
      setIsSaving(true);
      
      // Validate
      if (!editedSupplier.name) {
        toast.error('Supplier name is required');
        return;
      }
      
      await updateSupplier(normalizedId, { name: editedSupplier.name });
      await refreshData();
      
      toast.success('Supplier updated successfully');
      setIsEditing(false);
    } catch (err) {
      console.error('Error updating:', err);
      toast.error('Failed to update supplier');
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel edit
  const handleCancelEdit = () => {
    if (supplier) {
      setEditedSupplier({ ...supplier });
    }
    setIsEditing(false);
  };

  // Refresh data with optimized transitions
  const handleRefresh = async () => {
    try {
      // Start fade out transition
      setIsContentVisible(false);
      setIsRefreshing(true);
      setHasAccurateCount(false);
      setAccurateStats(null);
      
      // Clear prefetched data to force reload
      setPrefetchedProducts([]);
      
      // Small delay for visual transition
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Perform refresh operations in parallel
      await Promise.all([
        refreshData(),
        prefetchSupplierProducts(normalizedId),
        fetchTotalProductCount()
      ]);
      
      // Apply height measurement again after data reload
      measureCardHeights();
      
      // Fade back in after data is loaded
      setTimeout(() => {
        setIsContentVisible(true);
        setIsRefreshing(false);
      }, 100);
    } catch (err) {
      console.error('Error refreshing:', err);
      setIsRefreshing(false);
      setIsContentVisible(true);
    }
  };
  
  // Add a utility function to measure card heights to prevent layout shifts
  const measureCardHeights = useCallback(() => {
    if (overviewRef.current) {
      setOverviewHeight(Math.max(overviewRef.current.offsetHeight, 200));
    }
    
    if (detailsRef.current) {
      setDetailsHeight(Math.max(detailsRef.current.offsetHeight, 200));
    }
    
    if (productsContainerRef.current) {
      setProductsHeight(Math.max(productsContainerRef.current.offsetHeight, 400));
    }
  }, []);

  // Modal control
  const closeModal = () => setIsModalOpen(false);
  
  // Skeleton loaders
  const renderStatCardSkeleton = () => (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-gray-50 p-4 rounded-lg animate-pulse">
          <div className="h-5 bg-gray-200 rounded w-24 mb-1"></div>
          <div className="h-8 bg-gray-200 rounded w-20 mb-1"></div>
          {i === 1 && <div className="h-4 bg-gray-200 rounded w-16"></div>}
        </div>
      ))}
    </div>
  );
  
  // Error state for supplier not found
  if (!isRefreshing && dataFetched && supplierNotFound) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-300 rounded-md p-4 mb-6 animate-fadeIn">
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
  
  // Loading state handling
  const isLoading = isRefreshing || !dataFetched;
  const showSkeleton = isLoading && !supplier;

  return (
    <div className="p-6 content-wrapper">
      {/* Header Section */}
      <div 
        className="flex items-center justify-between mb-6 animate-fadeIn"
        style={isContentVisible ? styles.fadeIn : styles.fadeOut}
      >
        <div className="flex items-center">
          <Button 
            variant="secondary" 
            className="mr-3"
            onClick={() => navigate('/suppliers')}
          >
            <ArrowLeft size={16} className="mr-2" /> Back to Suppliers
          </Button>
          
          {showSkeleton ? (
            <div className="h-8 bg-gray-200 rounded skeleton-shimmer w-48"></div>
          ) : isEditing ? (
            <input
              type="text"
              value={editedSupplier?.name || ''}
              onChange={(e) => handleEditChange('name', e.target.value)}
              className="text-2xl font-bold border border-blue-300 rounded px-2 py-1 w-64 transition-all"
              placeholder="Supplier Name"
            />
          ) : (
            <h1 className="text-2xl font-bold transition-opacity">{supplier?.name || "Loading..."}</h1>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          {isRefreshing ? (
            <div className="flex items-center text-gray-500 text-sm">
              <RefreshCcw size={16} className="mr-2 animate-spin" />
              Refreshing...
            </div>
          ) : (
            <>
              {!isEditing && (
                <Button 
                  variant="secondary"
                  onClick={() => setIsEditing(true)}
                  className="flex items-center text-sm"
                  disabled={isSaving}
                >
                  <Edit size={16} className="mr-2" />
                  Edit
                </Button>
              )}
              
              {isEditing ? (
                <>
                  <Button 
                    variant="secondary"
                    onClick={handleCancelEdit}
                    className="flex items-center text-sm"
                    disabled={isSaving}
                  >
                    <X size={16} className="mr-2" />
                    Cancel
                  </Button>
                  
                  <Button 
                    onClick={handleSave}
                    className="flex items-center text-sm"
                    disabled={isSaving}
                  >
                    <Save size={16} className="mr-2" />
                    {isSaving ? 'Saving...' : 'Save'}
                  </Button>
                </>
              ) : (
                <Button 
                  variant="secondary"
                  onClick={handleRefresh}
                  className="flex items-center text-sm"
                  disabled={isRefreshing}
                >
                  <RefreshCcw size={16} className="mr-2" />
                  Refresh
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* Overview Card */}
      <div ref={overviewRef} style={{ minHeight: overviewHeight }}>
        <Card className="mb-6 card-container">
        <h2 className="text-xl font-semibold mb-4">Supplier Overview</h2>
        
          {showSkeleton ? renderStatCardSkeleton() : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6 animate-fadeIn">
              <div className="bg-blue-50 p-4 rounded-lg stat-card">
                <div className="text-sm text-blue-700 mb-1 flex items-center">
                  <Package size={16} className="mr-1" /> Total Products
                </div>
            <div className="text-2xl font-bold flex items-center">
                  {hasAccurateCount ? (
                    <span className="transition-all">{stats.productCount}</span>
                  ) : (
                    <div className="inline-block w-12 h-8 bg-blue-100 skeleton-shimmer rounded"></div>
              )}
            </div>
          </div>
      
              <div className="bg-green-50 p-4 rounded-lg stat-card">
                <div className="text-sm text-green-700 mb-1 flex items-center">
                  <BarChart size={16} className="mr-1" /> Matched Products
                </div>
                <div className="text-2xl font-bold flex items-center">
                  {hasAccurateCount ? (
                    <span className="transition-all">{stats.matchedCount}</span>
                  ) : (
                    <div className="inline-block w-12 h-8 bg-green-100 skeleton-shimmer rounded"></div>
                  )}
                </div>
            <div className="text-sm text-green-700">
                  {hasAccurateCount ? (
                    <span>({stats.matchedPercent}%)</span>
                  ) : (
                    <div className="inline-block w-14 h-4 bg-green-100 skeleton-shimmer rounded"></div>
                  )}
            </div>
          </div>
    
              <div className="bg-amber-50 p-4 rounded-lg stat-card">
                <div className="text-sm text-amber-700 mb-1 flex items-center">
                  <DollarSign size={16} className="mr-1" /> Average Cost
          </div>
                <div className="text-2xl font-bold">
                  {hasAccurateCount ? (
                    <span className="transition-all">${stats.avgCost.toFixed(2)}</span>
                  ) : (
                    <div className="inline-block w-24 h-8 bg-amber-100 skeleton-shimmer rounded"></div>
                  )}
          </div>
        </div>
              
              <div className="bg-purple-50 p-4 rounded-lg stat-card">
                <div className="text-sm text-purple-700 mb-1 flex items-center">
                  <TrendingUp size={16} className="mr-1" /> Avg Profit Margin
                </div>
                <div className="text-2xl font-bold">
                  {hasAccurateCount ? (
                    <span className="transition-all">{avgProfitMargin.toFixed(1)}%</span>
                  ) : (
                    <div className="inline-block w-20 h-8 bg-purple-100 skeleton-shimmer rounded"></div>
                  )}
                </div>
              </div>
            </div>
          )}
        
        {/* Custom Attributes Section */}
        {customAttributes.length > 0 && (
            <div className="border-t border-gray-200 pt-4 mt-2 animate-fadeIn">
            <h3 className="text-lg font-medium mb-3">Custom Attributes</h3>
            
              {showSkeleton ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="border rounded-lg p-3 relative bg-gray-50 skeleton-shimmer">
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
                        // Convert value to appropriate type
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
                      } catch (err) {
                        console.error('Error updating attribute:', err);
                      toast.error('Failed to update attribute');
                    }
                  };
                  
                  return (
                      <div key={attribute.id} className="border rounded-lg p-3 relative bg-gray-50 transition-all">
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
      </div>
      
      {/* Supplier Data Section */}
      {(supplier || showSkeleton) && (
        <div ref={detailsRef} style={{ minHeight: detailsHeight }}>
          <Card className="mb-6 card-container">
          <h3 className="text-lg font-medium mb-2">Supplier Data</h3>
          
            {showSkeleton ? (
              <div className="bg-gray-50 rounded border border-gray-200 overflow-x-auto p-2 skeleton-shimmer">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex border-b border-gray-200 py-2">
                    <div className="w-1/3 h-5 bg-gray-200 rounded"></div>
                    <div className="w-2/3 h-5 bg-gray-200 rounded ml-2"></div>
                  </div>
                ))}
              </div>
            ) : (
          <div className="bg-gray-50 rounded border border-gray-200 overflow-x-auto">
                <table className="min-w-full text-xs supplier-table">
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
                      <td className="px-2 py-1.5">
                        {hasAccurateCount ? (
                          <span className="transition-all">{stats.productCount}</span>
                        ) : (
                          <div className="inline-block w-12 h-4 bg-gray-100 skeleton-shimmer rounded"></div>
                    )}
                  </td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="px-2 py-1.5 font-medium">Matched Products</td>
                      <td className="px-2 py-1.5">
                        {hasAccurateCount ? (
                          <span className="transition-all">{stats.matchedCount} ({stats.matchedPercent}%)</span>
                        ) : (
                          <div className="inline-block w-20 h-4 bg-gray-100 skeleton-shimmer rounded"></div>
                        )}
                      </td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td className="px-2 py-1.5 font-medium">Average Cost</td>
                      <td className="px-2 py-1.5">
                        {hasAccurateCount ? (
                          <span className="transition-all">${stats.avgCost.toFixed(2)}</span>
                        ) : (
                          <div className="inline-block w-16 h-4 bg-gray-100 skeleton-shimmer rounded"></div>
                        )}
                      </td>
                </tr>
                
                    {/* Custom attributes */}
                    {customAttributes.map(({ attribute, value }) => {
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
                      } catch (err) {
                        console.error("Error formatting attribute value:", err);
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
            )}
        </Card>
        </div>
      )}
      
      {/* Supplier Products Section */}
      {(supplier || (showSkeleton && dataFetched)) && (
        <div 
          ref={productsContainerRef} 
          style={{ 
            minHeight: productsHeight,
            ...styles.contentTransition,
            ...(isContentVisible ? styles.fadeIn : styles.fadeOut)
          }}
        >
          {supplier ? (
            <SupplierProducts 
              supplierId={supplier.id} 
              initialCachedProducts={
                // Use the most complete data source available
                prefetchedProducts.length > 0 
                  ? prefetchedProducts 
                  : supplierCache[supplier.id]?.products || []
              } 
            />
          ) : (
            <Card className="mb-6 card-skeleton">
              <div className="h-7 bg-gray-200 rounded skeleton-shimmer w-40 mb-4"></div>
              <div className="skeleton-shimmer space-y-4">
                <div className="h-10 bg-gray-200 rounded"></div>
                <div className="h-10 bg-gray-200 rounded"></div>
                <div className="h-10 bg-gray-200 rounded"></div>
              </div>
            </Card>
          )}
        </div>
      )}
      
      {/* Edit Modal */}
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