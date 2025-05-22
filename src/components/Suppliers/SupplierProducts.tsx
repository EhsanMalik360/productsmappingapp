import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, ExternalLink, Link, Info, Search, Filter, X, ArrowDownAZ, DollarSign, TrendingUp, Tag, ChevronLeft, ChevronRight, RefreshCcw } from 'lucide-react';
import Card from '../UI/Card';
import Table from '../UI/Table';
import Button from '../UI/Button';
import EmptyState from '../Dashboard/EmptyState';
import ProductMatchBadge from '../UI/ProductMatchBadge';
import { useAppContext } from '../../context/AppContext';

// Add CSS to ensure smooth transitions
const transitionStyles = {
  table: {
    transition: 'opacity 0.3s ease-in-out'
  },
  fadeIn: {
    opacity: 1,
    transition: 'opacity 0.3s ease-in-out'
  },
  fadeOut: {
    opacity: 0.6,
    transition: 'opacity 0.3s ease-in-out'
  }
};

interface SupplierProductsProps {
  supplierId: string;
  initialCachedProducts?: any[];
}

type FilterOption = 'all' | 'matched' | 'unmatched';
type SortField = 'name' | 'cost' | 'price' | 'profit' | 'margin' | '';
type SortOrder = 'asc' | 'desc';

