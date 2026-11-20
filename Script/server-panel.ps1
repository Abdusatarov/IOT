param([switch]$CheckOnly, [switch]$Internet, [switch]$Start)
$ErrorActionPreference = 'Stop'
try {
    $projectRoot = Split-Path $PSScriptRoot -Parent
    Set-Location -LiteralPath $projectRoot
    $panelPython = Join-Path $projectRoot 'air-quality-backend\.venv\Scripts\python.exe'
    if (!(Test-Path -LiteralPath $panelPython)) { throw 'Create air-quality-backend/.venv and install requirements-dev.txt and Script/requirements-panel.txt.' }
    & $panelPython -c 'import qrcode, PIL, tkinter'
    if ($LASTEXITCODE) { throw 'Install Script/requirements-panel.txt with the backend Python.' }
    if ($CheckOnly) {
        & $panelPython -c 'import ast,pathlib,sys; ast.parse(pathlib.Path(sys.argv[1]).read_bytes())' (Join-Path $PSScriptRoot 'server-panel.py')
        if ($LASTEXITCODE) { throw 'Panel syntax check failed.' }
        Write-Host 'Launcher OK: Python, dependencies and panel script checked.'
    } else {
        $panelArguments = @()
        if ($Internet) { $panelArguments += '--internet' }
        elseif ($Start) { $panelArguments += '--start' }
        & $panelPython (Join-Path $PSScriptRoot 'server-panel.py') @panelArguments
        if ($LASTEXITCODE) { throw 'Server panel exited with an error.' }
    }
} catch {
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
