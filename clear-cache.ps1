#  Integration - Cache Clearing Script
Write-Host "Clearing WordPress cache..." -ForegroundColor Cyan

# Clear WordPress cache directories
Write-Host "Clearing wp-content/cache..." -ForegroundColor Yellow
Remove-Item "..\..\cache\*" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Clearing wp-content/et-cache..." -ForegroundColor Yellow  
Remove-Item "..\..\et-cache\*" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Clearing wp-content/wpo-cache..." -ForegroundColor Yellow
Remove-Item "..\..\wpo-cache\*" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Cache clearing completed!" -ForegroundColor Green
Write-Host "Please hard refresh your browser (Ctrl+F5) to see changes" -ForegroundColor Magenta