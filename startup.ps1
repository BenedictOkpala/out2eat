param()
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
try {
  $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/' -UseBasicParsing -TimeoutSec 2
  if ($response.StatusCode -eq 200) { exit 0 }
} catch { }
New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'artifacts') | Out-Null
$nodePath = (Get-Command node.exe).Source
$npmCli = Join-Path (Split-Path -Parent $nodePath) 'node_modules/npm/bin/npm-cli.js'
if (-not (Test-Path -LiteralPath $npmCli)) { throw 'npm CLI was not found beside Node.' }
Start-Process -FilePath $nodePath -ArgumentList "`"$npmCli`" run dev" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'artifacts/dev.log') -RedirectStandardError (Join-Path $PSScriptRoot 'artifacts/dev-error.log')
