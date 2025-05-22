import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, startTransition } from 'react';
import Card from '../../components/UI/Card';
import Table from '../../components/UI/Table';
import Button from '../../components/UI/Button';
import ProductRow from '../../components/Products/ProductRow';
import { Search, Filter, ChevronLeft, ChevronRight, RefreshCcw, X, ArrowDownAZ, ArrowDownUp, Briefcase, DollarSign, Loader2 } from 'lucide-react';
import { useProducts, ProductFilters } from '../../hooks/useProducts';
import { useAppContext } from '../../context/AppContext';

type SortField = 'price' | 'units' | 'profit' | 'brand' | '';
type SortOrder = 'asc' | 'desc';

// Enhanced skeleton loader for product rows that looks more like real data
const ProductRowSkeleton = () => (
  <tr className="border-b animate-pulse transition-all duration-500 ease-in-out">
    <td className="px-4 py-3">
      <div className="flex flex-col">
        <div className="h-5 bg-gray-200 rounded w-full mb-1 transition-all duration-500"></div>
        <div className="h-4 bg-gray-100 rounded w-2/3 transition-all duration-700"></div>
      </div>
    </td>
    <td className="px-4 py-3"><div className="h-5 bg-gray-200 rounded w-4/5 transition-all duration-600"></div></td>
    <td className="px-4 py-3"><div className="h-5 bg-gray-200 rounded w-2/3 transition-all duration-800"></div></td>
    <td className="px-4 py-3"><div className="h-5 bg-gray-200 rounded w-1/2 transition-all duration-500"></div></td>
    <td className="px-4 py-3"><div className="h-5 bg-gray-200 rounded w-1/2 transition-all duration-700"></div></td>
    <td className="px-4 py-3"><div className="h-5 bg-gray-200 rounded w-1/2 transition-all duration-600"></div></td>
    <td className="px-4 py-3">
      <div className="flex flex-col space-y-1 min-h-[44px]">
        <div className="supplier-badge bg-gray-200 h-6 w-[90px] rounded-full transition-all duration-500"></div>
        <div className="bg-gray-100 h-5 w-[40px] rounded transition-all duration-700"></div>
      </div>
    </td>
    <td className="px-4 py-3 min-w-[80px]"><div className="h-5 bg-gray-200 rounded w-[60px] transition-all duration-800"></div></td>
    <td className="px-4 py-3 min-w-[100px]">
      <div className="font-medium h-5 bg-gray-200 rounded w-[40px] mb-1 transition-all duration-500"></div>
      <div className="h-2 bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300 rounded opacity-60 transition-all duration-700">
        <div className="profit-marker w-2.5 h-2.5 bg-gray-400 rounded-full relative -top-[3px] ml-[30%]"></div>
      </div>
    </td>
    <td className="px-4 py-3">
      <div className="flex items-center">
        <div className="h-5 w-5 bg-gray-200 rounded-full mr-1 transition-all duration-600"></div>
        <div className="h-5 bg-gray-200 rounded w-12 transition-all duration-800"></div>
      </div>
    </td>
  </tr>
);

