# Railway Deployment Guide

This document provides instructions for deploying the Product Mapping application to Railway.

## Prerequisites

1. A [Railway](https://railway.app/) account
2. [Railway CLI](https://docs.railway.app/develop/cli) installed (optional for more advanced deployment)
3. Your Supabase project details

## Deployment Steps

### 1. Fork or Clone the Repository

First, ensure you have a copy of the repository that you can connect to Railway.

### 2. Connect to Railway

#### Using Railway Dashboard:

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway will automatically detect your project settings

#### Using Railway CLI:

```bash
# Login to Railway
railway login

# Link your project
railway link

# Deploy your project
railway up
```

### 3. Configure Environment Variables

In the Railway dashboard, go to your project, click on the "Variables" tab, and add the following:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key
PORT=3001
MAX_FILE_SIZE=2147483648
DEFAULT_CHUNK_SIZE=10000
DEFAULT_BATCH_SIZE=500
HIGH_MEMORY_THRESHOLD=1536
```

### 4. Set Resource Allocation

1. Navigate to your project settings
2. Go to the "Resources" tab
3. Increase the RAM allocation to at least 4GB for handling large file processing
4. Save your changes

### 5. Deploy

Your application will automatically deploy after configuration. You can also manually deploy:

1. In the Railway dashboard, go to your project
2. Click "Deploy" or "Redeploy"

### 6. Verify Deployment

1. Once deployed, Railways will provide a URL for your application
2. Visit the URL to ensure the application is running correctly
3. Check the `/health` endpoint to verify the server is working

## File Storage Considerations

Railway provides ephemeral storage, which means files uploaded to the server will be lost when the service restarts. For production use, modify the application to use:

1. Supabase Storage
2. AWS S3
3. Another cloud storage solution

## Troubleshooting

If your deployment fails:

1. Check deployment logs in the Railway dashboard
2. Ensure all environment variables are set correctly
3. Verify the server has enough memory (at least 4GB recommended)
4. Check if the application is exceeding Railway's storage limits

## Support

For Railway-specific issues, refer to the [Railway documentation](https://docs.railway.app/). 