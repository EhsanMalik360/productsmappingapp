# Memory Optimization Guide

This guide explains how to use the memory optimization tools for processing large CSV files efficiently.

## Available Tools

1. **start-optimized.js** - Launches the server with memory optimizations
2. **split-csv.js** - Splits large CSV files into smaller chunks
3. **monitor-memory.js** - Monitors memory usage during imports

## Quick Start

For processing very large files with limited memory:

```bash
# Step 1: Split a large CSV file into smaller chunks
node split-csv.js large-file.csv 5000

# Step 2: Start the server with memory optimizations
node start-optimized.js

# Step 3: In a separate terminal, monitor memory usage
node monitor-memory.js
```

Then import each split file separately through the application UI.

## Memory Optimization Settings

The following settings can be configured in your `.env` file:

```
# Turn on extreme optimization mode
EXTREME_OPTIMIZATION=true

# CSV processing settings
DEFAULT_CHUNK_SIZE=50
DEFAULT_BATCH_SIZE=10
FORCE_GC_INTERVAL=1000
HIGH_MEMORY_THRESHOLD=512
MAX_ROWS=50000
CONCURRENT_PROCESSING=1
LOW_MEMORY_MODE=true
CSV_HIGH_WATER_MARK=16
CSV_OBJECT_HIGH_WATER_MARK=50
```

## File Splitting Recommendations

| File Size | Rows Per Split | Batch Size | Chunk Size |
|-----------|----------------|------------|------------|
| < 10MB    | Not needed     | 20         | 100        |
| 10-50MB   | 10,000         | 20         | 100        |
| 50-200MB  | 5,000          | 10         | 50         |
| > 200MB   | 2,000          | 10         | 50         |

## Monitoring Memory Usage

The memory monitor (`monitor-memory.js`) logs:

- Heap usage
- External memory
- Array buffers
- RSS (Resident Set Size)

This data is logged to both the console and a CSV file (`memory-log.csv`) for later analysis.

## Troubleshooting

If you encounter memory issues:

1. Reduce the rows per split file
2. Enable extreme optimization mode
3. Decrease batch and chunk sizes
4. Run on a machine with more available RAM

## How This Works

The optimization uses:

1. Streaming CSV parser with backpressure management
2. Batch processing of data
3. Chunk-based file processing
4. Forced garbage collection
5. Memory usage monitoring and throttling 