const SupplierProducts: React.FC<SupplierProductsProps> = ({ supplierId, initialCachedProducts }) => {
  const navigate = useNavigate();
  const { products, fetchSupplierProducts, supplierCache } = useAppContext();
  const [filterOption, setFilterOption] = useState<FilterOption>('all');
  const [selectedUnmatchedProduct, setSelectedUnmatchedProduct] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<SortField>('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [costRange, setCostRange] = useState<{min: number, max: number}>({min: 0, max: 1000});
  const [userModifiedCostRange, setUserModifiedCostRange] = useState(false);
  const [matchMethodFilter, setMatchMethodFilter] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [isLoading, setIsLoading] = useState(false);
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
  const [supplierProductsData, setSupplierProductsData] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [costStats, setCostStats] = useState<{min: number, max: number}>({min: 0, max: 1000});
  const [matchMethods, setMatchMethods] = useState<string[]>([]);
  const [matchStats, setMatchStats] = useState<{ total: number, matched: number, unmatched: number }>({
    total: 0,
    matched: 0,
    unmatched: 0
  });
  const [hasInitializedFilters, setHasInitializedFilters] = useState(false);
  const [usingCachedData, setUsingCachedData] = useState(false);
  
  // Add ref for tracking data updates to prevent flickering
  const dataUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Add state for visual stability
  const [isTableVisible, setIsTableVisible] = useState(true);
  
  // Modify the cached data initialization to prevent flickering
  useEffect(() => {
    // Check for cache in both props and context
    const cachedProducts = initialCachedProducts || 
                         (supplierCache[supplierId]?.products || []);
    const cachedCount = supplierCache[supplierId]?.count || 0;
    
    if (cachedProducts && cachedProducts.length > 0) {
      console.log('Using cached supplier products data');
      
      // Set data without causing flickering
      setSupplierProductsData(cachedProducts);
      setTotalCount(cachedCount);
      setUsingCachedData(true);
      setIsTableVisible(true);
      
      // Start a silent background refresh with delay to prevent immediate flicker
      setTimeout(() => {
        setIsBackgroundRefreshing(true);
        loadData(true);
      }, 500);
    } else {
      // No cached data, need to load with spinner
      setIsLoading(true);
      setIsTableVisible(false);
    }
  }, [supplierId]); // Only trigger on supplier ID change to prevent re-runs
  
  // Batch state updates to prevent flickering when data refreshes
  const updateDisplayData = useCallback((data: any[], count: number, keepVisible = false) => {
    // Clear any pending updates
    if (dataUpdateTimeoutRef.current) {
      clearTimeout(dataUpdateTimeoutRef.current);
    }
    
    // If we're updating with new data and table is visible, fade it out first
    if (!keepVisible && isTableVisible && data.length > 0) {
      setIsTableVisible(false);
      
      // Wait for fade out transition before updating data
      dataUpdateTimeoutRef.current = setTimeout(() => {
        setSupplierProductsData(data);
        setTotalCount(count);
        
        // Then fade back in after a short delay
        setTimeout(() => {
          setIsTableVisible(true);
        }, 50);
      }, 300); // Match the CSS transition duration
    } else {
      // Direct update without animation if table is already hidden or we want to keep it visible
      setSupplierProductsData(data);
      setTotalCount(count);
      if (!isTableVisible) {
        setIsTableVisible(true);
      }
    }
  }, [isTableVisible]);
  
  // Fetch data with improved handling to prevent flickering
  const loadData = useCallback(async (skipLoadingState = false) => {
    try {
      if (!skipLoadingState) {
        setIsLoading(true);
        // Only hide table if we don't have data yet
        if (supplierProductsData.length === 0) {
          setIsTableVisible(false);
        }
      }

      // Create filter params - only include cost range if user has modified it
      const filterParams: any = {
        searchTerm,
        filterOption,
        matchMethodFilter,
        sortField,
        sortOrder
      };
      
      if (userModifiedCostRange) {
        filterParams.costRange = costRange;
      }

      // Fetch data with server-side pagination
      const result = await fetchSupplierProducts(
        supplierId,
        currentPage,
        itemsPerPage,
        filterParams
      );
      
      // Batch update the UI to prevent flickering
      updateDisplayData(result.data, result.count, skipLoadingState);
      
      // Keep cached flag for UI indication, but update silently
      setUsingCachedData(false);
    
      // If we haven't loaded filter stats yet, fetch them
      if (!hasInitializedFilters) {
        await loadFilterStats();
      }
      
    } catch (error) {
      console.error('Error loading supplier products:', error);
    } finally {
      setIsLoading(false);
      setIsBackgroundRefreshing(false);
    }
  }, [supplierId, currentPage, itemsPerPage, searchTerm, filterOption, userModifiedCostRange, costRange, matchMethodFilter, sortField, sortOrder, fetchSupplierProducts, hasInitializedFilters, updateDisplayData, supplierProductsData.length]);
  
  // Load filter statistics (match stats, cost range, match methods)
  const loadFilterStats = useCallback(async () => {
    try {
      // Fetch total count stats for matched/unmatched
      const matchedResult = await fetchSupplierProducts(supplierId, 1, 1, { filterOption: 'matched' });
      const unmatchedResult = await fetchSupplierProducts(supplierId, 1, 1, { filterOption: 'unmatched' });
      const totalResult = await fetchSupplierProducts(supplierId, 1, 1);
      
      setMatchStats({
        total: totalResult.count,
        matched: matchedResult.count,
        unmatched: unmatchedResult.count
      });
      
      // Fetch min/max cost (we'll need a special query for this)
      const { data: costData, error: costError } = await fetch(`/api/supplier-product-stats/${supplierId}`)
        .then(res => res.json());
        
      if (!costError && costData) {
        const newCostStats = {
          min: costData.minCost || 0,
          max: costData.maxCost || 1000
        };
        
        setCostStats(newCostStats);

        // Only initialize the cost range control with these values, but don't apply 
        // as a filter until user interaction
        if (!userModifiedCostRange) {
          setCostRange(newCostStats);
        }
      }
      
      // Fetch unique match methods
      const { data: methodsData } = await fetch(`/api/supplier-product-methods/${supplierId}`)
        .then(res => res.json());
        
      if (methodsData && methodsData.matchMethods) {
        setMatchMethods(methodsData.matchMethods);
      }
      
      setHasInitializedFilters(true);
    } catch (error) {
      console.error('Error loading filter stats:', error);
    }
  }, [supplierId, fetchSupplierProducts]);

  // Improve loading behavior to prevent unnecessary re-renders
  useEffect(() => {
    const loadDataWithParams = async () => {
      // Skip the loading state if we have data and are just changing filters
      const skipLoading = supplierProductsData.length > 0;
      
      // Clear any existing debounce timers
      if (dataUpdateTimeoutRef.current) {
        clearTimeout(dataUpdateTimeoutRef.current);
      }
      
      // Debounce the load operation to prevent rapid updates
      dataUpdateTimeoutRef.current = setTimeout(async () => {
        await loadData(skipLoading);
      }, 200); // Small delay to batch changes
    };
    
    // Only trigger data load when relevant parameters change
    loadDataWithParams();
    
    // Cleanup any pending updates when component unmounts or dependencies change
    return () => {
      if (dataUpdateTimeoutRef.current) {
        clearTimeout(dataUpdateTimeoutRef.current);
      }
    };
  }, [loadData, currentPage, itemsPerPage, filterOption, sortField, sortOrder, userModifiedCostRange && costRange, matchMethodFilter, searchTerm]);

  // Join with product data for additional information
  const productsWithDetails = useMemo(() => {
    if (!Array.isArray(supplierProductsData) || !products || !Array.isArray(products)) {
      return [];
    }
    
    return supplierProductsData.map(sp => {
      // For matched products, include product details and calculate profit metrics
      if (sp.product_id) {
        // Normalize IDs to strings for comparison to avoid type mismatches
        const product = products.find(p => String(p.id) === String(sp.product_id));
        
        if (product) {
          const profitPerUnit = product.salePrice - product.amazonFee - sp.cost;
          const profitMargin = (profitPerUnit / product.salePrice) * 100;
          
          return {
            ...sp,
            product,
            productName: product.title || sp.product_name || '-',
            productEan: product.ean || sp.ean || '-',
            productMpn: product.mpn || sp.mpn || '-',
            profitPerUnit,
            profitMargin
          };
        }
        
        // If product_id exists but product not found in products array,
        // treat it as matched anyway since it has a valid product_id
        if (sp.match_method) {
          // Create a minimal placeholder to indicate it's matched
          return {
            ...sp,
            product: { id: sp.product_id }, // Minimal placeholder
            isPlaceholderProduct: true, // Flag to indicate product details are missing
            productName: sp.product_name || '-',
            productEan: sp.ean || '-',
            productMpn: sp.mpn || '-',
            profitPerUnit: 0,
            profitMargin: 0
          };
        }
      }
      
      // For unmatched products, use the stored product_name and ean
      return {
        ...sp,
        product: null,
        productName: sp.product_name || '-',
        productEan: sp.ean || '-',
        productMpn: sp.mpn || '-',
        profitPerUnit: 0,
        profitMargin: 0
      };
    });
  }, [supplierProductsData, products]);

  // Determine the headers based on the current filter
  const tableHeaders = useMemo(() => {
    // Show the same headers for all view types for consistency
    return ['Product Name', 'EAN', 'MPN', 'Cost', 'Match Status', 'Sale Price', 'Profit', 'Margin', 'Actions'];
  }, []);

  // Handle view details for unmatched products
  const handleViewUnmatchedProduct = (productId: string) => {
    setSelectedUnmatchedProduct(productId === selectedUnmatchedProduct ? null : productId);
  };
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1); // Reset to first page on search
    loadData();
  };
  
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle sort order if same field
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field and default to ascending
      setSortField(field);
      setSortOrder('asc');
    }
    setCurrentPage(1); // Reset to first page on sort change
  };
  
  const handleClearFilters = () => {
    setSearchTerm('');
    if (costStats) {
      setCostRange(costStats);
    } else {
      setCostRange({min: 0, max: 1000});
    }
    // Reset the userModifiedCostRange flag when clearing filters
    setUserModifiedCostRange(false);
    setMatchMethodFilter(null);
    setSortField('');
    setSortOrder('asc');
    setCurrentPage(1);
  };
  
  const getActiveFilterCount = () => {
    let count = 0;
    if (searchTerm) count++;
    // Only count cost range filter if user has modified it
    if (userModifiedCostRange && (costRange.min !== costStats.min || costRange.max !== costStats.max)) count++;
    if (matchMethodFilter !== null) count++;
    if (sortField) count++;
    return count;
  };

  const changePage = (page: number) => {
    if (page > 0 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleItemsPerPageChange = (value: number) => {
    setItemsPerPage(value);
    setCurrentPage(1); // Reset to first page when changing items per page
  };
  
  // Calculate total pages from server-side count
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  
  // Format large numbers for better display
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };
  
  const renderPagination = () => {
    if (totalPages <= 1) return null;
    
    return (
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
            Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} items
          </span>
          <select 
            className="border rounded p-1 text-sm"
            value={itemsPerPage}
            onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
          >
            <option value="10">10 per page</option>
            <option value="25">25 per page</option>
            <option value="50">50 per page</option>
            <option value="100">100 per page</option>
            <option value="500">500 per page</option>
          </select>
        </div>
        
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            onClick={() => changePage(currentPage - 1)}
            disabled={currentPage === 1}
            className="flex items-center px-2 py-1 text-sm disabled:opacity-50"
          >
            <ChevronLeft size={16} />
          </Button>
          
          {/* Page numbers */}
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            // Show first page, last page, current page, and pages around current page
            let pageToShow = 0;
            
            if (totalPages <= 5) {
              // If 5 or fewer pages, show all pages
              pageToShow = i + 1;
            } else if (currentPage <= 3) {
              // If near start, show first 5 pages
              pageToShow = i + 1;
            } else if (currentPage >= totalPages - 2) {
              // If near end, show last 5 pages
              pageToShow = totalPages - 4 + i;
            } else {
              // Otherwise show 2 pages before and after current page
              pageToShow = currentPage - 2 + i;
            }
            
            return (
              <Button
                key={pageToShow}
                variant={currentPage === pageToShow ? 'primary' : 'secondary'}
                onClick={() => changePage(pageToShow)}
                className="flex items-center justify-center w-8 h-8 text-sm"
              >
                {pageToShow}
              </Button>
            );
          })}
          
          <Button
            variant="secondary"
            onClick={() => changePage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="flex items-center px-2 py-1 text-sm disabled:opacity-50"
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    );
  };
  
  // Main render with progressive loading and smooth transitions
  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant={filterOption === 'all' ? 'primary' : 'secondary'}
            className="flex items-center justify-between text-xs px-3 py-1.5 min-w-[120px]"
            onClick={() => { setFilterOption('all'); setCurrentPage(1); }}
          >
            <span>All Products</span>
            <span className="ml-1.5 bg-white text-blue-700 font-medium rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center text-xs whitespace-nowrap">
              {formatNumber(matchStats.total)}
            </span>
          </Button>
          <Button 
            variant={filterOption === 'matched' ? 'primary' : 'secondary'}
            className="flex items-center justify-between text-xs px-3 py-1.5 min-w-[100px]"
            onClick={() => { setFilterOption('matched'); setCurrentPage(1); }}
          >
            <span>Matched</span>
            <span className="ml-1.5 bg-white text-blue-700 font-medium rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center text-xs whitespace-nowrap">
              {formatNumber(matchStats.matched)}
            </span>
          </Button>
          <Button 
            variant={filterOption === 'unmatched' ? 'primary' : 'secondary'}
            className="flex items-center justify-between text-xs px-3 py-1.5 min-w-[120px]"
            onClick={() => { setFilterOption('unmatched'); setCurrentPage(1); }}
          >
            <span>Unmatched</span>
            <span className="ml-1.5 bg-white text-blue-700 font-medium rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center text-xs whitespace-nowrap">
              {formatNumber(matchStats.unmatched)}
            </span>
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          {usingCachedData && (
            <div className="text-xs text-blue-700 px-2 py-1 bg-blue-50 border border-blue-100 rounded flex items-center">
              <RefreshCcw size={12} className={`mr-1.5 ${isBackgroundRefreshing ? 'animate-spin' : ''}`} />
              {isBackgroundRefreshing ? 'Refreshing...' : 'Using cached data'}
            </div>
          )}
          <form onSubmit={handleSearch} className="relative w-60">
            <input
              type="text"
              placeholder="Search products..."
              className="pl-10 pr-4 py-2 border rounded-lg w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
            <button type="submit" className="hidden">Search</button>
          </form>
          
          <Button 
            variant={showFilters ? 'primary' : 'secondary'}
            className="flex items-center justify-between text-xs px-3 py-1.5 min-w-[100px]"
            onClick={() => setShowFilters(!showFilters)}
          >
            <span className="flex items-center">
              <Filter size={16} className="mr-2" />
              Filters
            </span>
            {getActiveFilterCount() > 0 && (
              <span className="ml-1.5 bg-white text-blue-700 font-medium rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center text-xs whitespace-nowrap">
                {getActiveFilterCount()}
              </span>
            )}
          </Button>
        </div>
      </div>
      
      {/* Show filters only when requested */}
      {showFilters && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cost Range</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      className="w-24 border p-2 rounded"
                      value={costRange.min}
                      onChange={(e) => {
                        setCostRange({...costRange, min: Number(e.target.value)});
                        setUserModifiedCostRange(true);
                      }}
                      min={0}
                    />
                    <span className="text-gray-600">to</span>
                    <input
                      type="number"
                      className="w-24 border p-2 rounded"
                      value={costRange.max}
                      onChange={(e) => {
                        setCostRange({...costRange, max: Number(e.target.value)});
                        setUserModifiedCostRange(true);
                      }}
                      min={costRange.min}
                    />
                  </div>
                </div>
                
                {matchMethods.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Match Method</label>
                    <select 
                      className="w-full border p-2 rounded"
                      value={matchMethodFilter || ''}
                      onChange={(e) => setMatchMethodFilter(e.target.value === '' ? null : e.target.value)}
                    >
                      <option value="">All Methods</option>
                      {matchMethods.map(method => (
                        <option key={method} value={method}>{method.charAt(0).toUpperCase() + method.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                <div className="text-sm font-medium">Sort By:</div>
                <div className="flex gap-2">
                  <Button 
                    variant={sortField === 'name' ? 'primary' : 'secondary'} 
                    className="flex items-center text-xs px-2 py-1"
                    onClick={() => handleSort('name')}
                  >
                    <ArrowDownAZ size={14} className="mr-1" /> 
                    Name
                    {sortField === 'name' && <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                  </Button>
                  <Button 
                    variant={sortField === 'cost' ? 'primary' : 'secondary'} 
                    className="flex items-center text-xs px-2 py-1"
                    onClick={() => handleSort('cost')}
                  >
                    <DollarSign size={14} className="mr-1" /> 
                    Cost
                    {sortField === 'cost' && <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                  </Button>
                  <Button 
                    variant={sortField === 'price' ? 'primary' : 'secondary'} 
                    className="flex items-center text-xs px-2 py-1"
                    onClick={() => handleSort('price')}
                  >
                    <Tag size={14} className="mr-1" /> 
                    Price
                    {sortField === 'price' && <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                  </Button>
                  <Button 
                    variant={sortField === 'profit' ? 'primary' : 'secondary'} 
                    className="flex items-center text-xs px-2 py-1"
                    onClick={() => handleSort('profit')}
                  >
                    <TrendingUp size={14} className="mr-1" /> 
                    Profit
                    {sortField === 'profit' && <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                  </Button>
                  {getActiveFilterCount() > 0 && (
                    <Button 
                      variant="secondary" 
                      className="flex items-center text-xs px-2 py-1 ml-2 border-red-300 text-red-700 hover:bg-red-50"
                      onClick={handleClearFilters}
                    >
                      <X size={14} className="mr-1" /> Clear All
                    </Button>
                  )}
                </div>
              </div>
            </>
        </div>
      )}
      
      {/* Improve the table rendering with fade transitions */}
      <div 
        style={{
          ...transitionStyles.table, 
          opacity: isTableVisible ? 1 : 0.6,
          minHeight: '100px' // Prevent layout shifts
        }}
      >
        {isLoading && productsWithDetails.length === 0 ? (
          <div className="animate-pulse space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex justify-between items-center border-t py-3">
                <div className="w-1/3">
                  <div className="h-5 bg-gray-200 rounded"></div>
                </div>
                <div className="w-1/6">
                  <div className="h-5 bg-gray-200 rounded"></div>
                </div>
                <div className="w-1/6">
                  <div className="h-5 bg-gray-200 rounded"></div>
                </div>
                <div className="w-1/6">
                  <div className="h-5 bg-gray-200 rounded"></div>
                </div>
                <div className="w-1/6">
                  <div className="h-5 bg-gray-200 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        ) : productsWithDetails.length === 0 ? (
          <EmptyState
            message={`No ${filterOption} products found matching your criteria`}
            suggestion={
              getActiveFilterCount() > 0 
                ? "Try adjusting your filters or search term"
                : filterOption === 'matched' 
                  ? "This supplier doesn't have any matched products. Try importing products or manually associating them."
                  : filterOption === 'unmatched'
                    ? "All products for this supplier have been matched."
                    : "Add products through product import or manually associate products with this supplier."
            }
          />
        ) : (
          <>
            {/* Background refresh indicator - keep it subtle */}
            {isBackgroundRefreshing && (
              <div className="bg-blue-50 border-blue-100 border text-blue-700 text-xs py-1 px-2 rounded mb-2 flex items-center" style={{opacity: 0.8}}>
                <RefreshCcw size={12} className="animate-spin mr-1.5" />
                Refreshing data...
              </div>
            )}
            
            <Table headers={tableHeaders}>
              {productsWithDetails.map((item: any) => (
                <React.Fragment key={item.id}>
                  <tr className={`border-t ${selectedUnmatchedProduct === item.id ? 'bg-blue-50' : ''} hover:bg-gray-50`}>
                    <td className="px-4 py-3 font-medium">
                      {item.productName}
                    </td>
                    <td className="px-4 py-3">{item.productEan || '-'}</td>
                    <td className="px-4 py-3">{item.product?.mpn || item.mpn || '-'}</td>
                    <td className="px-4 py-3">${item.cost.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <ProductMatchBadge matchMethod={item.match_method} />
                    </td>
                    
                    {/* Display finance data for all products, with placeholders for unmatched */}
                    <td className="px-4 py-3">
                      {item.product && !item.isPlaceholderProduct ? `$${item.product.salePrice.toFixed(2)}` : '-'}
                    </td>
                    <td className={`px-4 py-3 ${item.product && !item.isPlaceholderProduct ? (item.profitPerUnit >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
                      {item.product && !item.isPlaceholderProduct ? `$${item.profitPerUnit.toFixed(2)}` : '-'}
                    </td>
                    <td className={`px-4 py-3 ${item.product && !item.isPlaceholderProduct ? (item.profitMargin >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
                      {item.product && !item.isPlaceholderProduct ? `${item.profitMargin.toFixed(1)}%` : '-'}
                    </td>
                    
                    <td className="px-4 py-3">
                      {item.product ? (
                        <Button
                          onClick={() => navigate(`/products/${item.product.id}`, { 
                            state: { 
                              product: item.product,
                              from: 'supplierDetail',
                              supplierId: supplierId 
                            } 
                          })}
                          variant="secondary"
                          className="flex items-center gap-2 text-sm py-1"
                        >
                          <Package size={14} />
                          View Product
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          className="flex items-center gap-2 text-sm py-1 bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100"
                          onClick={() => handleViewUnmatchedProduct(item.id)}
                        >
                          <Info size={14} />
                          {selectedUnmatchedProduct === item.id ? 'Hide Details' : 'View Details'}
                        </Button>
                      )}
                    </td>
                  </tr>
                  
                  {/* Only show details panel for truly unmatched products */}
                  {!item.product && selectedUnmatchedProduct === item.id && (
                    <tr>
                      <td colSpan={9} className="px-0 py-0 border-t border-blue-100">
                        <div className="bg-gradient-to-b from-blue-50 to-white p-4 rounded-md shadow-inner">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-base font-semibold text-blue-900 flex items-center">
                              <Info size={16} className="mr-2 text-blue-500" />
                              Product Details
                            </h4>
                            <div className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-medium">
                              Unmatched Product
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="bg-white p-3 rounded-lg shadow-sm border border-blue-100">
                              <h5 className="font-medium text-blue-900 mb-1.5 pb-1.5 border-b border-blue-100 text-sm">Basic Info</h5>
                              <div className="space-y-2">
                                <div>
                                  <p className="text-xs text-gray-500 uppercase mb-0.5">Product Name</p>
                                  <p className="font-medium text-sm">{item.productName}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 uppercase mb-0.5">EAN / Barcode</p>
                                  <p className="font-mono text-xs bg-gray-50 p-1 rounded">{item.ean || '-'}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 uppercase mb-0.5">MPN</p>
                                  <p className="font-mono text-xs bg-gray-50 p-1 rounded">{item.mpn || '-'}</p>
                                </div>
                              </div>
                            </div>
                            
                            <div className="bg-white p-3 rounded-lg shadow-sm border border-blue-100">
                              <h5 className="font-medium text-blue-900 mb-1.5 pb-1.5 border-b border-blue-100 text-sm">Ordering Info</h5>
                              <div className="space-y-2">
                                <div>
                                  <p className="text-xs text-gray-500 uppercase mb-0.5">Cost</p>
                                  <p className="font-medium text-sm text-green-700">${item.cost.toFixed(2)}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 uppercase mb-0.5">MOQ</p>
                                  <div className="flex items-center">
                                    <span className="font-medium text-sm">{item.moq || '1'}</span>
                                    <span className="text-xs text-gray-500 ml-1">units</span>
                                  </div>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 uppercase mb-0.5">Lead Time</p>
                                  <p className="font-medium text-sm">{item.lead_time || '-'}</p>
                                </div>
                              </div>
                            </div>
                            
                            <div className="bg-white p-3 rounded-lg shadow-sm border border-blue-100">
                              <h5 className="font-medium text-blue-900 mb-1.5 pb-1.5 border-b border-blue-100 text-sm">Additional Info</h5>
                              <div className="space-y-2">
                                <div>
                                  <p className="text-xs text-gray-500 uppercase mb-0.5">Payment Terms</p>
                                  <p className="font-medium text-sm">{item.payment_terms || '-'}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 uppercase mb-0.5">Last Updated</p>
                                  <p className="font-medium text-sm">{new Date(item.updated_at || Date.now()).toLocaleDateString()}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="mt-3 pt-2 border-t border-blue-100 flex justify-between items-center">
                            <p className="text-sm text-blue-700 flex items-center">
                              <ExternalLink size={14} className="mr-1.5" />
                              This product needs to be matched with a catalog product
                            </p>
                            
                            <Button 
                              variant="primary" 
                              className="flex items-center gap-2 text-sm"
                              // Functionality to be implemented
                              onClick={() => alert('This functionality will be implemented soon')}
                            >
                              <Link size={14} /> Find Matches
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </Table>
            
            {/* Pagination */}
            {renderPagination()}
          </>
        )}
      </div>
    </Card>
  );
};

export default SupplierProducts; 