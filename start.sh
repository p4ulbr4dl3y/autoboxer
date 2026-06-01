#!/bin/bash

# Trap SIGINT (Ctrl+C) and SIGTERM to kill background jobs on exit
trap 'echo "Stopping Autoboxer services..."; kill $(jobs -p) 2>/dev/null' EXIT

echo "Starting Autoboxer services..."

# Start Backend API
echo "Starting backend API on http://localhost:8000..."
cd backend
uv run main.py &
cd ..

# Start Frontend Client
echo "Starting frontend client on http://localhost:5173..."
cd frontend
npm run dev &
cd ..

# Wait for background jobs
wait
