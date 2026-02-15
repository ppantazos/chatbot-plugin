# Stop Script - Stops all containers

Write-Host "Stopping WordPress environment..." -ForegroundColor Yellow

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

docker-compose down

Write-Host ""
Write-Host "Stopped!" -ForegroundColor Green
Write-Host ""
Write-Host "To start again, run: start.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to exit..."
try {
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
} catch {
    Read-Host "Press Enter to exit"
}
