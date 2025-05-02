import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { MatchMethod } from '../../utils/supplierImport';

interface ProductMatchBadgeProps {
  matchMethod: string;
  className?: string;
}

const ProductMatchBadge: React.FC<ProductMatchBadgeProps> = ({ matchMethod, className = '' }) => {
  let badgeText = '';
  let badgeColor = '';
  let tooltip = '';
  let icon = null;
  
  switch (matchMethod) {
    case MatchMethod.EAN:
      badgeText = 'EAN';
      badgeColor = 'bg-green-100 text-green-800 border-green-200';
      tooltip = 'Matched by EAN/UPC (High Confidence)';
      break;
      
    case MatchMethod.MPN:
      badgeText = 'MPN';
      badgeColor = 'bg-yellow-100 text-yellow-800 border-yellow-200';
      tooltip = 'Matched by Manufacturer Part Number (Medium Confidence)';
      break;
      
    case MatchMethod.NAME:
      badgeText = 'Name';
      badgeColor = 'bg-red-100 text-red-800 border-red-200';
      tooltip = 'Matched by Product Name (Low Confidence) - Please verify this match';
      icon = <AlertTriangle size={12} className="inline-block ml-1" />;
      break;
      
    default:
      badgeText = 'Unknown';
      badgeColor = 'bg-gray-100 text-gray-800 border-gray-200';
      tooltip = 'Unknown match method';
  }
  
  return (
    <span 
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${badgeColor} ${className}`}
      title={tooltip}
    >
      {badgeText}
      {icon}
    </span>
  );
};

export default ProductMatchBadge; 