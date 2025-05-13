#!/bin/bash
# Shell script to run server with extreme optimization in deployment

echo "🚀 Starting server with memory optimizations in deployment environment..."

# Set optimization environment variables
export EXTREME_OPTIMIZATION=true
export DEFAULT_CHUNK_SIZE=50
export DEFAULT_BATCH_SIZE=10
export FORCE_GC_INTERVAL=1000
export HIGH_MEMORY_THRESHOLD=512
export MAX_ROWS=50000
export CONCURRENT_PROCESSING=1
export LOW_MEMORY_MODE=true
export CSV_HIGH_WATER_MARK=16
export CSV_OBJECT_HIGH_WATER_MARK=50
export NODE_OPTIONS="--expose-gc --optimize-for-size --max-old-space-size=2048 --gc-interval=100"

echo "Environment variables set for extreme optimization"
echo "Running npm run server with optimized settings..."

# Run the server with your standard deployment command
npm run server 