import React from 'react';
import { useAppContext, SupplierProduct } from '../../context/AppContext';
import Card from '../UI/Card';
import ProductMatchBadge from '../UI/ProductMatchBadge';

interface SupplierComparisonProps {
  productId: string;
  linkedSuppliers: SupplierProduct[];
}

const SupplierComparison: React.FC<SupplierComparisonProps> = ({ productId, linkedSuppliers }) => {
  const { suppliers } = useAppContext();
  
  if (!linkedSuppliers || linkedSuppliers.length === 0) {
    return (
      <Card>
        <h3 className="text-base font-semibold mb-2">Suppliers Comparison</h3>
        <div className="text-sm text-gray-500 py-4 text-center bg-gray-50 rounded">
          No suppliers found for this product.
        </div>
      </Card>
    );
  }

  // Sort suppliers by cost (cheapest first)
  const sortedSuppliers = [...linkedSuppliers].sort((a, b) => a.cost - b.cost);
  const cheapestSupplierId = sortedSuppliers[0]?.supplier_id;
  
  return (
    <Card>
      <h3 className="text-base font-semibold mb-2">Suppliers Comparison</h3>
      <div className="overflow-hidden rounded-md border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Supplier
              </th>
              <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cost
              </th>
              <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                MOQ
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Lead Time
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Payment Terms
              </th>
              <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Match
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedSuppliers.map((sp) => {
              const supplier = suppliers.find(s => s.id === sp.supplier_id);
              const isBestSupplier = sp.supplier_id === cheapestSupplierId;
              
              return (
                <tr key={sp.id} className={isBestSupplier ? 'bg-green-50' : ''}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center">
                      {isBestSupplier && (
                        <span className="flex-shrink-0 w-2 h-2 bg-green-500 rounded-full mr-2" />
                      )}
                      <span className={`${isBestSupplier ? 'font-medium' : ''}`}>
                        {supplier?.name || '-'}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-medium">
                    <span className={isBestSupplier ? 'text-green-600' : ''}>
                      ${sp.cost.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-center">
                    {sp.moq || 1}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {sp.lead_time || '-'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {sp.payment_terms || '-'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-center">
                    <div className="flex justify-center">
                      <ProductMatchBadge matchMethod={sp.match_method} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default SupplierComparison; 