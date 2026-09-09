# Starts Huma Radar's dev server and opens it in your default browser.
#
# This is PowerShell rather than a plain .bat for a specific reason: when npm is
# launched from cmd.exe with this project's path, the non-ASCII characters in
# "Masaustu" reach Node with the wrong encoding. Vite then cannot match a
# request to a real file, serves src/main.tsx untransformed, and the browser
# chokes on raw JSX - the page loads but renders completely blank. PowerShell
# passes the path through correctly. Setting "chcp 65001" in cmd does not help.

$ErrorActionPreference = 'Stop'

# Resolve through Get-Item so an 8.3 short path ("MASAST~1") becomes the real
# long path before Node ever sees it.
$root = (Get-Item -LiteralPath $PSScriptRoot).FullName
$app = Join-Path $root 'huma-radar'

if (-not (Test-Path -LiteralPath $app)) {
  Write-Host "Could not find $app" -ForegroundColor Red
  Read-Host 'Press Enter to close'
  exit 1
}

Set-Location -LiteralPath $app

if (-not (Test-Path -LiteralPath (Join-Path $app 'node_modules'))) {
  Write-Host 'First run - installing dependencies. This takes a minute.' -ForegroundColor Yellow
  npm install
  Write-Host ''
}

Write-Host ''
Write-Host '============================================' -ForegroundColor DarkMagenta
Write-Host '  Huma Radar' -ForegroundColor White
Write-Host '  http://localhost:5173' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Leave this window open while you browse.'
Write-Host '  Press Ctrl+C or close it to stop.'
Write-Host '============================================' -ForegroundColor DarkMagenta
Write-Host ''

# --open launches your default browser once the server is actually ready
npm run dev -- --open

# If the server fell over, hold the window open so the error stays readable
# instead of vanishing when the script ends.
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host 'The server stopped unexpectedly. The error is above.' -ForegroundColor Red
  Read-Host 'Press Enter to close'
}
