import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, ExternalLink, Link, Info } from 'lucide-react';
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

const SupplierProducts: React.FC<SupplierProductsProps> = ({ supplierId }) => {
  const navigate = useNavigate();
  const { supplierProducts, products } = useAppContext();
  const [filterOption, setFilterOption] = useState<FilterOption>('all');
  const [selectedUnmatchedProduct, setSelectedUnmatchedProduct] = useState<string | null>(null);

  // Get all supplier products
  const allSupplierProducts = useMemo(() => {
    return supplierProducts.filter(sp => sp.supplier_id === supplierId);
  }, [supplierProducts, supplierId]);

  // Apply filtering based on matched/unmatched status
  const filteredProducts = useMemo(() => {
    if (filterOption === 'matched') {
      return allSupplierProducts.filter(sp => sp.product_id !== null);
    } else if (filterOption === 'unmatched') {
      return allSupplierProducts.filter(sp => sp.product_id === null);
    }
    return allSupplierProducts;
  }, [allSupplierProducts, filterOption]);

  // Get product details for matched products
  const productsWithDetails = useMemo(() => {
    return filteredProducts.map(sp => {
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
        mpn: sp.mpn || '-',
        profitPerUnit: 0,
        profitMargin: 0
      };
    });
  }, [filteredProducts, products]);

  const matchStats = useMemo(() => {
    const total = allSupplierProducts.length;
    const matched = allSupplierProducts.filter(sp => sp.product_id !== null).length;
    const unmatched = total - matched;
    
    return { total, matched, unmatched };
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

  return (
    <Card>
      <div className="flex justify-between items-center mb-4">
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
      
      {productsWithDetails.length === 0 ? (
        <EmptyState
          message={`No ${filterOption} products found for this supplier`}
          suggestion={
            filterOption === 'matched' 
              ? "This supplier doesn't have any matched products. Try importing products or manually associating them."
              : filterOption === 'unmatched'
                ? "All products for this supplier have been matched."
                : "Add products through product import or manually associate products with this supplier."
          }
        />
      ) : (
        <Table headers={tableHeaders}>
          {productsWithDetails.map((item: any) => (
            <React.Fragment key={item.id}>
              <tr className={`border-t ${selectedUnmatchedProduct === item.id ? 'bg-blue-50' : ''}`}>
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
                        <p className="text-xs text-blue-600">
                          This product is not yet matched to an existing product in your database.
                        </p>
                        <Button
                          variant="secondary"
                          className="text-xs py-1 px-2 bg-white border-blue-200 text-blue-700 hover:bg-blue-50"
                          onClick={() => handleViewUnmatchedProduct(item.id)}
                        >
                          Close
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