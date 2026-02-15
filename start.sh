#!/bin/bash
# Quick Start Script - Just run this! (Linux/Mac)

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "🚀 Starting SellEmbedded Chatbot Local Environment..."
echo ""

# Check if Docker is running
if ! docker ps &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Navigate to script directory
cd "$SCRIPT_DIR"

# Start Docker containers
echo "🐳 Starting WordPress and MySQL containers..."
docker-compose up -d

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Success! WordPress is starting up..."
    echo ""
    echo "📝 WordPress URL: http://localhost:8080"
    echo "📝 Database Host: localhost:3306"
    echo "📝 Database Name: wordpress"
    echo "📝 Database User: wordpress"
    echo "📝 Database Password: wordpress"
    echo ""
    echo "⏳ Waiting for WordPress to be ready (this may take 30-60 seconds)..."
    
    # Wait for WordPress to be ready
    max_attempts=30
    attempt=0
    ready=false
    
    while [ $attempt -lt $max_attempts ] && [ "$ready" = false ]; do
        sleep 2
        attempt=$((attempt + 1))
        if curl -s http://localhost:8080 > /dev/null 2>&1; then
            ready=true
        fi
        echo -n "."
    done
    
    echo ""
    echo ""
    
    if [ "$ready" = true ]; then
        echo "✅ WordPress is ready!"
    else
        echo "⚠️  WordPress is still starting. It should be ready soon."
    fi
    
    echo ""
    echo "🌐 Opening WordPress in your browser..."
    sleep 2
    
    # Try to open browser
    if command -v xdg-open &> /dev/null; then
        xdg-open "http://localhost:8080" 2>/dev/null &
    elif command -v open &> /dev/null; then
        open "http://localhost:8080" 2>/dev/null &
    fi
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 Next Steps:"
    echo "1. Complete WordPress installation (if first time)"
    echo "2. Go to Plugins → Installed Plugins"
    echo "3. Activate 'SellEmbedded Chatbot'"
    echo "4. Go to Settings → SellEmbedded Chatbot"
    echo "5. Configure your API key"
    echo ""
    echo "🛑 To stop: Run ./stop.sh or 'docker-compose down'"
    echo "📊 To view logs: docker-compose logs -f"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
else
    echo ""
    echo "❌ Failed to start containers. Check Docker is running."
    echo ""
    echo "Troubleshooting:"
    echo "- Make sure Docker is running"
    echo "- Check if port 8080 is already in use"
    echo "- Try: docker-compose down (to clean up) then start again"
fi

