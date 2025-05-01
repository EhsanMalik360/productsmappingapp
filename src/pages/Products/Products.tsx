import React, { useState, useMemo } from 'react';
import { useAppContext } from '../../context/AppContext';
import Card from '../../components/UI/Card';
import Table from '../../components/UI/Table';
import Button from '../../components/UI/Button';
import ProductRow from '../../components/Products/ProductRow';
import { Search, Filter, ChevronLeft, ChevronRight, RefreshCcw } from 'lucide-react';
import LoadingOverlay from '../../components/UI/LoadingOverlay';

const Products: React.FC = () => {
  const { products, loading, error, refreshData } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const itemsPerPage = 5;
  
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
  
  // Filter products based on search and filters
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      // Search filter
      const matchesSearch = 
        product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.ean.includes(searchTerm) ||
        product.brand.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Brand filter
      const matchesBrand = selectedBrand ? product.brand === selectedBrand : true;
      
      // Category filter
      const matchesCategory = selectedCategory ? product.category === selectedCategory : true;
      
      return matchesSearch && matchesBrand && matchesCategory;
    });
  }, [products, searchTerm, selectedBrand, selectedCategory]);
  
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, startIndex + itemsPerPage);
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1); // Reset to first page on search
  };
  
  const changePage = (page: number) => {
    if (page > 0 && page <= totalPages) {
      setCurrentPage(page);
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
    setCurrentPage(1);
  };

  if (loading || isRefreshing) {
    return <LoadingOverlay message={isRefreshing ? "Refreshing products..." : "Loading products..."} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Products</h1>
        <Button onClick={handleRefresh} className="flex items-center">
          <RefreshCcw size={16} className="mr-2" /> Refresh Data
        </Button>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          Error loading products: {error.message}
        </div>
      )}
      
      <Card className="mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <form onSubmit={handleSearch} className="flex w-full md:w-auto">
            <input
              type="text"
              placeholder="Search products..."
              className="border p-2 rounded-l"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Button type="submit" className="rounded-l-none flex items-center">
              <Search size={16} />
            </Button>
          </form>
          
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <select 
              className="border p-2 rounded"
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
            >
              <option value="">All Brands</option>
              {brands.map(brand => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
            
            <select 
              className="border p-2 rounded"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            
            <Button 
              variant="secondary" 
              className="flex items-center"
              onClick={handleClearFilters}
            >
              <Filter size={16} className="mr-1" /> Clear Filters
            </Button>
          </div>
        </div>
        
        {filteredProducts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No products found matching your criteria
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
            
            <div className="flex justify-between items-center mt-4">
              <div>
                <span className="text-sm text-gray-500">
                  Showing {filteredProducts.length > 0 ? startIndex + 1 : 0}-{Math.min(startIndex + itemsPerPage, filteredProducts.length)} of {filteredProducts.length} products
                </span>
              </div>
              
              {totalPages > 1 && (
                <div className="flex">
                  <button 
                    className="border p-2 rounded mr-2 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" 
                    onClick={() => changePage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNumber = i + 1;
                    return (
                      <button
                        key={i}
                        className={`border p-2 rounded mr-2 ${currentPage === pageNumber ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
                        onClick={() => changePage(pageNumber)}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                  
                  {totalPages > 5 && (
                    <>
                      <span className="p-2">...</span>
                      <button
                        className={`border p-2 rounded mr-2 hover:bg-gray-100`}
                        onClick={() => changePage(totalPages)}
                      >
                        {totalPages}
                      </button>
                    </>
                  )}
                  
                  <button 
                    className="border p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" 
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