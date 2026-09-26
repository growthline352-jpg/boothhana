$ErrorActionPreference = 'Stop'
$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (!(Test-Path $python)) { throw 'Create collector/.venv first.' }
$env:PYTHONUTF8 = '1'
& $python (Join-Path $PSScriptRoot 'floorplans.py') --config (Join-Path $PSScriptRoot 'config.local.json') --imminent
exit $LASTEXITCODE
