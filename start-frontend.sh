#!/bin/bash

echo "Starting React frontend for Products Mapping Web App..."

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
fi

# Start the development server
echo "Starting development server on port 3000..."
npm run dev 