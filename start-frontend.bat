@echo off
echo Starting React frontend for Products Mapping Web App...

REM Check if dependencies are installed
if not exist node_modules (
    echo Installing npm dependencies...
    npm install
)

REM Start the development server
echo Starting development server on port 3000...
npm run dev 