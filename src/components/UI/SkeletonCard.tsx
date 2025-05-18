import React from 'react';

interface SkeletonCardProps {
  height?: string;
  className?: string;
}

const SkeletonCard: React.FC<SkeletonCardProps> = ({ 
  height = 'h-[200px]', 
  className = ''
}) => {
  return (
    <div className={`bg-white rounded-lg shadow p-6 animate-pulse ${height} ${className}`}>
      <div className="h-6 bg-gray-200 rounded w-1/2 mb-4"></div>
      <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full h-full bg-gray-200 rounded"></div>
      </div>
    </div>
  );
};

export default SkeletonCard; 