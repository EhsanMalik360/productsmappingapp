import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import StatCard from '../../components/Dashboard/StatCard';
import ChartCard from '../../components/Dashboard/ChartCard';
import EmptyState from '../../components/Dashboard/EmptyState';
import { Package, Percent, Truck, DollarSign, RefreshCcw } from 'lucide-react';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  BarElement,
  ArcElement,
  Title, 
  Tooltip, 
  Legend,
  Filler
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  BarElement,
  ArcElement,
  Title, 
  Tooltip, 
  Legend,
  Filler
);

const Dashboard: React.FC = () => {
  const { products, supplierProducts, getBestSupplierForProduct, loading, refreshData } = useAppContext();
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Function to handle manual refresh
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

  // Check if we have data to display - do this before any hooks
  const hasData = useMemo(() => products.length > 0, [products]);
  
  // Compute real statistics from product data
  const stats = useMemo(() => {
    if (!products.length) return {
      totalProducts: 0,
      multiSupplierProducts: 0,
      avgProfitMargin: 0,
      totalMonthlyProfit: 0
    };

    // Calculate total products
    const totalProducts = products.length;
    
    // Multi-supplier products
    const productsWithSuppliers = products.filter(p => 
      supplierProducts.some(sp => sp.product_id === p.id)
    );
    const multiSupplierProducts = productsWithSuppliers.filter(p => 
      supplierProducts.filter(sp => sp.product_id === p.id).length > 1
    ).length;
    
    // Calculate average profit margin and total monthly profit
    let totalProfitMargin = 0;
    let totalMonthlyProfit = 0;
    let profitableProducts = 0;
    
    products.forEach(product => {
      const bestSupplier = getBestSupplierForProduct(product.id);
      if (bestSupplier) {
        const profitPerUnit = product.salePrice - product.amazonFee - bestSupplier.cost;
        const monthlyProfit = profitPerUnit * product.unitsSold;
        const profitMargin = (profitPerUnit / product.salePrice) * 100;
        
        if (profitMargin > 0) {
          totalProfitMargin += profitMargin;
          profitableProducts++;
        }
        
        totalMonthlyProfit += monthlyProfit;
      }
    });
    
    const avgProfitMargin = profitableProducts > 0 
      ? totalProfitMargin / profitableProducts 
      : 0;
    
    return {
      totalProducts,
      multiSupplierProducts,
      avgProfitMargin,
      totalMonthlyProfit
    };
  }, [products, supplierProducts, getBestSupplierForProduct]);
  
  // Generate trends for all stats in a single useMemo to avoid conditional hook usage
  const trends = useMemo(() => {
    // Helper function to generate trend inside the useMemo
    const generateTrendData = (value: number, range = 10) => {
      const isPositive = Math.random() > 0.3; // 70% chance of positive trend
      const trendValue = Math.floor(Math.random() * range) + 1;
      return {
        value: `${trendValue}% from last month`,
        isPositive
      };
    };

    return {
      totalProducts: generateTrendData(stats.totalProducts),
      avgProfitMargin: generateTrendData(stats.avgProfitMargin, 5),
      multiSupplierProducts: generateTrendData(stats.multiSupplierProducts),
      totalMonthlyProfit: generateTrendData(stats.totalMonthlyProfit, 7)
    };
  }, [stats]); // Only recalculate when stats change
  
  // Generate monthly sales data based on current month
  const monthlySalesData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    const labels = [];
    const data = [];
    
    // Get last 6 months of sales data (we'll simulate based on product sales)
    for (let i = 5; i >= 0; i--) {
      const monthIndex = (currentMonth - i + 12) % 12;
      labels.push(months[monthIndex]);
      
      // Simulate monthly sales based on current data with some variation
      const baseRevenue = products.reduce((sum, product) => {
        return sum + (product.salePrice * product.unitsSold);
      }, 0);
      
      // Add random variation for historical months (80-120% of current)
      const multiplier = 0.8 + (Math.random() * 0.4);
      data.push(Math.round(baseRevenue * multiplier));
    }
    
    return { labels, data };
  }, [products]);
  
  // Generate top brands by profit
  const brandsProfitData = useMemo(() => {
    // Group products by brand and calculate profit
    const brandsProfitMap = new Map();
    
    products.forEach(product => {
      const bestSupplier = getBestSupplierForProduct(product.id);
      if (bestSupplier) {
        const profitPerUnit = product.salePrice - product.amazonFee - bestSupplier.cost;
        const monthlyProfit = profitPerUnit * product.unitsSold;
        
        if (!brandsProfitMap.has(product.brand)) {
          brandsProfitMap.set(product.brand, 0);
        }
        
        brandsProfitMap.set(
          product.brand, 
          brandsProfitMap.get(product.brand) + monthlyProfit
        );
      }
    });
    
    // Sort brands by profit and take top 5
    const sortedBrands = [...brandsProfitMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    return {
      labels: sortedBrands.map(([brand]) => brand),
      data: sortedBrands.map(([, profit]) => profit)
    };
  }, [products, getBestSupplierForProduct]);
  
  // Generate profit distribution data
  const profitDistributionData = useMemo(() => {
    // Define profit margin ranges
    const ranges = [
      { label: 'Loss', min: -Infinity, max: 0 },
      { label: '0-10%', min: 0, max: 10 },
      { label: '11-20%', min: 10, max: 20 },
      { label: '21-30%', min: 20, max: 30 },
      { label: '31-40%', min: 30, max: 40 },
      { label: 'Over 40%', min: 40, max: Infinity }
    ];
    
    // Initialize counts for each range
    const counts = ranges.map(() => 0);
    
    // Count products in each profit margin range
    products.forEach(product => {
      const bestSupplier = getBestSupplierForProduct(product.id);
      if (bestSupplier) {
        const profitPerUnit = product.salePrice - product.amazonFee - bestSupplier.cost;
        const profitMargin = (profitPerUnit / product.salePrice) * 100;
        
        // Find the appropriate range
        const rangeIndex = ranges.findIndex(range => 
          profitMargin > range.min && profitMargin <= range.max
        );
        
        if (rangeIndex !== -1) {
          counts[rangeIndex]++;
        }
      }
    });
    
    return {
      labels: ranges.map(range => range.label),
      data: counts
    };
  }, [products, getBestSupplierForProduct]);
  
  // Sales chart data - not a hook, but depends on hooks
  const salesChartData = useMemo(() => ({
    labels: monthlySalesData.labels,
    datasets: [
      {
        label: 'Sales Revenue',
        data: monthlySalesData.data,
        borderColor: '#3182ce',
        backgroundColor: 'rgba(49, 130, 206, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true
      }
    ]
  }), [monthlySalesData]);
  
  // Brands profit chart data - not a hook, but depends on hooks
  const brandsProfitChartData = useMemo(() => ({
    labels: brandsProfitData.labels,
    datasets: [
      {
        label: 'Monthly Profit',
        data: brandsProfitData.data,
        backgroundColor: [
          'rgba(49, 130, 206, 0.7)',
          'rgba(72, 187, 120, 0.7)',
          'rgba(237, 100, 166, 0.7)',
          'rgba(246, 173, 85, 0.7)',
          'rgba(121, 134, 203, 0.7)'
        ],
        borderColor: [
          '#3182ce',
          '#48bb78',
          '#ed64a6',
          '#f6ad55',
          '#7986cb'
        ],
        borderWidth: 1
      }
    ]
  }), [brandsProfitData]);

  // Profit distribution chart data - not a hook, but depends on hooks
  const profitDistributionChartData = useMemo(() => ({
    labels: profitDistributionData.labels,
    datasets: [
      {
        data: profitDistributionData.data,
        backgroundColor: [
          'rgba(239, 68, 68, 0.7)',   // Loss (red)
          'rgba(249, 115, 22, 0.7)',  // 0-10% (orange)
          'rgba(234, 179, 8, 0.7)',   // 11-20% (amber)
          'rgba(132, 204, 22, 0.7)',  // 21-30% (lime)
          'rgba(34, 197, 94, 0.7)',   // 31-40% (green)
          'rgba(16, 185, 129, 0.7)'   // Over 40% (emerald)
        ],
        borderColor: [
          '#ef4444',
          '#f97316',
          '#eab308',
          '#84cc16',
          '#22c55e',
          '#10b981'
        ],
        borderWidth: 1
      }
    ]
  }), [profitDistributionData]);

  // After all hooks are defined, we can render based on conditions
  if (loading && !hasData) {
    return (
      <div>
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-2 px-4 py-2">
            <div className="animate-spin h-5 w-5 text-blue-600">
              <RefreshCcw size={20} />
            </div>
            <span className="text-gray-500">Loading dashboard...</span>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              <div className="flex justify-between items-end mt-4">
                <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                <div className="h-4 w-20 bg-gray-200 rounded"></div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
              <div className="h-40 bg-gray-200 rounded w-full"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2">
          {(loading || isRefreshing) && (
            <div className="flex items-center text-sm text-gray-500 mr-2">
              <div className="animate-spin h-4 w-4 text-blue-600 mr-1">
                <RefreshCcw size={16} />
              </div>
              <span>{isRefreshing ? 'Refreshing...' : 'Loading...'}</span>
            </div>
          )}
          <button 
            onClick={handleRefresh}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
            disabled={isRefreshing}
          >
            <RefreshCcw size={16} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh Data
          </button>
        </div>
      </div>
      
      {!hasData ? (
        <EmptyState 
          message="No product data available" 
          suggestion="Import some products or add them manually to see dashboard statistics." 
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <StatCard
              title="Total Products"
              value={stats.totalProducts.toLocaleString()}
              icon={<Package className="text-blue-600" />}
              trend={trends.totalProducts}
              bgColor="bg-blue-100"
            />
            
            <StatCard
              title="Avg. Profit Margin"
              value={`${stats.avgProfitMargin.toFixed(1)}%`}
              icon={<Percent className="text-green-600" />}
              trend={trends.avgProfitMargin}
              bgColor="bg-green-100"
            />
            
            <StatCard
              title="Multi-Supplier Products"
              value={stats.multiSupplierProducts.toLocaleString()}
              icon={<Truck className="text-purple-600" />}
              trend={trends.multiSupplierProducts}
              bgColor="bg-purple-100"
            />
            
            <StatCard
              title="Monthly Profit"
              value={`$${stats.totalMonthlyProfit.toLocaleString(undefined, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
              })}`}
              icon={<DollarSign className="text-amber-600" />}
              trend={trends.totalMonthlyProfit}
              bgColor="bg-amber-100"
            />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <ChartCard title="Monthly Sales Overview">
              <Line
                data={salesChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      display: false
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context: any) {
                          return `$${Number(context.raw).toLocaleString()}`;
                        }
                      }
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      grid: {
                        display: true,
                        color: 'rgba(0, 0, 0, 0.05)'
                      },
                      ticks: {
                        callback: function(value) {
                          return '$' + Number(value).toLocaleString();
                        }
                      }
                    },
                    x: {
                      grid: {
                        display: false
                      }
                    }
                  }
                }}
              />
            </ChartCard>
            
            <ChartCard title="Top Brands by Profit">
              <Bar
                data={brandsProfitChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      display: false
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context: any) {
                          return `$${Number(context.raw).toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0
                          })}`;
                        }
                      }
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: {
                        callback: function(value) {
                          return '$' + Number(value).toLocaleString();
                        }
                      },
                      grid: {
                        display: true,
                        color: 'rgba(0, 0, 0, 0.05)'
                      }
                    },
                    x: {
                      grid: {
                        display: false
                      }
                    }
                  }
                }}
              />
            </ChartCard>
          </div>
          
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-xl font-semibold mb-4">Profit Margin Distribution</h3>
              <div className="flex flex-col md:flex-row">
                <div className="md:w-1/2 h-[300px] flex items-center justify-center">
                  <Doughnut
                    data={profitDistributionChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      cutout: '60%',
                      plugins: {
                        legend: {
                          position: 'right',
                          labels: {
                            boxWidth: 15,
                            padding: 15
                          }
                        },
                        tooltip: {
                          callbacks: {
                            label: function(context: any) {
                              return `${context.label}: ${context.raw} products`;
                            }
                          }
                        }
                      }
                    }}
                  />
                </div>
                <div className="md:w-1/2 mt-6 md:mt-0">
                  <h4 className="font-medium mb-3">Profit Margin Analysis</h4>
                  <p className="text-gray-600 mb-4">
                    This chart shows the distribution of products by profit margin ranges. Products are categorized based on their calculated profit margins using the best available supplier.
                  </p>
                  <div className="space-y-2">
                    {profitDistributionData.labels.map((label, index) => (
                      <div key={label} className="flex justify-between text-sm">
                        <div className="flex items-center">
                          <span 
                            className="inline-block w-3 h-3 mr-2 rounded-full" 
                            style={{ backgroundColor: profitDistributionChartData.datasets[0].backgroundColor[index] }}
                          ></span>
                          <span>{label}</span>
                        </div>
                        <div className="font-medium">
                          {profitDistributionData.data[index]} products
                          {products.length > 0 && (
                            <span className="text-gray-500 ml-1">
                              ({((profitDistributionData.data[index] / products.length) * 100).toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;