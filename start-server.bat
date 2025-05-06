@echo off
echo Starting server with increased memory limits for large file imports...

:: Determine memory limit based on available system resources
:: This command gets total physical memory in MB (divide by 1024 to get memory in MB)
for /f "tokens=4" %%a in ('systeminfo ^| findstr /C:"Total Physical Memory"') do set total_mem=%%a
:: Remove commas from the memory value
set total_mem=%total_mem:,=%
:: Convert to number in MB
set /a total_mem_mb=%total_mem%

:: Calculate recommended memory (between 4GB and 8GB, or half of system RAM)
set /a recommended_mem=%total_mem_mb% / 2
if %recommended_mem% LSS 4096 set recommended_mem=4096
if %recommended_mem% GTR 8192 set recommended_mem=8192

echo System memory: %total_mem_mb% MB
echo Setting Node.js memory limit to: %recommended_mem% MB

:: Start server with increased memory
node --max-old-space-size=%recommended_mem% src/server/index.js

echo Server stopped. 