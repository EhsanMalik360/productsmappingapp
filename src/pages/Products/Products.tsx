import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import Card from '../../components/UI/Card';
import Table from '../../components/UI/Table';
import Button from '../../components/UI/Button';
import ProductRow from '../../components/Products/ProductRow';
import { Search, Filter, ChevronLeft, ChevronRight, RefreshCcw, X, ArrowDownAZ, ArrowDownUp, Briefcase, DollarSign, Database, AlertTriangle, Info, Loader2 } from 'lucide-react';

type SortField = 'price' | 'units' | 'profit' | 'brand' | '';
type SortOrder = 'asc' | 'desc';

const Products: React.FC = () => {
  const { products, loading, initialLoading, error, refreshData, totalProductCount } = useAppContext();
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
  const [loadingMessage, setLoadingMessage] = useState("Loading products from database...");
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  const [loadingRemainingData, setLoadingRemainingData] = useState(false);
  
  // Auto-refresh data when component mounts
  useEffect(() => {
    // Force a data refresh when the component mounts
    handleRefresh();
  }, []);
  
  // Extract unique brands and categories from products
  const brands = useMemo(() => {
    const uniqueBrands = new Set(products.map(product => product.brand));
    return Array.from(uniqueBrands).sort();
  }, [products]);
  
  const categories = useMemo(() => {
    const uniqueCategories = new Set(
      products.map(product => product.category)
        .filter(category => category !== null && category !== undefined)
    );
    return Array.from(uniqueCategories as Set<string>).sort();
  }, [products]);

  // Get price range for all products
  const priceStats = useMemo(() => {
    if (products.length === 0) return { min: 0, max: 1000 };
    
    const prices = products.map(p => p.buyBoxPrice);
    return {
      min: Math.floor(Math.min(...prices)),
      max: Math.ceil(Math.max(...prices))
    };
  }, [products]);
  
  // Reset price range when products change
  useEffect(() => {
    if (products.length > 0) {
      setPriceRange(priceStats);
    }
  }, [priceStats]);
  
  // Listen for console logs to update loading message
  useEffect(() => {
    const originalConsoleLog = console.log;
    
    console.log = function(...args) {
      // Call original console.log
      originalConsoleLog.apply(console, args);
      
      // Check if the message is related to product loading
      const message = args.join(' ');
      if (message.includes('Fetching batch') || message.includes('Fetched')) {
        setLoadingMessage(message);
      }
    };
    
    // Restore original console.log on unmount
    return () => {
      console.log = originalConsoleLog;
    };
  }, []);
  
  // Filter products based on search and filters
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      // Search filter
      const matchesSearch = 
        product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.ean.includes(searchTerm) ||
        (product.mpn && product.mpn.toLowerCase().includes(searchTerm.toLowerCase())) ||
        product.brand.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Brand filter
      const matchesBrand = selectedBrand ? product.brand === selectedBrand : true;
      
      // Category filter
      const matchesCategory = selectedCategory ? product.category === selectedCategory : true;

      // Price range filter
      const matchesPriceRange = 
        product.buyBoxPrice >= priceRange.min && 
        product.buyBoxPrice <= priceRange.max;

      // Supplier filter
      const { getSuppliersForProduct } = useAppContext();
      const suppliers = getSuppliersForProduct(product.id);
      const matchesSuppliers = hasSuppliers === null ? true : 
        hasSuppliers ? suppliers.length > 0 : suppliers.length === 0;
      
      return matchesSearch && matchesBrand && matchesCategory && matchesPriceRange && matchesSuppliers;
    });
  }, [products, searchTerm, selectedBrand, selectedCategory, priceRange, hasSuppliers]);

  // Apply sorting
  const sortedProducts = useMemo(() => {
    if (!sortField) return filteredProducts;

    return [...filteredProducts].sort((a, b) => {
      let comparison = 0;
      const { getSuppliersForProduct, getBestSupplierForProduct } = useAppContext();

      switch (sortField) {
        case 'price':
          comparison = a.buyBoxPrice - b.buyBoxPrice;
          break;
        case 'units':
          comparison = a.unitsSold - b.unitsSold;
          break;
        case 'profit': {
          const aSupplier = getBestSupplierForProduct(a.id);
          const bSupplier = getBestSupplierForProduct(b.id);
          const aProfit = aSupplier ? (a.buyBoxPrice - a.amazonFee - aSupplier.cost) : 0;
          const bProfit = bSupplier ? (b.buyBoxPrice - b.amazonFee - bSupplier.cost) : 0;
          comparison = aProfit - bProfit;
          break;
        }
        case 'brand':
          comparison = a.brand.localeCompare(b.brand);
          break;
        default:
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredProducts, sortField, sortOrder]);
  
  const totalPages = Math.ceil(sortedProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedProducts = sortedProducts.slice(startIndex, startIndex + itemsPerPage);
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1); // Reset to first page on search
  };
  
  const changePage = (page: number) => {
    if (page > 0 && page <= totalPages) {
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
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      setLoadingMessage("Starting to refresh products from database...");
      await refreshData();
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
    if (products.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <Database className="w-12 h-12 text-gray-400 mb-4" />
          <h3 className="text-xl font-semibold mb-2">No products found</h3>
          <p className="text-gray-500">Try adjusting your filters or import some products.</p>
        </div>
      );
    }
    
    // If filtering results in no products
    if (filteredProducts.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <Filter className="w-12 h-12 text-gray-400 mb-4" />
          <h3 className="text-xl font-semibold mb-2">No products match your filters</h3>
          <p className="text-gray-500">Try adjusting your search or filter criteria.</p>
          <Button 
            variant="secondary" 
            className="mt-4"
            onClick={handleClearFilters}
          >
            Clear All Filters
          </Button>
        </div>
      );
    }
    
    return null;
  };

  const renderBottomLoadingIndicator = () => {
    if (loading && !initialLoading && products.length > 0) {
      return (
        <div className="bg-blue-50 border-t border-blue-100 px-4 py-2 mt-2">
          <div className="flex items-center text-sm text-blue-700">
            <Loader2 className="w-3 h-3 text-blue-500 animate-spin mr-2" />
            <span>Loading additional data in background...</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Add a loader for the table 
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
                <span className="font-medium">{filteredProducts.length}</span>
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

        {/* Only render table if we have data and passed initial loading */}
        {!initialLoading && filteredProducts.length > 0 && (
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
              {paginatedProducts.map(product => (
                <ProductRow key={product.id} product={product} />
              ))}
            </Table>

            {/* Background loading indicator */}
            {renderBottomLoadingIndicator()}

            {/* Pagination controls */}
            <div className="flex justify-between items-center mt-4">
              <div className="text-sm text-gray-500">
                Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredProducts.length)} of {filteredProducts.length} products
                {totalProductCount > products.length && !loading && (
                  <span className="ml-1">
                    (of {totalProductCount} total in database)
                  </span>
                )}
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
                  Page {currentPage} of {totalPages || 1}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => changePage(currentPage + 1)}
                  disabled={currentPage === totalPages}
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