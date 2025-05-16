import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { useProfitFormula } from '../../context/ProfitFormulaContext';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import { Bar } from 'react-chartjs-2';
import { Check, ArrowLeft, RefreshCcw, Calculator, Edit2, Save, X } from 'lucide-react';
import SupplierComparison from '../../components/Suppliers/SupplierComparison';
import toast from 'react-hot-toast';
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
    setAttributeValue,
    getAttributeValue,
    customAttributes,
    updateProduct
  } = useAppContext();
  
  // Use the shared profit formula context
  const { formulaItems, evaluateFormula } = useProfitFormula();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedProduct, setEditedProduct] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [customSalePrice, setCustomSalePrice] = useState<number>(0);
  const [customAmazonFee, setCustomAmazonFee] = useState<number>(0);
  const [customSupplierCost, setCustomSupplierCost] = useState<number>(0);
  const [customReferralFee, setCustomReferralFee] = useState<number>(0);
  const [customProfit, setCustomProfit] = useState<{
    perUnit: number;
    monthly: number;
    margin: number;
  }>({ perUnit: 0, monthly: 0, margin: 0 });
  const [autoCalculate, setAutoCalculate] = useState<boolean>(false);
  
  // Add state variables to track loading of different sections - initialize as false to show content immediately
  const [headerLoaded, setHeaderLoaded] = useState(true);
  const [supplierSectionLoading, setSupplierSectionLoading] = useState(false);
  const [profitSectionLoading, setProfitSectionLoading] = useState(false);
  const [chartSectionLoading, setChartSectionLoading] = useState(false);
  
  const product = getProductById(id!);
  
  // Initialize a default empty product if not yet loaded
  const emptyProduct = {
    id: '',
    title: 'Loading...',
    ean: '',
    brand: '',
    mpn: '',
    salePrice: 0,
    buyBoxPrice: 0,
    amazonFee: 0,
    unitsSold: 0,
    referralFee: 0,
    category: '',
    created_at: new Date().toISOString()
  };

  // Use a safe version of product that's never undefined
  const safeProduct = product || emptyProduct;
  
  // Initialize edited product when product data loads or edit mode is entered
  useEffect(() => {
    // Always set loading states to false immediately to prevent loaders from displaying
    setHeaderLoaded(true);
    setSupplierSectionLoading(false);
    setProfitSectionLoading(false);
    setChartSectionLoading(false);
    
    if (safeProduct && (isEditing || !editedProduct)) {
      setEditedProduct({
        ...safeProduct,
        title: safeProduct.title,
        ean: safeProduct.ean,
        brand: safeProduct.brand,
        mpn: safeProduct.mpn || '',
        salePrice: safeProduct.salePrice,
        buyBoxPrice: safeProduct.buyBoxPrice,
        amazonFee: safeProduct.amazonFee,
        unitsSold: safeProduct.unitsSold,
        category: safeProduct.category || '',
        referralFee: safeProduct.referralFee || 0
      });
    }
  }, [safeProduct, isEditing]);

  // Initialize custom calculator values when product is loaded
  useEffect(() => {
    if (safeProduct) {
      setCustomSalePrice(safeProduct.salePrice);
      setCustomAmazonFee(safeProduct.amazonFee);
      setCustomReferralFee(safeProduct.referralFee || 0);
      
      const bestSupplier = getBestSupplierForProduct(safeProduct.id);
      if (bestSupplier) {
        setCustomSupplierCost(bestSupplier.cost);
      }
    }
  }, [safeProduct, getBestSupplierForProduct]);

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
      referralFee: customReferralFee,
      supplierCost: customSupplierCost,
      buyBoxPrice: safeProduct?.buyBoxPrice || 0,
      unitsSold: safeProduct?.unitsSold || 0
    };
    
    // Add any custom attributes that might be used in the formula
    const customAttrs = getEntityAttributes(safeProduct?.id || '', 'product');
    customAttrs.forEach(({ attribute, value }) => {
      if (attribute.type === 'Number') {
        values[`attr_${attribute.id}`] = typeof value === 'number' ? value : 0;
      }
    });
    
    const profitPerUnit = evaluateFormula(values);
    const monthlyProfit = safeProduct ? profitPerUnit * safeProduct.unitsSold : 0;
    
    // Updated margin calculation using Buy Box price
    const buyBoxPrice = safeProduct?.buyBoxPrice || 0;
    const margin = buyBoxPrice - customAmazonFee - customReferralFee - customSupplierCost;
    const profitMargin = buyBoxPrice > 0 ? (margin / buyBoxPrice) * 100 : 0;
    
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
    if (safeProduct) {
      setCustomSalePrice(safeProduct.salePrice);
      setCustomAmazonFee(safeProduct.amazonFee);
      setCustomReferralFee(safeProduct.referralFee || 0);
      
      const bestSupplier = getBestSupplierForProduct(safeProduct.id);
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

  // New function to handle input changes when editing
  const handleEditChange = (field: string, value: any) => {
    setEditedProduct((prev: any) => ({
      ...prev,
      [field]: value
    }));
  };

  // New function to save changes
  const handleSave = async () => {
    if (!editedProduct) return;
    
    try {
      setIsSaving(true);
      
      // Validate required fields
      if (!editedProduct.title || !editedProduct.ean || !editedProduct.brand) {
        toast.error('Title, EAN, and Brand are required fields');
        return;
      }
      
      // Convert numeric string values to numbers
      const updatedProduct = {
        ...editedProduct,
        salePrice: parseFloat(editedProduct.salePrice),
        buyBoxPrice: parseFloat(editedProduct.buyBoxPrice),
        amazonFee: parseFloat(editedProduct.amazonFee),
        unitsSold: parseInt(editedProduct.unitsSold, 10),
        referralFee: parseFloat(editedProduct.referralFee)
      };
      
      // Update the product
      await updateProduct(updatedProduct);
      
      // Refresh data to get updated state
      await refreshData();
      
      toast.success('Product updated successfully');
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating product:', error);
      toast.error('Failed to update product');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (safeProduct) {
      setEditedProduct({
        ...safeProduct,
        title: safeProduct.title,
        ean: safeProduct.ean,
        brand: safeProduct.brand,
        mpn: safeProduct.mpn || '',
        salePrice: safeProduct.salePrice,
        buyBoxPrice: safeProduct.buyBoxPrice,
        amazonFee: safeProduct.amazonFee,
        unitsSold: safeProduct.unitsSold,
        category: safeProduct.category || '',
        referralFee: safeProduct.referralFee || 0
      });
    }
    setIsEditing(false);
  };
  
  // Show loading indicator only when saving, not during initial loading
  if (isSaving) {
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
            <div className="h-6 bg-gray-200 rounded animate-pulse w-48"></div>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="animate-spin h-4 w-4 text-blue-600 mr-1">
              <RefreshCcw size={16} />
            </div>
            <span>Saving...</span>
          </div>
        </div>
        
        {/* Minimal saving indicator instead of full page loader */}
        <div className="p-6 text-center">
          <div className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-4">
            <RefreshCcw size={24} />
          </div>
          <p>Saving your changes...</p>
        </div>
      </div>
    );
  }
  
  // Skip product check during loading - this prevents flashing "Product Not Found" during initial load
  if (!safeProduct && !loading) {
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
  
  const suppliers = getSuppliersForProduct(safeProduct.id);
  const bestSupplier = getBestSupplierForProduct(safeProduct.id);
  
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
  const revenue = safeProduct.salePrice;
  const amazonFee = safeProduct.amazonFee;
  const referralFee = safeProduct.referralFee || 0; 
  const buyBoxPrice = safeProduct.buyBoxPrice;
  const costBestSupplier = bestSupplier ? bestSupplier.cost : 0;
  
  // Create values object for formula evaluation
  const formulaValues: Record<string, number> = {
    salePrice: revenue,
    amazonFee: amazonFee,
    referralFee: referralFee,
    supplierCost: costBestSupplier,
    buyBoxPrice: buyBoxPrice,
    unitsSold: safeProduct.unitsSold
  };
  
  // Add any custom attributes that might be used in the formula
  const productAttrs = getEntityAttributes(safeProduct.id, 'product');
  productAttrs.forEach(({ attribute, value }) => {
    if (attribute.type === 'Number') {
      formulaValues[`attr_${attribute.id}`] = typeof value === 'number' ? value : 0;
    }
  });
  
  // Calculate profit using the formula
  const profitPerUnit = evaluateFormula(formulaValues);
  const monthlyProfit = profitPerUnit * safeProduct.unitsSold;
  
  // Updated margin calculation: Margin/Buy Box price
  const margin = buyBoxPrice - amazonFee - referralFee - costBestSupplier;
  const profitMargin = buyBoxPrice > 0 ? (margin / buyBoxPrice) * 100 : 0;
  
  const hasCostRange = supplierCosts.length > 1;
  const minCost = hasCostRange ? Math.min(...supplierCosts) : (supplierCosts[0] || 0);
  const maxCost = hasCostRange ? Math.max(...supplierCosts) : (supplierCosts[0] || 0);
  
  // Start rendering as soon as possible with progressive loading
  return (
    <div className="max-w-7xl mx-auto">
      {/* Header - Always show this */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <Button 
            variant="secondary" 
            className="mr-3"
            onClick={() => navigate('/products')}
          >
            <ArrowLeft size={14} className="mr-1.5" /> Back
          </Button>
          {loading && !headerLoaded ? (
            <div className="h-6 bg-gray-200 rounded animate-pulse w-48"></div>
          ) : (
            <h1 className="text-xl font-bold">{safeProduct.title}</h1>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {isRefreshing ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="animate-spin h-4 w-4 text-blue-600 mr-1">
                <RefreshCcw size={16} />
              </div>
              <span>Refreshing...</span>
            </div>
          ) : isEditing ? (
            <>
              <Button 
                variant="secondary" 
                onClick={handleCancelEdit}
                className="flex items-center text-sm py-1.5"
              >
                <X size={14} className="mr-1.5" /> Cancel
              </Button>
              <Button 
                onClick={handleSave}
                className="flex items-center text-sm py-1.5 bg-green-600 hover:bg-green-700"
              >
                <Save size={14} className="mr-1.5" /> Save
              </Button>
            </>
          ) : (
            <>
              <Button 
                variant="secondary"
                onClick={() => setIsEditing(true)}
                className="flex items-center text-sm py-1.5"
              >
                <Edit2 size={14} className="mr-1.5" /> Edit
              </Button>
              <Button 
                onClick={handleRefresh} 
                className="flex items-center text-sm py-1.5"
              >
                <RefreshCcw size={14} className="mr-1.5" /> Refresh
              </Button>
            </>
          )}
        </div>
      </div>
      
      {/* First row - Basic Product info */}
      <div className="grid grid-cols-12 gap-3 mb-3">
        <div className="col-span-12">
          <Card>
            {!headerLoaded ? (
              <>
                <div className="flex justify-between items-start mb-2">
                  <div className="h-5 bg-gray-200 rounded animate-pulse w-24"></div>
                  <div className="h-5 bg-gray-200 rounded animate-pulse w-24"></div>
                  <div className="h-5 bg-gray-200 rounded animate-pulse w-24"></div>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="bg-gray-100 rounded p-2 animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-16 mb-1"></div>
                      <div className="h-6 bg-gray-200 rounded w-24"></div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between items-start mb-2">
                  {isEditing ? (
                    <>
                      <div className="text-sm">
                        <span className="text-gray-500 mr-1">EAN:</span>
                        <input
                          type="text"
                          value={editedProduct?.ean || ''}
                          onChange={(e) => handleEditChange('ean', e.target.value)}
                          className="border p-1 rounded text-sm w-32"
                        />
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-500 mr-1">Brand:</span>
                        <input
                          type="text"
                          value={editedProduct?.brand || ''}
                          onChange={(e) => handleEditChange('brand', e.target.value)}
                          className="border p-1 rounded text-sm w-32"
                        />
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-500 mr-1">MPN:</span>
                        <input
                          type="text"
                          value={editedProduct?.mpn || ''}
                          onChange={(e) => handleEditChange('mpn', e.target.value)}
                          className="border p-1 rounded text-sm w-32"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm text-gray-500">EAN: {safeProduct?.ean || '...'}</div>
                      <div className="text-sm text-gray-500">Brand: {safeProduct?.brand || '...'}</div>
                      {safeProduct?.mpn && <div className="text-sm text-gray-500">MPN: {safeProduct.mpn}</div>}
                    </>
                  )}
                </div>
                
                <div className="grid grid-cols-6 gap-2">
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-xs text-gray-500">Sale Price</div>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editedProduct?.salePrice || 0}
                        onChange={(e) => handleEditChange('salePrice', e.target.value)}
                        className="border p-1 rounded text-sm w-full"
                      />
                    ) : (
                      <div className="text-base font-semibold">${safeProduct?.salePrice.toFixed(2) || '0.00'}</div>
                    )}
                  </div>
                  {/* Continue with other product fields */}
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-xs text-gray-500">Units Sold</div>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editedProduct?.unitsSold || 0}
                        onChange={(e) => handleEditChange('unitsSold', e.target.value)}
                        className="border p-1 rounded text-sm w-full"
                      />
                    ) : (
                      <div className="text-base font-semibold">{safeProduct?.unitsSold.toLocaleString() || '0'}</div>
                    )}
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-xs text-gray-500">Buy Box</div>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editedProduct?.buyBoxPrice || 0}
                        onChange={(e) => handleEditChange('buyBoxPrice', e.target.value)}
                        className="border p-1 rounded text-sm w-full"
                      />
                    ) : (
                      <div className="text-base font-semibold">${safeProduct?.buyBoxPrice.toFixed(2) || '0.00'}</div>
                    )}
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-xs text-gray-500">Amazon Fee</div>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editedProduct?.amazonFee || 0}
                        onChange={(e) => handleEditChange('amazonFee', e.target.value)}
                        className="border p-1 rounded text-sm w-full"
                      />
                    ) : (
                      <div className="text-base font-semibold">${safeProduct?.amazonFee.toFixed(2) || '0.00'}</div>
                    )}
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-xs text-gray-500">Referral Fee</div>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editedProduct?.referralFee || 0}
                        onChange={(e) => handleEditChange('referralFee', e.target.value)}
                        className="border p-1 rounded text-sm w-full"
                      />
                    ) : (
                      <div className="text-base font-semibold">${safeProduct?.referralFee !== undefined ? safeProduct.referralFee.toFixed(2) : '0.00'}</div>
                    )}
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-xs text-gray-500">Category</div>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editedProduct?.category || ''}
                        onChange={(e) => handleEditChange('category', e.target.value)}
                        className="border p-1 rounded text-sm w-full"
                      />
                    ) : (
                      <div className="text-base font-semibold truncate">{safeProduct?.category || 'N/A'}</div>
                    )}
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-xs text-gray-500">Rating</div>
                    <div className="text-base font-semibold">
                      {safeProduct?.rating?.toFixed(1) || 'N/A'} 
                      {safeProduct?.reviewCount ? <span className="text-xs text-gray-500 ml-1">({safeProduct.reviewCount})</span> : ''}
                    </div>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
      
      {/* Second row - Supplier comparison */}
      <div className="grid grid-cols-12 gap-3 mb-3">
        <div className="col-span-12">
          {supplierSectionLoading ? (
            <Card className="animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-40 mb-4"></div>
              <div className="h-40 bg-gray-200 rounded w-full"></div>
            </Card>
          ) : (
            safeProduct && <SupplierComparison productId={safeProduct.id} />
          )}
        </div>
      </div>
      
      {/* Third row - Cost comparison, Profit Analysis, Supplier Info */}
      <div className="grid grid-cols-12 gap-3 mb-3">
        {/* Cost comparison chart - 4 columns */}
        <div className="col-span-12 md:col-span-4">
          <Card>
            <h3 className="text-sm font-semibold mb-2">Cost Comparison</h3>
            {chartSectionLoading ? (
              <div className="h-[180px] bg-gray-100 animate-pulse flex items-center justify-center">
                <div className="animate-spin h-6 w-6 text-blue-600">
                  <RefreshCcw size={24} />
                </div>
              </div>
            ) : suppliers.length === 0 ? (
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
            {profitSectionLoading ? (
              <div className="space-y-2 animate-pulse">
                <div className="bg-white p-2 rounded shadow-sm h-8 bg-gray-100"></div>
                <div className="bg-white p-2 rounded shadow-sm h-8 bg-gray-100"></div>
                <div className="bg-white p-2 rounded shadow-sm h-8 bg-gray-100"></div>
              </div>
            ) : (
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
            )}
          </Card>
        </div>
        
        {/* Supplier Info - 4 columns */}
        <div className="col-span-12 sm:col-span-4">
          <Card className={`${suppliers.length > 0 ? "bg-green-50" : "bg-gray-100"} h-full`}>
            <h3 className="text-sm font-semibold mb-2">Multi-Supplier Product</h3>
            {chartSectionLoading ? (
              <div className="space-y-2 animate-pulse">
                <div className="flex items-center mb-1.5">
                  <div className="h-4 w-4 bg-gray-200 rounded-full mr-1"></div>
                  <div className="h-4 bg-gray-200 rounded w-32"></div>
                </div>
                <div className="flex items-center mb-1.5">
                  <div className="h-4 w-4 bg-gray-200 rounded-full mr-1"></div>
                  <div className="h-4 bg-gray-200 rounded w-48"></div>
                </div>
                <div className="flex items-center">
                  <div className="h-4 w-4 bg-gray-200 rounded-full mr-1"></div>
                  <div className="h-4 bg-gray-200 rounded w-40"></div>
                </div>
              </div>
            ) : suppliers.length > 0 ? (
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
              const attributes = getEntityAttributes(safeProduct.id, 'product');
              
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
                        await setAttributeValue(attribute.id, safeProduct.id, newValue);
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
                          value = revenue;
                          break;
                        case 'amazonFee':
                          value = amazonFee;
                          // Add minus sign for costs in the formula, unless it's the first item
                          prefix = index > 0 && formulaItems[index-1]?.value === '-' ? '-' : '';
                          break;
                        case 'referralFee':
                          value = referralFee;
                          // Add minus sign for costs in the formula, unless it's the first item
                          prefix = index > 0 && formulaItems[index-1]?.value === '-' ? '-' : '';
                          break;
                        case 'supplierCost':
                          value = costBestSupplier;
                          // Add minus sign for costs in the formula, unless it's the first item
                          prefix = index > 0 && formulaItems[index-1]?.value === '-' ? '-' : '';
                          break;
                        case 'buyBoxPrice':
                          value = buyBoxPrice;
                          break;
                        case 'unitsSold':
                          value = safeProduct.unitsSold;
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
                    <td className="text-right">{safeProduct.unitsSold.toLocaleString()}</td>
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
                  <div className="grid grid-cols-4 gap-1.5">
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
                      <label className="block text-xs text-gray-500 mb-0.5">Referral Fee ($)</label>
                      <input 
                        type="number" 
                        value={customReferralFee || ''}
                        onChange={(e) => handleInputChange(setCustomReferralFee, e.target.value)}
                        onKeyDown={handleKeyDown}
                        step="0.01"
                        min="0"
                        placeholder="Referral Fee" 
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
      
      {/* Fifth row - Product Data (previously Mapping Columns) */}
      <div className="grid grid-cols-12 gap-3 mt-3">
        <div className="col-span-12">
          <Card>
            <h3 className="text-sm font-semibold mb-2">Product Data</h3>
            {(() => {
              // Get all custom attributes with column mapping enabled
              const mappingAttributes = useMemo(() => {
                if (!safeProduct || !customAttributes) return [];
                try {
                  // Ensure we're working with an array before filtering
                  return Array.isArray(customAttributes) 
                    ? customAttributes.filter(attr => 
                        attr && typeof attr === 'object' && 
                        attr.forType === 'product' && 
                        attr.hasColumnMapping === true)
                    : [];
                } catch (error) {
                  console.error('Error filtering custom attributes:', error);
                  return [];
                }
              }, [safeProduct, customAttributes]);
              
              if (!safeProduct || !Array.isArray(mappingAttributes)) {
                return (
                  <div className="text-gray-500 text-xs bg-gray-50 p-2 rounded">
                    No additional product data available. You can add custom fields in the Settings menu.
                  </div>
                );
              }
              
              // Check if there's actually any data to display
              const hasCustomFields = Array.isArray(mappingAttributes) && mappingAttributes.length > 0;
              
              return (
                <div className="bg-gray-50 rounded border border-gray-200 overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <tbody>
                      {/* Standard product fields */}
                      <tr className="border-b border-gray-200">
                        <td className="px-2 py-1.5 font-medium">Title</td>
                        <td className="px-2 py-1.5">{safeProduct.title}</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="px-2 py-1.5 font-medium">EAN</td>
                        <td className="px-2 py-1.5">{safeProduct.ean}</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="px-2 py-1.5 font-medium">Brand</td>
                        <td className="px-2 py-1.5">{safeProduct.brand}</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="px-2 py-1.5 font-medium">MPN</td>
                        <td className="px-2 py-1.5">{safeProduct.mpn || 'N/A'}</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="px-2 py-1.5 font-medium">Sale Price</td>
                        <td className="px-2 py-1.5">${safeProduct.salePrice.toFixed(2)}</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="px-2 py-1.5 font-medium">Amazon Fee</td>
                        <td className="px-2 py-1.5">${safeProduct.amazonFee.toFixed(2)}</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="px-2 py-1.5 font-medium">Referral Fee</td>
                        <td className="px-2 py-1.5">${safeProduct.referralFee !== undefined ? safeProduct.referralFee.toFixed(2) : '0.00'}</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="px-2 py-1.5 font-medium">Buy Box Price</td>
                        <td className="px-2 py-1.5">${safeProduct.buyBoxPrice.toFixed(2)}</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="px-2 py-1.5 font-medium">Units Sold</td>
                        <td className="px-2 py-1.5">{safeProduct.unitsSold}</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="px-2 py-1.5 font-medium">Category</td>
                        <td className="px-2 py-1.5">{safeProduct.category || 'N/A'}</td>
                      </tr>
                      
                      {/* Custom attributes */}
                      {hasCustomFields && mappingAttributes.map(attr => {
                        if (!attr || typeof attr !== 'object') return null;
                        
                        let displayValue: string;
                        
                        try {
                          if (!safeProduct || !safeProduct.id || !attr.id || typeof getAttributeValue !== 'function') {
                            return null;
                          }
                          
                          const value = getAttributeValue(attr.id, safeProduct.id);
                          
                          switch (attr.type) {
                            case 'Number':
                              displayValue = typeof value === 'number' ? value.toFixed(2) : 'N/A';
                              break;
                            case 'Date':
                              displayValue = value ? new Date(value).toLocaleDateString() : 'N/A';
                              break;
                            case 'Yes/No':
                              displayValue = value === true ? 'Yes' : value === false ? 'No' : 'N/A';
                              break;
                            default:
                              displayValue = value ? String(value) : 'N/A';
                          }
                        } catch (error) {
                          console.error("Error formatting attribute value:", error);
                          displayValue = 'Error';
                        }
                        
                        return (
                          <tr key={attr.id || 'unknown'} className="border-b border-gray-200">
                            <td className="px-2 py-1.5 font-medium">{attr.name || 'Unknown'}</td>
                            <td className="px-2 py-1.5">{displayValue || 'N/A'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;