[CmdletBinding()]
param(
    [string]$GradleTask = "bootRun"
)

$ErrorActionPreference = "Stop"

$envFile = Join-Path $PSScriptRoot ".env"
$gradleWrapper = Join-Path $PSScriptRoot "gradlew.bat"

if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
    throw "backend/.env is missing. Copy .env.example and add development values."
}

if (-not (Test-Path -LiteralPath $gradleWrapper -PathType Leaf)) {
    throw "Gradle Wrapper was not found: $gradleWrapper"
}

$loadedNames = [System.Collections.Generic.List[string]]::new()

foreach ($rawLine in Get-Content -LiteralPath $envFile) {
    $line = $rawLine.Trim()

    if (-not $line -or $line.StartsWith("#")) {
        continue
    }

    $parts = $line.Split("=", 2)
    if ($parts.Count -ne 2) {
        throw "Invalid .env line: $rawLine"
    }

    $name = $parts[0].Trim()
    $value = $parts[1].Trim()

    if ($name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
        throw "Invalid environment variable name in .env: $name"
    }

    if ($value.Length -ge 2) {
        $isDoubleQuoted = $value.StartsWith('"') -and $value.EndsWith('"')
        $isSingleQuoted = $value.StartsWith("'") -and $value.EndsWith("'")
        if ($isDoubleQuoted -or $isSingleQuoted) {
            $value = $value.Substring(1, $value.Length - 2)
        }
    }

    Set-Item -LiteralPath "Env:$name" -Value $value
    $loadedNames.Add($name)
}

if (-not $loadedNames.Contains("DATABASE_URL")) {
    throw "DATABASE_URL is missing from backend/.env."
}

Write-Host "Loaded $($loadedNames.Count) environment variables from backend/.env."
Write-Host "Running Gradle task: $GradleTask"

Push-Location $PSScriptRoot
try {
    & $gradleWrapper $GradleTask
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle task failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
