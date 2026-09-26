param([string]$At = '03:00', [string]$TaskName = 'BoothHana Weekly Subculture Catalogue')
$ErrorActionPreference = 'Stop'
if ($At -notmatch '^([01]\d|2[0-3]):[0-5]\d$') { throw 'At must be HH:mm.' }
if ((Get-TimeZone).Id -ne 'Korea Standard Time') { throw 'Set this Windows machine timezone to Korea Standard Time (Asia/Seoul), or use the Linux timer with an explicit timezone. No task was registered.' }
$runner = Join-Path $PSScriptRoot 'run-collection.ps1'
$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (!(Test-Path $python)) { throw 'Create collector/.venv and install requirements first.' }
if (!(Test-Path (Join-Path $PSScriptRoot 'config.local.json'))) { throw 'Copy config.example.json to config.local.json and configure the backend first.' }
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -File "' + $runner + '"') -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Weekly -WeeksInterval 1 -DaysOfWeek Sunday -At $At
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 22) -StartWhenAvailable
# No -Force: never silently overwrite an existing schedule.
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Sunday KST: events, participants, sales, approved images. No automatic publication.'
Write-Host ('Registered for Sunday ' + $At + ' Asia/Seoul. Runs only while this account is signed in and PC is powered on.')
Write-Host 'An older daily v3 task is NOT removed automatically. Check Task Scheduler and disable it before enabling this weekly job.'
