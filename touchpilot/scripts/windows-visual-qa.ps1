param(
  [string]$ProcessName = "touchpilot-desktop",
  [string]$OutputPath = (Join-Path $env:TEMP "touchpilot-visual-qa.png")
)

$ErrorActionPreference = "Stop"

if (-not $IsWindows -and $env:OS -ne "Windows_NT") {
  Write-Error "Windows visual QA can only run on Windows."
  exit 1
}

$processes = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
if ($processes.Count -eq 0) {
  Write-Error "No running $ProcessName process found. Start TouchPilot first, then rerun this visual QA."
  exit 1
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class TouchPilotVisualProbe {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  public struct Rect {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr extraData);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out Rect rect);

  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern int GetWindowTextLengthW(IntPtr hWnd);

  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int maxCount);
}
"@

function Get-WindowTitle([IntPtr]$Handle) {
  $length = [TouchPilotVisualProbe]::GetWindowTextLengthW($Handle)
  if ($length -le 0) {
    return ""
  }

  $builder = [StringBuilder]::new($length + 1)
  [void][TouchPilotVisualProbe]::GetWindowTextW($Handle, $builder, $builder.Capacity)
  return $builder.ToString()
}

function Get-WindowInfo([IntPtr]$Handle) {
  $pid = 0
  [void][TouchPilotVisualProbe]::GetWindowThreadProcessId($Handle, [ref]$pid)

  $rect = [TouchPilotVisualProbe+Rect]::new()
  [void][TouchPilotVisualProbe]::GetWindowRect($Handle, [ref]$rect)
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top

  [pscustomobject]@{
    Handle = $Handle
    HandleHex = "0x{0:X}" -f $Handle.ToInt64()
    ProcessId = [int]$pid
    Title = Get-WindowTitle $Handle
    Visible = [TouchPilotVisualProbe]::IsWindowVisible($Handle)
    Left = $rect.Left
    Top = $rect.Top
    Width = $width
    Height = $height
    Area = [int64]$width * [int64]$height
  }
}

function Add-Check([System.Collections.Generic.List[object]]$Checks, [string]$Name, [bool]$Pass, [string]$Details) {
  $Checks.Add([pscustomobject]@{
    Name = $Name
    Pass = $Pass
    Details = $Details
  })
}

$targetPids = @($processes | ForEach-Object { [int]$_.Id })
$windows = New-Object System.Collections.Generic.List[object]
$callback = [TouchPilotVisualProbe+EnumWindowsProc]{
  param([IntPtr]$hWnd, [IntPtr]$extraData)

  $pid = 0
  [void][TouchPilotVisualProbe]::GetWindowThreadProcessId($hWnd, [ref]$pid)
  if ($targetPids -contains [int]$pid) {
    $windows.Add((Get-WindowInfo $hWnd))
  }

  return $true
}

[void][TouchPilotVisualProbe]::EnumWindows($callback, [IntPtr]::Zero)

if ($windows.Count -eq 0) {
  Write-Error "No TouchPilot windows were found for $ProcessName."
  exit 1
}

$overlay = $windows | Sort-Object Area -Descending | Select-Object -First 1
$visiblePanels = @(
  $windows |
    Where-Object {
      $_.Visible -and
      $_.Handle -ne $overlay.Handle -and
      $_.Width -gt 160 -and
      $_.Height -gt 120
    }
)
$visibleTitles = @(
  $windows |
    Where-Object { $_.Visible -and -not [string]::IsNullOrWhiteSpace($_.Title) }
)

$primary = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = [System.Drawing.Bitmap]::new($primary.Width, $primary.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CopyFromScreen($primary.Left, $primary.Top, 0, 0, $bitmap.Size)
  $outputDirectory = Split-Path -Parent $OutputPath
  if ($outputDirectory -and -not (Test-Path $outputDirectory)) {
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
  }
  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}

$checks = New-Object System.Collections.Generic.List[object]
Add-Check $checks "screenshot captured" (Test-Path $OutputPath) $OutputPath
Add-Check $checks "no visible TouchPilot title text" ($visibleTitles.Count -eq 0) (($visibleTitles | ForEach-Object { "$($_.Title) $($_.Width)x$($_.Height)" }) -join "; ")
Add-Check $checks "no visible settings/debug panel by default" ($visiblePanels.Count -eq 0) (($visiblePanels | ForEach-Object { "$($_.Title) $($_.Width)x$($_.Height)" }) -join "; ")

$forbiddenPhrases = @(
  "TouchPilot Overlay",
  "CURRENT GUIDANCE",
  "DEBUG SCREENSHOT PREVIEW",
  "SAFE NAVIGATION"
)

$tesseract = Get-Command tesseract -ErrorAction SilentlyContinue
if ($tesseract) {
  $ocrBase = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "touchpilot-visual-qa-ocr")
  & $tesseract.Source $OutputPath $ocrBase --psm 6 2>$null | Out-Null
  $ocrPath = "$ocrBase.txt"
  $ocrText = if (Test-Path $ocrPath) { Get-Content -Raw $ocrPath } else { "" }
  $matches = @($forbiddenPhrases | Where-Object { $ocrText -match [regex]::Escape($_) })
  Add-Check $checks "OCR forbidden text" ($matches.Count -eq 0) (($matches -join ", "))
} else {
  Add-Check $checks "OCR forbidden text" $true "Skipped because tesseract is not installed. Review screenshot manually: $OutputPath"
}

Write-Host "TouchPilot Windows visual QA"
Write-Host ""
Write-Host "Screenshot: $OutputPath"
Write-Host "Overlay candidate: $($overlay.HandleHex) $($overlay.Width)x$($overlay.Height)+$($overlay.Left)+$($overlay.Top)"
Write-Host ""

$failed = @($checks | Where-Object { -not $_.Pass })
foreach ($check in $checks) {
  $status = if ($check.Pass) { "PASS" } else { "FAIL" }
  Write-Host ("[{0}] {1} - {2}" -f $status, $check.Name, $check.Details)
}

if ($failed.Count -gt 0) {
  Write-Host ""
  Write-Error "Visual QA failed with $($failed.Count) failing check(s)."
  exit 1
}

Write-Host ""
Write-Host "Visual QA passed. If OCR was skipped, manually inspect the screenshot before accepting Phase 8."
