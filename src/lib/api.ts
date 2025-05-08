// API client utility for communicating with backend

// Get the API URL from environment variables with fallback for Railway deployment
const API_URL = import.meta.env.VITE_API_URL || 
  (window.location.hostname === 'localhost' 
    ? 'http://localhost:3001' 
    : window.location.origin);

/**
 * Upload file to the server
 * @param file The file to upload
 * @param type The type of data (product, supplier)
 * @param options Additional upload options
 * @returns Promise with the upload result
 */
export async function uploadFile(file, type, options = {}) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', type);
  
  if (options) {
    formData.append('options', JSON.stringify(options));
  }
  
  const response = await fetch(`${API_URL}/api/upload`, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Upload failed');
  }
  
  return response.json();
}

/**
 * Check upload status
 * @param id The upload job ID
 * @returns Promise with the status
 */
export async function checkUploadStatus(id) {
  const response = await fetch(`${API_URL}/api/uploads/${id}/status`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to check status');
  }
  
  return response.json();
}

export default {
  uploadFile,
  checkUploadStatus,
  baseUrl: API_URL
}; 