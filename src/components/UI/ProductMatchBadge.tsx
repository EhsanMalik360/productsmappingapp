import React from 'react';

interface ProductMatchBadgeProps {
  matchMethod: string | null | undefined;
  className?: string;
  size?: 'sm' | 'md';
}

const ProductMatchBadge: React.FC<ProductMatchBadgeProps> = ({ matchMethod, className = '', size = 'md' }) => {
  // Adjust padding and text size based on the size prop
  const sizeClasses = size === 'sm'
    ? 'px-1.5 py-0.5 text-[10px]'
    : 'px-2.5 py-0.5 text-xs';
  
  if (!matchMethod || matchMethod === 'none') {
    return (
      <span className={`inline-flex items-center ${sizeClasses} rounded-full font-medium bg-red-100 text-red-800 ${className}`}>
        No Match
      </span>
    );
  }

  if (matchMethod === 'ean') {
    return (
      <span className={`inline-flex items-center ${sizeClasses} rounded-full font-medium bg-green-100 text-green-800 ${className}`}>
        EAN Match
      </span>
    );
  }

  if (matchMethod === 'mpn') {
    return (
      <span className={`inline-flex items-center ${sizeClasses} rounded-full font-medium bg-blue-100 text-blue-800 ${className}`}>
        <span className="font-bold mr-1">MPN</span> Match
      </span>
    );
  }

  if (matchMethod === 'name') {
    return (
      <span className={`inline-flex items-center ${sizeClasses} rounded-full font-medium bg-orange-100 text-orange-800 ${className}`}>
        Name Match
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center ${sizeClasses} rounded-full font-medium bg-gray-100 text-gray-800 ${className}`}>
      {matchMethod}
    </span>
  );
};

export default ProductMatchBadge; 