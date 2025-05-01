import React from 'react';
import { Database } from 'lucide-react';

interface EmptyStateProps {
  message: string;
  suggestion?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ message, suggestion }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-gray-50 rounded-lg">
      <div className="bg-blue-100 p-4 rounded-full mb-4">
        <Database className="h-8 w-8 text-blue-500" />
      </div>
      <h3 className="text-lg font-medium text-gray-800 mb-2">{message}</h3>
      {suggestion && <p className="text-gray-500">{suggestion}</p>}
    </div>
  );
};

export default EmptyState; 