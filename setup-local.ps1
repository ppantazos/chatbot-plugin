# Automated WordPress Plugin Local Setup Script
# This script sets up a local WordPress environment with the plugin

Write-Host "🚀 Setting up local WordPress environment..." -ForegroundColor Cyan

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$pluginName = "sellembedded-chatbot"
$wpDir = Join-Path $scriptPath "wordpress-local"
$pluginDir = Join-Path $wpDir "wp-content\plugins\$pluginName"

# Check if Docker is available
$dockerAvailable = $false
try {
    docker --version | Out-Null
    $dockerAvailable = $true
    Write-Host "✅ Docker detected" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Docker not found. Will use alternative method." -ForegroundColor Yellow
}

if ($dockerAvailable) {
    Write-Host "`n🐳 Using Docker setup..." -ForegroundColor Cyan
    
    # Check if docker-compose.yml exists
    if (Test-Path (Join-Path $scriptPath "docker-compose.yml")) {
        Write-Host "Starting Docker containers..." -ForegroundColor Yellow
        Set-Location $scriptPath
        docker-compose up -d
        
        Write-Host "`n✅ WordPress is starting up!" -ForegroundColor Green
        Write-Host "📝 Access WordPress at: http://localhost:8080" -ForegroundColor Cyan
        Write-Host "📝 Database: wordpress / wordpress" -ForegroundColor Cyan
        Write-Host "`n⏳ Waiting for WordPress to be ready..." -ForegroundColor Yellow
        
        Start-Sleep -Seconds 10
        
        # Try to open browser
        try {
            Start-Process "http://localhost:8080"
        } catch {
            Write-Host "Please open http://localhost:8080 in your browser" -ForegroundColor Yellow
        }
        
        Write-Host "`n✅ Setup complete! WordPress should be accessible at http://localhost:8080" -ForegroundColor Green
        Write-Host "`nTo stop: docker-compose down" -ForegroundColor Gray
        Write-Host "To view logs: docker-compose logs -f" -ForegroundColor Gray
        
    } else {
        Write-Host "❌ docker-compose.yml not found!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`n📦 Setting up WordPress manually..." -ForegroundColor Cyan
    
    # Check if PHP is available
    $phpAvailable = $false
    try {
        $phpVersion = php -v 2>&1 | Select-Object -First 1
        if ($phpVersion -match "PHP") {
            $phpAvailable = $true
            Write-Host "✅ PHP detected: $phpVersion" -ForegroundColor Green
        }
    } catch {
        Write-Host "❌ PHP not found. Please install PHP 7.4+ or use Docker." -ForegroundColor Red
        exit 1
    }
    
    # Download WordPress if not exists
    if (-not (Test-Path $wpDir)) {
        Write-Host "Downloading WordPress..." -ForegroundColor Yellow
        $wpZip = Join-Path $scriptPath "wordpress.zip"
        
        try {
            Invoke-WebRequest -Uri "https://wordpress.org/latest.zip" -OutFile $wpZip
            Expand-Archive -Path $wpZip -DestinationPath $scriptPath -Force
            Remove-Item $wpZip
            Rename-Item (Join-Path $scriptPath "wordpress") $wpDir
            Write-Host "✅ WordPress downloaded" -ForegroundColor Green
        } catch {
            Write-Host "❌ Failed to download WordPress. Please download manually." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "✅ WordPress directory exists" -ForegroundColor Green
    }
    
    # Copy plugin
    if (-not (Test-Path $pluginDir)) {
        Write-Host "Copying plugin..." -ForegroundColor Yellow
        New-Item -ItemType Directory -Path (Split-Path $pluginDir) -Force | Out-Null
        Copy-Item -Path $scriptPath -Destination $pluginDir -Recurse -Exclude "wordpress-local","node_modules",".git" -Force
        Write-Host "✅ Plugin copied" -ForegroundColor Green
    } else {
        Write-Host "✅ Plugin already exists" -ForegroundColor Green
    }
    
    # Create wp-config.php if not exists
    $wpConfig = Join-Path $wpDir "wp-config.php"
    if (-not (Test-Path $wpConfig)) {
        Write-Host "Creating wp-config.php..." -ForegroundColor Yellow
        Copy-Item (Join-Path $wpDir "wp-config-sample.php") $wpConfig
        
        # Update database settings
        $configContent = Get-Content $wpConfig -Raw
        $configContent = $configContent -replace "database_name_here", "wordpress"
        $configContent = $configContent -replace "username_here", "root"
        $configContent = $configContent -replace "password_here", ""
        $configContent = $configContent -replace "localhost", "localhost"
        
        # Add debug settings
        $configContent = $configContent -replace "define\('WP_DEBUG', false\);", "define('WP_DEBUG', true);`r`ndefine('WP_DEBUG_LOG', true);`r`ndefine('WP_DEBUG_DISPLAY', false);"
        
        Set-Content -Path $wpConfig -Value $configContent
        Write-Host "✅ wp-config.php created" -ForegroundColor Green
    }
    
    Write-Host "`n✅ Setup complete!" -ForegroundColor Green
    Write-Host "`n📝 Next steps:" -ForegroundColor Cyan
    Write-Host "1. Make sure MySQL/MariaDB is running" -ForegroundColor Yellow
    Write-Host "2. Create database 'wordpress' in phpMyAdmin or MySQL" -ForegroundColor Yellow
    Write-Host "3. Run: cd wordpress-local && php -S localhost:8000" -ForegroundColor Yellow
    Write-Host "4. Open http://localhost:8000 in your browser" -ForegroundColor Yellow
    Write-Host "5. Complete WordPress installation" -ForegroundColor Yellow
    Write-Host "6. Activate 'SellEmbedded Chatbot' plugin" -ForegroundColor Yellow
}

Write-Host "`n✨ Done! Happy coding!" -ForegroundColor Green

