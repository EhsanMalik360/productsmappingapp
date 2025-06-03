import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect, startTransition } from 'react';
import { Link } from 'react-router-dom';
import { PlusCircle, Search, RefreshCcw, Trash2, Eye, Edit, Filter, X, ArrowDownAZ, DollarSign, Package, ShoppingCart, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAppContext, Supplier } from '../../context/AppContext';
import Table from '../../components/UI/Table';
import Button from '../../components/UI/Button';
import Card from '../../components/UI/Card';
import SupplierModal from './SupplierModal';
import { supabase } from '../../lib/supabase';

// Add CSS for animations
import './Suppliers.css';

interface SupplierStats {
  productCount: number;
  avgCost: number;
  matchedCount: number;
}

type SortField = 'name' | 'products' | 'cost' | 'matched' | '';
type SortOrder = 'asc' | 'desc';

// Enhanced skeleton loader for supplier rows that looks more like real data
const SupplierRowSkeleton = () => (
  <tr className="border-t hover:bg-gray-50 animate-pulse transition-all duration-500 ease-in-out">
    <td className="px-4 py-4">
      <div className="h-5 bg-gray-200 rounded w-full max-w-[200px] transition-all duration-500"></div>
    </td>
    <td className="px-4 py-4">
      <div className="h-5 bg-gray-200 rounded w-8 transition-all duration-600"></div>
    </td>
    <td className="px-4 py-4">
      <div className="h-5 bg-gray-200 rounded w-16 transition-all duration-700"></div>
    </td>
    <td className="px-4 py-4">
      <div className="h-5 bg-gray-200 rounded w-10 transition-all duration-800"></div>
    </td>
    <td className="px-4 py-4 text-right space-x-2">
      <div className="flex justify-end space-x-2">
        <div className="h-8 bg-gray-200 rounded w-16 transition-all duration-500"></div>
        <div className="h-8 bg-gray-200 rounded w-16 transition-all duration-600"></div>
        <div className="h-8 bg-gray-200 rounded w-16 transition-all duration-700"></div>
      </div>
    </td>
  </tr>
);

