# Local Development Setup Guide

## Quick Setup Options

### Option 1: Local by Flywheel (Easiest)
1. Download and install [Local by Flywheel](https://localwp.com/)
2. Create a new WordPress site
3. Copy this plugin folder to: `wp-content/plugins/sellembedded-chatbot`
4. Activate the plugin in WordPress admin → Plugins

### Option 2: Docker (Recommended for Developers)
1. Make sure Docker Desktop is installed and running
2. Navigate to this directory in terminal
3. Run: `docker-compose up -d`
4. Visit: http://localhost:8080
5. Complete WordPress installation
6. Plugin is already mounted, just activate it in Plugins menu

### Option 3: XAMPP/WAMP/MAMP
1. Install XAMPP (Windows) or MAMP (Mac)
2. Download WordPress from wordpress.org
3. Extract WordPress to `htdocs/wordpress` (XAMPP) or `htdocs` (MAMP)
4. Create database: `wordpress` (via phpMyAdmin)
5. Copy this plugin to: `wp-content/plugins/sellembedded-chatbot`
6. Visit: http://localhost/wordpress (or http://localhost:8888 for MAMP)
7. Complete WordPress installation
8. Activate plugin in WordPress admin

### Option 4: Manual PHP Server (Advanced)
1. Install PHP 7.4+ and MySQL
2. Download WordPress
3. Set up WordPress manually
4. Copy plugin to `wp-content/plugins/sellembedded-chatbot`
5. Run: `php -S localhost:8000` from WordPress root

## Plugin Requirements
- PHP 7.4 or higher
- WordPress 5.0 or higher
- Composer dependencies (already installed in `vendor/` folder)

## After Setup
1. Go to WordPress Admin → Settings → SellEmbedded Chatbot
2. Configure your API key
3. The chatbot will appear on your WordPress site

## Troubleshooting
- **"Class Inpsyde\\Modularity\\Properties\\PluginProperties not found"**: Run `composer install` in the plugin directory to install PHP dependencies. The plugin requires the `inpsyde/modularity` package from Composer.
- If plugin doesn't appear: Check file permissions and ensure `vendor/autoload.php` exists
- If errors occur: Check WordPress debug log (`wp-content/debug.log`)
- Enable WordPress debugging: Add to `wp-config.php`:
  ```php
  define('WP_DEBUG', true);
  define('WP_DEBUG_LOG', true);
  ```