const Products: React.FC = () => {
  // Get AppContext and products hook
  const { refreshData, fetchLinkedSuppliersForProduct } = useAppContext();
  
  // Use our products hook
  const {
    products,
    totalCount,
    hasAccurateCount,
    getProducts,
    invalidateCache,
    getBrands,
    getCategories,
    getPriceRange
  } = useProducts();

  // UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [priceRange, setPriceRange] = useState<{min: number, max: number}>({min: 0, max: 1000});
  const [hasSuppliers, setHasSuppliers] = useState<boolean | null>(null);
  const [sortField, setSortField] = useState<SortField>('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [showFilters, setShowFilters] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [, setLastRefreshed] = useState<Date | null>(null);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [brands, setBrands] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [priceStats, setPriceStats] = useState<{min: number, max: number}>({min: 0, max: 1000});
  // Track if we've done initial data loading with accurate count
  const [isInitialDataLoaded, setIsInitialDataLoaded] = useState(false);
  
  // Table ref to maintain consistent height
  const tableRef = useRef<HTMLDivElement>(null);
  const [tableHeight, setTableHeight] = useState<number | null>(null);
  
  // Keep track of applied filters for caching
  const getActiveFilters = useCallback((): ProductFilters => {
    return {
      searchTerm,
      brand: selectedBrand,
      category: selectedCategory,
      priceRange,
      hasSuppliers,
      sortField,
      sortOrder
    };
  }, [searchTerm, selectedBrand, selectedCategory, priceRange, hasSuppliers, sortField, sortOrder]);
  
  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);
  
  // Measure table height after initial render to prevent layout shifts
  useLayoutEffect(() => {
    if (tableRef.current && products.length > 0 && tableHeight === null) {
      setTableHeight(tableRef.current.offsetHeight);
    }
  }, [products, tableHeight]);
  
  // Load data when any filter changes, but only after initial data is loaded
  useEffect(() => {
    // Don't trigger filter-based data loading until initial data is properly loaded
    if (!isInitialDataLoaded) return;
    
    // Always load data, even during initial load
    // This ensures we start fetching immediately without waiting
    startTransition(() => {
      loadData();
    });
  }, [currentPage, itemsPerPage, searchTerm, selectedBrand, selectedCategory, priceRange, hasSuppliers, sortField, sortOrder, isInitialDataLoaded]);

  // Load metadata and initial data
  const loadInitialData = async () => {
    try {
      // Set table height first to prevent layout shifts
      if (tableRef.current) {
        setTableHeight(Math.max(tableRef.current.clientHeight || 400, 400));
      }

      // Start metadata loading in parallel with products
      const metadataPromise = Promise.all([
        getBrands(),
        getCategories(),
        getPriceRange()
      ]);
      
      // First get products - this might come from cache initially
      await getProducts(1, itemsPerPage, getActiveFilters(), false);
      
      // Also refresh supplier products data to ensure we have the latest
      await refreshData();
      
      // Then wait for metadata
      const [brandsData, categoriesData, priceRangeData] = await metadataPromise;
      
      // Only update UI when we have everything
      setBrands(brandsData);
      setCategories(categoriesData);
      setPriceStats(priceRangeData);
      setPriceRange(priceRangeData);
      
      // Short delay before marking initial data as loaded
      // This allows animations to complete naturally
      setTimeout(() => {
        setLastRefreshed(new Date());
        setIsInitialDataLoaded(true);
      }, 500);
    } catch (error) {
      console.error('Error loading initial data:', error);
      // Even on error, mark as loaded after a delay
      setTimeout(() => {
        setIsInitialDataLoaded(true);
      }, 500);
    }
  };
  
  // Load products based on current page and filters
  const loadData = async () => {
    try {
      setIsRefreshing(true);
      
      // Always force fetch to ensure accurate counts
      await getProducts(currentPage, itemsPerPage, getActiveFilters(), true);
      
      setLastRefreshed(new Date());
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setIsRefreshing(false);
    }
  };
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(() => {
      setCurrentPage(1); // Reset to first page on search
    });
  };
  
  const changePage = (page: number) => {
  const maxPage = totalCount ? Math.ceil(totalCount / itemsPerPage) : 1;
  if (page > 0 && page <= maxPage) {
    startTransition(() => {
      setCurrentPage(page);
    });
  }
};

  const handleSort = (field: SortField) => {
    startTransition(() => {
      if (sortField === field) {
        // Toggle sort order if same field
        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        // Set new field and default to ascending
        setSortField(field);
        setSortOrder('asc');
      }
      setCurrentPage(1); // Reset to first page on sort
    });
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      
      // Invalidate cache to force fresh data fetch
      invalidateCache();
      
      // Reload metadata
      const [brandsData, categoriesData, priceRangeData] = await Promise.all([
        getBrands(),
        getCategories(),
        getPriceRange()
      ]);
      
      setBrands(brandsData);
      setCategories(categoriesData);
      setPriceStats(priceRangeData);
      
      // Force refetch current page
      await getProducts(currentPage, itemsPerPage, getActiveFilters(), true);
      
      // Also refresh supplier products to ensure they're up to date
      await refreshData();
      
      setLastRefreshed(new Date());
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClearFilters = () => {
    startTransition(() => {
      setSelectedBrand('');
      setSelectedCategory('');
      setSearchTerm('');
      setPriceRange(priceStats);
      setHasSuppliers(null);
      setSortField('');
      setSortOrder('asc');
      setCurrentPage(1);
    });
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (selectedBrand) count++;
    if (selectedCategory) count++;
    if (priceRange.min > priceStats.min || priceRange.max < priceStats.max) count++;
    if (hasSuppliers !== null) count++;
    if (sortField) count++;
    return count;
  };

  const handleItemsPerPageChange = (value: number) => {
    startTransition(() => {
      setItemsPerPage(value);
      setCurrentPage(1); // Reset to first page when changing items per page
    });
  };

  // Render product rows with skeletons until we have both products and accurate count
  const renderProductRows = () => {
    // Show real products as soon as we have them
    if (products && products.length > 0) {
      return products.map(product => (
        <ProductRow 
          key={product.id} 
          product={product} 
          className="transition-all duration-500 ease-in-out"
        />
      ));
    }
    
    // Use more skeletons for initial load to make the table look more substantial
    // and to prevent layout shifts when real data loads
    const skeletonCount = isInitialDataLoaded ? itemsPerPage : Math.max(10, itemsPerPage);
    
    // Fallback to skeletons only when necessary
    return Array(skeletonCount).fill(0).map((_, index) => (
      <ProductRowSkeleton key={index} />
    ));
  };

  // Empty state for when there are no products at all

  // We no longer show a full loading screen - we always show the table with skeleton loaders
  // This improves perceived performance by not making users wait for a loading screen

  useLayoutEffect(() => {
    // Set a minimum height for the table container regardless of content
    if (tableRef.current && !tableHeight) {
      setTableHeight(Math.max(tableRef.current.clientHeight, 400)); // At least 400px
    }
  }, [tableRef.current, tableHeight]);

  // Add a function to preload suppliers for all products on the current page
  const preloadSuppliersForCurrentProducts = useCallback(async () => {
    if (!products || products.length === 0) return;
    
    try {
      console.log(`Preloading suppliers for ${products.length} products on current page`);
      
      // To reduce flickering, we'll create a small delay after products load
      // before attempting to load all supplier data
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Using Promise.all but with a small concurrency limit to prevent UI jank
      const batchSize = 5; // Process in batches of 5 for smoother UI
      
      // Create batches of products
      const batches = [];
      for (let i = 0; i < products.length; i += batchSize) {
        batches.push(products.slice(i, i + batchSize));
      }
      
      // Process each batch sequentially to reduce load on UI thread
      for (const batch of batches) {
        await Promise.all(batch.map(product => 
          fetchLinkedSuppliersForProduct(product.id)
        ));
        // Small pause between batches to allow UI to breathe
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      console.log('Completed preloading suppliers for current page');
    } catch (error) {
      console.error('Error preloading suppliers:', error);
    }
  }, [products, fetchLinkedSuppliersForProduct]);
  
  // Use effect to trigger supplier preloading when products change
  useEffect(() => {
    if (products.length > 0) {
      // Use requestAnimationFrame to ensure UI updates first
      requestAnimationFrame(() => {
        preloadSuppliersForCurrentProducts();
      });
    }
  }, [products, preloadSuppliersForCurrentProducts]);

  return (
    <div className="container mx-auto px-4 py-6">
      <Card>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Products</h1>
          <div className="flex space-x-2">
            <Button 
              variant="secondary" 
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="transition-all duration-300 hover:bg-gray-100 active:bg-gray-200 flex items-center"
            >
              {isRefreshing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> 
                  <span className="transition-all duration-300 ease-in-out">Refreshing...</span>
                </>
              ) : (
                <>
                  <RefreshCcw className="w-4 h-4 mr-2 transition-transform duration-300 hover:rotate-180" /> 
                  <span className="transition-all duration-300 ease-in-out">Refresh</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Search & Filter UI with improved styling */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <form onSubmit={handleSearch} className="flex w-full md:w-auto relative">
              <input
                type="text"
                placeholder="Search products by name, EAN, MPN, or brand..."
                className="border pl-9 pr-4 py-2 rounded w-full md:w-80 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 transition-all duration-200"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
              {searchTerm && (
                <button 
                  type="button" 
                  className="absolute right-10 top-2.5 text-gray-400 hover:text-gray-700 transition-colors duration-200"
                  onClick={() => setSearchTerm('')}
                >
                  <X size={16} />
                </button>
              )}
              <Button type="submit" className="ml-2 text-sm transition-all duration-200 hover:bg-blue-600 active:bg-blue-700">
                Search
              </Button>
            </form>
            
            <div className="flex items-center">
              <div className="flex items-center mr-2 text-sm">
                <span className="text-gray-600 mr-1">Total:</span>
                {hasAccurateCount ? (
                  <span className="font-medium min-w-[2rem] transition-all duration-500 ease-in-out opacity-100">{totalCount}</span>
                ) : (
                  <span className="font-medium w-8 h-5 bg-gray-100 animate-pulse rounded transition-all duration-500 ease-in-out"></span>
                )}
                {getActiveFilterCount() > 0 && hasAccurateCount && (
                  <span className="ml-1 text-blue-600 transition-all duration-500 ease-in-out opacity-100">({getActiveFilterCount()} filter{getActiveFilterCount() !== 1 ? 's' : ''})</span>
                )}
              </div>
              <Button 
                variant={showFilters ? "primary" : "secondary"} 
                className={`transition-all duration-300 ${showFilters ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-100'} flex items-center`}
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-4 h-4 mr-2" /> 
                Filters {getActiveFilterCount() > 0 && `(${getActiveFilterCount()})`}
              </Button>
            </div>
          </div>
          
          {/* Expanded filters section with smoother animation */}
          {showFilters && (
            <div className="p-3 bg-gray-50 rounded-md mb-3 border border-gray-200 animate-slideDown">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                  <select 
                    className="border p-2 rounded w-full bg-white"
                    value={selectedBrand}
                    onChange={(e) => setSelectedBrand(e.target.value)}
                  >
                    <option value="">All Brands</option>
                    {brands.map(brand => (
                      <option key={brand} value={brand}>{brand}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select 
                    className="border p-2 rounded w-full bg-white"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  >
                    <option value="">All Categories</option>
                    {categories.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Price Range (${priceRange.min} - ${priceRange.max})
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={priceStats.min}
                      max={priceStats.max}
                      value={priceRange.min}
                      onChange={(e) => setPriceRange({...priceRange, min: Number(e.target.value)})}
                      className="w-full"
                    />
                    <input
                      type="range"
                      min={priceStats.min}
                      max={priceStats.max}
                      value={priceRange.max}
                      onChange={(e) => setPriceRange({...priceRange, max: Number(e.target.value)})}
                      className="w-full"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Status</label>
                  <div className="flex flex-col gap-1">
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        checked={hasSuppliers === null}
                        onChange={() => setHasSuppliers(null)}
                        className="mr-2"
                      />
                      <span className="text-sm">All Products</span>
                    </label>
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        checked={hasSuppliers === true}
                        onChange={() => setHasSuppliers(true)}
                        className="mr-2"
                      />
                      <span className="text-sm">With Suppliers</span>
                    </label>
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        checked={hasSuppliers === false}
                        onChange={() => setHasSuppliers(false)}
                        className="mr-2"
                      />
                      <span className="text-sm">Without Suppliers</span>
                    </label>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                <div className="text-sm font-medium">Sort By:</div>
                <div className="flex gap-2">
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
                    variant={sortField === 'price' ? 'primary' : 'secondary'} 
                    className="flex items-center text-xs px-2 py-1"
                    onClick={() => handleSort('price')}
                  >
                    <DollarSign size={14} className="mr-1" /> 
                    Price
                    {sortField === 'price' && <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                  </Button>
                  <Button 
                    variant={sortField === 'units' ? 'primary' : 'secondary'} 
                    className="flex items-center text-xs px-2 py-1"
                    onClick={() => handleSort('units')}
                  >
                    <ArrowDownUp size={14} className="mr-1" /> 
                    Units Sold
                    {sortField === 'units' && <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                  </Button>
                  <Button 
                    variant={sortField === 'profit' ? 'primary' : 'secondary'} 
                    className="flex items-center text-xs px-2 py-1"
                    onClick={() => handleSort('profit')}
                  >
                    <Briefcase size={14} className="mr-1" /> 
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
            </div>
          )}
        </div>

        {/* Table container with guaranteed height */}
        {/* Table container with guaranteed height and stability */}
        <div 
          ref={tableRef} 
          className="overflow-x-auto relative"
          style={{ 
            minHeight: tableHeight ? `${tableHeight}px` : '600px', // Larger minimum height for better stability
            transition: 'min-height 300ms ease-in-out' // Smooth transition for any height changes
          }}
        >
          <Table
            headers={[
              'Product', 
              'EAN', 
              'Brand', 
              'Buy Box Price', 
              'Units Sold', 
              'FBA Fee', 
              'Suppliers', 
              'Best Cost', 
              'Profit Margin',
              'Actions'
            ]}
            columnWidths={[
              '25%', // Product - larger for product names
              '10%', // EAN
              '10%', // Brand
              '8%',  // Buy Box Price
              '8%',  // Units Sold
              '8%',  // FBA Fee
              '10%', // Suppliers
              '6%',  // Best Cost
              '8%',  // Profit Margin
              '7%'   // Actions
            ]}
          >
            {renderProductRows()}
          </Table>

          {/* Pagination controls - simplified to avoid flickering */}
          <div className="flex justify-between items-center mt-4">
            <div className="text-sm text-gray-500 min-h-[1.25rem]">
              {hasAccurateCount ? (
                <span className="transition-all duration-500 ease-in-out opacity-100">
                  Showing {products.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to {Math.min(currentPage * itemsPerPage, totalCount || 0)} of {totalCount || 0} products
                </span>
              ) : (
                <div className="h-5 bg-gray-100 animate-pulse rounded w-48 transition-all duration-500 ease-in-out"></div>
              )}
            </div>
            <div className="flex items-center space-x-1">
              <Button
                variant="secondary"
                onClick={() => changePage(currentPage - 1)}
                disabled={currentPage === 1 || !hasAccurateCount}
                className="p-1 transition-all duration-200 hover:bg-gray-100"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="px-2">
                {hasAccurateCount ? (
                  <span>Page {currentPage} of {Math.ceil((totalCount || 0) / itemsPerPage) || 1}</span>
                ) : (
                  <div className="h-5 bg-gray-100 animate-pulse rounded w-24 mx-2"></div>
                )}
              </span>
              <Button
                variant="secondary"
                onClick={() => changePage(currentPage + 1)}
                disabled={!hasAccurateCount || currentPage >= Math.ceil((totalCount || 0) / itemsPerPage)}
                className="p-1 transition-all duration-200 hover:bg-gray-100"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            
              <select
                className="ml-4 border rounded p-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 transition-all duration-200"
                value={itemsPerPage}
                onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Products;