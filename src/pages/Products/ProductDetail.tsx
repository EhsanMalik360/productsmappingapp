import React, { useState, useEffect, useMemo, useLayoutEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAppContext, Product, SupplierProduct } from '../../context/AppContext';
import { useProfitFormula } from '../../context/ProfitFormulaContext';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import { Bar } from 'react-chartjs-2';
import { Check, ArrowLeft, RefreshCcw, Calculator, Edit2, Save, X } from 'lucide-react';
import SupplierComparison from '../../components/Suppliers/SupplierComparison';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
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
  const location = useLocation();
  const { isAdmin } = useAuth();
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
    updateProduct,
    cacheSupplierById,
    fetchLinkedSuppliersForProduct
  } = useAppContext();
  
  // Use the shared profit formula context
  const { formulaItems, evaluateFormula } = useProfitFormula();

  // Check if we have a passed product from navigation state
  const passedProduct = location.state?.product;

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
  
  // Add a specific product loading state
  const [isLoadingProduct, setIsLoadingProduct] = useState(true);
  const [freshProductData, setFreshProductData] = useState<any>(null);
  
  // Add state for directly fetched linked suppliers
  const [linkedSuppliers, setLinkedSuppliers] = useState<SupplierProduct[]>([]);
  const [isLoadingLinkedSuppliers, setIsLoadingLinkedSuppliers] = useState<boolean>(true);

  // Get product data from context as a fallback or for initial render
  const contextProduct = getProductById(id!);

  // Use the freshest data available: 1. Direct fetch, 2. Enriched from nav, 3. Context
  const actualProduct = freshProductData || passedProduct || contextProduct;
  
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
    rating: 0,
    reviewCount: 0,
    created_at: new Date().toISOString()
  };

  // Use a safe version of product that's never undefined
  const safeProduct = actualProduct || emptyProduct;
  
  // console.log('ProductDetail Render: safeProduct.id:', safeProduct.id, 'isLoadingProduct:', isLoadingProduct, 'actualProduct source:', freshProductData ? 'fresh' : enrichedPassedProduct ? 'passed' : contextProduct ? 'context' : 'none');

  const enrichedPassedProduct = useMemo(() => {
    // Ensure dependencies are accessed safely, especially on initial render
    const currentPassedProduct = location.state?.product;
    const currentFreshProductData = freshProductData;
    const currentContextProduct = contextProduct; // id should be stable here if this memo runs

    const productToEnrich = currentFreshProductData || currentPassedProduct;
    
    if (productToEnrich && location.state?.from === 'supplierDetail') {
      if (productToEnrich.salePrice === 0 || productToEnrich.unitsSold === 0) {
        if (currentContextProduct && currentContextProduct.id === productToEnrich.id && 
            (currentContextProduct.salePrice !== productToEnrich.salePrice || currentContextProduct.unitsSold !== productToEnrich.unitsSold)) {
          return {
            ...productToEnrich,
            title: currentContextProduct.title || productToEnrich.title,
            ean: currentContextProduct.ean || productToEnrich.ean,
            brand: currentContextProduct.brand || productToEnrich.brand,
            mpn: currentContextProduct.mpn || productToEnrich.mpn,
            salePrice: currentContextProduct.salePrice !== 0 ? currentContextProduct.salePrice : productToEnrich.salePrice,
            buyBoxPrice: currentContextProduct.buyBoxPrice !== 0 ? currentContextProduct.buyBoxPrice : productToEnrich.buyBoxPrice,
            amazonFee: currentContextProduct.amazonFee !== 0 ? currentContextProduct.amazonFee : productToEnrich.amazonFee,
            unitsSold: currentContextProduct.unitsSold !== 0 ? currentContextProduct.unitsSold : productToEnrich.unitsSold,
            referralFee: currentContextProduct.referralFee !== 0 ? currentContextProduct.referralFee : productToEnrich.referralFee,
            rating: currentContextProduct.rating || productToEnrich.rating,
            reviewCount: currentContextProduct.reviewCount || productToEnrich.reviewCount
          };
        }
      }
    }
    return currentFreshProductData || currentPassedProduct; 
  }, [location.state, freshProductData, contextProduct]); // Dependencies kept simple

  // Add a more direct approach to load product data by ID
  const loadProductData = useCallback(async (productId: string) => { // Wrapped in useCallback
    if (!productId) {
      setIsLoadingProduct(false);
      return;
    }
    
    console.log('ProductDetail: Loading product data for ID:', productId);
    setIsLoadingProduct(true); // Ensure loading state is true at start
    
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();
        
      if (error) throw error;
      if (!data) {
        console.error('ProductDetail: No product data found from direct fetch for ID:', productId);
        setFreshProductData(null); // Explicitly set to null if not found
        toast.error('Product not found.');
        // Optionally navigate back or to a 404 page
        // navigate('/products'); 
        return;
      }
      
      console.log('ProductDetail: Successfully loaded fresh product data:', data);
      
      const freshProduct = {
        id: data.id,
        title: data.title || 'Untitled Product',
        ean: data.ean || '',
        brand: data.brand || '',
        salePrice: typeof data.sale_price === 'number' ? data.sale_price : 0,
        unitsSold: typeof data.units_sold === 'number' ? data.units_sold : 0,
        amazonFee: typeof data.amazon_fee === 'number' ? data.amazon_fee : 
                  typeof data.fba_fees === 'number' ? data.fba_fees : 0,
        referralFee: typeof data.referral_fee === 'number' ? data.referral_fee : 0,
        buyBoxPrice: typeof data.buy_box_price === 'number' ? data.buy_box_price : 0,
        category: data.category || null,
        rating: typeof data.rating === 'number' ? data.rating : null,
        reviewCount: typeof data.review_count === 'number' ? data.review_count : null,
        mpn: data.mpn || null
      };
      
      setFreshProductData(freshProduct);
      
    } catch (err) {
      console.error('ProductDetail: Error loading product data directly:', err);
      toast.error('Failed to load product details.');
      setFreshProductData(null); // Set to null on error
    } finally {
      setIsLoadingProduct(false);
    }
  }, [navigate]); // Added navigate to dependencies

  // Call load on mount
  useEffect(() => {
    if (id) {
      loadProductData(id);
    } else {
      // No ID, maybe navigate away or show error
      console.error("ProductDetail: No product ID provided.");
      toast.error("No product specified.");
      // navigate("/products");
      setIsLoadingProduct(false);
    }
  }, [id, loadProductData]);

  // Use layout effect to ensure UI updates immediately with product data
  useLayoutEffect(() => {
    // Always set loading states to false immediately to prevent loaders from displaying
    setHeaderLoaded(true);
    setSupplierSectionLoading(false);
    setProfitSectionLoading(false);
    setChartSectionLoading(false);
  }, []);
  
  // Initialize edited product when product data loads or edit mode is entered
  useEffect(() => {
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
        referralFee: safeProduct.referralFee || 0
      });
    }
  }, [safeProduct, isEditing]);

  // Initialize custom calculator values when product is loaded
  useEffect(() => {
    if (safeProduct) {
      setCustomSalePrice(safeProduct.buyBoxPrice);
      setCustomAmazonFee(safeProduct.amazonFee);
      setCustomReferralFee(safeProduct.referralFee || 0);
      
      const bestSupplier = getBestSupplierForProduct(safeProduct.id);
      // Set default value of 0 if no supplier is available
      setCustomSupplierCost(bestSupplier ? bestSupplier.cost : 0);
    }
  }, [safeProduct, getBestSupplierForProduct]);

  // Silent background refresh - simplified
  useEffect(() => {
    const silentRefresh = async () => {
      if (id && actualProduct && (actualProduct.salePrice === 0 || !actualProduct.mpn)) { // Simpler check
        console.log('ProductDetail: Data for current product seems minimal (e.g. no sale price/MPN), performing background context refresh.');
        try {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Delay a bit
          await refreshData(); // Refresh general app context data
        } catch (error) {
          console.error("ProductDetail: Error during silent background refresh:", error);
        }
      }
    };
    // Only run if we have an ID and some form of product data to evaluate
    if (id && actualProduct) {
      const refreshTimeout = setTimeout(silentRefresh, 2000); // Delay this overall refresh
      return () => clearTimeout(refreshTimeout);
    }
  }, [id, actualProduct, refreshData]); // Dependency on actualProduct

  // useEffect to fetch linked suppliers when product ID is available
  useEffect(() => {
    console.log('ProductDetail: linkedSuppliers effect triggered. safeProduct.id:', safeProduct.id, 'isLoadingProduct:', isLoadingProduct);
    if (safeProduct.id && !isLoadingProduct) { // Ensure product is loaded before fetching its suppliers
      const loadLinkedSuppliers = async () => {
        console.log(`ProductDetail: Condition met (safeProduct.id && !isLoadingProduct). safeProduct.id is ${safeProduct.id}, attempting to fetch linked suppliers.`);
        setIsLoadingLinkedSuppliers(true);
        try {
          const data = await fetchLinkedSuppliersForProduct(safeProduct.id);
          setLinkedSuppliers(data);
          console.log('ProductDetail: Fetched linked suppliers directly:', data);
        } catch (error) {
          console.error('ProductDetail: Error fetching linked suppliers:', error);
          setLinkedSuppliers([]); // Set to empty array on error
        } finally {
          setIsLoadingLinkedSuppliers(false);
        }
      };
      loadLinkedSuppliers();
    }
  }, [safeProduct.id, fetchLinkedSuppliersForProduct, isLoadingProduct]); // Depend on safeProduct.id, the fetch function, and isLoadingProduct

  // Add a useEffect to try and refresh context if product is loaded but suppliers are missing
  // This useEffect might need to be re-evaluated or removed if direct fetch for linkedSuppliers is sufficient
  useEffect(() => {
    if (!isLoadingProduct && safeProduct.id && linkedSuppliers.length === 0 && !isLoadingLinkedSuppliers) {
      // Check if a refresh is already in progress to avoid loops if refreshData itself doesn't immediately populate suppliers
      if (!isRefreshing) { 
        console.log(`ProductDetail: Product ${safeProduct.id} loaded, direct linkedSuppliers fetch resulted in 0. Current context refresh status: ${isRefreshing}. Consider if global refresh is needed.`);
        // const forceRefreshSuppliers = async () => { // Potentially remove or adapt this section
        //   try {
        //     setIsRefreshing(true); // Indicate a refresh is happening
        //     await refreshData();
        //   } catch (error) {
        //     console.error("ProductDetail: Error during explicit refresh for missing suppliers:", error);
        //   } finally {
        //     setIsRefreshing(false);
        //   }
        // };
        // forceRefreshSuppliers();
      }
    }
  }, [isLoadingProduct, safeProduct.id, linkedSuppliers, refreshData, isRefreshing, isLoadingLinkedSuppliers]); 

  // Add a check for the referrer in useEffect
  useEffect(() => {
    // Check if we came from a supplier details page
    if (location.state?.from === 'supplierDetail' && location.state?.supplierId) {
      // Store the supplier ID to return to
      setReferringSupplierId(location.state.supplierId);
    }
  }, [location.state]);

  // Add state to store the referring supplier ID
  const [referringSupplierId, setReferringSupplierId] = useState<string | null>(null);

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      // Reload the direct product data
      if (id) await loadProductData(id);
      // Reload the linked suppliers for this product
      if (safeProduct.id) {
        const data = await fetchLinkedSuppliersForProduct(safeProduct.id);
        setLinkedSuppliers(data);
      }
      // Optionally, trigger a global refresh if other parts of the app might need it
      // await refreshData(); 
      toast.success('Product data refreshed');
    } catch (error) {
      console.error('Error refreshing product data:', error);
      toast.error('Failed to refresh product data');
    } finally {
      setIsRefreshing(false);
    }
  };

  const calculateCustomProfit = () => {
    if (isNaN(customSalePrice) || isNaN(customAmazonFee) || isNaN(customSupplierCost) || isNaN(customReferralFee)) {
      toast.error("Please enter valid numbers for all calculator fields");
      return;
    }

    const values: Record<string, number> = {
      salePrice: customSalePrice, 
      amazonFee: customAmazonFee,
      referralFee: customReferralFee,
      supplierCost: customSupplierCost,
      buyBoxPrice: customSalePrice, 
      unitsSold: safeProduct?.unitsSold || 0
    };
    
    const customAttrs = getEntityAttributes(safeProduct?.id || '', 'product');
    customAttrs.forEach(({ attribute, value }) => {
      if (attribute.type === 'Number') {
        values[`attr_${attribute.id}`] = typeof value === 'number' ? value : 0;
      }
    });
    
    const profitPerUnit = evaluateFormula(values);
    const monthlyProfit = safeProduct ? profitPerUnit * (safeProduct.unitsSold || 0) : 0;
    const currentBuyBoxPrice = customSalePrice; // Use the custom sale price for margin calculation here
    const margin = currentBuyBoxPrice - customAmazonFee - customReferralFee - customSupplierCost;
    const profitMargin = currentBuyBoxPrice > 0 ? (margin / currentBuyBoxPrice) * 100 : 0;
    
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
    
    if (autoCalculate) {
      // Debounce or directly call calculateCustomProfit
      // Using a timeout to allow state to update before calculation
      setTimeout(() => calculateCustomProfit(), 0); 
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      calculateCustomProfit();
    }
  };

  const resetCalculator = () => {
    if (safeProduct) {
      setCustomSalePrice(safeProduct.buyBoxPrice); // Reset to product's buyBoxPrice
      setCustomAmazonFee(safeProduct.amazonFee);
      setCustomReferralFee(safeProduct.referralFee || 0);
      
      // Use the best supplier from the new linkedSuppliers logic
      const localBestSupplier = bestSupplier; // Already calculated via useMemo
      setCustomSupplierCost(localBestSupplier ? localBestSupplier.cost : 0);
      
      setCustomProfit({
        perUnit: 0,
        monthly: 0,
        margin: 0
      });
    }
  };

  const handleEditChange = (field: string, value: any) => {
    setEditedProduct((prev: any) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    if (!editedProduct) return;
    
    try {
      setIsSaving(true);
      
      if (!editedProduct.title || !editedProduct.ean || !editedProduct.brand) {
        toast.error('Title, EAN, and Brand are required fields');
        setIsSaving(false);
        return;
      }
      
      const productToSave = {
        ...editedProduct,
        salePrice: parseFloat(String(editedProduct.salePrice || 0)),
        buyBoxPrice: parseFloat(String(editedProduct.buyBoxPrice || 0)),
        amazonFee: parseFloat(String(editedProduct.amazonFee || 0)),
        unitsSold: parseInt(String(editedProduct.unitsSold || 0), 10),
        referralFee: parseFloat(String(editedProduct.referralFee || 0))
      };
      
      await updateProduct(productToSave as Product); // Ensure type compatibility
      
      // Refresh local product data and linked suppliers after save
      if (id) await loadProductData(id);
      if (id) {
          const data = await fetchLinkedSuppliersForProduct(id);
          setLinkedSuppliers(data);
      }
      // Optionally call global refreshData if other parts of app need update
      // await refreshData();

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
        referralFee: safeProduct.referralFee || 0
      });
    }
    setIsEditing(false);
  };

  // Sort suppliers by cost (lowest first) - now use linkedSuppliers
  const sortedSuppliers = useMemo(() => [...linkedSuppliers].sort((a, b) => a.cost - b.cost), [linkedSuppliers]);
  
  // Prepare data for chart - now use sortedSuppliers
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
  const revenue = safeProduct.buyBoxPrice;
  const amazonFee = safeProduct.amazonFee;
  const referralFee = safeProduct.referralFee || 0; 
  const buyBoxPrice = safeProduct.buyBoxPrice;
  // const costBestSupplier = bestSupplier ? bestSupplier.cost : 0; // REMOVED

  // Recalculate bestSupplier based on linkedSuppliers
  const bestSupplier = useMemo(() => {
    if (sortedSuppliers.length === 0) return undefined;
    // sortedSuppliers is already sorted by cost, so the first element is the best
    return sortedSuppliers[0]; 
  }, [sortedSuppliers]);

  const costBestSupplier = bestSupplier ? bestSupplier.cost : 0; // Now uses the new bestSupplier

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
  
  // Update the back button click handler
  const handleBackClick = () => {
    if (referringSupplierId) {
      // Use replace:true to prevent adding to history stack and causing re-renders
      navigate(`/suppliers/${referringSupplierId}`, { 
        replace: true,
        state: { 
          fromProduct: true,
          productId: id
        }
      });
    } else {
      // Default behavior - go to products page
      navigate('/products');
    }
  };
  
  // Log dependencies just before returning JSX
  console.log('ProductDetail Render: safeProduct.id:', safeProduct.id, 'isLoadingProduct:', isLoadingProduct, 'actualProduct source:', freshProductData ? 'fresh' : enrichedPassedProduct ? 'passed' : contextProduct ? 'context' : 'none');
  console.log('ProductDetail Pre-Render State: safeProduct.id:', safeProduct.id, 'isLoadingProduct:', isLoadingProduct, 'isLoadingLinkedSuppliers:', isLoadingLinkedSuppliers, 'actualProduct source:', freshProductData ? 'fresh' : enrichedPassedProduct ? 'passed' : contextProduct ? 'context' : 'none', 'linkedSuppliers count:', linkedSuppliers.length);

  // Start rendering as soon as possible with progressive loading
  return (
    <div className="max-w-7xl mx-auto">
      {/* Header - Always show this */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <Button 
            variant="secondary" 
            className="mr-3"
            onClick={handleBackClick}
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
                    <div className="text-xs text-gray-500">Buy Box Price</div>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editedProduct?.buyBoxPrice || 0}
                        onChange={(e) => handleEditChange('buyBoxPrice', e.target.value)}
                        className="border p-1 rounded text-sm w-full"
                      />
                    ) : (
                      <div className="text-base font-semibold">${safeProduct?.buyBoxPrice ? safeProduct.buyBoxPrice.toFixed(2) : '0.00'}</div>
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
                      <div className="text-base font-semibold">{safeProduct?.unitsSold ? safeProduct.unitsSold.toLocaleString() : '0'}</div>
                    )}
                  </div>

                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-xs text-gray-500">FBA Fee</div>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editedProduct?.amazonFee || 0}
                        onChange={(e) => handleEditChange('amazonFee', e.target.value)}
                        className="border p-1 rounded text-sm w-full"
                      />
                    ) : (
                      <div className="text-base font-semibold">${safeProduct?.amazonFee ? safeProduct.amazonFee.toFixed(2) : '0.00'}</div>
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
                    <div className="text-xs text-gray-500">Rating</div>
                    <div className="text-base font-semibold">
                      {safeProduct?.rating ? safeProduct.rating.toFixed(1) : 'N/A'} 
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
            safeProduct && <SupplierComparison productId={safeProduct.id} linkedSuppliers={linkedSuppliers} />
          )}
        </div>
      </div>
      
      {/* Third row - Cost comparison, Profit Analysis, Supplier Info */}
      <div className="grid grid-cols-12 gap-3 mb-3">
        {/* Cost comparison chart - 4 columns */}
        <div className="col-span-12 md:col-span-4">
          <Card>
            <h3 className="text-sm font-semibold mb-2">Cost Comparison</h3>
            <div className="h-[180px] relative">
              {isLoadingLinkedSuppliers || chartSectionLoading ? (
                <div className="absolute inset-0 bg-gray-100 animate-pulse flex items-center justify-center opacity-90 transition-opacity duration-300">
                  <div className="animate-spin h-6 w-6 text-blue-600">
                    <RefreshCcw size={24} />
                  </div>
                </div>
              ) : linkedSuppliers.length === 0 ? (
                <div className="absolute inset-0 text-center py-6 text-gray-500 flex items-center justify-center bg-gray-50 rounded transition-opacity duration-300">
                  <span className="text-xs">No supplier data available to generate chart</span>
                </div>
              ) : (
                <div className="absolute inset-0 transition-opacity duration-300">
                  <Bar data={chartData} options={chartOptions} />
                </div>
              )}
            </div>
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
                    {typeof profitMargin === 'number' ? profitMargin.toFixed(1) : '0.0'}%
                  </div>
                </div>
                <div className="bg-white p-2 rounded shadow-sm flex justify-between items-center">
                  <div className="text-xs text-gray-600">Unit Profit:</div>
                  <div className={`text-sm font-semibold ${profitPerUnit > 0 ? 'text-black' : 'text-red-600'}`}>
                    ${typeof profitPerUnit === 'number' ? profitPerUnit.toFixed(2) : '0.00'}
                  </div>
                </div>
                <div className="bg-white p-2 rounded shadow-sm flex justify-between items-center">
                  <div className="text-xs text-gray-600">Monthly:</div>
                  <div className={`text-sm font-semibold ${monthlyProfit > 0 ? 'text-black' : 'text-red-600'}`}>
                    ${typeof monthlyProfit === 'number' ? monthlyProfit.toFixed(2) : '0.00'}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
        
        {/* Supplier Info - 4 columns */}
        <div className="col-span-12 sm:col-span-4">
          <Card className={`h-full transition-colors duration-300 ${linkedSuppliers.length > 0 ? 'bg-green-50' : 'bg-gray-50'}`}>
            <h3 className="text-sm font-semibold mb-2">Multi-Supplier Product</h3>
            <div className="min-h-[100px] relative">
              {isLoadingLinkedSuppliers || chartSectionLoading ? (
                <div className="space-y-2 animate-pulse absolute inset-0 transition-opacity duration-300">
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
              ) : (
                <div className="text-xs transition-opacity duration-300">
                  {linkedSuppliers.length > 0 ? (
                    <>
                      <p className="flex items-center mb-1.5">
                        <Check size={14} className="text-green-600 mr-1 flex-shrink-0" />
                        <span className="font-medium">{linkedSuppliers.length} supplier{linkedSuppliers.length !== 1 ? 's' : ''} available</span>
                      </p>
                      {hasCostRange && (
                        <p className="flex items-center mb-1.5">
                          <Check size={14} className="text-green-600 mr-1 flex-shrink-0" />
                          <span><span className="font-medium">Cost range:</span> ${typeof minCost === 'number' ? minCost.toFixed(2) : '0.00'} - ${typeof maxCost === 'number' ? maxCost.toFixed(2) : '0.00'}</span>
                        </p>
                      )}
                      <p className="flex items-center">
                        <Check size={14} className="text-green-600 mr-1 flex-shrink-0" />
                        <span><span className="font-medium">Best supplier:</span> {bestSupplier?.suppliers?.name || 'N/A'}</span>
                      </p>
                    </>
                  ) : (
                    <p className="text-gray-600">No suppliers available for this product.</p>
                  )}
                </div>
              )}
            </div>
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
        
        {/* Profit calculator - 6 columns - Available to all users */}
        <div className="col-span-12 md:col-span-6">
          <Card>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold">Profit Calculation</h3>
              {isAdmin && (
                <Button 
                  variant="secondary" 
                  onClick={() => navigate('/profit-analysis')} 
                  className="text-xs flex items-center text-blue-600"
                >
                  <Calculator size={12} className="mr-1" />
                  Edit Formula
                </Button>
              )}
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
                            // Update display to show Buy Box Price instead of Sale Price
                            item = {
                              ...item,
                              displayValue: 'Buy Box Price'
                            };
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
                            {item.displayValue || item.value}:
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
                      <td className="text-right">{safeProduct?.unitsSold ? safeProduct.unitsSold.toLocaleString() : '0'}</td>
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
                        <label className="block text-xs text-gray-500 mb-0.5">Buy Box Price ($)</label>
                        <input 
                          type="number" 
                          value={customSalePrice || ''}
                          onChange={(e) => handleInputChange(setCustomSalePrice, e.target.value)}
                          onKeyDown={handleKeyDown}
                          step="0.01" 
                          min="0"
                          placeholder="Buy Box Price"
                          className="border p-1 rounded w-full text-xs" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">FBA Fee ($)</label>
                        <input 
                          type="number" 
                          value={customAmazonFee || ''}
                          onChange={(e) => handleInputChange(setCustomAmazonFee, e.target.value)}
                          onKeyDown={handleKeyDown}
                          step="0.01"
                          min="0"
                          placeholder="FBA Fee" 
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
                        {!bestSupplier && (
                          <div className="text-xs text-amber-600 mt-1">
                            No supplier available. Using 0 as default.
                          </div>
                        )}
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
                        <td className="px-2 py-1.5 font-medium">Buy Box Price</td>
                        <td className="px-2 py-1.5">${safeProduct?.buyBoxPrice !== undefined ? safeProduct.buyBoxPrice.toFixed(2) : '0.00'}</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="px-2 py-1.5 font-medium">FBA Fee</td>
                        <td className="px-2 py-1.5">${safeProduct?.amazonFee !== undefined ? safeProduct.amazonFee.toFixed(2) : '0.00'}</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="px-2 py-1.5 font-medium">Referral Fee</td>
                        <td className="px-2 py-1.5">${safeProduct.referralFee !== undefined ? safeProduct.referralFee.toFixed(2) : '0.00'}</td>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <td className="px-2 py-1.5 font-medium">Units Sold</td>
                        <td className="px-2 py-1.5">{safeProduct?.unitsSold !== undefined ? safeProduct.unitsSold : 0}</td>
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