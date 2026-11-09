# Run once in PowerShell as Administrator to allow local Wi-Fi clients.
$ErrorActionPreference = 'Stop'
if (!(Get-NetFirewallRule -DisplayName 'Air Monitor LAN 8000' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'Air Monitor LAN 8000' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8000 -RemoteAddress LocalSubnet -Profile Any
}
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' } | ForEach-Object {
    Write-Host ($_.InterfaceAlias + ': http://' + $_.IPAddress + ':8000')
}
