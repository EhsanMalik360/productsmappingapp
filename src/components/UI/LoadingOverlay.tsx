import React, { useState, useEffect } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

interface LoadingOverlayProps {
  message?: string;
  progress?: number;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message = 'Loading...', progress }) => {
  // Show progress bar even if we don't have a value, but show as indeterminate
  const hasProgress = progress !== undefined && progress >= 0;
  
  // State for smooth progress transitions
  const [displayProgress, setDisplayProgress] = useState(progress || 0);
  
  // Use effect to animate progress changes
  useEffect(() => {
    if (hasProgress && progress !== undefined) {
      // If progress jumps by more than 5%, animate it smoothly
      if (progress > displayProgress + 5) {
        // Animate the progress in smaller increments
        const interval = setInterval(() => {
          setDisplayProgress(prev => {
            const next = Math.min(prev + 1, progress);
            if (next >= progress) {
              clearInterval(interval);
            }
            return next;
          });
        }, 50); // Update every 50ms for smooth animation
        
        return () => clearInterval(interval);
      } else {
        // For small changes, update directly
        setDisplayProgress(progress);
      }
    }
  }, [progress, hasProgress]);
  
  // State for elapsed time tracking
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  // Start a timer to track elapsed time
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);
  
  // Calculate estimated time remaining if we have progress > 10%
  const showEta = hasProgress && displayProgress > 10 && elapsedSeconds > 5;
  
  // Simple estimated time calculation based on elapsed time and current progress
  const calculateEta = () => {
    if (!showEta) return '';
    
    const totalEstimatedSeconds = (elapsedSeconds / displayProgress) * 100;
    const remainingSeconds = Math.max(0, totalEstimatedSeconds - elapsedSeconds);
    
    if (remainingSeconds < 60) {
      return `${Math.ceil(remainingSeconds)} seconds remaining`;
    } else if (remainingSeconds < 3600) {
      return `${Math.ceil(remainingSeconds / 60)} minutes remaining`;
    } else {
      const hours = Math.floor(remainingSeconds / 3600);
      const minutes = Math.ceil((remainingSeconds % 3600) / 60);
      return `${hours}h ${minutes}m remaining`;
    }
  };

  // Add a status color based on progress
  const getStatusColor = () => {
    if (!hasProgress) return 'bg-gray-400';
    if (displayProgress < 30) return 'bg-blue-500';
    if (displayProgress < 70) return 'bg-sky-600';
    if (displayProgress < 100) return 'bg-blue-700';
    return 'bg-green-600'; // 100% complete
  };
  
  // Function to clear localStorage and reload the page
  const handleClearCache = () => {
    console.log('Clearing cache and reloading...');
    
    // Clear only Supabase-related items to avoid clearing other app data
    if (typeof window !== 'undefined') {
      Object.keys(localStorage).forEach(key => {
        if (key.includes('supabase') || key.includes('sb-')) {
          console.log('Removing item:', key);
          localStorage.removeItem(key);
        }
      });
    }
    
    // Force reload the page
    window.location.reload();
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white p-8 rounded-lg shadow-2xl flex flex-col items-center" style={{ minWidth: '400px', maxWidth: '90%' }}>
        <div className="mb-6 flex items-center justify-center relative">
          {/* Animated spinner */}
          <Loader2 className="h-20 w-20 text-blue-600 animate-spin" />
          
          {/* Progress percentage in middle of spinner */}
          {hasProgress && (
            <div className="absolute">
              <span className="text-2xl font-bold text-blue-700">{Math.round(displayProgress)}%</span>
            </div>
          )}
        </div>
        
        {/* Progress bar */}
        <div className="w-full mb-4">
          <div className="relative pt-1">
            <div className="overflow-hidden h-5 mb-2 text-xs flex rounded-full bg-blue-100 shadow-inner">
              <div 
                style={{ width: `${displayProgress}%` }} 
                className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center rounded-full transition-all duration-500 ease-out ${getStatusColor()} ${!hasProgress ? 'animate-pulse' : ''}`}
              ></div>
            </div>
          </div>
        </div>
        
        {/* Status message with larger font */}
        <div className="w-full text-center mb-3">
          <p className="text-gray-800 font-semibold text-lg">{message}</p>
          
          {/* Estimated time remaining with better styling */}
          {showEta && (
            <p className="text-blue-600 font-medium text-sm mt-1">{calculateEta()}</p>
          )}
        </div>
        
        {/* Elapsed time indicator */}
        <div className="w-full border-t border-gray-200 pt-3 mt-2">
          <p className="text-gray-500 text-sm text-center">
            Time elapsed: {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s
          </p>
        </div>
        
        {/* Processing message */}
        {!showEta && elapsedSeconds > 10 && (
          <p className="text-gray-500 text-sm mt-2 italic">
            {displayProgress < 100 ? "Processing your data, please wait..." : "Almost done!"}
          </p>
        )}
        
        {/* Show cache clear button after 15 seconds if still loading */}
        {elapsedSeconds > 15 && (
          <div className="mt-4 border-t border-gray-200 pt-4 w-full">
            <div className="flex flex-col items-center">
              <p className="text-amber-600 text-sm mb-2">Taking longer than expected?</p>
              <button
                onClick={handleClearCache}
                className="bg-amber-100 hover:bg-amber-200 text-amber-800 font-medium py-2 px-4 rounded-full inline-flex items-center text-sm transition-colors"
              >
                <RefreshCw size={16} className="mr-2" />
                Clear Cache & Reload
              </button>
              <p className="text-gray-500 text-xs mt-2">This may help if you're stuck in a loading state</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadingOverlay;