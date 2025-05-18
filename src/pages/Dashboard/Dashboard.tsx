import React from 'react';
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
import { useDashboard } from '../../hooks/useDashboard';
import SkeletonCard from '../../components/UI/SkeletonCard';

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
  const { 
    stats, 
    trends, 
    monthlySalesData, 
    brandsProfitData, 
    profitDistributionData, 
    loading, 
    refreshDashboard 
  } = useDashboard();
  
  // Function to handle manual refresh
  const handleRefresh = async () => {
    await refreshDashboard();
  };

  // Check if we have data to display
  const hasData = stats.totalProducts > 0;

  // Sales chart data
  const salesChartData = {
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
  };
  
  // Brands profit chart data
  const brandsProfitChartData = {
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
  };

  // Profit distribution chart data
  const profitDistributionChartData = {
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
  };

  // After all hooks are defined, we can render based on conditions
  if (loading.isLoading && !hasData) {
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
            <SkeletonCard key={i} height="h-[140px]" />
          ))}
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {[...Array(2)].map((_, i) => (
            <SkeletonCard key={i} height="h-[300px]" />
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
          {loading.isLoading && (
            <div className="flex items-center text-sm text-gray-500 mr-2">
              <div className="animate-spin h-4 w-4 text-blue-600 mr-1">
                <RefreshCcw size={16} />
              </div>
              <span>Refreshing...</span>
            </div>
          )}
          <button 
            onClick={handleRefresh}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
            disabled={loading.isLoading}
          >
            <RefreshCcw size={16} className={loading.isLoading ? 'animate-spin' : ''} />
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
            {loading.stats ? (
              <SkeletonCard height="h-[140px]" />
            ) : (
              <StatCard
                title="Total Products"
                value={stats.totalProducts.toLocaleString()}
                icon={<Package className="text-blue-600" />}
                trend={trends.totalProducts}
                bgColor="bg-blue-100"
              />
            )}
            
            {loading.stats ? (
              <SkeletonCard height="h-[140px]" />
            ) : (
              <StatCard
                title="Avg. Profit Margin"
                value={`${stats.avgProfitMargin.toFixed(1)}%`}
                icon={<Percent className="text-green-600" />}
                trend={trends.avgProfitMargin}
                bgColor="bg-green-100"
              />
            )}
            
            {loading.stats ? (
              <SkeletonCard height="h-[140px]" />
            ) : (
              <StatCard
                title="Multi-Supplier Products"
                value={stats.multiSupplierProducts.toLocaleString()}
                icon={<Truck className="text-purple-600" />}
                trend={trends.multiSupplierProducts}
                bgColor="bg-purple-100"
              />
            )}
            
            {loading.stats ? (
              <SkeletonCard height="h-[140px]" />
            ) : (
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
            )}
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {loading.monthlySales ? (
              <SkeletonCard height="h-[300px]" />
            ) : (
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
            )}
            
            {loading.brandsProfits ? (
              <SkeletonCard height="h-[300px]" />
            ) : (
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
            )}
          </div>
          
          <div className="grid grid-cols-1 gap-6">
            {loading.profitDistribution ? (
              <SkeletonCard height="h-[400px]" />
            ) : (
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
                            {stats.totalProducts > 0 && (
                              <span className="text-gray-500 ml-1">
                                ({((profitDistributionData.data[index] / stats.totalProducts) * 100).toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;