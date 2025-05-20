import React, { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCcw, Edit, Save, X, DollarSign, Package, TrendingUp, BarChart } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import SupplierModal from './SupplierModal';
import SupplierProducts from '../../components/Suppliers/SupplierProducts';
import toast from 'react-hot-toast';
import './SupplierDetail.css';

const SupplierDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { 
    suppliers, 
    supplierProducts, 
    products, 
    refreshData,
    getEntityAttributes,
    setAttributeValue,
    updateSupplier,
    fetchSupplierProducts
  } = useAppContext();
  
  // Component state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [supplierNotFound, setSupplierNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dataFetched, setDataFetched] = useState(false);
  const [totalProductCount, setTotalProductCount] = useState(0);
  const [hasAccurateCount, setHasAccurateCount] = useState(false);
  
  // Edit mode states
  const [isEditing, setIsEditing] = useState(false);
  const [editedSupplier, setEditedSupplier] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Refs for height measurement
  const overviewRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const [overviewHeight, setOverviewHeight] = useState<number>(200);
  const [detailsHeight, setDetailsHeight] = useState<number>(200);

  // Format ID properly
  const normalizedId = useMemo(() => id ? String(id) : '', [id]);

  // Get supplier data
  const supplier = useMemo(() => 
    suppliers.find(s => s.id === normalizedId), 
    [suppliers, normalizedId]
  );
  
  // Get supplier products
  const supplierProductsList = useMemo(() => 
    supplierProducts.filter(sp => sp.supplier_id === normalizedId), 
    [supplierProducts, normalizedId]
  );
  
  // Calculate statistics
  const stats = useMemo(() => {
    // Use client-side data for immediate display
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
        ? supplierProductsList.reduce((sum, sp) => sum + sp.cost, 0) / clientCount
        : 0
    };
  }, [supplierProductsList, totalProductCount, hasAccurateCount]);
  
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
  
  // Fetch accurate product count
  const fetchTotalProductCount = useCallback(async () => {
    if (!normalizedId) return;
    try {
      const result = await fetchSupplierProducts(normalizedId, 1, 1);
      setTotalProductCount(result.count);
      setHasAccurateCount(true);
    } catch (err) {
      console.error('Error fetching count:', err);
      setHasAccurateCount(true); // Show client-side data on error
    }
  }, [normalizedId, fetchSupplierProducts]);

  // Load initial data
  const fetchInitialData = useCallback(async () => {
    if (!normalizedId || dataFetched) return;
    
    try {
      setIsRefreshing(true);
      
      // Check if we already have the supplier
      const existingSupplier = suppliers.find(s => s.id === normalizedId);
      
      if (!existingSupplier) {
        await refreshData();
      }
      
      // Get accurate count in background
      fetchTotalProductCount();
      
      // Check if supplier exists
      const supplierExists = suppliers.some(s => s.id === normalizedId) || !!existingSupplier;
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
  }, [normalizedId, suppliers, refreshData, fetchTotalProductCount, dataFetched]);

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

  // Refresh data
  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      setHasAccurateCount(false);
      await refreshData();
      await fetchTotalProductCount();
    } catch (err) {
      console.error('Error refreshing:', err);
    } finally {
      setIsRefreshing(false);
    }
  };
  
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
      <div className="flex items-center justify-between mb-6 animate-fadeIn">
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
        
        <div className="flex space-x-2">
          {isRefreshing || isSaving ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 px-4 py-2 border rounded">
              <RefreshCcw size={16} className="animate-spin" />
              <span>
                {isSaving ? "Saving..." : "Refreshing..."}
              </span>
            </div>
          ) : isEditing ? (
            <>
              <Button 
                variant="secondary" 
                onClick={handleCancelEdit}
                className="flex items-center transition-all"
              >
                <X size={16} className="mr-2" /> Cancel
              </Button>
              <Button 
                onClick={handleSave}
                className="flex items-center transition-all"
              >
                <Save size={16} className="mr-2" /> Save
              </Button>
            </>
          ) : (
            <>
              <Button 
                variant="secondary" 
                onClick={() => setIsEditing(true)} 
                className="flex items-center transition-all" 
                disabled={showSkeleton}
              >
                <Edit size={16} className="mr-2" /> Edit
              </Button>
              <Button 
                variant="secondary" 
                onClick={handleRefresh}
                className="flex items-center transition-all"
                disabled={isRefreshing}
              >
                <RefreshCcw size={16} className="mr-2 transition-transform hover:rotate-180" /> Refresh
              </Button>
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
        supplier ? <SupplierProducts supplierId={supplier.id} /> : (
          <Card className="mb-6 card-skeleton">
            <div className="h-7 bg-gray-200 rounded skeleton-shimmer w-40 mb-4"></div>
            <div className="skeleton-shimmer space-y-4">
            <div className="h-10 bg-gray-200 rounded"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
          </div>
        </Card>
        )
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