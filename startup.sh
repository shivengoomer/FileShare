#!/bin/bash
# Azure App Service startup script for FastAPI + React SPA

set -e

# Navigate to root of deployment
cd /home/site/wwwroot || cd $(dirname "$0")

echo "Starting FileShare FastAPI application..."

# Ensure Python is available
if ! command -v python &> /dev/null; then
    echo "Error: Python not found. Ensure Python 3.11+ is selected in App Service Configuration."
    exit 1
fi

# The PORT variable is automatically set by Azure App Service
# Default to 8000 if not set (for local testing)
PORT="${PORT:-8000}"
echo "Using port: $PORT"

# Install/upgrade Python dependencies if requirements.txt exists
if [ -f "backend/requirements.txt" ]; then
    echo "Installing Python dependencies..."
    pip install --upgrade pip
    pip install -r backend/requirements.txt
fi

echo "Launching Uvicorn server..."
exec uvicorn backend.main:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --workers 1 \
    --log-level info

