import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import Card from '../../components/UI/Card';
import Table from '../../components/UI/Table';
import Button from '../../components/UI/Button';
import ProductRow from '../../components/Products/ProductRow';
import { Search, Filter, ChevronLeft, ChevronRight, RefreshCcw, X, ArrowDownAZ, ArrowDownUp, Briefcase, DollarSign, Database, Loader2 } from 'lucide-react';

type SortField = 'price' | 'units' | 'profit' | 'brand' | '';
type SortOrder = 'asc' | 'desc';

const Products: React.FC = () => {
  const { products, loading, initialLoading, error, totalProductCount, fetchProducts, getBrands, getCategories, getPriceRange } = useAppContext();
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
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [brands, setBrands] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [priceStats, setPriceStats] = useState<{min: number, max: number}>({min: 0, max: 1000});
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const isMounted = useRef(true);
  const activeRequests = useRef<AbortController[]>([]);
  
  // Load data with debounce to prevent multiple API calls
  const loadData = useCallback(async () => {
    // Skip loading if we're currently navigating between pages
    if (isNavigating) {
      console.log('Skipping data load during navigation');
      return;
    }
    
    // Create abort controller for this request
    const controller = new AbortController();
    activeRequests.current.push(controller);
    
    try {
      console.log('Loading products data...');
      const filters = {
        searchTerm,
        brand: selectedBrand,
        category: selectedCategory,
        priceRange,
        hasSuppliers,
        sortField,
        sortOrder
      };
      
      const result = await fetchProducts(currentPage, itemsPerPage, filters);
      
      // Check if component is still mounted and request wasn't aborted
      if (isMounted.current && !controller.signal.aborted) {
        console.log(`Loaded ${result.data.length} products`);
        setDataLoaded(true);
      }
    } catch (error) {
      // Only log if not aborted and component is mounted
      if (isMounted.current && !controller.signal.aborted) {
        console.error('Error loading products:', error);
      }
    } finally {
      // Remove this controller from active requests
      activeRequests.current = activeRequests.current.filter(c => c !== controller);
    }
  }, [
    currentPage,
    itemsPerPage, 
    searchTerm, 
    selectedBrand, 
    selectedCategory, 
    priceRange, 
    hasSuppliers,
    sortField,
    sortOrder,
    fetchProducts,
    isNavigating
  ]);
  
  // Track navigation state
  useEffect(() => {
    // This runs when component mounts - reset navigation state
    setIsNavigating(false);
    
    return () => {
      // When component unmounts (navigating away), set flag to true
      // and cancel all active requests
      isMounted.current = false;
      setIsNavigating(true);
      activeRequests.current.forEach(controller => {
        controller.abort();
      });
    };
  }, []);
  
  // Create a debounced version of loadData with useEffect
  useEffect(() => {
    // Skip initial load to prevent double-loading
    if (!dataLoaded) return;
    
    // Use a small delay to batch rapid changes
    const timer = setTimeout(() => {
      // Only load if not navigating away
      if (!isNavigating && isMounted.current) {
        loadData();
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [
    currentPage,
    itemsPerPage, 
    searchTerm, 
    selectedBrand, 
    selectedCategory, 
    priceRange, 
    hasSuppliers,
    sortField,
    sortOrder,
    loadData,
    dataLoaded,
    isNavigating
  ]);
  
  // Initial data load
  useEffect(() => {
    // Only run if not navigating away and component is mounted
    if (!isNavigating && isMounted.current) {
      loadData();
      loadMetadata();
    }
  }, []);
  
  // Load metadata (brands, categories, price range)
  const loadMetadata = async () => {
    // Skip if navigating or unmounted
    if (isNavigating || !isMounted.current) return;
    
    // Create abort controller
    const controller = new AbortController();
    activeRequests.current.push(controller);
    
    try {
      // Load brands
      const brandsData = await getBrands();
      
      // Check if still mounted and not aborted
      if (!isMounted.current || controller.signal.aborted) return;
      
      setBrands(brandsData);
      
      // Load categories
      const categoriesData = await getCategories();
      
      // Check again
      if (!isMounted.current || controller.signal.aborted) return;
      
      setCategories(categoriesData);
      
      // Load price range
      const priceRangeData = await getPriceRange();
      
      // Final check
      if (!isMounted.current || controller.signal.aborted) return;
      
      setPriceStats(priceRangeData);
      setPriceRange(priceRangeData);
    } catch (error) {
      // Only log if mounted and not aborted
      if (isMounted.current && !controller.signal.aborted) {
        console.error('Error loading metadata:', error);
      }
    } finally {
      // Remove this controller
      activeRequests.current = activeRequests.current.filter(c => c !== controller);
    }
  };
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1); // Reset to first page on search
  };
  
  const changePage = (page: number) => {
    if (page > 0 && page <= Math.ceil(totalProductCount / itemsPerPage)) {
      setCurrentPage(page);
    }
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
    setCurrentPage(1); // Reset to first page on sort
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await loadMetadata();
      await loadData();
      setLastRefreshed(new Date());
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClearFilters = () => {
    setSelectedBrand('');
    setSelectedCategory('');
    setSearchTerm('');
    setPriceRange(priceStats);
    setHasSuppliers(null);
    setSortField('');
    setSortOrder('asc');
    setCurrentPage(1);
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
    setItemsPerPage(value);
    setCurrentPage(1); // Reset to first page when changing items per page
  };

  // Show loading state based on different conditions
  const renderLoadingState = () => {
    // If loading initial data, show loading indicator
    if (initialLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="w-16 h-16 relative mb-4">
            <div className="animate-pulse bg-blue-100 w-full h-full rounded-full"></div>
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin absolute top-3 left-3" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Loading products</h3>
          <div className="text-gray-500 max-w-md text-center">
            <p>Please wait while we load your product data...</p>
          </div>
        </div>
      );
    }
    
    // If no products after initial load, show empty state
    if (products.length === 0 && !loading) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <Database className="w-12 h-12 text-gray-400 mb-4" />
          <h3 className="text-xl font-semibold mb-2">No products found</h3>
          <p className="text-gray-500">Try adjusting your filters or import some products.</p>
        </div>
      );
    }
    
    return null;
  };

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
            >
              {isRefreshing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> 
                  Refreshing...
                </>
              ) : (
                <>
                  <RefreshCcw className="w-4 h-4 mr-2" /> 
                  Refresh
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Search & Filter UI */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <form onSubmit={handleSearch} className="flex w-full md:w-auto relative">
              <input
                type="text"
                placeholder="Search products by name, EAN, MPN, or brand..."
                className="border pl-9 pr-4 py-2 rounded w-full md:w-80"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
              {searchTerm && (
                <button 
                  type="button" 
                  className="absolute right-10 top-2.5 text-gray-400 hover:text-gray-700"
                  onClick={() => setSearchTerm('')}
                >
                  <X size={16} />
                </button>
              )}
              <Button type="submit" className="ml-2 text-sm">
                Search
              </Button>
            </form>
            
            <div className="flex items-center">
              <div className="flex items-center mr-2 text-sm">
                <span className="text-gray-600 mr-1">Total:</span>
                <span className="font-medium">{totalProductCount}</span>
                {getActiveFilterCount() > 0 && (
                  <span className="ml-1 text-blue-600">({getActiveFilterCount()} filter{getActiveFilterCount() !== 1 ? 's' : ''})</span>
                )}
              </div>
              <Button 
                variant={showFilters ? "primary" : "secondary"} 
                className="flex items-center text-sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter size={14} className="mr-1.5" /> 
                {showFilters ? 'Hide Filters' : 'Show Filters'}
              </Button>
            </div>
          </div>
          
          {/* Expanded filters section */}
          {showFilters && (
            <div className="p-3 bg-gray-50 rounded-md mb-3 border border-gray-200">
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

        {/* Loading states */}
        {renderLoadingState()}

        {/* Show loading overlay when refreshing data */}
        {loading && !initialLoading && (
          <div className="relative">
            <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center z-10">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          </div>
        )}

        {/* Only render table if we have data and passed initial loading */}
        {!initialLoading && products.length > 0 && (
          <>
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
            >
              {products.map(product => (
                <ProductRow key={product.id} product={product} />
              ))}
            </Table>

            {/* Pagination controls */}
            <div className="flex justify-between items-center mt-4">
              <div className="text-sm text-gray-500">
                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, totalProductCount)} of {totalProductCount} products
              </div>
              <div className="flex items-center space-x-1">
                <Button
                  variant="secondary"
                  onClick={() => changePage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="px-2">
                  Page {currentPage} of {Math.ceil(totalProductCount / itemsPerPage) || 1}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => changePage(currentPage + 1)}
                  disabled={currentPage === Math.ceil(totalProductCount / itemsPerPage)}
                  className="p-1"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                
                <select
                  className="ml-4 border rounded p-1 text-sm"
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
          </>
        )}
      </Card>
    </div>
  );
};

export default Products;