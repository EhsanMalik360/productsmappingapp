import React, { useMemo } from 'react';
import Card from '../../components/UI/Card';
import { Bar } from 'react-chartjs-2';
import { useAppContext } from '../../context/AppContext';

const ProfitDistributionChart: React.FC = () => {
  const { products, supplierProducts, getBestSupplierForProduct } = useAppContext();
  
  // Generate real profit distribution data
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

  const chartData = {
    labels: profitDistributionData.labels,
    datasets: [
      {
        label: 'Number of Products',
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
  
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      title: {
        display: true,
        text: 'Products by Profit Margin Range',
        font: {
          size: 14
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
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
  };
  
  return (
    <Card>
      <h3 className="text-lg font-semibold mb-3">Profit Margin Distribution</h3>
      <div className="h-[300px]">
        <Bar data={chartData} options={options} />
      </div>
    </Card>
  );
};

export default ProfitDistributionChart;