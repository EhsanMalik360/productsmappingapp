import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';

interface ImportJob {
  id: string;
  file_name: string;
  completed_at: string;
  total_records: number;
  successful: number;
  failed: number;
}

interface Product {
  id: string;
  title: string;
  ean: string;
  brand: string;
  sale_price: number;
  amazon_fee?: number;
  units_sold?: number;
  category?: string;
  rating?: number;
}

const ImportedProducts: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [importJob, setImportJob] = useState<ImportJob | null>(null);

  useEffect(() => {
    const fetchImportedProducts = async () => {
      try {
        setLoading(true);
        const response = await api.getImportedProducts();
        
        setProducts(response.products);
        setImportJob(response.import_job);
        setError('');
      } catch (err) {
        console.error('Error fetching imported products:', err);
        setError('Failed to load imported products. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchImportedProducts();
  }, []);

  if (loading) return <div className="p-4">Loading imported products...</div>;
  
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  
  if (!products.length) return <div className="p-4">No products have been imported yet.</div>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Recently Imported Products</h1>
      
      {importJob && (
        <div className="mb-6 p-4 bg-gray-50 rounded-md">
          <h2 className="text-lg font-semibold mb-2">Import Information</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-gray-600">File</p>
              <p className="font-medium">{importJob.file_name}</p>
            </div>
            <div>
              <p className="text-gray-600">Imported On</p>
              <p className="font-medium">{new Date(importJob.completed_at).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-600">Results</p>
              <p className="font-medium">
                Success: {importJob.successful} / Total: {importJob.total_records}
                {importJob.failed > 0 && (
                  <span className="text-red-600 ml-2">Failed: {importJob.failed}</span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
      
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-3 text-left border-b">Title</th>
              <th className="p-3 text-left border-b">EAN</th>
              <th className="p-3 text-left border-b">Brand</th>
              <th className="p-3 text-right border-b">Sale Price</th>
              <th className="p-3 text-right border-b">Amazon Fee</th>
              <th className="p-3 text-right border-b">Profit</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const amazonFee = product.amazon_fee || 0;
              const profit = product.sale_price - amazonFee;
              const margin = (profit / product.sale_price) * 100;
              
              return (
                <tr key={product.id} className="hover:bg-gray-50 border-b">
                  <td className="p-3">{product.title}</td>
                  <td className="p-3">{product.ean}</td>
                  <td className="p-3">{product.brand}</td>
                  <td className="p-3 text-right">${product.sale_price.toFixed(2)}</td>
                  <td className="p-3 text-right">${amazonFee.toFixed(2)}</td>
                  <td className="p-3 text-right">
                    ${profit.toFixed(2)}
                    <span className="ml-2 text-xs text-gray-600">
                      ({margin.toFixed(1)}%)
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ImportedProducts; 