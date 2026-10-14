param([int] $OwnerProcessId)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
  Add-Type -Path (Join-Path $PSScriptRoot 'WindowMonitor.cs') -ReferencedAssemblies System.Windows.Forms,System.Web.Extensions
  [FishBook.WindowMonitor]::Run($OwnerProcessId)
} catch {
  [Console]::WriteLine((@{ type = 'error'; message = 'Windows window monitor could not start.' } | ConvertTo-Json -Compress))
  exit 1
}
