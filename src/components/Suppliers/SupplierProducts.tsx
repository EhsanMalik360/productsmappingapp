import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, ExternalLink, Link, Info, Search, Filter, X, ArrowDownAZ, DollarSign, TrendingUp, Tag, ChevronLeft, ChevronRight, RefreshCcw } from 'lucide-react';
import Card from '../UI/Card';
import Table from '../UI/Table';
import Button from '../UI/Button';
import EmptyState from '../Dashboard/EmptyState';
import ProductMatchBadge from '../UI/ProductMatchBadge';
import { useAppContext } from '../../context/AppContext';

// Use more subtle and hardware-accelerated transitions

interface SupplierProductsProps {
  supplierId: string;
  initialCachedProducts?: any[];
}

type FilterOption = 'all' | 'matched' | 'unmatched';
type SortField = 'name' | 'cost' | 'price' | 'profit' | 'margin' | 'brand' | '';
type SortOrder = 'asc' | 'desc';

const SupplierProducts: React.FC<SupplierProductsProps> = ({ supplierId, initialCachedProducts }) => {
  const navigate = useNavigate();
  const { products, fetchSupplierProducts, supplierCache, refreshData, suppliers } = useAppContext();
  const [filterOption, setFilterOption] = useState<FilterOption>('all');
  const [selectedUnmatchedProduct, setSelectedUnmatchedProduct] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<SortField>('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [costRange, setCostRange] = useState<{min: number, max: number}>({min: 0, max: 1000});
  const [userModifiedCostRange, setUserModifiedCostRange] = useState(false);
  const [matchMethodFilter, setMatchMethodFilter] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [brands, setBrands] = useState<string[]>([]);
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
  // Add ref for tracking filter state to prevent redundant loads
  const prevFilterStateRef = useRef('');
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
      
      // Show immediate results from cache
      setSupplierProductsData(cachedProducts);
      setTotalCount(cachedCount);
      setUsingCachedData(true);
      setIsTableVisible(true);
      
      // Start a silent background refresh with progressive loading
      const loadProgressively = async () => {
        try {
          // First load filter stats for a responsive UI
          await loadFilterStats();
          
          // Then refresh the data
          setIsBackgroundRefreshing(true);
          await loadData(true);
        } finally {
          setIsBackgroundRefreshing(false);
        }
      };
      
      // Delay the progressive load slightly to prioritize UI rendering
      setTimeout(loadProgressively, 300);
    } else {
      // No cached data, need to load with spinner
      setIsLoading(true);
      setIsTableVisible(false);
      
      // Load with a slight delay to allow UI to render
      setTimeout(async () => {
        try {
          await loadData();
        } finally {
          setIsLoading(false);
        }
      }, 100);
    }
  }, [supplierId]); // Only trigger on supplier ID change to prevent re-runs
  
  // Virtual DOM approach to eliminate flickering
  const updateDisplayData = useCallback((data: any[], count: number, keepVisible = false) => {
    // Cancel any pending updates
    if (dataUpdateTimeoutRef.current) {
      clearTimeout(dataUpdateTimeoutRef.current);
    }
    
    // Get reference to the table element
    const tableElement = document.querySelector('.supplier-products-table');
    
    // PROFESSIONAL APPROACH: Never show loading states for data you already have
    // Always update state before visual changes - React's batching will handle it optimally
    
    // Method 1: Direct update without any transition for best performance
    if (keepVisible || data.length === 0) {
      // For filter changes or empty results, don't animate at all
      // This provides the smoothest possible transition
      setSupplierProductsData(data);
      setTotalCount(count);
      setIsTableVisible(true);
      setUsingCachedData(false);
      
      // Optional: Add a class for a brief moment to show that data has changed
      if (tableElement && tableElement instanceof HTMLElement && data.length > 0) {
        tableElement.classList.add('data-updated');
        setTimeout(() => {
          tableElement.classList.remove('data-updated');
        }, 300);
      }
    } 
    // Method 2: Subtle cross-fade for major data changes
    else {
      // For content that's already visible, use a subtle transition
      if (tableElement && tableElement instanceof HTMLElement) {
        // Set a CSS class instead of inline styles for better performance
        tableElement.classList.add('updating');
        
        // Update the state immediately
        setSupplierProductsData(data);
        setTotalCount(count);
        setUsingCachedData(false);
        
        // Remove the updating class after a brief delay
        // This is the professional approach used by major websites
        requestAnimationFrame(() => {
          // Force layout recalculation to ensure smooth transition
          void tableElement.offsetHeight;
          tableElement.classList.remove('updating');
        });
      } else {
        // Fallback to direct update if element not found
        setSupplierProductsData(data);
        setTotalCount(count);
        setIsTableVisible(true);
        setUsingCachedData(false);
      }
    }
  }, []);
  
  // Fetch data with improved handling to prevent flickering
  const loadData = useCallback(async (skipLoadingState = false) => {
    try {
      // Only show loading indicators if needed
      if (!skipLoadingState) {
        setIsLoading(true);
        // Only hide table if we don't have data yet
        if (supplierProductsData.length === 0) {
          setIsTableVisible(false);
        }
      }

      // Log which filter we're applying (for debugging)
      console.log('Filter selected by user (and passing to backend):', filterOption);
      
      // Create filter params - only include cost range if user has modified it
      const filterParams: any = {
        searchTerm,
        filterOption: filterOption,
        matchMethodFilter,
        selectedBrand,
        sortField,
        sortOrder
      };
      
      if (userModifiedCostRange) {
        filterParams.costRange = costRange;
      }

      // Create a cache key for storing filter results
      // Only cache if no search term or custom filters to save memory
      const shouldCache = !searchTerm && !userModifiedCostRange && !matchMethodFilter && !selectedBrand && !sortField;
      const cacheKey = shouldCache ? `filter_${filterOption}_${supplierId}` : null;

      // Fetch data with server-side pagination
      const result = await fetchSupplierProducts(
        supplierId,
        currentPage,
        itemsPerPage,
        filterParams
      );
      
      // Cache results for faster filter switching (but only first page)
      if (cacheKey && currentPage === 1) {
        try {
          // Only store minimal data needed for quick display
          sessionStorage.setItem(cacheKey, JSON.stringify({
            data: result.data,
            count: result.count,
            timestamp: Date.now()
          }));
        } catch (e) {
          // Ignore storage errors - this is just an optimization
          console.log('Could not cache filter results');
        }
      }
      
      // Use a shorter transition time for filter changes to reduce flicker
      const isFilterChange = skipLoadingState && supplierProductsData.length > 0;
      
      // Batch update the UI to prevent flickering
      updateDisplayData(
        result.data, 
        result.count, 
        isFilterChange // Keep visible for filter changes
      );
      
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
  }, [supplierId, currentPage, itemsPerPage, searchTerm, filterOption, userModifiedCostRange, costRange, matchMethodFilter, selectedBrand, sortField, sortOrder, fetchSupplierProducts, hasInitializedFilters, updateDisplayData, supplierProductsData.length]);
  
  // Load filter statistics (match stats, cost range, match methods)
  const loadFilterStats = useCallback(async () => {
    try {
      // Fetch total count stats for matched/unmatched
      console.log('Fetching matched products stats...');
      const matchedResult = await fetchSupplierProducts(supplierId, 1, 1, { filterOption: 'matched' });
      console.log('Fetching unmatched products stats...');
      const unmatchedResult = await fetchSupplierProducts(supplierId, 1, 1, { filterOption: 'unmatched' });
      console.log('Fetching total products stats...');
      const totalResult = await fetchSupplierProducts(supplierId, 1, 1);
      
      console.log('Filter stats:', {
        total: totalResult.count,
        matched: matchedResult.count,
        unmatched: unmatchedResult.count
      });
      
      setMatchStats({
        total: totalResult.count,
        matched: matchedResult.count,
        unmatched: unmatchedResult.count
      });
      
      // Fetch cost range from the actual data - use a larger sample to get accurate min/max
      console.log('Fetching cost range stats...');
      const costRangeResult = await fetchSupplierProducts(supplierId, 1, 1000, { 
        filterOption: 'all'
      });
      
      if (costRangeResult.data && costRangeResult.data.length > 0) {
        // Calculate min/max from actual data
        const costs = costRangeResult.data.map(item => parseFloat(String(item.cost)) || 0).filter(cost => cost > 0);
        
        if (costs.length > 0) {
          const minCost = Math.min(...costs);
          const maxCost = Math.max(...costs);
          
          const newCostStats = {
            min: Math.floor(minCost), // Round down for min
            max: Math.ceil(maxCost)   // Round up for max
          };
          
          console.log('Cost range calculated from data:', newCostStats);
          
          setCostStats(newCostStats);

          // Only initialize the cost range control with these values if user hasn't modified it
          if (!userModifiedCostRange) {
            setCostRange(newCostStats);
          }
        } else {
          // Fallback if no valid costs found
          const fallbackStats = { min: 0, max: 100 };
          setCostStats(fallbackStats);
          if (!userModifiedCostRange) {
            setCostRange(fallbackStats);
          }
        }
      } else {
        // Fallback if no data
        const fallbackStats = { min: 0, max: 100 };
        setCostStats(fallbackStats);
        if (!userModifiedCostRange) {
          setCostRange(fallbackStats);
        }
      }
      
      // Fetch unique match methods
      const uniqueMethods = [...new Set(
        totalResult.data
          ?.filter(item => item.match_method)
          ?.map(item => item.match_method)
          ?.filter(Boolean) // Filter out undefined values
      )] as string[];
      
      if (uniqueMethods.length > 0) {
        setMatchMethods(uniqueMethods);
      }
      
      // Fetch unique brands from supplier products data
      console.log('Fetching brands for supplier products...');
      const brandsResult = await fetchSupplierProducts(supplierId, 1, 1000, { 
        filterOption: 'all'
      });
      
      if (brandsResult.data && brandsResult.data.length > 0) {
        const uniqueBrands = [...new Set(
          brandsResult.data
            ?.filter(item => item.brand != null && String(item.brand).trim() !== '')
            ?.map(item => String(item.brand).trim())
            ?.filter(Boolean) // Filter out undefined values
        )] as string[];
        
        if (uniqueBrands.length > 0) {
          setBrands(uniqueBrands.sort()); // Sort alphabetically
          console.log('Loaded brands for supplier products:', uniqueBrands.length, 'unique brands');
        }
      }
      
      setHasInitializedFilters(true);
    } catch (error) {
      console.error('Error loading filter stats:', error);
      // Set fallback values on error
      const fallbackStats = { min: 0, max: 100 };
      setCostStats(fallbackStats);
      if (!userModifiedCostRange) {
        setCostRange(fallbackStats);
      }
      setHasInitializedFilters(true);
    }
  }, [supplierId, fetchSupplierProducts, userModifiedCostRange]);

  // Optimized data loading with state tracking to prevent visual flickering
  useEffect(() => {
    // Create an identifier for the current filter state to prevent redundant loads
    const filterStateKey = `${filterOption}-${currentPage}-${itemsPerPage}-${sortField}-${sortOrder}-${searchTerm}-${matchMethodFilter}-${selectedBrand}-${userModifiedCostRange ? `${costRange.min}-${costRange.max}` : 'default'}`;
    
    const loadDataWithParams = async () => {
      // Avoid redundant loads by comparing filter states
      if (filterStateKey === prevFilterStateRef.current) {
        return; // Skip if nothing changed
      }
      
      // Store the new filter state
      prevFilterStateRef.current = filterStateKey;
      
      // Skip the loading indicators if we already have data
      const skipLoading = supplierProductsData.length > 0;
      
      // Clear any pending updates
      if (dataUpdateTimeoutRef.current) {
        clearTimeout(dataUpdateTimeoutRef.current);
      }
      
      // For filter changes, load immediately with no debounce
      // This is key to eliminating flickering
      if (skipLoading) {
        // Immediately update filter option UI
        await loadData(true);
      } 
      // For initial loads, use a very brief delay to allow for UI rendering
      else {
        dataUpdateTimeoutRef.current = setTimeout(async () => {
          await loadData(false);
        }, 50); // Minimal delay for UI preparation
      }
    };
    
    // Execute the load
    loadDataWithParams();
    
    // Cleanup on unmount
    return () => {
      if (dataUpdateTimeoutRef.current) {
        clearTimeout(dataUpdateTimeoutRef.current);
      }
    };
  }, [loadData, currentPage, itemsPerPage, filterOption, sortField, sortOrder, userModifiedCostRange, costRange.min, costRange.max, matchMethodFilter, searchTerm, supplierProductsData.length, selectedBrand]);

  // Join with product data for additional information
  const productsWithDetails = useMemo(() => {
    if (!Array.isArray(supplierProductsData) || !products || !Array.isArray(products)) {
      return [];
    }
    
    // Use the transformed data instead of the original data
    return supplierProductsData.map(sp => {
      // Normal processing for non-transformed records
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
            productBrand: product.brand || sp.brand || '-',
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
            productBrand: sp.brand || '-',
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
        productBrand: sp.brand || '-',
        profitPerUnit: 0,
        profitMargin: 0
      };
    });
  }, [supplierProductsData, products, filterOption]);

  // Determine the headers based on the current filter
  const tableHeaders = useMemo(() => {
    // Show the same headers for all view types for consistency
    return ['Product Name', 'EAN', 'Brand', 'MPN', 'Cost', 'Match Status', 'Sale Price', 'Profit', 'Margin', 'Actions'];
  }, []);

  // Handle view details for unmatched products
  const handleViewUnmatchedProduct = (productId: string) => {
    setSelectedUnmatchedProduct(productId === selectedUnmatchedProduct ? null : productId);
  };
  
  // Improve filtering with debouncing
  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    
    // Clear any existing debounce timer
    if (dataUpdateTimeoutRef.current) {
      clearTimeout(dataUpdateTimeoutRef.current);
    }
    
    // Set a new debounce timer to trigger search after user stops typing
    if (e.target.value.length >= 3 || e.target.value.length === 0) {
      // Show immediate feedback that we're processing
      setIsTableVisible(false);
      
      dataUpdateTimeoutRef.current = setTimeout(() => {
        setCurrentPage(1); // Reset to first page on search
        loadData(true); // Skip loading indicator for better UX
      }, 300);
    }
  };
  
  // Modified clear filters function with visual feedback
  const handleClearFilters = () => {
    // Show visual feedback immediately
    setIsTableVisible(false);
    
    // Clear all filters
    setSearchTerm('');
    setCostRange(costStats);
    // Reset the userModifiedCostRange flag when clearing filters
    setUserModifiedCostRange(false);
    setMatchMethodFilter(null);
    setSelectedBrand('');
    setSortField('');
    setSortOrder('asc');
    setCurrentPage(1);
    
    // Load data with reset filters after a short delay
    setTimeout(() => loadData(true), 100);
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
  
  const getActiveFilterCount = () => {
    let count = 0;
    if (searchTerm) count++;
    // Only count cost range filter if user has modified it
    if (userModifiedCostRange && (costRange.min !== costStats.min || costRange.max !== costStats.max)) count++;
    if (matchMethodFilter !== null) count++;
    if (selectedBrand) count++;
    if (sortField) count++;
    return count;
  };

  // Improve the pagination with visual feedback
  const changePage = (page: number) => {
    if (page > 0 && page <= totalPages) {
      // Show visual feedback
      setIsTableVisible(false);
      
      // Change page and load data with a small delay
      setCurrentPage(page);
      
      // Scroll to top of the table for better UX
      const tableElement = document.querySelector('.supplier-products-table');
      if (tableElement) {
        tableElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      
      // Load data with slight delay to allow for UI updates
      setTimeout(() => loadData(true), 50);
    }
  };

  // Enhanced items per page change
  const handleItemsPerPageChange = (value: number) => {
    // Show visual feedback
    setIsTableVisible(false);
    
    // Update state
    setItemsPerPage(value);
    setCurrentPage(1); // Reset to first page when changing items per page
    
    // Load data with slight delay to allow for UI updates
    setTimeout(() => loadData(true), 50);
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
  
  // Add a manual refresh function
  const handleManualRefresh = () => {
    // Show visual feedback
    setIsTableVisible(false);
    setIsBackgroundRefreshing(true);
    
    // Reset all caches and force reload
    setTimeout(async () => {
      try {
        await loadFilterStats();
        await loadData(false);
      } finally {
        setIsBackgroundRefreshing(false);
        setIsTableVisible(true);
      }
    }, 100);
  };
  
  // Main render with progressive loading and smooth transitions
  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            variant={filterOption === 'all' ? 'primary' : 'secondary'}
            className="flex items-center justify-between text-xs px-3 py-1.5 min-w-[120px] view-product-btn"
            onClick={() => {
              // Only update if actually changing the filter
              if (filterOption !== 'all') {
                // Try to display from sessionStorage immediately
                const cachedFilterKey = `filter_all_${supplierId}`;
                const cachedDataString = sessionStorage.getItem(cachedFilterKey);
                if (cachedDataString) {
                  try {
                    const { data, count } = JSON.parse(cachedDataString);
                    updateDisplayData(data, count, true); // true to keep table visible
                  } catch (e) {
                    console.error("Failed to parse cached filter data for all", e);
                    setSupplierProductsData([]);
                    setTotalCount(0);
                    setIsTableVisible(false); // Show loading state
                  }
                } else {
                  // No cache, ensure loading state is shown until useEffect loads data
                  setSupplierProductsData([]);
                  setTotalCount(0);
                  setIsTableVisible(false); // Show loading state
                }
                // Set state to trigger useEffect, which will call loadData
                setFilterOption('all');
                setCurrentPage(1);
              }
            }}
          >
            <span>All Products</span>
            <span className="ml-1.5 bg-white text-blue-700 font-medium rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center text-xs whitespace-nowrap">
              {formatNumber(matchStats.total)}
            </span>
          </Button>
          <Button 
                          variant={filterOption === 'matched' ? 'primary' : 'secondary'}
              className="flex items-center justify-between text-xs px-3 py-1.5 min-w-[100px] view-product-btn"
              onClick={() => {
                // Only update if actually changing the filter
                if (filterOption !== 'matched') {
                  // Try to display from sessionStorage immediately
                  const cachedFilterKey = `filter_matched_${supplierId}`;
                  const cachedDataString = sessionStorage.getItem(cachedFilterKey);
                  if (cachedDataString) {
                    try {
                      const { data, count } = JSON.parse(cachedDataString);
                      updateDisplayData(data, count, true); // true to keep table visible
                    } catch (e) {
                      console.error("Failed to parse cached filter data for matched", e);
                      setSupplierProductsData([]);
                      setTotalCount(0);
                      setIsTableVisible(false); // Show loading state
                    }
                  } else {
                    // No cache, ensure loading state is shown until useEffect loads data
                    setSupplierProductsData([]);
                    setTotalCount(0);
                    setIsTableVisible(false); // Show loading state
                  }
                  // Set state to trigger useEffect, which will call loadData
                  setFilterOption('matched');
                  setCurrentPage(1);
                }
              }}
          >
            <span>Matched</span>
            <span className="ml-1.5 bg-white text-blue-700 font-medium rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center text-xs whitespace-nowrap">
              {formatNumber(matchStats.matched)}
            </span>
          </Button>
          <Button 
                          variant={filterOption === 'unmatched' ? 'primary' : 'secondary'}
              className="flex items-center justify-between text-xs px-3 py-1.5 min-w-[120px] view-product-btn"
              onClick={() => {
                // Only update if actually changing the filter
                if (filterOption !== 'unmatched') {
                  // Try to display from sessionStorage immediately
                  const cachedFilterKey = `filter_unmatched_${supplierId}`;
                  const cachedDataString = sessionStorage.getItem(cachedFilterKey);
                  if (cachedDataString) {
                    try {
                      const { data, count } = JSON.parse(cachedDataString);
                      updateDisplayData(data, count, true); // true to keep table visible
                    } catch (e) {
                      console.error("Failed to parse cached filter data for unmatched", e);
                      setSupplierProductsData([]);
                      setTotalCount(0);
                      setIsTableVisible(false); // Show loading state
                    }
                  } else {
                    // No cache, ensure loading state is shown until useEffect loads data
                    setSupplierProductsData([]);
                    setTotalCount(0);
                    setIsTableVisible(false); // Show loading state
                  }
                  // Set state to trigger useEffect, which will call loadData
                  setFilterOption('unmatched');
                  setCurrentPage(1);
                }
              }}
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
          
          <Button
            variant="secondary"
            className="flex items-center text-xs px-2 py-1.5"
            onClick={handleManualRefresh}
            disabled={isBackgroundRefreshing}
          >
            <RefreshCcw size={14} className={`mr-1.5 ${isBackgroundRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            if (dataUpdateTimeoutRef.current) {
              clearTimeout(dataUpdateTimeoutRef.current);
            }
            setCurrentPage(1);
            loadData(true);
          }} className="relative w-60">
            <input
              type="text"
              placeholder="Search products..."
              className="pl-10 pr-4 py-2 border rounded-lg w-full"
              value={searchTerm}
              onChange={handleSearchInputChange}
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
          
          {getActiveFilterCount() > 0 && (
            <Button 
              variant="secondary" 
              className="flex items-center text-xs px-2 py-1.5 border-red-300 text-red-700 hover:bg-red-50"
              onClick={handleClearFilters}
            >
              <X size={14} className="mr-1" /> Clear Filters
            </Button>
          )}
        </div>
      </div>
      
      {/* Show filters only when requested */}
      {showFilters && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cost Range (${costRange.min} - ${costRange.max})
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={costStats.min}
                      max={costStats.max}
                      value={costRange.min}
                      onChange={(e) => {
                        setCostRange({...costRange, min: Number(e.target.value)});
                        setUserModifiedCostRange(true);
                      }}
                      className="w-full"
                    />
                    <input
                      type="range"
                      min={costStats.min}
                      max={costStats.max}
                      value={costRange.max}
                      onChange={(e) => {
                        setCostRange({...costRange, max: Number(e.target.value)});
                        setUserModifiedCostRange(true);
                      }}
                      className="w-full"
                    />
                  </div>
                </div>
                
                {brands.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                    <select 
                      className="w-full border p-2 rounded bg-white"
                      value={selectedBrand}
                      onChange={(e) => setSelectedBrand(e.target.value)}
                    >
                      <option value="">All Brands</option>
                      {brands.map(brand => (
                        <option key={brand} value={brand}>{brand}</option>
                      ))}
                    </select>
                  </div>
                )}
                
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
                    variant={sortField === 'brand' ? 'primary' : 'secondary'} 
                    className="flex items-center text-xs px-2 py-1"
                    onClick={() => handleSort('brand')}
                  >
                    <ArrowDownAZ size={14} className="mr-1" /> 
                    Brand
                    {sortField === 'brand' && <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
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
        className="supplier-products-table"
        style={{
          opacity: isTableVisible ? 1 : 0.97,
          minHeight: '100px' // Prevent layout shifts
          // CSS moved to SupplierDetail.css for better performance
        }}
      >
      {isLoading && productsWithDetails.length === 0 ? (
        <div className="animate-pulse space-y-3">
            {[...Array(5)].map((_, i) => (
            <div key={i} className="flex justify-between items-center border-t py-3">
              <div className="w-1/3">
                <div className="h-5 bg-gray-200 rounded"></div>
                  <div className="h-3 bg-gray-100 rounded mt-1 w-3/4"></div>
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
              <div className="bg-blue-50 border-blue-100 border text-blue-700 text-xs py-1 px-2 rounded mb-2 flex items-center justify-center" style={{opacity: 0.8}}>
                <RefreshCcw size={12} className="animate-spin mr-1.5" />
                Refreshing data in background...
              </div>
            )}
            
          <Table headers={tableHeaders}>
            {productsWithDetails.map((item: any) => (
              <React.Fragment key={item.id}>
                  <tr 
                    className={`border-t ${selectedUnmatchedProduct === item.id ? 'bg-blue-50' : ''} hover:bg-gray-50 transition-colors duration-150`}
                  >
                  <td className="px-4 py-3 font-medium">
                    {item.productName}
                  </td>
                  <td className="px-4 py-3">{item.productEan || '-'}</td>
                  <td className="px-4 py-3">{item.productBrand || '-'}</td>
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
                          onClick={() => {
                            // Get product ID - this will always be valid for matched products
                            const productId = item.product.id;
                            const currentSupplierObject = supplierCache[supplierId]?.supplier || suppliers.find(s => s.id === supplierId);
                            
                            // First navigate immediately to prevent click delays
                            navigate(`/products/${productId}`, {
                              state: {
                                product: item.product,
                                supplier: currentSupplierObject, // Pass the full supplier object if found
                                from: 'supplierDetail',
                                supplierId: supplierId // Keep supplierId as a fallback
                              }
                            });
                            
                            // Then optionally refresh data in the background if needed
                            // This prevents multiple clicks and UI freezing
                            if (!item.product.buyBoxPrice || item.product.salePrice === 0) {
                              setTimeout(() => {
                                refreshData().catch(err => {
                                  console.error('Error refreshing product data:', err);
                                });
                              }, 100);
                            }
                          }}
                        variant="secondary"
                          className="flex items-center gap-2 text-sm py-1 view-product-btn"
                      >
                        <Package size={14} />
                        View Product
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                            className="flex items-center gap-2 text-sm py-1 bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100 view-product-btn"
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
                    <td colSpan={10} className="px-0 py-0 border-t border-blue-100">
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