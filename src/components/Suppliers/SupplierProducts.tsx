import React, { useState, useMemo, useEffect } from 'react';
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
  const { supplierProducts, products, loading } = useAppContext();
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
  
  // New states for progressive loading
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isLoadingFilters, setIsLoadingFilters] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Get all supplier products
  const allSupplierProducts = useMemo(() => {
    const filtered = supplierProducts.filter(sp => sp.supplier_id === supplierId);
    
    // If we have any products, consider initial data loaded
    if (filtered.length > 0 && !initialDataLoaded) {
      setInitialDataLoaded(true);
      
      // Stagger loading states for better UX
      setTimeout(() => setIsLoadingProducts(false), 50);
      setTimeout(() => setIsLoadingStats(false), 100);
      setTimeout(() => setIsLoadingFilters(false), 150);
    }
    
    return filtered;
  }, [supplierProducts, supplierId, initialDataLoaded]);
  
  // Get cost range for all products
  const costStats = useMemo(() => {
    if (allSupplierProducts.length === 0) return { min: 0, max: 100 };
    
    const costs = allSupplierProducts.map(p => p.cost);
    return {
      min: Math.floor(Math.min(...costs)),
      max: Math.ceil(Math.max(...costs, 10)) // Ensure at least 10 for the slider
    };
  }, [allSupplierProducts]);

  // Initialize cost filter with full range when stats are loaded
  useEffect(() => {
    if (!isLoadingStats) {
      setCostRange(costStats);
    }
  }, [isLoadingStats, costStats]);

  // Apply filtering based on matched/unmatched status
  const filteredByMatchStatus = useMemo(() => {
    if (filterOption === 'matched') {
      return allSupplierProducts.filter(sp => sp.product_id !== null);
    } else if (filterOption === 'unmatched') {
      return allSupplierProducts.filter(sp => sp.product_id === null);
    }
    return allSupplierProducts;
  }, [allSupplierProducts, filterOption]);

  // Progress loading indicator based on data availability
  useEffect(() => {
    if (products.length > 0 && allSupplierProducts.length > 0) {
      setIsLoadingProducts(false);
    }
  }, [products, allSupplierProducts]);

  // Get product details for all filtered products - but don't block rendering
  const productsWithDetails = useMemo(() => {
    // Don't process if still loading initial products data
    if (isLoadingProducts) return [];
    
    return filteredByMatchStatus.map(sp => {
      // For matched products, include product details and calculate profit metrics
      if (sp.product_id) {
        const product = products.find(p => p.id === sp.product_id);
        if (product) {
          const profitPerUnit = product.salePrice - product.amazonFee - sp.cost;
          const profitMargin = (profitPerUnit / product.salePrice) * 100;
          
          return {
            ...sp,
            product,
            productName: product.title || '-',
            productEan: product.ean || '-',
            productMpn: product.mpn || '-',
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
  }, [filteredByMatchStatus, products, isLoadingProducts]);

  // Apply additional filters and search - but only when data and filters are ready
  const filteredProducts = useMemo(() => {
    if (isLoadingFilters || isLoadingProducts) return productsWithDetails;
    
    return productsWithDetails.filter(item => {
      // Text search
      const matchesSearch = searchTerm === '' || 
        item.productName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        item.productEan.includes(searchTerm) || 
        (item.mpn && item.mpn.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.productMpn && item.productMpn.toLowerCase().includes(searchTerm.toLowerCase()));
      
      // Cost range filter
      const matchesCost = 
        item.cost >= costRange.min && 
        item.cost <= costRange.max;
      
      // Match method filter
      const matchesMethod = matchMethodFilter === null || 
        item.match_method === matchMethodFilter;
      
      return matchesSearch && matchesCost && matchesMethod;
    });
  }, [productsWithDetails, searchTerm, costRange, matchMethodFilter, isLoadingFilters, isLoadingProducts]);

  // Apply sorting - but don't block on this
  const sortedProducts = useMemo(() => {
    if (!sortField || isLoadingFilters) return filteredProducts;

    return [...filteredProducts].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'name':
          comparison = a.productName.localeCompare(b.productName);
          break;
        case 'cost':
          comparison = a.cost - b.cost;
          break;
        case 'price':
          const aPrice = a.product ? a.product.salePrice : 0;
          const bPrice = b.product ? b.product.salePrice : 0;
          comparison = aPrice - bPrice;
          break;
        case 'profit':
          comparison = a.profitPerUnit - b.profitPerUnit;
          break;
        case 'margin':
          comparison = a.profitMargin - b.profitMargin;
          break;
        default:
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredProducts, sortField, sortOrder, isLoadingFilters]);
  
  // Apply pagination
  const totalPages = Math.ceil(sortedProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedProducts = useMemo(() => {
    return sortedProducts.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedProducts, startIndex, itemsPerPage]);

  // Calculate match stats - but don't block rendering on this
  const matchStats = useMemo(() => {
    if (isLoadingStats) {
      return { total: 0, matched: 0, unmatched: 0 };
    }
    
    const total = allSupplierProducts.length;
    const matched = allSupplierProducts.filter(sp => sp.product_id !== null).length;
    const unmatched = total - matched;
    
    return { total, matched, unmatched };
  }, [allSupplierProducts, isLoadingStats]);

  // Get unique match methods for filtering - but don't block on this
  const matchMethods = useMemo(() => {
    if (isLoadingFilters) return [];
    
    const methods = new Set(allSupplierProducts.map(sp => sp.match_method));
    return Array.from(methods).filter(Boolean) as string[];
  }, [allSupplierProducts, isLoadingFilters]);

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
  
  const handleClearFilters = () => {
    setSearchTerm('');
    setCostRange(costStats);
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
  
  // Add the missing renderPagination function
  const renderPagination = () => {
    if (totalPages <= 1) return null;
    
    return (
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
            Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, sortedProducts.length)} of {sortedProducts.length} items
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
  
  // Show faster initial loading state
  if (loading && !initialDataLoaded) {
    return (
      <Card className="mb-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold">Supplier Products</h3>
            <span className="text-sm text-gray-500">Loading initial data...</span>
          </div>
          <div className="flex items-center">
            <div className="animate-spin mr-2 h-5 w-5 text-blue-600">
              <RefreshCcw size={20} />
            </div>
          </div>
        </div>
        
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
      </Card>
    );
  }
  
  // Main render with progressive loading
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
              {isLoadingStats ? (
                <span className="h-3 w-3 animate-pulse bg-gray-200 rounded-full"></span>
              ) : (
                matchStats.total
              )}
            </span>
          </Button>
          <Button 
            variant={filterOption === 'matched' ? 'primary' : 'secondary'}
            className="flex items-center text-xs px-3 py-1.5"
            onClick={() => { setFilterOption('matched'); setCurrentPage(1); }}
          >
            Matched
            <span className="ml-1.5 bg-white text-blue-700 font-medium rounded-full w-5 h-5 flex items-center justify-center text-xs">
              {isLoadingStats ? (
                <span className="h-3 w-3 animate-pulse bg-gray-200 rounded-full"></span>
              ) : (
                matchStats.matched
              )}
            </span>
          </Button>
          <Button 
            variant={filterOption === 'unmatched' ? 'primary' : 'secondary'}
            className="flex items-center text-xs px-3 py-1.5"
            onClick={() => { setFilterOption('unmatched'); setCurrentPage(1); }}
          >
            Unmatched
            <span className="ml-1.5 bg-white text-blue-700 font-medium rounded-full w-5 h-5 flex items-center justify-center text-xs">
              {isLoadingStats ? (
                <span className="h-3 w-3 animate-pulse bg-gray-200 rounded-full"></span>
              ) : (
                matchStats.unmatched
              )}
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
          {isLoadingFilters ? (
            <div className="animate-pulse space-y-3">
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              <div className="h-10 bg-gray-200 rounded"></div>
              <div className="h-8 bg-gray-200 rounded w-full"></div>
            </div>
          ) : (
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
          )}
        </div>
      )}
      
      {/* Show table content as soon as we have products */}
      {isLoadingProducts ? (
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
      ) : sortedProducts.length === 0 ? (
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
            {paginatedProducts.map((item: any) => (
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