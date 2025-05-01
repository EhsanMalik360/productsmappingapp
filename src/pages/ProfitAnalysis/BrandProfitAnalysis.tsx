import React, { useMemo } from 'react';
import Card from '../../components/UI/Card';
import Table from '../../components/UI/Table';
import { useAppContext } from '../../context/AppContext';

interface BrandProfit {
  brand: string;
  products: number;
  avgMargin: number;
  monthlyProfit: number;
  bestSupplier: string;
  multiSupplierProducts: number;
}

const BrandProfitAnalysis: React.FC = () => {
  const { products, suppliers, supplierProducts, getBestSupplierForProduct } = useAppContext();
  
  // Calculate brand-based profit metrics
  const brandProfitData = useMemo(() => {
    // Group products by brand
    const brandMap = new Map<string, {
      products: string[];
      totalMargin: number;
      totalProfit: number;
      supplierCounts: Map<string, number>;
      supplierProducts: Map<string, number>;
    }>();
    
    // Analyze each product and add to brand data
    products.forEach(product => {
      const bestSupplier = getBestSupplierForProduct(product.id);
      if (!bestSupplier) return;
      
      const profitPerUnit = product.salePrice - product.amazonFee - bestSupplier.cost;
      const profitMargin = (profitPerUnit / product.salePrice) * 100;
      const monthlyProfit = profitPerUnit * product.unitsSold;
      
      // Skip products with negative profit
      if (profitMargin <= 0) return;
      
      // Get or create brand data
      if (!brandMap.has(product.brand)) {
        brandMap.set(product.brand, {
          products: [],
          totalMargin: 0,
          totalProfit: 0,
          supplierCounts: new Map(),
          supplierProducts: new Map()
        });
      }
      
      const brandData = brandMap.get(product.brand)!;
      
      // Add product data to brand
      brandData.products.push(product.id);
      brandData.totalMargin += profitMargin;
      brandData.totalProfit += monthlyProfit;
      
      // Count suppliers for this product
      const productSuppliers = supplierProducts
        .filter(sp => sp.product_id === product.id)
        .map(sp => sp.supplier_id);
      
      // Count products with multiple suppliers
      if (productSuppliers.length > 1) {
        brandData.supplierProducts.set(product.id, productSuppliers.length);
      }
      
      // Track supplier frequency
      productSuppliers.forEach(supplierId => {
        const currentCount = brandData.supplierCounts.get(supplierId) || 0;
        brandData.supplierCounts.set(supplierId, currentCount + 1);
      });
    });
    
    // Convert map to array and calculate averages
    const brandsArray: BrandProfit[] = [];
    
    brandMap.forEach((data, brand) => {
      // Skip brands with no products
      if (data.products.length === 0) return;
      
      // Find most frequent supplier
      let bestSupplierId = '';
      let maxCount = 0;
      
      data.supplierCounts.forEach((count, supplierId) => {
        if (count > maxCount) {
          maxCount = count;
          bestSupplierId = supplierId;
        }
      });
      
      // Get supplier name
      const bestSupplier = suppliers.find(s => s.id === bestSupplierId);
      
      // Count products with multiple suppliers
      const multiSupplierProducts = data.supplierProducts.size;
      
      brandsArray.push({
        brand,
        products: data.products.length,
        avgMargin: data.totalMargin / data.products.length,
        monthlyProfit: data.totalProfit,
        bestSupplier: bestSupplier?.name || 'Unknown',
        multiSupplierProducts
      });
    });
    
    // Sort by monthly profit (highest first)
    return brandsArray.sort((a, b) => b.monthlyProfit - a.monthlyProfit);
  }, [products, suppliers, supplierProducts, getBestSupplierForProduct]);

  if (brandProfitData.length === 0) {
    return (
      <Card>
        <h3 className="text-lg font-semibold mb-3">Profit Analysis by Brand</h3>
        <p className="text-gray-500">No brand profit data available.</p>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="text-lg font-semibold mb-3">Profit Analysis by Brand</h3>
      <div className="overflow-x-auto">
        <Table
          headers={[
            'Brand', 
            'Products', 
            'Avg. Profit Margin', 
            'Monthly Profit', 
            'Best Supplier', 
            'Multi-Supplier Products'
          ]}
        >
          {brandProfitData.map((brand, index) => (
            <tr key={index} className="border-t">
              <td className="px-4 py-2 font-medium">{brand.brand}</td>
              <td className="px-4 py-2">{brand.products}</td>
              <td className="px-4 py-2">{brand.avgMargin.toFixed(1)}%</td>
              <td className="px-4 py-2">${brand.monthlyProfit.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}</td>
              <td className="px-4 py-2">{brand.bestSupplier}</td>
              <td className="px-4 py-2">{brand.multiSupplierProducts}</td>
            </tr>
          ))}
        </Table>
      </div>
    </Card>
  );
};

export default BrandProfitAnalysis;