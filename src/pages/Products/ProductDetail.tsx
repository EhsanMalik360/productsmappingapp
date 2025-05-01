import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import Card from '../../components/UI/Card';
import Table from '../../components/UI/Table';
import Button from '../../components/UI/Button';
import { Bar } from 'react-chartjs-2';
import LoadingOverlay from '../../components/UI/LoadingOverlay';
import { Check, ArrowLeft, RefreshCcw } from 'lucide-react';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement,
  Title, 
  Tooltip, 
  Legend
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale, 
  LinearScale, 
  BarElement,
  Title, 
  Tooltip, 
  Legend
);

const ProductDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { 
    getProductById, 
    getSuppliersForProduct, 
    getBestSupplierForProduct,
    loading, 
    refreshData,
    customAttributes,
    getEntityAttributes,
    setAttributeValue
  } = useAppContext();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [customSalePrice, setCustomSalePrice] = useState<number>(0);
  const [customAmazonFee, setCustomAmazonFee] = useState<number>(0);
  const [customSupplierCost, setCustomSupplierCost] = useState<number>(0);
  const [customProfit, setCustomProfit] = useState<{
    perUnit: number;
    monthly: number;
    margin: number;
  }>({ perUnit: 0, monthly: 0, margin: 0 });
  const [autoCalculate, setAutoCalculate] = useState<boolean>(false);
  
  const product = getProductById(id!);
  
  // Initialize custom calculator values when product is loaded
  useEffect(() => {
    if (product) {
      setCustomSalePrice(product.salePrice);
      setCustomAmazonFee(product.amazonFee);
      
      const bestSupplier = getBestSupplierForProduct(product.id);
      if (bestSupplier) {
        setCustomSupplierCost(bestSupplier.cost);
      }
    }
  }, [product, getBestSupplierForProduct]);

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

  const calculateCustomProfit = () => {
    if (isNaN(customSalePrice) || isNaN(customAmazonFee) || isNaN(customSupplierCost)) {
      alert("Please enter valid numbers for all fields");
      return;
    }

    const profitPerUnit = customSalePrice - customAmazonFee - customSupplierCost;
    const monthlyProfit = product ? profitPerUnit * product.unitsSold : 0;
    const profitMargin = customSalePrice > 0 ? (profitPerUnit / customSalePrice) * 100 : 0;
    
    setCustomProfit({
      perUnit: profitPerUnit,
      monthly: monthlyProfit,
      margin: profitMargin
    });
  };

  const handleInputChange = (
    setter: React.Dispatch<React.SetStateAction<number>>,
    value: string
  ) => {
    const parsedValue = parseFloat(value);
    setter(isNaN(parsedValue) ? 0 : parsedValue);
    
    // Auto-calculate if enabled
    if (autoCalculate) {
      setTimeout(() => calculateCustomProfit(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      calculateCustomProfit();
    }
  };

  // Add a reset function for the calculator
  const resetCalculator = () => {
    if (product) {
      setCustomSalePrice(product.salePrice);
      setCustomAmazonFee(product.amazonFee);
      
      const bestSupplier = getBestSupplierForProduct(product.id);
      if (bestSupplier) {
        setCustomSupplierCost(bestSupplier.cost);
      }
      
      // Reset results
      setCustomProfit({
        perUnit: 0,
        monthly: 0,
        margin: 0
      });
    }
  };
  
  if (loading || isRefreshing) {
    return <LoadingOverlay message={isRefreshing ? "Refreshing product data..." : "Loading product details..."} />;
  }
  
  if (!product) {
    return (
      <div className="text-center py-10">
        <h2 className="text-2xl font-bold mb-4">Product Not Found</h2>
        <p className="mb-6">The product you're looking for doesn't exist or has been removed.</p>
        <Button onClick={() => navigate('/products')} className="flex items-center mx-auto">
          <ArrowLeft size={16} className="mr-2" /> Back to Products
        </Button>
      </div>
    );
  }
  
  const suppliers = getSuppliersForProduct(product.id);
  const bestSupplier = getBestSupplierForProduct(product.id);
  
  // Sort suppliers by cost (lowest first)
  const sortedSuppliers = [...suppliers].sort((a, b) => a.cost - b.cost);
  
  // Prepare data for chart
  const supplierNames = sortedSuppliers.map(s => s.suppliers?.name || 'Unknown');
  const supplierCosts = sortedSuppliers.map(s => s.cost);
  
  const chartData = {
    labels: supplierNames,
    datasets: [
      {
        label: 'Cost per Unit ($)',
        data: supplierCosts,
        backgroundColor: supplierNames.map((_, i) => 
          i === 0 ? 'rgba(72, 187, 120, 0.7)' : 'rgba(49, 130, 206, 0.7)'
        ),
        borderColor: supplierNames.map((_, i) => 
          i === 0 ? '#48bb78' : '#3182ce'
        ),
        borderWidth: 1
      }
    ]
  };
  
  const chartOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: {
          display: true,
          color: 'rgba(0, 0, 0, 0.05)'
        }
      },
      y: {
        grid: {
          display: false
        }
      }
    }
  };
  
  // Calculate profit values
  const revenue = product.salePrice;
  const amazonFee = product.amazonFee;
  const costBestSupplier = bestSupplier ? bestSupplier.cost : 0;
  
  const profitPerUnit = revenue - amazonFee - costBestSupplier;
  const monthlyProfit = profitPerUnit * product.unitsSold;
  const profitMargin = revenue > 0 ? (profitPerUnit / revenue) * 100 : 0;
  
  const hasCostRange = supplierCosts.length > 1;
  const minCost = hasCostRange ? Math.min(...supplierCosts) : (supplierCosts[0] || 0);
  const maxCost = hasCostRange ? Math.max(...supplierCosts) : (supplierCosts[0] || 0);
  
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button 
            variant="secondary" 
            className="mr-4"
            onClick={() => navigate('/products')}
          >
            <ArrowLeft size={16} className="mr-2" /> Back
          </Button>
          <h1 className="text-3xl font-bold">Product Details</h1>
        </div>
        <Button onClick={handleRefresh} className="flex items-center">
          <RefreshCcw size={16} className="mr-2" /> Refresh
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="col-span-2">
          <Card>
            <h2 className="text-lg font-semibold">{product.title}</h2>
            <p className="text-gray-500">EAN: {product.ean}</p>
            <p className="mb-4"><span className="font-medium">Brand:</span> {product.brand}</p>
            
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <div className="text-sm text-gray-500">Sale Price</div>
                <div className="text-lg font-semibold">${product.salePrice.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Units Sold (Monthly)</div>
                <div className="text-lg font-semibold">{product.unitsSold.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Buy Box Price</div>
                <div className="text-lg font-semibold">${product.buyBoxPrice.toFixed(2)}</div>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <div className="text-sm text-gray-500">Amazon Fee</div>
                <div className="text-lg font-semibold">${product.amazonFee.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Category</div>
                <div className="text-lg font-semibold">{product.category || 'N/A'}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Rating</div>
                <div className="text-lg font-semibold">
                  {product.rating?.toFixed(1) || 'N/A'} 
                  {product.reviewCount ? <span className="text-sm text-gray-500 ml-1">({product.reviewCount} reviews)</span> : ''}
                </div>
              </div>
            </div>
          </Card>
        </div>
        
        <div className="col-span-1">
          <Card>
            <h3 className="text-lg font-semibold mb-3">Custom Attributes</h3>
            
            {(() => {
              const attributes = getEntityAttributes(product.id, 'product');
              
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
                        await setAttributeValue(attribute.id, product.id, newValue);
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
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div>
          <Card className="bg-blue-50 mb-4">
            <h3 className="font-semibold mb-2">Profit Analysis</h3>
            <div className="mb-2">
              <div className="flex justify-between mb-1">
                <span>Best Margin:</span>
                <span className={`font-semibold ${profitMargin > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {profitMargin.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between mb-1">
                <span>Profit per Unit:</span>
                <span className={`font-semibold ${profitPerUnit > 0 ? 'text-black' : 'text-red-600'}`}>
                  ${profitPerUnit.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Monthly Profit:</span>
                <span className={`font-semibold ${monthlyProfit > 0 ? 'text-black' : 'text-red-600'}`}>
                  ${monthlyProfit.toFixed(2)}
                </span>
              </div>
            </div>
          </Card>
          
          <Card className={suppliers.length > 0 ? "bg-green-50" : "bg-gray-100"}>
            <h3 className="font-semibold mb-2">Multi-Supplier Product</h3>
            {suppliers.length > 0 ? (
              <div className="text-sm">
                <p className="mb-1">
                  <Check size={16} className="text-green-600 inline mr-1" />
                  <span className="font-medium">{suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''} available</span>
                </p>
                {hasCostRange && (
                  <p className="mb-1">
                    <Check size={16} className="text-green-600 inline mr-1" />
                    <span className="font-medium">Cost range:</span> ${minCost.toFixed(2)} - ${maxCost.toFixed(2)}
                  </p>
                )}
                <p>
                  <Check size={16} className="text-green-600 inline mr-1" />
                  <span className="font-medium">Best supplier:</span> {bestSupplier?.suppliers?.name || 'N/A'}
                </p>
              </div>
            ) : (
              <div className="text-sm text-gray-600">
                <p>No suppliers available for this product.</p>
              </div>
            )}
          </Card>
        </div>
      </div>
      
      <Card className="mb-6">
        <h3 className="text-lg font-semibold mb-4">Suppliers Comparison</h3>
        {suppliers.length === 0 ? (
          <div className="text-center py-5 text-gray-500">
            No suppliers available for this product
          </div>
        ) : (
          <Table
            headers={[
              'Supplier', 
              'Cost', 
              'MOQ', 
              'Lead Time', 
              'Payment Terms', 
              'Profit Margin', 
              'Monthly Profit',
              ''
            ]}
          >
            {sortedSuppliers.map((supplier, index) => {
              const supplierProfit = (product.salePrice - product.amazonFee - supplier.cost);
              const supplierMargin = (product.salePrice > 0) ? (supplierProfit / product.salePrice) * 100 : 0;
              const monthlySupplierProfit = supplierProfit * product.unitsSold;
              
              return (
                <tr 
                  key={supplier.id} 
                  className={`border-t ${index === 0 ? 'bg-green-50' : ''}`}
                >
                  <td className="px-4 py-3 font-medium">{supplier.suppliers?.name || 'Unknown'}</td>
                  <td className="px-4 py-3">${supplier.cost.toFixed(2)}</td>
                  <td className="px-4 py-3">{supplier.moq || 'N/A'}</td>
                  <td className="px-4 py-3">{supplier.lead_time || 'N/A'}</td>
                  <td className="px-4 py-3">{supplier.payment_terms || 'N/A'}</td>
                  <td className={`px-4 py-3 ${supplierMargin > 0 ? '' : 'text-red-600'}`}>
                    {supplierMargin.toFixed(1)}%
                  </td>
                  <td className={`px-4 py-3 ${monthlySupplierProfit > 0 ? '' : 'text-red-600'}`}>
                    ${monthlySupplierProfit.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    {index === 0 && (
                      <span className="text-green-600 font-medium">Best Value</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-lg font-semibold mb-3">Cost Comparison</h3>
          {suppliers.length === 0 ? (
            <div className="text-center py-10 text-gray-500 h-[250px] flex items-center justify-center">
              No supplier data available to generate chart
            </div>
          ) : (
            <div className="h-[250px]">
              <Bar data={chartData} options={chartOptions} />
            </div>
          )}
        </Card>
        
        <Card>
          <h3 className="text-lg font-semibold mb-3">Profit Calculation</h3>
          <div className="bg-gray-50 p-4 rounded">
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="font-medium py-1">Sale Price:</td>
                  <td className="text-right">${product.salePrice.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="font-medium py-1">Amazon Fee:</td>
                  <td className="text-right">-${product.amazonFee.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="font-medium py-1">Cost ({bestSupplier?.suppliers?.name || 'N/A'}):</td>
                  <td className="text-right">-${costBestSupplier.toFixed(2)}</td>
                </tr>
                <tr className="border-t">
                  <td className="font-medium py-2">Profit per Unit:</td>
                  <td className={`text-right font-bold ${profitPerUnit > 0 ? '' : 'text-red-600'}`}>
                    ${profitPerUnit.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td className="font-medium py-1">Monthly Units Sold:</td>
                  <td className="text-right">{product.unitsSold.toLocaleString()}</td>
                </tr>
                <tr className="border-t">
                  <td className="font-medium py-2">Monthly Profit:</td>
                  <td className={`text-right font-bold ${monthlyProfit > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${monthlyProfit.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
            
            <div className="mt-4">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-medium">Custom Profit Calculator</h4>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center text-sm cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={autoCalculate}
                      onChange={() => setAutoCalculate(!autoCalculate)}
                      className="mr-2"
                    />
                    Auto-calculate
                  </label>
                  <Button 
                    variant="secondary" 
                    onClick={resetCalculator}
                    className="text-sm py-1"
                  >
                    Reset
                  </Button>
                </div>
              </div>
              
              <div className="bg-gray-100 p-3 rounded mb-3">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Sale Price ($)</label>
                    <input 
                      type="number" 
                      value={customSalePrice || ''}
                      onChange={(e) => handleInputChange(setCustomSalePrice, e.target.value)}
                      onKeyDown={handleKeyDown}
                      step="0.01" 
                      min="0"
                      placeholder="Sale Price"
                      className="border p-2 rounded w-full" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Amazon Fee ($)</label>
                    <input 
                      type="number" 
                      value={customAmazonFee || ''}
                      onChange={(e) => handleInputChange(setCustomAmazonFee, e.target.value)}
                      onKeyDown={handleKeyDown}
                      step="0.01"
                      min="0"
                      placeholder="Amazon Fee" 
                      className="border p-2 rounded w-full" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Supplier Cost ($)</label>
                    <input 
                      type="number" 
                      value={customSupplierCost || ''}
                      onChange={(e) => handleInputChange(setCustomSupplierCost, e.target.value)}
                      onKeyDown={handleKeyDown}
                      step="0.01"
                      min="0"
                      placeholder="Supplier Cost" 
                      className="border p-2 rounded w-full" 
                    />
                  </div>
                </div>
                
                <div className="mt-3 flex justify-end">
                  <Button 
                    onClick={calculateCustomProfit}
                    disabled={autoCalculate}
                    className={`${autoCalculate ? 'opacity-50' : ''}`}
                  >
                    Calculate
                  </Button>
                </div>
              </div>
              
              {(customProfit.perUnit !== 0 || customProfit.monthly !== 0 || customProfit.margin !== 0) && (
                <div className="p-3 bg-blue-50 rounded">
                  <h5 className="font-medium mb-2">Calculation Results</h5>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Profit per Unit</div>
                      <div className={`font-semibold ${customProfit.perUnit > 0 ? 'text-black' : 'text-red-600'}`}>
                        ${customProfit.perUnit.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600">Monthly Profit</div>
                      <div className={`font-semibold ${customProfit.monthly > 0 ? 'text-black' : 'text-red-600'}`}>
                        ${customProfit.monthly.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600">Profit Margin</div>
                      <div className={`font-semibold ${customProfit.margin > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {customProfit.margin.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ProductDetail;