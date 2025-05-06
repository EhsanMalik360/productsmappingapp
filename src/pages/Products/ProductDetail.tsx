import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { useProfitFormula } from '../../context/ProfitFormulaContext';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import { Bar } from 'react-chartjs-2';
import LoadingOverlay from '../../components/UI/LoadingOverlay';
import { Check, ArrowLeft, RefreshCcw, Calculator } from 'lucide-react';
import SupplierComparison from '../../components/Suppliers/SupplierComparison';
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
    getEntityAttributes,
    setAttributeValue
  } = useAppContext();
  
  // Use the shared profit formula context
  const { formulaItems, evaluateFormula } = useProfitFormula();

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

    // Use the formula context to evaluate profit
    const values: Record<string, number> = {
      salePrice: customSalePrice,
      amazonFee: customAmazonFee,
      supplierCost: customSupplierCost,
      buyBoxPrice: product?.buyBoxPrice || 0,
      unitsSold: product?.unitsSold || 0
    };
    
    // Add any custom attributes that might be used in the formula
    const customAttrs = getEntityAttributes(product?.id || '', 'product');
    customAttrs.forEach(({ attribute, value }) => {
      if (attribute.type === 'Number') {
        values[`attr_${attribute.id}`] = typeof value === 'number' ? value : 0;
      }
    });
    
    const profitPerUnit = evaluateFormula(values);
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
  
  // Calculate profit values using the shared formula
  const revenue = product.salePrice;
  const amazonFee = product.amazonFee;
  const costBestSupplier = bestSupplier ? bestSupplier.cost : 0;
  
  // Create values object for formula evaluation
  const formulaValues: Record<string, number> = {
    salePrice: revenue,
    amazonFee: amazonFee,
    supplierCost: costBestSupplier,
    buyBoxPrice: product.buyBoxPrice,
    unitsSold: product.unitsSold
  };
  
  // Add any custom attributes that might be used in the formula
  const productAttrs = getEntityAttributes(product.id, 'product');
  productAttrs.forEach(({ attribute, value }) => {
    if (attribute.type === 'Number') {
      formulaValues[`attr_${attribute.id}`] = typeof value === 'number' ? value : 0;
    }
  });
  
  // Calculate profit using the formula
  const profitPerUnit = evaluateFormula(formulaValues);
  const monthlyProfit = profitPerUnit * product.unitsSold;
  const profitMargin = revenue > 0 ? (profitPerUnit / revenue) * 100 : 0;
  
  const hasCostRange = supplierCosts.length > 1;
  const minCost = hasCostRange ? Math.min(...supplierCosts) : (supplierCosts[0] || 0);
  const maxCost = hasCostRange ? Math.max(...supplierCosts) : (supplierCosts[0] || 0);
  
  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <Button 
            variant="secondary" 
            className="mr-3"
            onClick={() => navigate('/products')}
          >
            <ArrowLeft size={14} className="mr-1.5" /> Back
          </Button>
          <h1 className="text-xl font-bold">{product.title}</h1>
        </div>
        <Button onClick={handleRefresh} className="flex items-center text-sm py-1.5">
          <RefreshCcw size={14} className="mr-1.5" /> Refresh
        </Button>
      </div>
      
      {/* First row - Product info */}
      <div className="grid grid-cols-12 gap-3 mb-3">
        <div className="col-span-12">
          <Card>
            <div className="flex justify-between items-start mb-2">
              <div className="text-sm text-gray-500">EAN: {product.ean}</div>
              <div className="text-sm text-gray-500">Brand: {product.brand}</div>
              {product.mpn && <div className="text-sm text-gray-500">MPN: {product.mpn}</div>}
            </div>
            
            <div className="grid grid-cols-6 gap-2">
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-xs text-gray-500">Sale Price</div>
                <div className="text-base font-semibold">${product.salePrice.toFixed(2)}</div>
              </div>
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-xs text-gray-500">Units Sold</div>
                <div className="text-base font-semibold">{product.unitsSold.toLocaleString()}</div>
              </div>
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-xs text-gray-500">Buy Box</div>
                <div className="text-base font-semibold">${product.buyBoxPrice.toFixed(2)}</div>
              </div>
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-xs text-gray-500">Amazon Fee</div>
                <div className="text-base font-semibold">${product.amazonFee.toFixed(2)}</div>
              </div>
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-xs text-gray-500">Category</div>
                <div className="text-base font-semibold truncate">{product.category || 'N/A'}</div>
              </div>
              <div className="bg-gray-50 p-2 rounded">
                <div className="text-xs text-gray-500">Rating</div>
                <div className="text-base font-semibold">
                  {product.rating?.toFixed(1) || 'N/A'} 
                  {product.reviewCount ? <span className="text-xs text-gray-500 ml-1">({product.reviewCount})</span> : ''}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
      
      {/* Second row - Supplier comparison */}
      <div className="grid grid-cols-12 gap-3 mb-3">
        <div className="col-span-12">
          <SupplierComparison productId={product.id} />
        </div>
      </div>
      
      {/* Third row - Cost comparison, Profit Analysis, Supplier Info */}
      <div className="grid grid-cols-12 gap-3 mb-3">
        {/* Cost comparison chart - 4 columns */}
        <div className="col-span-12 md:col-span-4">
          <Card>
            <h3 className="text-sm font-semibold mb-2">Cost Comparison</h3>
            {suppliers.length === 0 ? (
              <div className="text-center py-6 text-gray-500 h-[180px] flex items-center justify-center bg-gray-50 rounded">
                <span className="text-xs">No supplier data available to generate chart</span>
              </div>
            ) : (
              <div className="h-[180px]">
                <Bar data={chartData} options={chartOptions} />
              </div>
            )}
          </Card>
        </div>
        
        {/* Profit Analysis - 4 columns */}
        <div className="col-span-12 sm:col-span-4">
          <Card className="bg-blue-50 h-full">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold">Profit Analysis</h3>
              <div className="text-xs text-blue-700 flex items-center">
                <Calculator size={12} className="mr-1" />
                Using shared formula
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <div className="bg-white p-2 rounded shadow-sm flex justify-between items-center">
                <div className="text-xs text-gray-600">Margin:</div>
                <div className={`text-sm font-semibold ${profitMargin > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {profitMargin.toFixed(1)}%
                </div>
              </div>
              <div className="bg-white p-2 rounded shadow-sm flex justify-between items-center">
                <div className="text-xs text-gray-600">Unit Profit:</div>
                <div className={`text-sm font-semibold ${profitPerUnit > 0 ? 'text-black' : 'text-red-600'}`}>
                  ${profitPerUnit.toFixed(2)}
                </div>
              </div>
              <div className="bg-white p-2 rounded shadow-sm flex justify-between items-center">
                <div className="text-xs text-gray-600">Monthly:</div>
                <div className={`text-sm font-semibold ${monthlyProfit > 0 ? 'text-black' : 'text-red-600'}`}>
                  ${monthlyProfit.toFixed(2)}
                </div>
              </div>
            </div>
          </Card>
        </div>
        
        {/* Supplier Info - 4 columns */}
        <div className="col-span-12 sm:col-span-4">
          <Card className={`${suppliers.length > 0 ? "bg-green-50" : "bg-gray-100"} h-full`}>
            <h3 className="text-sm font-semibold mb-2">Multi-Supplier Product</h3>
            {suppliers.length > 0 ? (
              <div className="text-xs">
                <p className="flex items-center mb-1.5">
                  <Check size={14} className="text-green-600 mr-1 flex-shrink-0" />
                  <span className="font-medium">{suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''} available</span>
                </p>
                {hasCostRange && (
                  <p className="flex items-center mb-1.5">
                    <Check size={14} className="text-green-600 mr-1 flex-shrink-0" />
                    <span><span className="font-medium">Cost range:</span> ${minCost.toFixed(2)} - ${maxCost.toFixed(2)}</span>
                  </p>
                )}
                <p className="flex items-center">
                  <Check size={14} className="text-green-600 mr-1 flex-shrink-0" />
                  <span><span className="font-medium">Best supplier:</span> {bestSupplier?.suppliers?.name || 'N/A'}</span>
                </p>
              </div>
            ) : (
              <div className="text-xs text-gray-600">
                <p>No suppliers available for this product.</p>
              </div>
            )}
          </Card>
        </div>
      </div>
      
      {/* Fourth row - Custom attributes and Profit Calculator */}
      <div className="grid grid-cols-12 gap-3">
        {/* Custom attributes - 6 columns */}
        <div className="col-span-12 md:col-span-6">
          <Card>
            <h3 className="text-sm font-semibold mb-2">Custom Attributes</h3>
            
            {(() => {
              const attributes = getEntityAttributes(product.id, 'product');
              
              if (attributes.length === 0) {
                return (
                  <div className="text-gray-500 text-xs bg-gray-50 p-2 rounded">
                    No custom attributes defined. Add custom attributes in the Settings menu.
                  </div>
                );
              }
              
              return (
                <div className="space-y-2">
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
                            className="border p-1 rounded w-full text-xs"
                          />
                        );
                        break;
                      case 'Date':
                        inputElement = (
                          <input
                            type="date"
                            value={value || ''}
                            onChange={(e) => handleValueChange(e.target.value)}
                            className="border p-1 rounded w-full text-xs"
                          />
                        );
                        break;
                      case 'Yes/No':
                        inputElement = (
                          <select
                            value={value === true ? 'true' : 'false'}
                            onChange={(e) => handleValueChange(e.target.value === 'true')}
                            className="border p-1 rounded w-full text-xs"
                          >
                            <option value="false">No</option>
                            <option value="true">Yes</option>
                          </select>
                        );
                        break;
                      default:
                        inputElement = (
                          <input
                            type="text"
                            value={value || ''}
                            onChange={(e) => handleValueChange(e.target.value)}
                            className="border p-1 rounded w-full text-xs"
                          />
                        );
                    }
                    
                    return (
                      <div key={attribute.id}>
                        <div className="flex justify-between items-center mb-0.5">
                          <label className="text-xs font-medium text-gray-600">
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
        
        {/* Profit calculator - 6 columns */}
        <div className="col-span-12 md:col-span-6">
          <Card>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold">Profit Calculation</h3>
              <Button 
                variant="secondary" 
                onClick={() => navigate('/profit-analysis')} 
                className="text-xs flex items-center text-blue-600"
              >
                <Calculator size={12} className="mr-1" />
                Edit Formula
              </Button>
            </div>
            <div className="bg-gray-50 p-2 rounded">
              <table className="w-full text-xs">
                <tbody>
                  {/* Dynamically generate formula steps based on formula items */}
                  {formulaItems.map((item, index) => {
                    // Skip operators in the table view
                    if (item.type === 'operator') return null;
                    
                    // Get the value for this item
                    let value = 0;
                    let prefix = '';
                    
                    if (item.type === 'field') {
                      switch (item.value) {
                        case 'salePrice':
                          value = product.salePrice;
                          break;
                        case 'amazonFee':
                          value = product.amazonFee;
                          // Add minus sign for costs in the formula, unless it's the first item
                          prefix = index > 0 && formulaItems[index-1]?.value === '-' ? '-' : '';
                          break;
                        case 'supplierCost':
                          value = costBestSupplier;
                          // Add minus sign for costs in the formula, unless it's the first item
                          prefix = index > 0 && formulaItems[index-1]?.value === '-' ? '-' : '';
                          break;
                        case 'buyBoxPrice':
                          value = product.buyBoxPrice;
                          break;
                        case 'unitsSold':
                          value = product.unitsSold;
                          break;
                        default:
                          value = 0;
                      }
                    } else if (item.type === 'customAttribute') {
                      // Find custom attribute value
                      const attrId = item.value.replace('attr_', '');
                      const attr = productAttrs.find(a => a.attribute.id === attrId);
                      value = attr && typeof attr.value === 'number' ? attr.value : 0;
                      
                      // Add minus sign if the previous operator was subtraction
                      prefix = index > 0 && formulaItems[index-1]?.value === '-' ? '-' : '';
                    } else if (item.type === 'constant') {
                      value = parseFloat(item.value);
                      
                      // Add minus sign if the previous operator was subtraction
                      prefix = index > 0 && formulaItems[index-1]?.value === '-' ? '-' : '';
                    }
                    
                    // Only render table rows for non-operator items
                    return (
                      <tr key={item.id}>
                        <td className="font-medium py-0.5">
                          {item.displayValue || item.value}
                          {item.type === 'field' && item.value === 'supplierCost' && 
                            ` (${bestSupplier?.suppliers?.name || 'N/A'})`}:
                        </td>
                        <td className="text-right">
                          {prefix}{prefix === '-' ? '' : (index > 0 && ['*', '/'].includes(formulaItems[index-1]?.value as string) ? '' : '$')}
                          {typeof value === 'number' ? (
                            item.value === 'unitsSold' ? 
                              value.toLocaleString() : 
                              value.toFixed(2)
                          ) : value}
                        </td>
                      </tr>
                    );
                  })}
                  
                  {/* Result row */}
                  <tr className="border-t">
                    <td className="font-medium py-1">Profit per Unit:</td>
                    <td className={`text-right font-bold ${profitPerUnit > 0 ? '' : 'text-red-600'}`}>
                      ${profitPerUnit.toFixed(2)}
                    </td>
                  </tr>
                  
                  {/* Monthly calculation */}
                  <tr>
                    <td className="font-medium py-0.5">Monthly Units Sold:</td>
                    <td className="text-right">{product.unitsSold.toLocaleString()}</td>
                  </tr>
                  <tr className="border-t">
                    <td className="font-medium py-1">Monthly Profit:</td>
                    <td className={`text-right font-bold ${monthlyProfit > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${monthlyProfit.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
              
              <div className="mt-2">
                <div className="flex justify-between items-center mb-1">
                  <h4 className="font-medium text-xs">Custom Profit Calculator</h4>
                  <div className="flex items-center space-x-2">
                    <label className="flex items-center text-xs cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={autoCalculate}
                        onChange={() => setAutoCalculate(!autoCalculate)}
                        className="mr-1 h-3 w-3"
                      />
                      Auto
                    </label>
                    <Button 
                      variant="secondary" 
                      onClick={resetCalculator}
                      className="text-xs py-0.5 px-1.5"
                    >
                      Reset
                    </Button>
                  </div>
                </div>
                
                <div className="bg-white p-1.5 rounded mb-1.5 border border-gray-100">
                  <div className="grid grid-cols-3 gap-1.5">
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Sale Price ($)</label>
                      <input 
                        type="number" 
                        value={customSalePrice || ''}
                        onChange={(e) => handleInputChange(setCustomSalePrice, e.target.value)}
                        onKeyDown={handleKeyDown}
                        step="0.01" 
                        min="0"
                        placeholder="Sale Price"
                        className="border p-1 rounded w-full text-xs" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Amazon Fee ($)</label>
                      <input 
                        type="number" 
                        value={customAmazonFee || ''}
                        onChange={(e) => handleInputChange(setCustomAmazonFee, e.target.value)}
                        onKeyDown={handleKeyDown}
                        step="0.01"
                        min="0"
                        placeholder="Amazon Fee" 
                        className="border p-1 rounded w-full text-xs" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Supplier Cost ($)</label>
                      <input 
                        type="number" 
                        value={customSupplierCost || ''}
                        onChange={(e) => handleInputChange(setCustomSupplierCost, e.target.value)}
                        onKeyDown={handleKeyDown}
                        step="0.01"
                        min="0"
                        placeholder="Supplier Cost" 
                        className="border p-1 rounded w-full text-xs" 
                      />
                    </div>
                  </div>
                  
                  <div className="mt-1.5 flex justify-end">
                    <Button 
                      onClick={calculateCustomProfit}
                      disabled={autoCalculate}
                      className={`text-xs py-0.5 px-2 ${autoCalculate ? 'opacity-50' : ''}`}
                    >
                      Calculate
                    </Button>
                  </div>
                </div>
                
                {(customProfit.perUnit !== 0 || customProfit.monthly !== 0 || customProfit.margin !== 0) && (
                  <div className="p-1.5 bg-blue-50 rounded border border-blue-100">
                    <h5 className="font-medium text-xs mb-1 text-blue-800">Calculation Results</h5>
                    <div className="grid grid-cols-3 gap-1.5 text-xs">
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
    </div>
  );
};

export default ProductDetail;