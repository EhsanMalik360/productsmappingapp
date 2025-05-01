import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCcw, Edit, Package } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import Table from '../../components/UI/Table';
import LoadingOverlay from '../../components/UI/LoadingOverlay';
import EmptyState from '../../components/Dashboard/EmptyState';
import SupplierModal from './SupplierModal';

const SupplierDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { 
    suppliers, 
    supplierProducts, 
    products, 
    loading, 
    refreshData,
    getEntityAttributes,
    setAttributeValue
  } = useAppContext();
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const supplier = suppliers.find(s => s.id === id);
  
  // Get supplier products
  const supplierProductsList = supplierProducts.filter(sp => sp.supplier_id === id);
  
  // Join with product data
  const productsWithDetails = supplierProductsList.map(sp => {
    const product = products.find(p => p.id === sp.product_id);
    if (!product) return null;
    
    const profitPerUnit = product.salePrice - product.amazonFee - sp.cost;
    const profitMargin = (profitPerUnit / product.salePrice) * 100;
    
    return {
      ...sp,
      product,
      profitPerUnit,
      profitMargin
    };
  }).filter(Boolean);
  
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
  
  const openEditModal = () => {
    setIsModalOpen(true);
  };
  
  const closeModal = () => {
    setIsModalOpen(false);
  };
  
  // Calculate supplier statistics
  const stats = useMemo(() => {
    if (productsWithDetails.length === 0) {
      return {
        avgCost: 0,
        avgMargin: 0
      };
    }
    
    // Filter out null items before reducing
    const validProducts = productsWithDetails.filter(item => item !== null);
    
    const totalCost = validProducts.reduce((sum, item) => sum + item.cost, 0);
    const avgCost = validProducts.length > 0 ? totalCost / validProducts.length : 0;
    
    const totalMargin = validProducts.reduce((sum, item) => sum + item.profitMargin, 0);
    const avgMargin = validProducts.length > 0 ? totalMargin / validProducts.length : 0;
    
    return {
      avgCost,
      avgMargin
    };
  }, [productsWithDetails]);
  
  if (loading || isRefreshing) {
    return (
      <LoadingOverlay message={isRefreshing ? "Refreshing supplier data..." : "Loading supplier details..."} />
    );
  }
  
  if (!supplier) {
    return (
      <div className="text-center py-10">
        <h2 className="text-2xl font-bold mb-4">Supplier Not Found</h2>
        <p className="mb-6">The supplier you're looking for doesn't exist or has been removed.</p>
        <Button onClick={() => navigate('/suppliers')} className="flex items-center mx-auto">
          <ArrowLeft size={16} className="mr-2" /> Back to Suppliers
        </Button>
      </div>
    );
  }
  
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button 
            variant="secondary" 
            className="mr-4"
            onClick={() => navigate('/suppliers')}
          >
            <ArrowLeft size={16} className="mr-2" /> Back
          </Button>
          <h1 className="text-3xl font-bold">Supplier Details</h1>
        </div>
        <div className="flex space-x-2">
          <Button onClick={handleRefresh} className="flex items-center">
            <RefreshCcw size={16} className="mr-2" /> Refresh
          </Button>
          <Button onClick={openEditModal} className="flex items-center" variant="secondary">
            <Edit size={16} className="mr-2" /> Edit Supplier
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
        <div className="col-span-2">
          <Card>
            <h2 className="text-xl font-bold mb-4">{supplier.name}</h2>
            <div className="text-gray-600 mb-2">ID: {supplier.id}</div>
            <div className="text-gray-600">
              Added: {new Date().toLocaleDateString()}
            </div>
          </Card>
        </div>
        
        <div className="col-span-3">
          <Card>
            <h3 className="text-lg font-semibold mb-3">Supplier Statistics</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <div className="text-sm text-gray-500">Products</div>
                <div className="text-lg font-semibold">{productsWithDetails.length}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Avg. Cost</div>
                <div className="text-lg font-semibold">${stats.avgCost.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Avg. Margin</div>
                <div className="text-lg font-semibold">{stats.avgMargin.toFixed(1)}%</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="md:col-span-2">
          <Card>
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-2xl font-bold">{supplier?.name}</h2>
              <Button variant="secondary" onClick={openEditModal} className="flex items-center">
                <Edit size={16} className="mr-2" /> Edit
              </Button>
            </div>
            
            <p className="text-gray-600 mb-6">
              This page shows details about the supplier and their products.
            </p>
            
            <div className="bg-blue-50 p-4 rounded mb-4">
              <h3 className="font-semibold text-blue-800 mb-2">Supplier Overview</h3>
              <ul className="space-y-2">
                <li>
                  <span className="font-medium">Products:</span> {productsWithDetails.length}
                </li>
                <li>
                  <span className="font-medium">Average Cost:</span> ${stats.avgCost.toFixed(2)}
                </li>
                <li>
                  <span className="font-medium">Average Margin:</span> {stats.avgMargin.toFixed(1)}%
                </li>
              </ul>
            </div>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card>
            <h3 className="text-lg font-semibold mb-3">Custom Attributes</h3>
            
            {(() => {
              const attributes = getEntityAttributes(supplier?.id || '', 'supplier');
              
              if (attributes.length === 0) {
                return (
                  <div className="text-gray-500 text-sm">
                    No custom attributes defined. Add custom attributes in the Settings menu.
                  </div>
                );
              }
              
              return (
                <div className="space-y-4">
                  {attributes.map(({ attribute, value }) => {
                    const handleValueChange = async (newValue: any) => {
                      try {
                        await setAttributeValue(attribute.id, supplier?.id || '', newValue);
                      } catch (err) {
                        console.error('Error updating attribute value:', err);
                      }
                    };
                    
                    let inputElement;
                    
                    switch (attribute.type) {
                      case 'Number':
                        inputElement = (
                          <input
                            type="number"
                            value={value !== null ? value : ''}
                            onChange={(e) => handleValueChange(Number(e.target.value))}
                            className="border p-2 rounded w-full"
                          />
                        );
                        break;
                      case 'Date':
                        inputElement = (
                          <input
                            type="date"
                            value={value || ''}
                            onChange={(e) => handleValueChange(e.target.value)}
                            className="border p-2 rounded w-full"
                          />
                        );
                        break;
                      case 'Yes/No':
                        inputElement = (
                          <select
                            value={value === true ? 'true' : 'false'}
                            onChange={(e) => handleValueChange(e.target.value === 'true')}
                            className="border p-2 rounded w-full"
                          >
                            <option value="false">No</option>
                            <option value="true">Yes</option>
                          </select>
                        );
                        break;
                      case 'Selection':
                        // For simplicity, using a text input for selections
                        inputElement = (
                          <input
                            type="text"
                            value={value || ''}
                            onChange={(e) => handleValueChange(e.target.value)}
                            className="border p-2 rounded w-full"
                          />
                        );
                        break;
                      case 'Text':
                      default:
                        inputElement = (
                          <input
                            type="text"
                            value={value || ''}
                            onChange={(e) => handleValueChange(e.target.value)}
                            className="border p-2 rounded w-full"
                          />
                        );
                    }
                    
                    return (
                      <div key={attribute.id}>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-sm font-medium">
                            {attribute.name}
                            {attribute.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                        </div>
                        {inputElement}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </Card>
        </div>
      </div>
      
      <Card>
        <h3 className="text-lg font-semibold mb-4">Products from this Supplier</h3>
        
        {productsWithDetails.length === 0 ? (
          <EmptyState
            message="No products found for this supplier"
            suggestion="Add products through product import or manually associate products with this supplier."
          />
        ) : (
          <Table
            headers={[
              'Product', 
              'EAN', 
              'Cost', 
              'Sale Price', 
              'Profit', 
              'Margin', 
              'Actions'
            ]}
          >
            {productsWithDetails.map((item: any) => (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-3 font-medium">{item.product.title}</td>
                <td className="px-4 py-3">{item.product.ean}</td>
                <td className="px-4 py-3">${item.cost.toFixed(2)}</td>
                <td className="px-4 py-3">${item.product.salePrice.toFixed(2)}</td>
                <td className={`px-4 py-3 ${item.profitPerUnit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${item.profitPerUnit.toFixed(2)}
                </td>
                <td className={`px-4 py-3 ${item.profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {item.profitMargin.toFixed(1)}%
                </td>
                <td className="px-4 py-3">
                  <Button
                    onClick={() => navigate(`/products/${item.product.id}`)}
                    variant="secondary"
                    className="flex items-center gap-2 text-sm py-1"
                  >
                    <Package size={14} />
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      
      {isModalOpen && (
        <SupplierModal
          isOpen={isModalOpen}
          onClose={closeModal}
          supplier={supplier}
        />
      )}
    </div>
  );
};

export default SupplierDetail; 