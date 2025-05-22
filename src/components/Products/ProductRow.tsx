import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { useAppContext, Product, SupplierProduct } from '../../context/AppContext';
import ProductMatchBadge from './ProductMatchBadge';

interface ProductRowProps {
  product: Product;
  className?: string;
}

const ProductRow: React.FC<ProductRowProps> = ({ product, className = '' }) => {
  const { fetchLinkedSuppliersForProduct } = useAppContext();
  
  // State for storing suppliers data from the server
  const [suppliers, setSuppliers] = useState<SupplierProduct[]>([]);
  const [bestSupplier, setBestSupplier] = useState<SupplierProduct | undefined>(undefined);
  const [loadingState, setLoadingState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [isVisible] = useState(true);
  
  // Fetch suppliers directly from the database for this product
  useEffect(() => {
    let isMounted = true;
    
    const loadSuppliers = async () => {
      try {
        // Fetch data and update state only if component is still mounted
        const supplierData = await fetchLinkedSuppliersForProduct(product.id);
        
        if (isMounted) {
          // Find the best supplier (lowest cost)
          let best = undefined;
          if (supplierData.length > 0) {
            best = supplierData.reduce((best, current) => {
              return (current.cost < best.cost) ? current : best;
            }, supplierData[0]);
          }
          
          // Apply updates together to reduce renders
          setSuppliers(supplierData);
          setBestSupplier(best);
          setLoadingState('loaded');
        }
      } catch (error) {
        console.error('Error fetching suppliers for product:', error);
        if (isMounted) {
          setLoadingState('error');
        }
      }
    };
    
    loadSuppliers();
    return () => { isMounted = false; };
  }, [product.id, fetchLinkedSuppliersForProduct]);
  
  // Debug data structure
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Product in ProductRow:', product);
    }
  }, [product]);
  
  // Calculate profit margin
  const calculateProfitMargin = (buyBoxPrice: number, cost: number, amazonFee: number) => {
    if (buyBoxPrice <= 0 || !cost) return 0;
    const profit = buyBoxPrice - cost - amazonFee;
    return Math.round((profit / buyBoxPrice) * 100);
  };

  // Safer check to ensure cost is a number before calling toFixed
  const bestCost = bestSupplier?.cost && typeof bestSupplier.cost === 'number' 
    ? `$${bestSupplier.cost.toFixed(2)}` 
    : '-';
    
  const profitMargin = bestSupplier?.cost && typeof bestSupplier.cost === 'number'
    ? calculateProfitMargin(product.buyBoxPrice, bestSupplier.cost, product.amazonFee)
    : 0;
  
  // Helper function for rendering the supplier badge with consistent dimensions
  const renderSuppliersBadge = () => {
    const commonClasses = "supplier-badge px-2 py-1 rounded-full text-xs font-semibold min-w-[90px] inline-block text-center transition-all duration-300";
    
    if (loadingState === 'loading') {
      return (
        <div className={`${commonClasses} bg-gray-100 text-gray-400`}>
          <span className="opacity-70">Loading...</span>
        </div>
      );
    }
    
    if (loadingState === 'error') {
      return (
        <div className={`${commonClasses} bg-red-50 text-red-500`}>
          Error loading
        </div>
      );
    }
    
    return (
      <div className={`${commonClasses} bg-blue-100 text-blue-800`}>
        {suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''}
      </div>
    );
  };
  
  // Helper function for rendering match badge with placeholder if needed
  const renderMatchBadge = () => {
    if (loadingState === 'loading') {
      return (
        <div className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-gray-100 text-gray-400 opacity-70 min-w-[40px]">
          -
        </div>
      );
    }
    
    if (bestSupplier?.match_method) {
      return <ProductMatchBadge matchMethod={bestSupplier.match_method} />;
    }
    
    return null;
  };
  
  return (
    <tr className={`border-b hover:bg-gray-50 ${className}`} style={{opacity: isVisible ? 1 : 0, transition: 'opacity 150ms ease-in-out'}}>
      <td className="px-4 py-3 font-medium">{product.title}</td>
      <td className="px-4 py-3">{product.ean}</td>
      <td className="px-4 py-3">{product.brand}</td>
      <td className="px-4 py-3">${product.buyBoxPrice && typeof product.buyBoxPrice === 'number' ? product.buyBoxPrice.toFixed(2) : '0.00'}</td>
      <td className="px-4 py-3">{product.unitsSold && typeof product.unitsSold === 'number' ? product.unitsSold.toLocaleString() : '0'}</td>
      <td className="px-4 py-3">${product.amazonFee && typeof product.amazonFee === 'number' ? product.amazonFee.toFixed(2) : '0.00'}</td>
      <td className="px-4 py-3">
        <div className="flex flex-col space-y-1 min-h-[44px]">
          {renderSuppliersBadge()}
          {renderMatchBadge()}
        </div>
      </td>
      <td className="px-4 py-3 min-w-[80px]">
        {loadingState === 'loading' ? (
          <div className="bg-gray-100 text-gray-400 px-2 py-1 rounded opacity-70 min-w-[60px] inline-block">-</div>
        ) : (
          bestCost
        )}
      </td>
      <td className="px-4 py-3 min-w-[100px]">
        <div className="font-medium">
          {loadingState === 'loading' ? (
            <div className="bg-gray-100 text-gray-400 px-2 py-1 rounded opacity-70 min-w-[40px] inline-block">-</div>
          ) : (
            `${profitMargin}%`
          )}
        </div>
        <div className="profit-indicator h-2 bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded mt-1">
          <div 
            className="profit-marker w-2.5 h-2.5 bg-blue-600 rounded-full relative -top-[3px] transition-all duration-300"
            style={{ marginLeft: `${Math.min(Math.max(profitMargin, 0), 100)}%` }}
          ></div>
        </div>
      </td>
      <td className="px-4 py-3">
        <Link 
          to={`/products/${product.id}`} 
          state={{ product }} 
          className="text-blue-600 hover:underline flex items-center"
        >
          <Eye size={16} className="mr-1" /> View
        </Link>
      </td>
    </tr>
  );
};

export default ProductRow;