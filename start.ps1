# Quick Start Script - Just run this!
# This is the simplest way to start everything

Write-Host "Starting SellEmbedded Chatbot Local Environment..." -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
try {
    docker ps | Out-Null
    Write-Host "Docker is running" -ForegroundColor Green
} catch {
    Write-Host "Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    Write-Host "Press any key to exit..."
    try {
        $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    } catch {
        Read-Host "Press Enter to exit"
    }
    exit 1
}

# Navigate to script directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Start Docker containers
Write-Host "Starting WordPress and MySQL containers..." -ForegroundColor Yellow
docker-compose up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Success! WordPress is starting up..." -ForegroundColor Green
    Write-Host ""
    Write-Host "WordPress URL: http://localhost:8080" -ForegroundColor Cyan
    Write-Host "Database Host: db (internal Docker network)" -ForegroundColor Cyan
    Write-Host "Database Name: wordpress" -ForegroundColor Cyan
    Write-Host "Database User: wordpress" -ForegroundColor Cyan
    Write-Host "Database Password: wordpress" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Waiting for MySQL to be ready (this may take 30-60 seconds)..." -ForegroundColor Yellow
    
    # Wait for MySQL to be healthy
    $maxAttempts = 60
    $attempt = 0
    $dbReady = $false
    
    while ($attempt -lt $maxAttempts -and -not $dbReady) {
        Start-Sleep -Seconds 2
        $attempt++
        try {
            $health = docker inspect --format='{{.State.Health.Status}}' sellembedded-chatbot-db-1 2>&1 | Out-String
            if ($health -match "healthy") {
                $dbReady = $true
            }
        } catch {
            # Still loading
        }
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "Waiting for WordPress to be ready..." -ForegroundColor Yellow
    
    # Wait for WordPress to be ready
    $maxAttempts = 30
    $attempt = 0
    $ready = $false
    
    while ($attempt -lt $maxAttempts -and -not $ready) {
        Start-Sleep -Seconds 2
        $attempt++
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:8080" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                $ready = $true
            }
        } catch {
            # Still loading
        }
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host ""
    
    if ($ready) {
        Write-Host "WordPress is ready!" -ForegroundColor Green
    } else {
        Write-Host "WordPress is still starting. It should be ready soon." -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "Opening WordPress in your browser..." -ForegroundColor Cyan
    Start-Sleep -Seconds 2
    
    try {
        Start-Process "http://localhost:8080"
    } catch {
        Write-Host "Please open http://localhost:8080 in your browser" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Gray
    Write-Host "Next Steps:" -ForegroundColor Cyan
    Write-Host "1. Complete WordPress installation (if first time)" -ForegroundColor White
    Write-Host "2. Go to Plugins -> Installed Plugins" -ForegroundColor White
    Write-Host "3. Activate 'SellEmbedded Chatbot'" -ForegroundColor White
    Write-Host "4. Go to Settings -> SellEmbedded Chatbot" -ForegroundColor White
    Write-Host "5. Configure your API key" -ForegroundColor White
    Write-Host ""
    Write-Host "To stop: Run stop.ps1 or 'docker-compose down'" -ForegroundColor Gray
    Write-Host "To view logs: docker-compose logs -f" -ForegroundColor Gray
    Write-Host "================================================================" -ForegroundColor Gray
    
} else {
    Write-Host ""
    Write-Host "Failed to start containers. Check Docker Desktop is running." -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "- Make sure Docker Desktop is running" -ForegroundColor White
    Write-Host "- Check if port 8080 is already in use" -ForegroundColor White
    Write-Host "- If MySQL port 3306 is in use, stop local MySQL service" -ForegroundColor White
    Write-Host "- Try: docker-compose down (to clean up) then start again" -ForegroundColor White
}

Write-Host ""
Write-Host "Press any key to exit..."
try {
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
} catch {
    Read-Host "Press Enter to exit"
}
