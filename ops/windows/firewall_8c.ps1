# Patch 8c: one Windows Firewall rule that blocks inbound connections from other computers to every port this project uses.
# Programs on THIS computer still reach each other (loopback is not filtered). Run in an ADMINISTRATOR PowerShell:
#   powershell -ExecutionPolicy Bypass -File ops\windows\firewall_8c.ps1            (install)
#   powershell -ExecutionPolicy Bypass -File ops\windows\firewall_8c.ps1 -Remove     (remove)
param([switch]$Remove)
$name = "DEM-SDG 8c block inbound"
$ports = "3000,3100,5000,5173,5432,5433,6379,8000,8081,9090,9121,9182,9187"
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Write-Host "STOP: open PowerShell as Administrator and run this again. Nothing changed."; exit 1 }
Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
if ($Remove) { Write-Host "Rule removed (or it was not there)."; exit 0 }
New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Block -Protocol TCP -LocalPort ($ports -split ",") -Profile Any -Enabled True -ErrorAction Stop | Out-Null
Write-Host "Rule installed: $name  (ports $ports)"
netsh advfirewall firewall show rule name="$name" | Select-String "Enabled|Action|LocalPort"
