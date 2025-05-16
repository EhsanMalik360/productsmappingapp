// API client utility for communicating with Django backend

// When running in development with Vite proxy, use relative URL
// In production, use the actual server URL
const API_URL = import.meta.env.VITE_API_URL || 
  (window.location.hostname === 'localhost' 
    ? '/api' // This will use Vite's proxy
    : `${window.location.origin}/api`);

console.log('API client initialized with base URL:', API_URL);


// Generic fetch function with error handling
async function fetchApi(endpoint: string, options: RequestInit = {}): Promise<any> {
  const url = `${API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    credentials: 'include', // Include cookies for CORS
    ...options,
  });
  
  if (!response.ok) {
    let errorMessage = 'An error occurred';
    try {
    const error = await response.json();
      errorMessage = error.error || error.message || errorMessage;
    } catch (e) {
      // If response isn't JSON, use status text
      errorMessage = response.statusText;
    }
    throw new Error(errorMessage);
  }
  
  return response.json();
}

// API functions
export const api = {
  // Products
  getProducts: (params = {}) => fetch(`${API_URL}/products/?${new URLSearchParams(params).toString()}`, { credentials: 'include' }).then(response => response.json()),
  getProduct: (id: string) => fetch(`${API_URL}/products/${id}/`, { credentials: 'include' }).then(response => response.json()),
  createProduct: (data: Record<string, any>) => fetch(`${API_URL}/products/`, { 
    method: 'POST', 
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(response => response.json()),
  updateProduct: (id: string, data: Record<string, any>) => fetch(`${API_URL}/products/${id}/`, { 
    method: 'PUT', 
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(response => response.json()),
  deleteProduct: (id: string) => fetch(`${API_URL}/products/${id}/`, { 
    method: 'DELETE', 
    credentials: 'include'
  }).then(response => {
    if (response.ok) return { success: true };
    throw new Error(`Delete failed with status: ${response.status}`);
  }),
  getImportedProducts: () => fetch(`${API_URL}/products/imported/`, { credentials: 'include' }).then(response => response.json()),

  // Suppliers
  getSuppliers: (params: Record<string, any> = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return fetchApi(`/suppliers/${queryString ? `?${queryString}` : ''}`);
  },
  getSupplier: (id: string) => fetchApi(`/suppliers/${id}/`),
  createSupplier: (data: Record<string, any>) => fetchApi('/suppliers/', { method: 'POST', body: JSON.stringify(data) }),
  updateSupplier: (id: string, data: Record<string, any>) => fetchApi(`/suppliers/${id}/`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSupplier: (id: string) => fetchApi(`/suppliers/${id}/`, { method: 'DELETE' }),

  // Supplier Products
  getSupplierProducts: (params: Record<string, any> = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return fetchApi(`/supplier-products/${queryString ? `?${queryString}` : ''}`);
  },
  getSupplierProduct: (id: string) => fetchApi(`/supplier-products/${id}/`),
  createSupplierProduct: (data: Record<string, any>) => fetchApi('/supplier-products/', { method: 'POST', body: JSON.stringify(data) }),
  updateSupplierProduct: (id: string, data: Record<string, any>) => fetchApi(`/supplier-products/${id}/`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSupplierProduct: (id: string) => fetchApi(`/supplier-products/${id}/`, { method: 'DELETE' }),

  // File Upload
  uploadSupplierFile: (file: File, options: Record<string, any> = {}) => {
    // Create FormData with the file
    const formData = new FormData();
    formData.append('file', file);
    
    // Include all options in the request
    Object.keys(options).forEach(key => {
      if (options[key] !== null && options[key] !== undefined) {
        // Stringify objects
        if (typeof options[key] === 'object') {
          formData.append(key, JSON.stringify(options[key]));
        } else {
          formData.append(key, options[key].toString());
        }
      }
    });
    
    console.log(`Uploading supplier file to ${API_URL}/upload/supplier/...`);
    
    // Calculate timeout based on file size - use more generous timeouts
    const fileSizeMB = file.size / (1024 * 1024);
    const uploadTimeoutMs = Math.max(
      180000, // Minimum 3 minutes even for small files
      Math.min(600000, Math.round(fileSizeMB * 10000)) // Max 10 minutes, with more scaling
    );
    
    console.log(`Setting upload timeout to ${Math.round(uploadTimeoutMs/1000)} seconds based on file size of ${fileSizeMB.toFixed(2)}MB`);
    
    // Use the endpoint directly with timeout protection
    return Promise.race([
      fetch(`${API_URL}/upload/supplier/`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Upload timed out. Your file might be too large or the server is busy. Try reducing the file size or try again later.')), 
        uploadTimeoutMs)
      )
    ])
    .then(response => {
      if (!response.ok) {
        // Handle different error status codes
        if (response.status === 413) {
          throw new Error('File too large for server to handle. Try a smaller file or contact your administrator.');
        } else if (response.status === 400) {
          return response.json().then(data => {
            throw new Error(data.error || 'Bad request');
          });
        } else if (response.status === 502) {
          throw new Error('Server is busy or unreachable (502 Bad Gateway). Try again later.');
        } else {
          throw new Error(`Server returned error status: ${response.status}`);
        }
      }
      return response.json();
    })
    .then(data => {
      console.log('Supplier file upload completed successfully');
      return data;
    })
    .catch(error => {
      console.error('Error in uploadSupplierFile:', error);
      throw error;
    });
  },
  
  uploadAmazonFile: (file: File, options: Record<string, unknown> = {}) => {
    // First, test the endpoint with a simple GET request
    console.log('Testing upload endpoint before submitting file...');
    return fetch(`${API_URL}/upload/amazon/`, { 
      method: 'GET',
      credentials: 'include'
    })
    .then(response => {
      console.log('Upload endpoint test result:', response.status, response.statusText);
  if (!response.ok) {
        console.error('Upload endpoint test failed with status:', response.status);
        throw new Error(`Upload endpoint test failed with status: ${response.status}`);
      }
      
      // Then proceed with the actual file upload
      const formData = new FormData();
      formData.append('file', file);
      
      if (options.field_mapping) {
        formData.append('field_mapping', JSON.stringify(options.field_mapping));
      }
      
      if (options.batch_size) {
        formData.append('batch_size', options.batch_size.toString());
      }
      
      console.log(`Uploading file to ${API_URL}/upload/amazon/...`);
      
      // Calculate timeout based on file size - larger files need more time
      const fileSizeMB = file.size / (1024 * 1024);
      const uploadTimeoutMs = Math.max(
        120000, // Minimum 2 minutes
        Math.min(600000, Math.round(fileSizeMB * 5000)) // Max 10 minutes, scaling with file size
      );
      
      console.log(`Setting upload timeout to ${Math.round(uploadTimeoutMs/1000)} seconds based on file size of ${fileSizeMB.toFixed(2)}MB`);
      
      // Use only the Django endpoint
      return Promise.race([
        fetch(`${API_URL}/upload/amazon/`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
        }),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Upload timed out. Your file might be too large for the server to handle. Try reducing the file size or try again later.')), 
          uploadTimeoutMs)
        )
      ]);
    })
    .then((response: Response) => {
      if (!response.ok) {
        // Try to parse JSON error if available
        return response.text().then((text: string) => {
          console.log('Server response text:', text);
          try {
            const error = JSON.parse(text);
            throw new Error(error.error || 'Upload failed');
          } catch (e) {
            // If not valid JSON, return the raw response
            if (e instanceof SyntaxError) {
              console.error('Server returned non-JSON response. Status:', response.status);
              throw new Error(`Upload failed with status ${response.status}. Check the server logs for details.`);
            }
            throw e;
          }
        });
      }
      return response.json().then(data => {
        // Ensure response has a job_id field
        if (data.id && !data.job_id) {
          data.job_id = data.id; // Use id as job_id if job_id doesn't exist
          console.log('Mapped server response id to job_id:', data.job_id);
        }
        return data;
      });
    });
  },
  
  checkJobStatus: (jobId: string) => {
    console.log(`Checking job status for ID: ${jobId}`);
    
    // Increase timeout to 60 seconds for status checks on large imports
    const statusCheckTimeout = 60000; // 60 seconds
    
    // For real job IDs, use the Django status checking endpoint
    return Promise.race([
      fetch(`${API_URL}/api/upload/status/${jobId}/`, {
        credentials: 'include'
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Status check timed out after 60 seconds')), 
        statusCheckTimeout) // 60 second timeout instead of 30
      )
    ])
    .then(response => {
      console.log(`[API DEBUG] Status check response: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        // Handle 404 or other errors
        console.warn(`Status check failed with status: ${response.status}`);
        if (response.status === 404) {
          return {
            status: 'processing',
            progress: 50,
            message: 'File is being processed. Status tracking might be limited.'
          };
        } else if (response.status === 502 || response.status === 504) {
          // Gateway timeout or bad gateway - server might be busy
          return {
            status: 'processing',
            progress: 70,
            message: 'Server is busy processing your file. This can take several minutes for large imports.'
          };
        }
        throw new Error(`Status check failed with status: ${response.status}`);
      }

      // Parse the response
      return response.json();
    })
    .then(data => {
      console.log('[API DEBUG] Raw job status data from Django backend:', JSON.stringify(data, null, 2));
      
      // Map Django backend fields to frontend expected fields
      const mappedData = {
        status: data.status,
        progress: data.progress || 0,
        message: data.status_message || 'Processing file...',
        results: data.results
      };
      
      // For completed jobs with results, ensure we have the data structured correctly
      if (mappedData.status === 'completed' && mappedData.results) {
        console.log('[API DEBUG] Received completed status with results from Django:', 
          JSON.stringify(mappedData.results, null, 2));
      }
      
      return mappedData;
    });
  },
  
  getImportHistory: (params: Record<string, any> = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return fetchApi(`/import-history/${queryString ? `?${queryString}` : ''}`);
  },
  
  // Recent Jobs (for finding active jobs)
  getRecentJobs: () => {
    return fetchApi(`/upload/jobs/recent`)
      .catch(error => {
        console.error('Error fetching recent jobs:', error);
        return []; // Return empty array on error to avoid breaking the UI
      });
  },
  
  // Profit Analysis
  getProfitAnalysis: (params: Record<string, any> = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return fetchApi(`/profit-analysis/${queryString ? `?${queryString}` : ''}`);
  },
  
  // Server Configuration
  getServerConfig: () => fetchApi('/config/'),
  
  // Health Check
  checkHealth: () => fetchApi('/health/'),
  
  baseUrl: API_URL
}; 

export default api; 