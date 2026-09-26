$ErrorActionPreference = 'Stop'
$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (!(Test-Path $python)) { throw 'Run py -3 -m venv .venv and install requirements.txt in collector first.' }
# Token is inherited from the task account's environment, not from frontend/.env.
& $python (Join-Path $PSScriptRoot 'run_scheduled.py') --config (Join-Path $PSScriptRoot 'config.local.json')
exit $LASTEXITCODE
