import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PlusCircle, Search, RefreshCcw, Trash2, Eye, Edit, Filter, X, ArrowDownAZ, DollarSign, Package, ShoppingCart } from 'lucide-react';
import { useAppContext, Supplier } from '../../context/AppContext';
import Table from '../../components/UI/Table';
import Button from '../../components/UI/Button';
import Card from '../../components/UI/Card';
import LoadingOverlay from '../../components/UI/LoadingOverlay';
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
  const { suppliers, supplierProducts, loading, refreshData, deleteSupplier } = useAppContext();
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
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
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (searchTerm) count++;
    if (productCountFilter.min > productCountStats.min || productCountFilter.max < productCountStats.max) count++;
    if (hasMatchedProducts !== null) count++;
    if (sortField) count++;
    return count;
  };
  
  if (loading || isRefreshing || isDeleting) {
    return (
      <LoadingOverlay 
        message={
          isDeleting 
            ? "Deleting supplier..." 
            : isRefreshing 
              ? "Refreshing supplier data..." 
              : "Loading suppliers..."
        } 
      />
    );
  }
  
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Suppliers ({suppliers.length})</h1>
        <div className="flex space-x-2">
          <Button 
            onClick={handleRefresh}
            variant="secondary"
            className="flex items-center text-sm"
          >
            <RefreshCcw size={14} className="mr-1.5" />
            Refresh
          </Button>
          <Button 
            onClick={openAddModal}
            className="flex items-center text-sm"
          >
            <PlusCircle size={14} className="mr-1.5" />
            Add Supplier
          </Button>
        </div>
      </div>
      
      {deleteError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {deleteError}
        </div>
      )}
      
      <Card className="mb-4">
        {/* Search and filter toggle row */}
        <div className="flex justify-between items-center mb-2">
          <form onSubmit={handleSearch} className="flex w-full md:w-auto relative">
            <input
              type="text"
              placeholder="Search suppliers by name..."
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
              <span className="font-medium">{filteredSuppliers.length}</span>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Match Status</label>
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
                  variant={sortField === 'products' ? 'primary' : 'secondary'} 
                  className="flex items-center text-xs px-2 py-1"
                  onClick={() => handleSort('products')}
                >
                  <Package size={14} className="mr-1" /> 
                  Products
                  {sortField === 'products' && <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                </Button>
                <Button 
                  variant={sortField === 'cost' ? 'primary' : 'secondary'} 
                  className="flex items-center text-xs px-2 py-1"
                  onClick={() => handleSort('cost')}
                >
                  <DollarSign size={14} className="mr-1" /> 
                  Avg. Cost
                  {sortField === 'cost' && <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                </Button>
                <Button 
                  variant={sortField === 'bestValue' ? 'primary' : 'secondary'} 
                  className="flex items-center text-xs px-2 py-1"
                  onClick={() => handleSort('bestValue')}
                >
                  <ShoppingCart size={14} className="mr-1" /> 
                  Best Value
                  {sortField === 'bestValue' && <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
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
        
        {suppliers.length === 0 ? (
          <EmptyState
            message="No suppliers found"
            suggestion="Add a supplier or import supplier data to get started."
          />
        ) : filteredSuppliers.length === 0 ? (
          <div className="text-center py-8 text-gray-500 bg-gray-50 rounded">
            <div className="font-medium mb-1">No suppliers found matching your criteria</div>
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
          <Table
            headers={[
              'Supplier Name',
              'Products',
              'Avg. Cost',
              'Best Value Count',
              'Actions'
            ]}
          >
            {sortedSuppliers.map(supplier => {
              const stats = getSupplierStats(supplier.id);
              const hasMatchedStatus = hasMatches(supplier.id);
              
              return (
                <tr key={supplier.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center">
                      <Link 
                        to={`/suppliers/${supplier.id}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {supplier.name}
                      </Link>
                      {hasMatchedStatus && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          Matched
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{stats.productCount}</span>
                  </td>
                  <td className="px-4 py-3">${stats.avgCost.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center">
                      <span className="font-medium">{stats.bestValueCount}</span>
                      {stats.bestValueCount > 0 && (
                        <span className="ml-1 text-xs text-green-600">
                          ({((stats.bestValueCount / stats.productCount) * 100).toFixed(0)}%)
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex space-x-3">
                      <Link 
                        to={`/suppliers/${supplier.id}`}
                        className="text-blue-600 hover:text-blue-800"
                        title="View supplier details"
                      >
                        <Eye size={16} />
                      </Link>
                      <button
                        className="text-blue-600 hover:text-blue-800"
                        onClick={() => openEditModal(supplier)}
                        title="Edit supplier"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800"
                        onClick={() => handleDelete(supplier)}
                        disabled={getProductCount(supplier.id) > 0}
                        title={
                          getProductCount(supplier.id) > 0
                            ? "Cannot delete supplier with associated products"
                            : "Delete supplier"
                        }
                      >
                        <Trash2 size={16} className={getProductCount(supplier.id) > 0 ? "opacity-30" : ""} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      
      {isModalOpen && (
        <SupplierModal
          isOpen={isModalOpen}
          onClose={closeModal}
          supplier={currentSupplier}
        />
      )}
    </div>
  );
};

export default Suppliers; 