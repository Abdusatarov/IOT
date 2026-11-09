param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
try {
    Set-Location -LiteralPath $PSScriptRoot
    $candidates = @(
        (Join-Path $PSScriptRoot 'air-quality-backend\.venv\Scripts\python.exe'),
        'C:\Users\MBX\Documents\Project\air-quality\air-quality-backend\.venv\Scripts\python.exe'
    )
    $panelPython = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (!$panelPython) { throw 'Backend Python environment was not found. Create air-quality-backend/.venv and install requirements-dev.txt.' }
    & $panelPython -c 'import sys; print(sys.executable)'
    if ($LASTEXITCODE) { throw 'The Python environment is broken.' }
    & $panelPython -c 'import qrcode, PIL, tkinter' 2>$null
    if ($LASTEXITCODE) {
        & $panelPython -m pip install -r (Join-Path $PSScriptRoot 'requirements-panel.txt')
        if ($LASTEXITCODE) { throw 'QR dependencies could not be installed.' }
    }
    if ($CheckOnly) {
        & $panelPython -c 'import ast,pathlib,sys; ast.parse(pathlib.Path(sys.argv[1]).read_bytes())' (Join-Path $PSScriptRoot 'server-panel.py')
        Write-Host 'Launcher OK: Python, dependencies and panel script checked.'
    } else {
        & $panelPython (Join-Path $PSScriptRoot 'server-panel.py')
    }
    if ($LASTEXITCODE) { throw 'Server panel exited with an error.' }
} catch {
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
