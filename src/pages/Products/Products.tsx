import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import Card from '../../components/UI/Card';
import Table from '../../components/UI/Table';
import Button from '../../components/UI/Button';
import ProductRow from '../../components/Products/ProductRow';
import { Search, Filter, ChevronLeft, ChevronRight, RefreshCcw, X, ArrowDownAZ, ArrowDownUp, Briefcase, DollarSign } from 'lucide-react';
import LoadingOverlay from '../../components/UI/LoadingOverlay';

type SortField = 'price' | 'units' | 'profit' | 'brand' | '';
type SortOrder = 'asc' | 'desc';

const Products: React.FC = () => {
  const { products, loading, error, refreshData } = useAppContext();
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
  const itemsPerPage = 10;
  
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
    
    const prices = products.map(p => p.salePrice);
    return {
      min: Math.floor(Math.min(...prices)),
      max: Math.ceil(Math.max(...prices))
    };
  }, [products]);
  
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
        product.salePrice >= priceRange.min && 
        product.salePrice <= priceRange.max;

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
          comparison = a.salePrice - b.salePrice;
          break;
        case 'units':
          comparison = a.unitsSold - b.unitsSold;
          break;
        case 'profit': {
          const aSupplier = getBestSupplierForProduct(a.id);
          const bSupplier = getBestSupplierForProduct(b.id);
          const aProfit = aSupplier ? (a.salePrice - a.amazonFee - aSupplier.cost) : 0;
          const bProfit = bSupplier ? (b.salePrice - b.amazonFee - bSupplier.cost) : 0;
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
      await refreshData();
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

  if (loading || isRefreshing) {
    return <LoadingOverlay message={isRefreshing ? "Refreshing products..." : "Loading products..."} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Products ({products.length})</h1>
        <Button onClick={handleRefresh} className="flex items-center text-sm">
          <RefreshCcw size={14} className="mr-1.5" /> Refresh Data
        </Button>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          Error loading products: {error.message}
        </div>
      )}
      
      <Card className="mb-4">
        {/* Search and filter toggle row */}
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
        
        {filteredProducts.length === 0 ? (
          <div className="text-center py-8 text-gray-500 bg-gray-50 rounded">
            <div className="font-medium mb-1">No products found matching your criteria</div>
            <div className="text-sm">Try adjusting your filters or search term</div>
            {getActiveFilterCount() > 0 && (
              <Button 
                variant="secondary" 
                className="mt-3 text-sm"
                onClick={handleClearFilters}
              >
                Clear All Filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <Table
              headers={[
                'Product', 
                'EAN', 
                'Brand', 
                'Sale Price', 
                'Units Sold', 
                'Amazon Fee', 
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
            
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mt-4 pt-3 border-t border-gray-200">
              <div className="text-sm text-gray-600 order-2 sm:order-1">
                Showing {filteredProducts.length > 0 ? startIndex + 1 : 0}-{Math.min(startIndex + itemsPerPage, filteredProducts.length)} of {filteredProducts.length} products
              </div>
              
              {totalPages > 1 && (
                <div className="flex order-1 sm:order-2">
                  <button 
                    className="border p-1.5 rounded-l hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center" 
                    onClick={() => changePage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    // Show first page, last page, current page, and pages around current
                    let pageNumbers = [];
                    if (totalPages <= 5) {
                      // If 5 or fewer pages, show all
                      pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
                    } else if (currentPage <= 3) {
                      // Near the start
                      pageNumbers = [1, 2, 3, 4, '...', totalPages];
                    } else if (currentPage >= totalPages - 2) {
                      // Near the end
                      pageNumbers = [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
                    } else {
                      // In the middle
                      pageNumbers = [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
                    }
                    
                    if (i < pageNumbers.length) {
                      const pageNumber = pageNumbers[i];
                      if (pageNumber === '...') {
                        return (
                          <span key={`ellipsis-${i}`} className="p-1.5 text-sm">
                            ...
                          </span>
                        );
                      }
                      
                      return (
                        <button
                          key={`page-${pageNumber}`}
                          className={`border p-1.5 min-w-[32px] ${currentPage === pageNumber ? 'bg-blue-500 text-white border-blue-500' : 'hover:bg-gray-100'} ${i === 0 ? 'rounded-l' : ''} ${i === pageNumbers.length - 1 ? 'rounded-r' : ''}`}
                          onClick={() => changePage(Number(pageNumber))}
                        >
                          {pageNumber}
                        </button>
                      );
                    }
                    return null;
                  })}
                  
                  <button 
                    className="border p-1.5 rounded-r hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center" 
                    onClick={() => changePage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default Products;