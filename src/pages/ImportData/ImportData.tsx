import React from 'react';
import Tabs, { Tab } from '../../components/UI/Tabs';
import Button from '../../components/UI/Button';
import AmazonImport from './AmazonImport';
import SupplierImport from './SupplierImport';
import ImportHistory from './ImportHistory';

const ImportData: React.FC = () => {
  const tabs: Tab[] = [
    {
      id: 'amazon-import',
      label: 'Amazon Data Import',
      content: <AmazonImport />
    },
    {
      id: 'supplier-import',
      label: 'Supplier Data Import',
      content: <SupplierImport />
    },
    {
      id: 'import-history',
      label: 'Import History',
      content: <ImportHistory />
    }
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Import Data</h1>
      
      <Tabs tabs={tabs} defaultActiveTab="amazon-import" />
    </div>
  );
};

export default ImportData;