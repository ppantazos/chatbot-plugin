#!/bin/bash
# Stop Script - Stops all containers (Linux/Mac)

echo "🛑 Stopping WordPress environment..."

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

docker-compose down

echo ""
echo "✅ Stopped!"
echo ""
echo "To start again, run: ./start.sh"
echo ""

