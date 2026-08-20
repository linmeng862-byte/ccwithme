Write-Host "=== VS Code Cache ==="

$paths = @(
    "$env:APPDATA\Code\Cache",
    "$env:APPDATA\Code\CachedData",
    "$env:APPDATA\Code\CachedExtensionVSIXs",
    "$env:APPDATA\Code\Code Cache",
    "$env:LOCALAPPDATA\Code\Cache"
)

foreach ($p in $paths) {
    if (Test-Path $p) {
        $size = (Get-ChildItem $p -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        $mb = [math]::Round($size/1MB, 1)
        Write-Host "$p : $mb MB"
    }
}

Write-Host ""
Write-Host "=== Workspace Storage (last 10) ==="
$ws = "$env:APPDATA\Code\User\workspaceStorage"
if (Test-Path $ws) {
    Get-ChildItem $ws -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 10 | ForEach-Object {
        $sz = (Get-ChildItem $_.FullName -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        $mb = [math]::Round($sz/1MB, 1)
        $short = $_.Name.Substring(0, [Math]::Min(12, $_.Name.Length))
        Write-Host "$short  $mb MB  $($_.LastWriteTime)"
    }
}