const Suppliers: React.FC = () => {
  const { suppliers, supplierProducts, initialLoading, refreshData, deleteSupplier, fetchSupplierProducts } = useAppContext();
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
  const [supplierProductCounts, setSupplierProductCounts] = useState<{[key: string]: number}>({});
  const [supplierProductsData, setSupplierProductsData] = useState<{[key: string]: any}>({});
  const [isDataStable, setIsDataStable] = useState(false);
  const [, setLastRefreshed] = useState<Date | null>(null);
  
  // Table ref to maintain consistent height
  const tableRef = useRef<HTMLDivElement>(null);
  const [tableHeight, setTableHeight] = useState<number | null>(null);
  
  // Get count of products for a supplier - using the accurate counts from the server
  const getProductCount = useCallback((supplierId: string): number => {
    // If we have cached the accurate count, use it
    if (supplierProductCounts[supplierId] !== undefined) {
      return supplierProductCounts[supplierId];
    }
    // Otherwise fallback to client-side count immediately
    return supplierProducts.filter(sp => sp.supplier_id === supplierId).length;
  }, [supplierProducts, supplierProductCounts]);
  
  // Get supplier products data for accurate calculations
  const getSupplierProductsData = useCallback((supplierId: string): any => {
    // If we have fetched accurate statistics, use them
    if (supplierProductsData[supplierId]) {
      return supplierProductsData[supplierId];
    }
    // Otherwise fallback to client-side data
    const clientProducts = supplierProducts.filter(sp => sp.supplier_id === supplierId);
    return {
      totalCount: clientProducts.length,
      matchedCount: clientProducts.filter(sp => sp.product_id).length,
      avgCost: clientProducts.length > 0 
        ? clientProducts.reduce((sum, sp) => sum + (sp.cost || 0), 0) / clientProducts.length
        : 0
    };
  }, [supplierProducts, supplierProductsData]);
  
  // Load initial data with better stability control
  const loadInitialData = async () => {
    try {
      console.log('Starting initial data load...');
      setIsDataStable(false);
      
      // Set table height first to prevent layout shifts
      if (tableRef.current) {
        setTableHeight(Math.max(tableRef.current.clientHeight || 400, 600));
      }

      // First, ensure we have all suppliers data by refreshing from the server
      console.log('Refreshing data to ensure all suppliers are loaded...');
      await refreshData();

      // Wait a bit more for the context to be fully updated after refresh
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log(`After refresh, we have ${suppliers.length} suppliers in context`);

      // If we still don't have suppliers, there might be an issue
      if (suppliers.length === 0) {
        console.log('No suppliers available after refresh and wait, showing empty state');
        setIsDataStable(true);
        return;
      }

      console.log(`Loading accurate statistics for ${suppliers.length} suppliers...`);

      // Then, fetch all accurate data and wait for it to complete
      await fetchAccurateSupplierData();
      
      console.log('Accurate data fetched, marking as stable...');
      
      // Add a small delay to ensure smooth transition
      setTimeout(() => {
        setLastRefreshed(new Date());
        setIsDataStable(true);
        console.log(`Data is now stable and ready to display - Final count: ${suppliers.length} suppliers`);
      }, 300);
    } catch (error) {
      console.error('Error loading initial data:', error);
      // Even on error, mark as stable after a delay to show client-side data
      setTimeout(() => {
        setIsDataStable(true);
      }, 1000);
    }
  };

  // Load initial data when component mounts, but add a small delay to avoid race conditions
  useEffect(() => {
    const initTimer = setTimeout(() => {
      if (!isDataStable) {
        loadInitialData();
      }
    }, 100); // Small delay to let context initialize
    
    return () => clearTimeout(initTimer);
  }, []); // Empty dependency array to run only on mount

  // Don't trigger on suppliers.length changes to avoid race conditions
  // The initial effect will handle everything

  // Measure table height after initial render to prevent layout shifts
  useLayoutEffect(() => {
    if (tableRef.current && suppliers.length > 0 && tableHeight === null) {
      setTableHeight(Math.max(tableRef.current.offsetHeight, 600));
    }
  }, [suppliers, tableHeight]);
  
  // Fetch accurate statistics from the server for all suppliers using optimized aggregation queries
  const fetchAccurateSupplierData = useCallback(async () => {
    if (suppliers.length === 0) return;
    
    try {
      console.log(`Fetching accurate stats for ${suppliers.length} suppliers...`);
      
      // Create a batch request for all suppliers to get their statistics using efficient aggregation
      const fetchPromises = suppliers.map(async (supplier) => {
        try {
          // Get total count
          const { count: totalCount, error: countError } = await supabase
            .from('supplier_products')
            .select('*', { count: 'exact', head: true })
            .eq('supplier_id', supplier.id);
            
          if (countError) throw countError;
          
          // Get matched count
          const { count: matchedCount, error: matchedError } = await supabase
            .from('supplier_products')
            .select('*', { count: 'exact', head: true })
            .eq('supplier_id', supplier.id)
            .not('product_id', 'is', null);
            
          if (matchedError) throw matchedError;
          
          // Get average cost using a more efficient query
          const { data: avgData, error: avgError } = await supabase
            .from('supplier_products')
            .select('cost')
            .eq('supplier_id', supplier.id);
            
          if (avgError) throw avgError;
          
          const avgCost = avgData && avgData.length > 0 
            ? avgData.reduce((sum, item) => sum + (item.cost || 0), 0) / avgData.length
            : 0;
          
          return {
            id: supplier.id,
            totalCount: totalCount || 0,
            matchedCount: matchedCount || 0,
            avgCost: avgCost
          };
          
        } catch (error) {
          console.error(`Error fetching stats for supplier ${supplier.id}:`, error);
          // Return the client-side data as fallback
          const clientProducts = supplierProducts.filter(sp => sp.supplier_id === supplier.id);
          const clientMatched = clientProducts.filter(sp => sp.product_id).length;
          const clientAvgCost = clientProducts.length > 0 
            ? clientProducts.reduce((sum, sp) => sum + (sp.cost || 0), 0) / clientProducts.length
            : 0;
            
          return { 
            id: supplier.id, 
            totalCount: clientProducts.length,
            matchedCount: clientMatched,
            avgCost: clientAvgCost
          };
        }
      });
      
      // Wait for all fetches to complete
      const results = await Promise.all(fetchPromises);
      
      // Update statistics all at once to prevent flickering
      const newCounts: {[key: string]: number} = {};
      const newProductsData: {[key: string]: any} = {};
      
      results.forEach(result => {
        newCounts[result.id] = result.totalCount;
        newProductsData[result.id] = {
          totalCount: result.totalCount,
          matchedCount: result.matchedCount,
          avgCost: result.avgCost
        };
      });
      
      // Set all data at once to prevent flickering
      setSupplierProductCounts(newCounts);
      setSupplierProductsData(newProductsData);
      
      console.log('All supplier statistics updated successfully');
    } catch (error) {
      console.error('Error fetching supplier statistics:', error);
      // Fallback to client-side data
      const fallbackCounts: {[key: string]: number} = {};
      const fallbackData: {[key: string]: any} = {};
      
      suppliers.forEach(supplier => {
        const clientProducts = supplierProducts.filter(sp => sp.supplier_id === supplier.id);
        const matchedCount = clientProducts.filter(sp => sp.product_id).length;
        const avgCost = clientProducts.length > 0 
          ? clientProducts.reduce((sum, sp) => sum + (sp.cost || 0), 0) / clientProducts.length
          : 0;
          
        fallbackCounts[supplier.id] = clientProducts.length;
        fallbackData[supplier.id] = {
          totalCount: clientProducts.length,
          matchedCount: matchedCount,
          avgCost: avgCost
        };
      });
      
      setSupplierProductCounts(fallbackCounts);
      setSupplierProductsData(fallbackData);
    }
  }, [suppliers, supplierProducts]);
  
  // Get product count range for all suppliers - using accurate counts
  const productCountStats = useMemo(() => {
    if (suppliers.length === 0) return { min: 0, max: 100 };
    
    const counts = suppliers.map(s => getProductCount(s.id));
    return {
      min: 0,
      max: Math.max(...counts, 10) // Ensure at least 10 for the slider
    };
  }, [suppliers, getProductCount]);

  // Init product count filter with stats
  useEffect(() => {
    setProductCountFilter(productCountStats);
  }, [productCountStats]);
  
  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      setIsDataStable(false);
      await refreshData();
      // After data is refreshed, update the counts and mark as stable
      await fetchAccurateSupplierData();
      setLastRefreshed(new Date());
      
      // Small delay before marking as stable
      setTimeout(() => {
        setIsDataStable(true);
      }, 300);
    } catch (error) {
      console.error('Error refreshing data:', error);
      // Mark as stable even on error
      setTimeout(() => {
        setIsDataStable(true);
      }, 1000);
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
      matchedCount: calculateMatchedCount(supplierId)
    };
  };
  
  // Calculate average cost for a supplier's products - using pre-calculated statistics
  const calculateAverageCost = (supplierId: string): number => {
    const stats = getSupplierProductsData(supplierId);
    
    // If we have pre-calculated stats, use them
    if (typeof stats.avgCost === 'number') {
      return stats.avgCost;
    }
    
    // Otherwise fall back to client-side calculation
    const supplierProductsList = supplierProducts.filter(sp => sp.supplier_id === supplierId);
    if (supplierProductsList.length === 0) return 0;
    
    const totalCost = supplierProductsList.reduce((sum, sp) => sum + (sp.cost || 0), 0);
    return totalCost / supplierProductsList.length;
  };
  
  // Calculate how many products are matched - using pre-calculated statistics
  const calculateMatchedCount = (supplierId: string): number => {
    const stats = getSupplierProductsData(supplierId);
    
    // If we have pre-calculated stats, use them
    if (typeof stats.matchedCount === 'number') {
      return stats.matchedCount;
    }
    
    // Otherwise fall back to client-side calculation
    return supplierProducts.filter(sp => sp.supplier_id === supplierId && sp.product_id).length;
  };

  // Check if supplier has matched products - using accurate data
  const hasMatches = (supplierId: string): boolean => {
    // Use accurate matched count if available
    const stats = getSupplierProductsData(supplierId);
    if (typeof stats.matchedCount === 'number') {
      return stats.matchedCount > 0;
    }
    
    // Fallback to client-side data
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
  }, [suppliers, searchTerm, productCountFilter, hasMatchedProducts, supplierProductsData, getSupplierStats, hasMatches]);

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
        case 'matched':
          comparison = statsA.matchedCount - statsB.matchedCount;
          break;
        default:
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredSuppliers, sortField, sortOrder, getSupplierStats]);
  
  // Apply pagination
  const totalPages = Math.ceil(sortedSuppliers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedSuppliers = sortedSuppliers.slice(startIndex, startIndex + itemsPerPage);
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(() => {
      setCurrentPage(1); // Reset to first page on search
    });
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
  
  const handleClearFilters = () => {
    startTransition(() => {
      setSearchTerm('');
      setProductCountFilter(productCountStats);
      setHasMatchedProducts(null);
      setSortField('');
      setSortOrder('asc');
      setCurrentPage(1);
    });
  };
  
  const getActiveFilterCount = () => {
    let count = 0;
    if (searchTerm) count++;
    if (productCountFilter.min !== productCountStats.min || productCountFilter.max !== productCountStats.max) count++;
    if (hasMatchedProducts !== null) count++;
    if (sortField) count++;
    return count;
  };

  const changePage = (page: number) => {
    if (page > 0 && page <= totalPages) {
      startTransition(() => {
        setCurrentPage(page);
      });
    }
  };

  const handleItemsPerPageChange = (value: number) => {
    startTransition(() => {
      setItemsPerPage(value);
      setCurrentPage(1); // Reset to first page when changing items per page
    });
  };
  
  // Render supplier rows - only show real data when stable
  const renderSupplierRows = () => {
    // Only show real suppliers when data is stable
    if (isDataStable && sortedSuppliers && sortedSuppliers.length > 0) {
      return paginatedSuppliers.map(supplier => {
        const stats = getSupplierStats(supplier.id);
        return (
          <tr key={supplier.id} className="border-t hover:bg-gray-50 transition-all duration-300 ease-in-out animate-fadeIn">
            <td className="px-4 py-4 font-medium">
              <Link to={`/suppliers/${supplier.id}`} className="hover:text-blue-600 hover:underline transition-colors duration-200">
                {supplier.name}
              </Link>
            </td>
            <td className="px-4 py-4">
              <span className="transition-all duration-500 ease-in-out opacity-100">
                {stats.productCount}
              </span>
            </td>
            <td className="px-4 py-4">
              <span className="transition-all duration-500 ease-in-out opacity-100">
                ${stats.avgCost.toFixed(2)}
              </span>
            </td>
            <td className="px-4 py-4">
              <span className="transition-all duration-500 ease-in-out opacity-100">
                {stats.matchedCount}
              </span>
            </td>
            <td className="px-4 py-4 text-right space-x-2">
              <Link to={`/suppliers/${supplier.id}`}>
                <Button variant="secondary" className="text-blue-600 text-sm transition-all duration-200 hover:bg-blue-50">
                  <Eye className="w-4 h-4 mr-1" /> View
                </Button>
              </Link>
              <Button 
                variant="secondary" 
                className="text-amber-600 text-sm transition-all duration-200 hover:bg-amber-50"
                onClick={() => openEditModal(supplier)}
              >
                <Edit className="w-4 h-4 mr-1" /> Edit
              </Button>
              <Button 
                variant="secondary" 
                className="text-red-600 text-sm transition-all duration-200 hover:bg-red-50"
                onClick={() => handleDelete(supplier)}
                disabled={isDeleting || stats.productCount > 0}
              >
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
            </td>
          </tr>
        );
      });
    }
    
    // Show skeleton loaders until data is stable
    const skeletonCount = Math.max(10, itemsPerPage);
    
    return Array(skeletonCount).fill(0).map((_, index) => (
      <SupplierRowSkeleton key={index} />
    ));
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <Card>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Suppliers</h1>
          <div className="flex space-x-2">
            <Button 
              onClick={openAddModal}
              className="flex items-center transition-all duration-200 hover:bg-blue-600 active:bg-blue-700"
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              Add Supplier
            </Button>
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

        {/* Error display */}
        {deleteError && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded mb-4 transition-all duration-300 ease-in-out">
            {deleteError}
          </div>
        )}

        {/* Search and filter controls with improved styling */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <form onSubmit={handleSearch} className="flex w-full md:w-auto relative">
              <input
                type="text"
                placeholder="Search suppliers by name..."
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
                <div className="min-w-[2rem] h-5 flex items-center">
                  {isDataStable ? (
                    <span className="font-medium transition-all duration-300 ease-in-out opacity-100">{filteredSuppliers.length}</span>
                  ) : (
                    <div className="w-8 h-4 bg-gray-100 animate-pulse rounded transition-all duration-300 ease-in-out"></div>
                  )}
                </div>
                <div className="min-h-[1.25rem] flex items-center">
                  {getActiveFilterCount() > 0 && isDataStable && (
                    <span className="ml-1 text-blue-600 transition-all duration-300 ease-in-out animate-fadeIn">({getActiveFilterCount()} filter{getActiveFilterCount() !== 1 ? 's' : ''})</span>
                  )}
                </div>
              </div>
              <div className="min-h-[2.5rem] flex items-center">
                <Button 
                  variant={showFilters ? "primary" : "secondary"}
                  className={`transition-all duration-300 ${showFilters ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-100'} flex items-center`}
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="w-4 h-4 mr-2" /> 
                  Filters {getActiveFilterCount() > 0 && isDataStable && `(${getActiveFilterCount()})`}
                </Button>
              </div>
            </div>
          </div>
          
          {/* Expanded filters section with smoother animation */}
          {showFilters && (
            <div className="p-3 bg-gray-50 rounded-md mb-3 border border-gray-200 animate-slideDown">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Matching Status</label>
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
                    variant={sortField === 'matched' ? 'primary' : 'secondary'} 
                    className="flex items-center text-xs px-2 py-1"
                    onClick={() => handleSort('matched')}
                  >
                    <ShoppingCart className="w-3 h-3 mr-1" /> 
                    Matched
                    {sortField === 'matched' && <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                  </Button>
                  
                  {getActiveFilterCount() > 0 && (
                    <Button 
                      variant="secondary" 
                      className="flex items-center text-xs px-2 py-1 ml-2 border-red-300 text-red-700 hover:bg-red-50"
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
        
        {/* Empty state for when there are no suppliers at all */}
        {isDataStable && suppliers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 animate-fadeIn">
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
        )}

        {/* Empty state for filtered results */}
        {isDataStable && suppliers.length > 0 && filteredSuppliers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 animate-fadeIn">
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
        )}

        {/* Table container with guaranteed height and stability */}
        <div 
          ref={tableRef} 
          className="overflow-x-auto relative"
          style={{ 
            minHeight: tableHeight ? `${tableHeight}px` : '600px',
            transition: 'min-height 300ms ease-in-out'
          }}
        >
          {/* Always render table to maintain consistent layout */}
          <Table
            headers={['Name', 'Products', 'Avg. Cost', 'Matched Products', 'Actions']}
            columnWidths={[
              '25%', // Name - larger for supplier names
              '15%', // Products
              '15%', // Avg. Cost
              '15%', // Matched Products
              '30%'  // Actions
            ]}
          >
            {renderSupplierRows()}
          </Table>
            
          {/* Pagination controls - only show when data is stable */}
          <div className="flex justify-between items-center mt-4">
            <div className="text-sm text-gray-500 min-h-[1.25rem]">
              {isDataStable ? (
                <span className="transition-all duration-500 ease-in-out opacity-100">
                  Showing {paginatedSuppliers.length > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + itemsPerPage, filteredSuppliers.length)} of {filteredSuppliers.length} suppliers
                </span>
              ) : (
                <div className="h-5 bg-gray-100 animate-pulse rounded w-48 transition-all duration-500 ease-in-out"></div>
              )}
            </div>
            <div className="flex items-center space-x-1">
              <Button
                variant="secondary"
                onClick={() => changePage(currentPage - 1)}
                disabled={currentPage === 1 || !isDataStable}
                className="p-1 transition-all duration-200 hover:bg-gray-100"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="px-2">
                {isDataStable ? (
                  <span>Page {currentPage} of {totalPages || 1}</span>
                ) : (
                  <div className="h-5 bg-gray-100 animate-pulse rounded w-24 mx-2"></div>
                )}
              </span>
              <Button
                variant="secondary"
                onClick={() => changePage(currentPage + 1)}
                disabled={!isDataStable || currentPage >= totalPages}
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