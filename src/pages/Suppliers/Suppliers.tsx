import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PlusCircle, Search, RefreshCcw, Trash2, Eye, Edit } from 'lucide-react';
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

const Suppliers: React.FC = () => {
  const { suppliers, supplierProducts, loading, refreshData, deleteSupplier } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentSupplier, setCurrentSupplier] = useState<Supplier | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  
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
  
  // Filter suppliers based on search term
  const filteredSuppliers = suppliers.filter(supplier => 
    supplier.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Calculate supplier statistics
  const getSupplierStats = (supplierId: string): SupplierStats => {
    return {
      productCount: getProductCount(supplierId),
      avgCost: calculateAverageCost(supplierId),
      bestValueCount: calculateBestValueCount(supplierId)
    };
  };
  
  // Get count of products for a supplier
  const getProductCount = (supplierId: string): number => {
    return supplierProducts.filter(sp => sp.supplier_id === supplierId).length;
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
      if (!productGroups.has(sp.product_id)) {
        productGroups.set(sp.product_id, []);
      }
      productGroups.get(sp.product_id)?.push(sp);
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Suppliers</h1>
        <div className="flex space-x-2">
          <Button 
            onClick={handleRefresh}
            variant="secondary"
            className="flex items-center gap-2"
          >
            <RefreshCcw size={16} />
            Refresh
          </Button>
          <Button 
            onClick={openAddModal}
            className="flex items-center gap-2"
          >
            <PlusCircle size={16} />
            Add Supplier
          </Button>
        </div>
      </div>
      
      {deleteError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {deleteError}
        </div>
      )}
      
      <Card className="mb-6">
        <div className="flex mb-4">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search suppliers by name..."
              className="block w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        {suppliers.length === 0 ? (
          <EmptyState
            message="No suppliers found"
            suggestion="Add a supplier or import supplier data to get started."
          />
        ) : filteredSuppliers.length === 0 ? (
          <EmptyState
            message="No suppliers match your search"
            suggestion="Try adjusting your search term."
          />
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
            {filteredSuppliers.map(supplier => {
              const stats = getSupplierStats(supplier.id);
              
              return (
                <tr key={supplier.id} className="border-t">
                  <td className="px-4 py-3 font-medium">
                    <Link 
                      to={`/suppliers/${supplier.id}`}
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {supplier.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{stats.productCount}</td>
                  <td className="px-4 py-3">${stats.avgCost.toFixed(2)}</td>
                  <td className="px-4 py-3">{stats.bestValueCount}</td>
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
                        disabled={stats.productCount > 0}
                        title={stats.productCount > 0 ? "Can't delete suppliers with associated products" : "Delete supplier"}
                      >
                        <Trash2 size={16} />
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