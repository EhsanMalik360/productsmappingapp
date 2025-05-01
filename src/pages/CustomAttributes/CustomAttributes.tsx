import React from 'react';
import Tabs, { Tab } from '../../components/UI/Tabs';
import ProductAttributes from './ProductAttributes';
import SupplierAttributes from './SupplierAttributes';

const CustomAttributes: React.FC = () => {
  const tabs: Tab[] = [
    {
      id: 'product-attributes',
      label: 'Amazon Product Attributes',
      content: <ProductAttributes />
    },
    {
      id: 'supplier-attributes',
      label: 'Supplier Attributes',
      content: <SupplierAttributes />
    }
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Custom Attributes</h1>
      
      <Tabs tabs={tabs} defaultActiveTab="product-attributes" />
    </div>
  );
};

export default CustomAttributes;