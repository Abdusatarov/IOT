param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot 'air-quality-backend')
try {
    $python = Join-Path (Get-Location) '.venv\Scripts\python.exe'
    if (!(Test-Path $python)) { throw 'Create .venv and install requirements-dev.txt first.' }
    & $python -m alembic upgrade head
    if ($LASTEXITCODE) { throw 'Database migration failed.' }
    $env:PORT = "$Port"
    $env:HOST = '0.0.0.0'
    Write-Host "Air Monitor: http://localhost:$Port"
    & $python -m app
} finally { Pop-Location }
