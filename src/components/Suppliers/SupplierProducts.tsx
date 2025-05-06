import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, ExternalLink, Link, Info, Search, Filter, X, ArrowDownAZ, DollarSign, TrendingUp, Tag } from 'lucide-react';
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
  const { supplierProducts, products } = useAppContext();
  const [filterOption, setFilterOption] = useState<FilterOption>('all');
  const [selectedUnmatchedProduct, setSelectedUnmatchedProduct] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<SortField>('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [costRange, setCostRange] = useState<{min: number, max: number}>({min: 0, max: 1000});
  const [matchMethodFilter, setMatchMethodFilter] = useState<string | null>(null);

  // Get all supplier products
  const allSupplierProducts = useMemo(() => {
    return supplierProducts.filter(sp => sp.supplier_id === supplierId);
  }, [supplierProducts, supplierId]);
  
  // Get cost range for all products
  const costStats = useMemo(() => {
    if (allSupplierProducts.length === 0) return { min: 0, max: 100 };
    
    const costs = allSupplierProducts.map(p => p.cost);
    return {
      min: Math.floor(Math.min(...costs)),
      max: Math.ceil(Math.max(...costs, 10)) // Ensure at least 10 for the slider
    };
  }, [allSupplierProducts]);

  // Initialize cost filter with full range
  useState(() => {
    setCostRange(costStats);
  });

  // Apply filtering based on matched/unmatched status
  const filteredByMatchStatus = useMemo(() => {
    if (filterOption === 'matched') {
      return allSupplierProducts.filter(sp => sp.product_id !== null);
    } else if (filterOption === 'unmatched') {
      return allSupplierProducts.filter(sp => sp.product_id === null);
    }
    return allSupplierProducts;
  }, [allSupplierProducts, filterOption]);

  // Get product details for all filtered products
  const productsWithDetails = useMemo(() => {
    // Log supplier products to help debug
    console.log(`Processing ${filteredByMatchStatus.length} supplier products for display`);
    
    // Count matches by method for debugging
    type MatchMethod = 'ean' | 'mpn' | 'name' | 'none';
    const matchCounts: Record<MatchMethod, number> = {
      ean: 0,
      mpn: 0,
      name: 0,
      none: 0
    };
    
    filteredByMatchStatus.forEach(sp => {
      // Type assertion to make TypeScript happy
      const method = (sp.match_method || 'none') as MatchMethod;
      matchCounts[method] = (matchCounts[method] || 0) + 1;
      
      // Log MPN matches for debugging
      if (method === 'mpn') {
        console.log(`Found MPN match: ${sp.mpn} for product_id: ${sp.product_id}`);
      }
    });
    
    console.log('Match method counts:', matchCounts);
    
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
  }, [filteredByMatchStatus, products]);

  // Apply additional filters and search
  const filteredProducts = useMemo(() => {
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
  }, [productsWithDetails, searchTerm, costRange, matchMethodFilter]);

  // Apply sorting
  const sortedProducts = useMemo(() => {
    if (!sortField) return filteredProducts;

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
  }, [filteredProducts, sortField, sortOrder]);

  const matchStats = useMemo(() => {
    const total = allSupplierProducts.length;
    const matched = allSupplierProducts.filter(sp => sp.product_id !== null).length;
    const unmatched = total - matched;
    
    return { total, matched, unmatched };
  }, [allSupplierProducts]);

  // Get unique match methods for filtering
  const matchMethods = useMemo(() => {
    const methods = new Set(allSupplierProducts.map(sp => sp.match_method));
    return Array.from(methods).filter(Boolean) as string[];
  }, [allSupplierProducts]);

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
    setMatchMethodFilter(null);
    setCostRange(costStats);
    setSortField('');
    setSortOrder('asc');
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (searchTerm) count++;
    if (costRange.min > costStats.min || costRange.max < costStats.max) count++;
    if (matchMethodFilter !== null) count++;
    if (sortField) count++;
    return count;
  };

  return (
    <Card>
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold">Products from this Supplier</h3>
        <div className="flex space-x-2">
          <Button 
            variant={filterOption === 'all' ? 'primary' : 'secondary'} 
            onClick={() => setFilterOption('all')}
            className="text-sm"
          >
            All ({matchStats.total})
          </Button>
          <Button 
            variant={filterOption === 'matched' ? 'primary' : 'secondary'} 
            onClick={() => setFilterOption('matched')}
            className="text-sm"
          >
            Matched ({matchStats.matched})
          </Button>
          <Button 
            variant={filterOption === 'unmatched' ? 'primary' : 'secondary'} 
            onClick={() => setFilterOption('unmatched')}
            className="text-sm"
          >
            Unmatched ({matchStats.unmatched})
          </Button>
        </div>
      </div>
      
      {/* Search and filter toggle row */}
      <div className="flex justify-between items-center mb-3">
        <form onSubmit={handleSearch} className="flex w-full md:w-auto relative">
          <input
            type="text"
            placeholder="Search by name, EAN, or MPN..."
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
        </form>
        
        <div className="flex items-center">
          <div className="flex items-center mr-2 text-sm">
            <span className="text-gray-600 mr-1">Found:</span>
            <span className="font-medium">{sortedProducts.length}</span>
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
                Cost Range (${costRange.min} - ${costRange.max})
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={costStats.min}
                  max={costStats.max}
                  value={costRange.min}
                  onChange={(e) => setCostRange({...costRange, min: Number(e.target.value)})}
                  className="w-full"
                />
                <input
                  type="range"
                  min={costStats.min}
                  max={costStats.max}
                  value={costRange.max}
                  onChange={(e) => setCostRange({...costRange, max: Number(e.target.value)})}
                  className="w-full"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Match Method</label>
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  variant={matchMethodFilter === null ? 'primary' : 'secondary'} 
                  className="text-xs py-1"
                  onClick={() => setMatchMethodFilter(null)}
                >
                  All Methods
                </Button>
                {matchMethods.map(method => (
                  <Button 
                    key={method}
                    variant={matchMethodFilter === method ? 'primary' : 'secondary'} 
                    className="text-xs py-1"
                    onClick={() => setMatchMethodFilter(method)}
                  >
                    {method.charAt(0).toUpperCase() + method.slice(1)} Match
                  </Button>
                ))}
                {filterOption === 'unmatched' && (
                  <Button 
                    variant={matchMethodFilter === 'none' ? 'primary' : 'secondary'} 
                    className="text-xs py-1"
                    onClick={() => setMatchMethodFilter('none')}
                  >
                    No Match
                  </Button>
                )}
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
        </div>
      )}
      
      {sortedProducts.length === 0 ? (
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
        <Table headers={tableHeaders}>
          {sortedProducts.map((item: any) => (
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
      )}
    </Card>
  );
};

export default SupplierProducts; 