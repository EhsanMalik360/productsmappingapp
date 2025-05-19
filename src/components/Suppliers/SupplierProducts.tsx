import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, ExternalLink, Link, Info, Search, Filter, X, ArrowDownAZ, DollarSign, TrendingUp, Tag, ChevronLeft, ChevronRight, RefreshCcw } from 'lucide-react';
import Card from '../UI/Card';
import Table from '../UI/Table';
import Button from '../UI/Button';
import EmptyState from '../Dashboard/EmptyState';
import ProductMatchBadge from '../UI/ProductMatchBadge';
import { useAppContext } from '../../context/AppContext';

interface SupplierProductsProps {
  supplierId: string;
}

type FilterOption = 'all' | 'matched' | 'unmatched';
type SortField = 'name' | 'cost' | 'price' | 'profit' | 'margin' | '';
type SortOrder = 'asc' | 'desc';

const SupplierProducts: React.FC<SupplierProductsProps> = ({ supplierId }) => {
  const navigate = useNavigate();
  const { products, fetchSupplierProducts } = useAppContext();
  const [filterOption, setFilterOption] = useState<FilterOption>('all');
  const [selectedUnmatchedProduct, setSelectedUnmatchedProduct] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<SortField>('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [costRange, setCostRange] = useState<{min: number, max: number}>({min: 0, max: 1000});
  const [matchMethodFilter, setMatchMethodFilter] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [isLoading, setIsLoading] = useState(false);
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
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  
  // Add refs to track component mount state and pending requests
  const isMounted = useRef(true);
  const pendingRequests = useRef<{[key: string]: AbortController}>({});
  const isInitialMount = useRef(true);
  const dataLoadAttempted = useRef(false);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      // Cancel all pending requests on unmount
      Object.values(pendingRequests.current).forEach(controller => {
        controller.abort();
      });
    };
  }, []);
  
  // Helper function to create an abort controller and track request
  const createRequest = useCallback((requestKey: string) => {
    // Cancel existing request with the same key if any
    if (pendingRequests.current[requestKey]) {
      pendingRequests.current[requestKey].abort();
    }
    
    const controller = new AbortController();
    pendingRequests.current[requestKey] = controller;
    
    return {
      signal: controller.signal,
      cleanup: () => {
        if (pendingRequests.current[requestKey] === controller) {
          delete pendingRequests.current[requestKey];
        }
      }
    };
  }, []);
  
  // Fetch data when component mounts or parameters change
  const loadData = useCallback(async () => {
    // Prevent loading if component is unmounted
    if (!isMounted.current) return;
    
    // Create a unique key for this request to prevent duplicates
    const requestKey = `loadData_${supplierId}_${currentPage}_${itemsPerPage}_${searchTerm}_${filterOption}_${JSON.stringify(costRange)}_${matchMethodFilter}_${sortField}_${sortOrder}`;
    
    // Setup request tracking and abort controller
    const { signal, cleanup } = createRequest(requestKey);
    
    try {
      // Only show loading state for subsequent loads, not initial load
      if (initialLoadComplete) {
        setIsLoading(true);
      }

      // Fetch data with server-side pagination
      const result = await fetchSupplierProducts(
        supplierId,
        currentPage,
        itemsPerPage,
        {
          searchTerm,
          filterOption,
          costRange,
          matchMethodFilter,
          sortField,
          sortOrder
        }
      );
      
      // Don't update state if component unmounted or request was cancelled
      if (!isMounted.current || signal.aborted) return;
      
      setSupplierProductsData(result.data);
      setTotalCount(result.count);
    
      // If we haven't loaded filter stats yet, fetch them
      if (!hasInitializedFilters) {
        await loadFilterStats();
      }
      
      // Mark initial load as complete
      setInitialLoadComplete(true);
      dataLoadAttempted.current = true;
      
    } catch (error) {
      // Only log errors if not caused by abort
      if (!signal.aborted) {
        console.error('Error loading supplier products:', error);
      }
    } finally {
      // Clean up this request
      cleanup();
      
      // Only update loading state if still mounted and not aborted
      if (isMounted.current && !signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [supplierId, currentPage, itemsPerPage, searchTerm, filterOption, costRange, matchMethodFilter, sortField, sortOrder, fetchSupplierProducts, hasInitializedFilters, initialLoadComplete, createRequest]);
  
  // Load filter statistics with proper request tracking
  const loadFilterStats = useCallback(async () => {
    // Skip if component is unmounted
    if (!isMounted.current) return;
    
    // Create a unique request key
    const requestKey = `loadFilterStats_${supplierId}`;
    const { signal, cleanup } = createRequest(requestKey);
    
    try {
      // Fetch using safer promise handling patterns
      // Convert all UUIDs to strings in requests to avoid DB type errors
      const stringifiedSupplierId = String(supplierId);
      
      // First get total count
      const totalPromise = fetchSupplierProducts(stringifiedSupplierId, 1, 1);
      
      // Then get matched and unmatched counts - but don't wait yet
      const matchedPromise = fetchSupplierProducts(stringifiedSupplierId, 1, 1, { filterOption: 'matched' });
      const unmatchedPromise = fetchSupplierProducts(stringifiedSupplierId, 1, 1, { filterOption: 'unmatched' });
      
      // Wait for total result first
      const totalResult = await totalPromise;
      
      // Check if request was aborted or component unmounted
      if (signal.aborted || !isMounted.current) return;
      
      // Now wait for the remaining promises
      const [matchedResult, unmatchedResult] = await Promise.all([
        matchedPromise,
        unmatchedPromise
      ]);
      
      // Check again if aborted or unmounted
      if (signal.aborted || !isMounted.current) return;
      
      // Update match stats
      setMatchStats({
        total: totalResult.count || 0,
        matched: matchedResult.count || 0,
        unmatched: unmatchedResult.count || 0
      });
      
      // Fetch cost stats
      try {
        // Set an abort signal for this fetch
        const response = await fetch(`/api/supplier-product-stats/${stringifiedSupplierId}`, { signal })
          .then(res => {
            if (!res.ok) {
              throw new Error(`API returned ${res.status}: ${res.statusText}`);
            }
            return res.json();
          });
          
        // Check if aborted or unmounted
        if (signal.aborted || !isMounted.current) return;
          
        if (response && response.data) {
          const min = response.data.minCost || 0;
          const max = response.data.maxCost || 1000;
          
          setCostStats({ min, max });
          // Only set cost range once to avoid triggering rerenders
          if (!hasInitializedFilters) {
            setCostRange({ min, max });
          }
        }
      } catch (costError: any) {
        // Only log if not aborted
        if (!signal.aborted) {
          console.error('Error fetching cost stats:', costError);
          // Use fallback values if API fails
          const fallbackMax = Math.max(...supplierProductsData.map(sp => sp.cost || 0), 1000);
          const min = 0;
          const max = fallbackMax;
          
          setCostStats({ min, max });
          // Only set cost range once to avoid triggering rerenders
          if (!hasInitializedFilters) {
            setCostRange({ min, max });
          }
        }
      }
      
      // Fetch match methods
      try {
        const response = await fetch(`/api/supplier-product-methods/${stringifiedSupplierId}`, { signal })
          .then(res => {
            if (!res.ok) {
              throw new Error(`API returned ${res.status}: ${res.statusText}`);
            }
            return res.json();
          });
        
        // Check if aborted or unmounted
        if (signal.aborted || !isMounted.current) return;
          
        if (response && response.data && response.data.matchMethods) {
          setMatchMethods(response.data.matchMethods);
        }
      } catch (methodsError: any) {
        // Only log if not aborted
        if (!signal.aborted) {
          console.error('Error fetching match methods:', methodsError);
          setMatchMethods([]);
        }
      }
      
      setHasInitializedFilters(true);
    } catch (error: any) {
      // Only log if not aborted
      if (!signal.aborted) {
        console.error('Error loading filter stats:', error);
        // Still mark filters as initialized to prevent endless retry loops
        setHasInitializedFilters(true);
      }
    } finally {
      cleanup();
    }
  }, [supplierId, fetchSupplierProducts, supplierProductsData, hasInitializedFilters, createRequest]);

  // Load data when component mounts or when parameters change - with debouncing
  useEffect(() => {
    // Skip the automatic load on first render, we'll handle it with the isInitialMount ref
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    // Use a debounce timer to avoid excessive API calls
    const timer = setTimeout(() => {
      loadData();
    }, 300); // 300ms debounce
    
    return () => {
      clearTimeout(timer);
    };
  }, [loadData]);
  
  // Initial data load - executed only once
  useEffect(() => {
    if (!dataLoadAttempted.current) {
      loadData();
    }
  }, [loadData]);

  // Join with product data for additional information
  const productsWithDetails = useMemo(() => {
    if (!Array.isArray(supplierProductsData) || !products || !Array.isArray(products)) {
      return [];
    }
    
    return supplierProductsData.map(sp => {
      // For matched products, include product details and calculate profit metrics
      if (sp.product_id) {
        const product = products.find(p => p.id === sp.product_id);
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
    setMatchMethodFilter(null);
    setSortField('');
    setSortOrder('asc');
    setCurrentPage(1);
  };
  
  const getActiveFilterCount = () => {
    let count = 0;
    if (searchTerm) count++;
    if (costRange.min !== costStats.min || costRange.max !== costStats.max) count++;
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
  
  // Main render with professional UI
  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button 
            variant={filterOption === 'all' ? 'primary' : 'secondary'}
            className="flex items-center text-xs px-3 py-1.5"
            onClick={() => { setFilterOption('all'); setCurrentPage(1); }}
          >
            All Products
            <span className="ml-1.5 bg-white text-blue-700 font-medium rounded-full w-5 h-5 flex items-center justify-center text-xs">
              {matchStats.total}
            </span>
          </Button>
          <Button 
            variant={filterOption === 'matched' ? 'primary' : 'secondary'}
            className="flex items-center text-xs px-3 py-1.5"
            onClick={() => { setFilterOption('matched'); setCurrentPage(1); }}
          >
            Matched
            <span className="ml-1.5 bg-white text-blue-700 font-medium rounded-full w-5 h-5 flex items-center justify-center text-xs">
              {matchStats.matched}
            </span>
          </Button>
          <Button 
            variant={filterOption === 'unmatched' ? 'primary' : 'secondary'}
            className="flex items-center text-xs px-3 py-1.5"
            onClick={() => { setFilterOption('unmatched'); setCurrentPage(1); }}
          >
            Unmatched
            <span className="ml-1.5 bg-white text-blue-700 font-medium rounded-full w-5 h-5 flex items-center justify-center text-xs">
              {matchStats.unmatched}
            </span>
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
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
            className="flex items-center"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} className="mr-2" />
            Filters
            {getActiveFilterCount() > 0 && (
              <span className="ml-1.5 bg-white text-blue-700 font-medium rounded-full w-5 h-5 flex items-center justify-center text-xs">
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
                      onChange={(e) => setCostRange({...costRange, min: Number(e.target.value)})}
                      min={0}
                    />
                    <span className="text-gray-600">to</span>
                    <input
                      type="number"
                      className="w-24 border p-2 rounded"
                      value={costRange.max}
                      onChange={(e) => setCostRange({...costRange, max: Number(e.target.value)})}
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
      
      {/* Show table content */}
      {productsWithDetails.length === 0 ? (
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
                    {item.product ? `$${item.product.salePrice.toFixed(2)}` : '-'}
                  </td>
                  <td className={`px-4 py-3 ${item.product ? (item.profitPerUnit >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
                    {item.product ? `$${item.profitPerUnit.toFixed(2)}` : '-'}
                  </td>
                  <td className={`px-4 py-3 ${item.product ? (item.profitMargin >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
                    {item.product ? `${item.profitMargin.toFixed(1)}%` : '-'}
                  </td>
                  
                  <td className="px-4 py-3">
                    {item.product ? (
                      <Button
                        onClick={() => navigate(`/products/${item.product.id}`)}
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
                
                {/* Details panel for unmatched products */}
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
    </Card>
  );
};

export default SupplierProducts; 