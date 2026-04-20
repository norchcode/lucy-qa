$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir '..')
$TargetDir = if ($env:LUCY_INSTALL_DIR) { $env:LUCY_INSTALL_DIR } else { Join-Path $HOME '.local\bin' }
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
$ShimPath = Join-Path $TargetDir 'lucy.cmd'
$Content = "@echo off`r`nnode \"$($RepoRoot.Path)\apps\cli\src\index.mjs\" %*`r`n"
Set-Content -Path $ShimPath -Value $Content -NoNewline
Write-Host "Installed lucy to $ShimPath"
Write-Host "Make sure $TargetDir is in your PATH."
Write-Host "Try: lucy"
