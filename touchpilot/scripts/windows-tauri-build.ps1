param(
  [switch]$NoBundle,
  [int]$CargoJobs = 1
)

$ErrorActionPreference = "Stop"

if (-not $IsWindows -and $env:OS -ne "Windows_NT") {
  Write-Error "Windows Tauri build helper can only run on Windows."
  exit 1
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$env:CARGO_BUILD_JOBS = [string]$CargoJobs

$tauriArgs = @("build")
if ($NoBundle) {
  $tauriArgs += "--no-bundle"
}

$npmArgs = @("--workspace", "@toki/desktop", "run", "tauri", "--") + $tauriArgs
& npm @npmArgs
