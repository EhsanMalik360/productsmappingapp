import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { useAppContext, Product, SupplierProduct } from '../../context/AppContext';
import ProductMatchBadge from './ProductMatchBadge';

interface ProductRowProps {
  product: Product;
  className?: string;
}

const ProductRow: React.FC<ProductRowProps> = ({ product, className = '' }) => {
  const { getSuppliersForProduct, getBestSupplierForProduct } = useAppContext();
  
  const suppliers = getSuppliersForProduct(product.id);
  const bestSupplier = getBestSupplierForProduct(product.id);
  
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
  
  return (
    <tr className={`border-b hover:bg-gray-50 ${className}`}>
      <td className="px-4 py-3 font-medium">{product.title}</td>
      <td className="px-4 py-3">{product.ean}</td>
      <td className="px-4 py-3">{product.brand}</td>
      <td className="px-4 py-3">${product.buyBoxPrice && typeof product.buyBoxPrice === 'number' ? product.buyBoxPrice.toFixed(2) : '0.00'}</td>
      <td className="px-4 py-3">{product.unitsSold && typeof product.unitsSold === 'number' ? product.unitsSold.toLocaleString() : '0'}</td>
      <td className="px-4 py-3">${product.amazonFee && typeof product.amazonFee === 'number' ? product.amazonFee.toFixed(2) : '0.00'}</td>
      <td className="px-4 py-3">
        <div className="flex flex-col space-y-1">
        <span className="supplier-badge bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-semibold">
          {suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''}
        </span>
          {bestSupplier?.match_method && (
            <ProductMatchBadge matchMethod={bestSupplier.match_method} />
          )}
        </div>
      </td>
      <td className="px-4 py-3">{bestCost}</td>
      <td className="px-4 py-3">
        <div className="font-medium">{profitMargin}%</div>
        <div className="profit-indicator h-2 bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded">
          <div 
            className="profit-marker w-2.5 h-2.5 bg-blue-600 rounded-full relative -top-[3px]" 
            style={{ marginLeft: `${Math.min(Math.max(profitMargin, 0), 100)}%` }}
          ></div>
        </div>
      </td>
      <td className="px-4 py-3">
        <Link to={`/products/${product.id}`} className="text-blue-600 hover:underline flex items-center">
          <Eye size={16} className="mr-1" /> View
        </Link>
      </td>
    </tr>
  );
};

export default ProductRow;