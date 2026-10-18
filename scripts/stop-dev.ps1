$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1

if (-not $listener) {
  Write-Host 'PicHost development server is not running.'
  exit 2
}

$process = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $listener.OwningProcess)
if (-not $process -or $process.CommandLine -notlike ('*' + $root + '*')) {
  Write-Host 'Port 3000 belongs to another program. Stop cancelled.'
  exit 3
}

taskkill /PID $listener.OwningProcess /T /F | Out-Null
if ($LASTEXITCODE -ne 0) {
  exit 1
}

Write-Host 'PicHost development server stopped.'
exit 0
