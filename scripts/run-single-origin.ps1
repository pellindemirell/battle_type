$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$frontendRoot = Join-Path $repositoryRoot 'frontend'
$projectPath = Join-Path $repositoryRoot 'backend\TypingApp.Api\TypingApp.Api.csproj'
$browserOutput = Join-Path $frontendRoot 'dist\typing-app-ui\browser'
$webRoot = Join-Path $repositoryRoot 'backend\TypingApp.Api\wwwroot'

Push-Location $frontendRoot
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Angular build failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path $browserOutput)) {
    throw "Angular browser output was not found at '$browserOutput'."
}

New-Item -ItemType Directory -Path $webRoot -Force | Out-Null
Copy-Item -Path (Join-Path $browserOutput '*') -Destination $webRoot -Recurse -Force

dotnet run --no-launch-profile --project $projectPath -- --urls 'http://0.0.0.0:5027'
exit $LASTEXITCODE
