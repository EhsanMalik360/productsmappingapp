import React from 'react';
import { MatchMethod } from '../../utils/supplierImport';

interface ProductMatchBadgeProps {
  matchMethod: MatchMethod;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const ProductMatchBadge: React.FC<ProductMatchBadgeProps> = ({ 
  matchMethod, 
  size = 'md',
  showLabel = true
}) => {
  // Define styling and labels based on match method
  let bgColor = '';
  let textColor = '';
  let label = '';
  let confidence = '';
  
  switch (matchMethod) {
    case MatchMethod.EAN:
      bgColor = 'bg-green-100';
      textColor = 'text-green-800';
      label = 'EAN';
      confidence = 'High';
      break;
    case MatchMethod.MPN:
      bgColor = 'bg-yellow-100';
      textColor = 'text-yellow-800';
      label = 'MPN';
      confidence = 'Medium';
      break;
    case MatchMethod.NAME:
      bgColor = 'bg-red-100';
      textColor = 'text-red-800';
      label = 'Name';
      confidence = 'Low';
      break;
    default:
      bgColor = 'bg-gray-100';
      textColor = 'text-gray-800';
      label = 'Unknown';
      confidence = 'Unknown';
  }
  
  // Determine size-based styles
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5 rounded',
    md: 'text-xs px-2 py-1 rounded-md',
    lg: 'text-sm px-3 py-1.5 rounded-md'
  };
  
  return (
    <span className={`inline-flex items-center ${bgColor} ${textColor} ${sizeClasses[size]}`}>
      {showLabel ? (
        <span className="flex items-center">
          <span className="font-medium mr-1">{label}</span>
          <span className="font-light">({confidence})</span>
        </span>
      ) : (
        <span className="font-medium">{confidence}</span>
      )}
    </span>
  );
};

export default ProductMatchBadge; 