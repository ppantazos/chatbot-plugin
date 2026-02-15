#!/bin/bash
# Automated WordPress Plugin Local Setup Script (Linux/Mac)

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PLUGIN_NAME="sellembedded-chatbot"
WP_DIR="$SCRIPT_DIR/wordpress-local"
PLUGIN_DIR="$WP_DIR/wp-content/plugins/$PLUGIN_NAME"

echo "🚀 Setting up local WordPress environment..."

# Check if Docker is available
if command -v docker &> /dev/null && docker --version &> /dev/null; then
    echo "✅ Docker detected"
    echo ""
    echo "🐳 Using Docker setup..."
    
    if [ -f "$SCRIPT_DIR/docker-compose.yml" ]; then
        cd "$SCRIPT_DIR"
        echo "Starting Docker containers..."
        docker-compose up -d
        
        echo ""
        echo "✅ WordPress is starting up!"
        echo "📝 Access WordPress at: http://localhost:8080"
        echo "📝 Database: wordpress / wordpress"
        echo ""
        echo "⏳ Waiting for WordPress to be ready..."
        sleep 10
        
        # Try to open browser (Linux/Mac)
        if command -v xdg-open &> /dev/null; then
            xdg-open "http://localhost:8080" 2>/dev/null &
        elif command -v open &> /dev/null; then
            open "http://localhost:8080" 2>/dev/null &
        fi
        
        echo ""
        echo "✅ Setup complete! WordPress should be accessible at http://localhost:8080"
        echo ""
        echo "To stop: docker-compose down"
        echo "To view logs: docker-compose logs -f"
        exit 0
    else
        echo "❌ docker-compose.yml not found!"
        exit 1
    fi
fi

# Manual setup
echo ""
echo "📦 Setting up WordPress manually..."

# Check if PHP is available
if ! command -v php &> /dev/null; then
    echo "❌ PHP not found. Please install PHP 7.4+ or use Docker."
    exit 1
fi

PHP_VERSION=$(php -v | head -n 1)
echo "✅ PHP detected: $PHP_VERSION"

# Download WordPress if not exists
if [ ! -d "$WP_DIR" ]; then
    echo "Downloading WordPress..."
    cd "$SCRIPT_DIR"
    curl -L -o wordpress.zip https://wordpress.org/latest.zip
    unzip -q wordpress.zip
    rm wordpress.zip
    mv wordpress wordpress-local
    echo "✅ WordPress downloaded"
else
    echo "✅ WordPress directory exists"
fi

# Copy plugin
if [ ! -d "$PLUGIN_DIR" ]; then
    echo "Copying plugin..."
    mkdir -p "$(dirname "$PLUGIN_DIR")"
    cp -r "$SCRIPT_DIR" "$PLUGIN_DIR"
    # Remove unnecessary files
    rm -rf "$PLUGIN_DIR/wordpress-local" "$PLUGIN_DIR/node_modules" "$PLUGIN_DIR/.git" 2>/dev/null || true
    echo "✅ Plugin copied"
else
    echo "✅ Plugin already exists"
fi

# Create wp-config.php if not exists
WP_CONFIG="$WP_DIR/wp-config.php"
if [ ! -f "$WP_CONFIG" ]; then
    echo "Creating wp-config.php..."
    cp "$WP_DIR/wp-config-sample.php" "$WP_CONFIG"
    
    # Update database settings (you may need to adjust these)
    sed -i.bak "s/database_name_here/wordpress/g" "$WP_CONFIG"
    sed -i.bak "s/username_here/root/g" "$WP_CONFIG"
    sed -i.bak "s/password_here//g" "$WP_CONFIG"
    sed -i.bak "s/localhost/localhost/g" "$WP_CONFIG"
    
    # Add debug settings
    echo "" >> "$WP_CONFIG"
    echo "define('WP_DEBUG', true);" >> "$WP_CONFIG"
    echo "define('WP_DEBUG_LOG', true);" >> "$WP_CONFIG"
    echo "define('WP_DEBUG_DISPLAY', false);" >> "$WP_CONFIG"
    
    rm -f "$WP_CONFIG.bak"
    echo "✅ wp-config.php created"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Make sure MySQL/MariaDB is running"
echo "2. Create database 'wordpress'"
echo "3. Run: cd wordpress-local && php -S localhost:8000"
echo "4. Open http://localhost:8000 in your browser"
echo "5. Complete WordPress installation"
echo "6. Activate 'SellEmbedded Chatbot' plugin"
echo ""
echo "✨ Done! Happy coding!"

