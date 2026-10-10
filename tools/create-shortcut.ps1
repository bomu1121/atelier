# Creates the desktop shortcut for the atelier reader.
# ASCII-only on purpose: this file is read as GBK by Windows PowerShell,
# so any non-ASCII literal would corrupt. All paths are derived at runtime.
$repo = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'atelier reader.lnk'

$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($lnkPath)
$lnk.TargetPath = Join-Path $repo 'tools\start-reader.cmd'
$lnk.WorkingDirectory = $repo
$lnk.WindowStyle = 7  # minimized console while the server runs
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if ($node) { $lnk.IconLocation = $node }
$lnk.Description = 'Start the local atelier markdown reader'
$lnk.Save()

Write-Output ('OK: ' + $lnkPath)
