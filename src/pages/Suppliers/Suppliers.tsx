import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PlusCircle, Search, RefreshCcw, Trash2, Eye, Edit, Filter, X, ArrowDownAZ, DollarSign, Package, ShoppingCart, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAppContext, Supplier } from '../../context/AppContext';
import Table from '../../components/UI/Table';
import Button from '../../components/UI/Button';
import Card from '../../components/UI/Card';
import EmptyState from '../../components/Dashboard/EmptyState';
import SupplierModal from './SupplierModal';

interface SupplierStats {
  productCount: number;
  avgCost: number;
  bestValueCount: number;
}

type SortField = 'name' | 'products' | 'cost' | 'bestValue' | '';
type SortOrder = 'asc' | 'desc';

const Suppliers: React.FC = () => {
  const { suppliers, supplierProducts, loading, initialLoading, refreshData, deleteSupplier } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentSupplier, setCurrentSupplier] = useState<Supplier | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<SortField>('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [productCountFilter, setProductCountFilter] = useState<{min: number, max: number}>({min: 0, max: 1000});
  const [hasMatchedProducts, setHasMatchedProducts] = useState<boolean | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  
  // Get count of products for a supplier - moved up to avoid circular reference
  const getProductCount = (supplierId: string): number => {
    return supplierProducts.filter(sp => sp.supplier_id === supplierId).length;
  };
  
  // Get product count range for all suppliers
  const productCountStats = useMemo(() => {
    if (suppliers.length === 0) return { min: 0, max: 100 };
    
    const counts = suppliers.map(s => getProductCount(s.id));
    return {
      min: 0,
      max: Math.max(...counts, 10) // Ensure at least 10 for the slider
    };
  }, [suppliers, supplierProducts]);

  // Init product count filter with stats
  useEffect(() => {
    setProductCountFilter(productCountStats);
  }, [productCountStats]);
  
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
  
  const openAddModal = () => {
    setCurrentSupplier(null);
    setIsModalOpen(true);
  };
  
  const openEditModal = (supplier: Supplier) => {
    setCurrentSupplier(supplier);
    setIsModalOpen(true);
  };
  
  const closeModal = () => {
    setIsModalOpen(false);
  };
  
  const handleDelete = async (supplier: Supplier) => {
    // Check if supplier has associated products
    const productCount = getProductCount(supplier.id);
    if (productCount > 0) {
      setDeleteError(`Cannot delete "${supplier.name}" because it has ${productCount} associated products.`);
      return;
    }
    
    try {
      setIsDeleting(true);
      await deleteSupplier(supplier.id);
      setDeleteError(null);
    } catch (error) {
      console.error('Error deleting supplier:', error);
      setDeleteError('Failed to delete supplier. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };
  
  // Clear error after 5 seconds
  useEffect(() => {
    if (deleteError) {
      const timer = setTimeout(() => {
        setDeleteError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [deleteError]);
  
  // Calculate supplier statistics
  const getSupplierStats = (supplierId: string): SupplierStats => {
    return {
      productCount: getProductCount(supplierId),
      avgCost: calculateAverageCost(supplierId),
      bestValueCount: calculateBestValueCount(supplierId)
    };
  };
  
  // Calculate average cost for a supplier's products
  const calculateAverageCost = (supplierId: string): number => {
    const supplierProductsList = supplierProducts.filter(sp => 
      sp.supplier_id === supplierId
    );
    
    if (supplierProductsList.length === 0) return 0;
    
    const totalCost = supplierProductsList.reduce((sum, sp) => sum + sp.cost, 0);
    return totalCost / supplierProductsList.length;
  };
  
  // Calculate how many times this supplier offers the best value (lowest cost)
  const calculateBestValueCount = (supplierId: string): number => {
    let bestValueCount = 0;
    
    // Group supplier products by product_id to compare costs
    const productGroups = new Map<string, typeof supplierProducts>();
    
    supplierProducts.forEach(sp => {
      if (sp.product_id) {  // Only include products with valid product_id
        if (!productGroups.has(sp.product_id)) {
          productGroups.set(sp.product_id, []);
        }
        const group = productGroups.get(sp.product_id);
        if (group) {
          group.push(sp);
        }
      }
    });
    
    // Count products where this supplier has the lowest cost
    productGroups.forEach((group) => {
      if (group.length > 0) {
        const lowestCostSupplier = group.reduce((lowest, current) => 
          current.cost < lowest.cost ? current : lowest
        );
        
        if (lowestCostSupplier.supplier_id === supplierId) {
          bestValueCount++;
        }
      }
    });
    
    return bestValueCount;
  };

  // Check if supplier has matched products
  const hasMatches = (supplierId: string): boolean => {
    return supplierProducts.some(sp => 
      sp.supplier_id === supplierId && sp.product_id !== null
    );
  };
  
  // Filter suppliers based on search and filters
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(supplier => {
      // Search filter
      const matchesSearch = supplier.name.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Product count filter
      const stats = getSupplierStats(supplier.id);
      const matchesProductCount = 
        stats.productCount >= productCountFilter.min && 
        stats.productCount <= productCountFilter.max;
      
      // Matched products filter
      const matchesHasMatched = hasMatchedProducts === null ? true : 
        hasMatchedProducts ? hasMatches(supplier.id) : !hasMatches(supplier.id);
      
      return matchesSearch && matchesProductCount && matchesHasMatched;
    });
  }, [suppliers, searchTerm, productCountFilter, hasMatchedProducts, supplierProducts]);

  // Apply sorting
  const sortedSuppliers = useMemo(() => {
    if (!sortField) return filteredSuppliers;

    return [...filteredSuppliers].sort((a, b) => {
      let comparison = 0;
      const statsA = getSupplierStats(a.id);
      const statsB = getSupplierStats(b.id);

      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'products':
          comparison = statsA.productCount - statsB.productCount;
          break;
        case 'cost':
          comparison = statsA.avgCost - statsB.avgCost;
          break;
        case 'bestValue':
          comparison = statsA.bestValueCount - statsB.bestValueCount;
          break;
        default:
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredSuppliers, sortField, sortOrder]);
  
  // Apply pagination
  const totalPages = Math.ceil(sortedSuppliers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedSuppliers = sortedSuppliers.slice(startIndex, startIndex + itemsPerPage);
  
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
    setProductCountFilter(productCountStats);
    setHasMatchedProducts(null);
    setSortField('');
    setSortOrder('asc');
    setCurrentPage(1);
  };
  
  const getActiveFilterCount = () => {
    let count = 0;
    if (searchTerm) count++;
    if (productCountFilter.min !== productCountStats.min || productCountFilter.max !== productCountStats.max) count++;
    if (hasMatchedProducts !== null) count++;
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
          <h3 className="text-xl font-semibold mb-2">Loading suppliers</h3>
          <div className="text-gray-500 max-w-md text-center">
            <p>Please wait while we load your supplier data...</p>
          </div>
        </div>
      );
    }
    
    // If no suppliers after initial load, show empty state
    if (suppliers.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <Package className="w-12 h-12 text-gray-400 mb-4" />
          <h3 className="text-xl font-semibold mb-2">No suppliers found</h3>
          <p className="text-gray-500">Add your first supplier to get started</p>
          <Button 
            variant="primary" 
            className="mt-4 flex items-center"
            onClick={openAddModal}
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Add Supplier
          </Button>
        </div>
      );
    }
    
    // If filtering results in no suppliers
    if (filteredSuppliers.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <Filter className="w-12 h-12 text-gray-400 mb-4" />
          <h3 className="text-xl font-semibold mb-2">No suppliers match your filters</h3>
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
    if (loading && !initialLoading && suppliers.length > 0) {
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

  return (
    <div className="container mx-auto px-4 py-6">
      <Card>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Suppliers</h1>
          <div className="flex space-x-2">
            <Button 
              onClick={openAddModal}
              className="flex items-center"
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              Add Supplier
            </Button>
            <Button 
              variant="secondary" 
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center"
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

        {/* Error display */}
        {deleteError && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded mb-4">
            {deleteError}
          </div>
        )}

        {/* Search and filter controls */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <form onSubmit={handleSearch} className="flex w-full md:w-auto">
              <input
                type="text"
                placeholder="Search suppliers..."
                className="border pl-3 pr-3 py-2 rounded w-full md:w-64"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Button type="submit" className="ml-2">
                <Search className="w-4 h-4 mr-2" />
                Search
              </Button>
            </form>
            
            <Button 
              variant={showFilters ? "primary" : "secondary"}
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center"
            >
              <Filter className="w-4 h-4 mr-2" />
              {showFilters ? "Hide Filters" : "Show Filters"}
            </Button>
          </div>
          
          {/* Filter controls */}
          {showFilters && (
            <div className="bg-gray-50 p-4 rounded border mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Product Count Range ({productCountFilter.min} - {productCountFilter.max})
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={productCountStats.min}
                      max={productCountStats.max}
                      value={productCountFilter.min}
                      onChange={(e) => setProductCountFilter({...productCountFilter, min: Number(e.target.value)})}
                      className="w-full"
                    />
                    <input
                      type="range"
                      min={productCountStats.min}
                      max={productCountStats.max}
                      value={productCountFilter.max}
                      onChange={(e) => setProductCountFilter({...productCountFilter, max: Number(e.target.value)})}
                      className="w-full"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Matching Status</label>
                  <div className="flex flex-col gap-1">
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        checked={hasMatchedProducts === null}
                        onChange={() => setHasMatchedProducts(null)}
                        className="mr-2"
                      />
                      <span className="text-sm">All Suppliers</span>
                    </label>
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        checked={hasMatchedProducts === true}
                        onChange={() => setHasMatchedProducts(true)}
                        className="mr-2"
                      />
                      <span className="text-sm">With Matched Products</span>
                    </label>
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        checked={hasMatchedProducts === false}
                        onChange={() => setHasMatchedProducts(false)}
                        className="mr-2"
                      />
                      <span className="text-sm">Without Matched Products</span>
                    </label>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200">
                <div className="text-sm font-medium">Sort By:</div>
                <div className="flex gap-2 flex-wrap">
                  <Button 
                    variant={sortField === 'name' ? 'primary' : 'secondary'} 
                    className="flex items-center text-xs px-2 py-1"
                    onClick={() => handleSort('name')}
                  >
                    <ArrowDownAZ className="w-3 h-3 mr-1" /> 
                    Name
                    {sortField === 'name' && <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                  </Button>
                  <Button 
                    variant={sortField === 'products' ? 'primary' : 'secondary'} 
                    className="flex items-center text-xs px-2 py-1"
                    onClick={() => handleSort('products')}
                  >
                    <Package className="w-3 h-3 mr-1" /> 
                    Products
                    {sortField === 'products' && <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                  </Button>
                  <Button 
                    variant={sortField === 'cost' ? 'primary' : 'secondary'} 
                    className="flex items-center text-xs px-2 py-1"
                    onClick={() => handleSort('cost')}
                  >
                    <DollarSign className="w-3 h-3 mr-1" /> 
                    Avg. Cost
                    {sortField === 'cost' && <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                  </Button>
                  <Button 
                    variant={sortField === 'bestValue' ? 'primary' : 'secondary'} 
                    className="flex items-center text-xs px-2 py-1"
                    onClick={() => handleSort('bestValue')}
                  >
                    <ShoppingCart className="w-3 h-3 mr-1" /> 
                    Best Value
                    {sortField === 'bestValue' && <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                  </Button>
                  
                  {getActiveFilterCount() > 0 && (
                    <Button 
                      variant="secondary" 
                      className="flex items-center text-xs px-2 py-1 border-red-300 text-red-700"
                      onClick={handleClearFilters}
                    >
                      <X className="w-3 h-3 mr-1" /> Clear All
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Loading states */}
        {renderLoadingState()}
        
        {/* Supplier table */}
        {!initialLoading && filteredSuppliers.length > 0 && (
          <>
            <Table
              headers={['Name', 'Products', 'Avg. Cost', 'Best Value', 'Actions']}
            >
              {paginatedSuppliers.map(supplier => {
                const stats = getSupplierStats(supplier.id);
                return (
                  <tr key={supplier.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-4 font-medium">
                      <Link to={`/suppliers/${supplier.id}`} className="hover:text-blue-600 hover:underline">
                        {supplier.name}
                      </Link>
                    </td>
                    <td className="px-4 py-4">{stats.productCount}</td>
                    <td className="px-4 py-4">${stats.avgCost.toFixed(2)}</td>
                    <td className="px-4 py-4">{stats.bestValueCount}</td>
                    <td className="px-4 py-4 text-right space-x-2">
                      <Link to={`/suppliers/${supplier.id}`}>
                        <Button variant="secondary" className="text-blue-600 text-sm">
                          <Eye className="w-4 h-4 mr-1" /> View
                        </Button>
                      </Link>
                      <Button 
                        variant="secondary" 
                        className="text-amber-600 text-sm"
                        onClick={() => openEditModal(supplier)}
                      >
                        <Edit className="w-4 h-4 mr-1" /> Edit
                      </Button>
                      <Button 
                        variant="secondary" 
                        className="text-red-600 text-sm"
                        onClick={() => handleDelete(supplier)}
                        disabled={isDeleting || getProductCount(supplier.id) > 0}
                      >
                        <Trash2 className="w-4 h-4 mr-1" /> Delete
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </Table>
            
            {/* Background loading indicator */}
            {renderBottomLoadingIndicator()}
            
            {/* Pagination */}
            <div className="flex justify-between items-center mt-4">
              <div className="text-sm text-gray-500">
                Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredSuppliers.length)} of {filteredSuppliers.length} suppliers
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
      
      {/* Supplier modal */}
      {isModalOpen && (
        <SupplierModal
          supplier={currentSupplier}
          onClose={closeModal}
          isOpen={isModalOpen}
        />
      )}
    </div>
  );
};

export default Suppliers; 