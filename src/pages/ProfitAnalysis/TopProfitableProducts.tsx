import React, { useMemo } from 'react';
import Card from '../../components/UI/Card';
import Table from '../../components/UI/Table';
import { useAppContext } from '../../context/AppContext';

interface ProductProfit {
  id: string;
  title: string;
  margin: number;
  profit: number;
}

const TopProfitableProducts: React.FC = () => {
  const { products, getBestSupplierForProduct } = useAppContext();
  
  // Calculate product profitability and get top 5
  const topProducts = useMemo(() => {
    // Calculate profit metrics for each product
    const productsWithProfit = products.map(product => {
      const bestSupplier = getBestSupplierForProduct(product.id);
      if (!bestSupplier) return null;
      
      const profitPerUnit = product.salePrice - product.amazonFee - bestSupplier.cost;
      const profitMargin = (profitPerUnit / product.salePrice) * 100;
      const monthlyProfit = profitPerUnit * product.unitsSold;
      
      return {
        id: product.id,
        title: product.title,
        margin: profitMargin,
        profit: monthlyProfit
      };
    }).filter((item): item is ProductProfit => item !== null && item.margin > 0);
    
    // Sort by profit and take top 5
    return productsWithProfit
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);
  }, [products, getBestSupplierForProduct]);

  if (topProducts.length === 0) {
    return (
      <Card>
        <h3 className="text-lg font-semibold mb-3">Top 5 Most Profitable Products</h3>
        <p className="text-gray-500">No profitable products found.</p>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="text-lg font-semibold mb-3">Top 5 Most Profitable Products</h3>
      <Table
        headers={['Product', 'Profit Margin', 'Monthly Profit']}
      >
        {topProducts.map((product) => (
          <tr key={product.id} className="border-t">
            <td className="px-4 py-2">{product.title}</td>
            <td className="px-4 py-2">{product.margin.toFixed(1)}%</td>
            <td className="px-4 py-2">${product.profit.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}</td>
          </tr>
        ))}
      </Table>
    </Card>
  );
};

export default TopProfitableProducts;