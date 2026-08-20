Write-Host "=== Claude processes ==="
Get-Process claude -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host ("PID " + $_.Id + "  Mem: " + [math]::Round($_.WS/1MB,1) + "MB  Started: " + $_.StartTime)
}
Write-Host ""
Write-Host "=== VS Code processes ==="
Get-Process Code -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host ("PID " + $_.Id + "  Mem: " + [math]::Round($_.WS/1MB,1) + "MB  Started: " + $_.StartTime + "  Window: " + $_.MainWindowTitle)
}
Write-Host ""
Write-Host "=== VS Code extensions ==="
code --list-extensions 2>&1
