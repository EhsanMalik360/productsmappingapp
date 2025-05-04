import React, { useState } from 'react';
import { Calculator, BarChart, BarChart3 } from 'lucide-react';
import ProfitFormulaEditor from './ProfitFormulaEditor';
import ProfitDistributionChart from './ProfitDistributionChart';
import TopProfitableProducts from './TopProfitableProducts';
import BrandProfitAnalysis from './BrandProfitAnalysis';

const ProfitAnalysis: React.FC = () => {
  const [activeTab, setActiveTab] = useState('formula');
  
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Profit Analysis</h1>
      
      <div className="bg-white rounded-lg shadow-sm mb-6 border border-gray-200">
        <div className="flex flex-wrap">
          <button 
            className={`flex items-center px-6 py-3 font-medium transition-all rounded-tl-lg ${
              activeTab === 'formula' 
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500' 
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            onClick={() => setActiveTab('formula')}
          >
            <Calculator size={18} className={`mr-2 ${activeTab === 'formula' ? 'text-blue-600' : 'text-gray-500'}`} />
            Profit Formula
          </button>
          <button 
            className={`flex items-center px-6 py-3 font-medium transition-all ${
              activeTab === 'distribution' 
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500' 
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            onClick={() => setActiveTab('distribution')}
          >
            <BarChart size={18} className={`mr-2 ${activeTab === 'distribution' ? 'text-blue-600' : 'text-gray-500'}`} />
            Profit Distribution
          </button>
          <button 
            className={`flex items-center px-6 py-3 font-medium transition-all ${
              activeTab === 'by-brand' 
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500' 
                : 'text-gray-700 hover:bg-gray-50'
            }`}
            onClick={() => setActiveTab('by-brand')}
          >
            <BarChart3 size={18} className={`mr-2 ${activeTab === 'by-brand' ? 'text-blue-600' : 'text-gray-500'}`} />
            Analysis by Brand
          </button>
        </div>
      </div>
      
      <div className="transition-all duration-300 ease-in-out">
        {activeTab === 'formula' && (
          <div className="animate-fadeIn">
            <ProfitFormulaEditor />
          </div>
        )}
        
        {activeTab === 'distribution' && (
          <div className="animate-fadeIn">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <ProfitDistributionChart />
              <TopProfitableProducts />
            </div>
          </div>
        )}
        
        {activeTab === 'by-brand' && (
          <div className="animate-fadeIn">
            <BrandProfitAnalysis />
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfitAnalysis;