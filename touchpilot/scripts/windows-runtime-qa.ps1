param(
  [string]$ProcessName = "touchpilot-desktop",
  [int]$TolerancePx = 6
)

$ErrorActionPreference = "Stop"

if (-not $IsWindows -and $env:OS -ne "Windows_NT") {
  Write-Error "Windows runtime QA can only run on Windows."
  exit 1
}

$processes = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
if ($processes.Count -eq 0) {
  Write-Error "No running $ProcessName process found. Start TouchPilot first, then rerun this probe."
  exit 1
}

Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class TouchPilotWindowProbe {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  public struct Rect {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct Point {
    public int X;
    public int Y;
  }

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr extraData);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out Rect rect);

  [DllImport("user32.dll", SetLastError = true)]
  public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int index);

  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern int GetWindowTextLengthW(IntPtr hWnd);

  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int maxCount);

  [DllImport("user32.dll")]
  public static extern IntPtr WindowFromPoint(Point point);
}
"@

$constants = @{
  GwlStyle = -16
  GwlExStyle = -20
  WsCaption = 0x00C00000L
  WsThickFrame = 0x00040000L
  WsSysMenu = 0x00080000L
  WsExTransparent = 0x00000020L
  WsExToolWindow = 0x00000080L
  WsExAppWindow = 0x00040000L
  WsExLayered = 0x00080000L
}

function Get-WindowTitle([IntPtr]$Handle) {
  $length = [TouchPilotWindowProbe]::GetWindowTextLengthW($Handle)
  if ($length -le 0) {
    return ""
  }

  $builder = [StringBuilder]::new($length + 1)
  [void][TouchPilotWindowProbe]::GetWindowTextW($Handle, $builder, $builder.Capacity)
  return $builder.ToString()
}

function Get-WindowInfo([IntPtr]$Handle) {
  $pid = 0
  [void][TouchPilotWindowProbe]::GetWindowThreadProcessId($Handle, [ref]$pid)

  $rect = [TouchPilotWindowProbe+Rect]::new()
  [void][TouchPilotWindowProbe]::GetWindowRect($Handle, [ref]$rect)

  $style = [TouchPilotWindowProbe]::GetWindowLongPtr($Handle, $constants.GwlStyle).ToInt64()
  $exStyle = [TouchPilotWindowProbe]::GetWindowLongPtr($Handle, $constants.GwlExStyle).ToInt64()
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top

  [pscustomobject]@{
    Handle = $Handle
    HandleHex = "0x{0:X}" -f $Handle.ToInt64()
    ProcessId = [int]$pid
    Title = Get-WindowTitle $Handle
    Visible = [TouchPilotWindowProbe]::IsWindowVisible($Handle)
    Left = $rect.Left
    Top = $rect.Top
    Right = $rect.Right
    Bottom = $rect.Bottom
    Width = $width
    Height = $height
    Area = [int64]$width * [int64]$height
    Style = $style
    ExStyle = $exStyle
    HasCaption = (($style -band $constants.WsCaption) -ne 0)
    HasThickFrame = (($style -band $constants.WsThickFrame) -ne 0)
    HasSysMenu = (($style -band $constants.WsSysMenu) -ne 0)
    IsLayered = (($exStyle -band $constants.WsExLayered) -ne 0)
    IsTransparentInput = (($exStyle -band $constants.WsExTransparent) -ne 0)
    IsToolWindow = (($exStyle -band $constants.WsExToolWindow) -ne 0)
    IsAppWindow = (($exStyle -band $constants.WsExAppWindow) -ne 0)
  }
}

$targetPids = @($processes | ForEach-Object { [int]$_.Id })
$windows = New-Object System.Collections.Generic.List[object]
$callback = [TouchPilotWindowProbe+EnumWindowsProc]{
  param([IntPtr]$hWnd, [IntPtr]$extraData)

  $pid = 0
  [void][TouchPilotWindowProbe]::GetWindowThreadProcessId($hWnd, [ref]$pid)
  if ($targetPids -contains [int]$pid) {
    $windows.Add((Get-WindowInfo $hWnd))
  }

  return $true
}

[void][TouchPilotWindowProbe]::EnumWindows($callback, [IntPtr]::Zero)

if ($windows.Count -eq 0) {
  Write-Error "No top-level TouchPilot windows were found for $ProcessName."
  exit 1
}

$overlay = $windows | Sort-Object Area -Descending | Select-Object -First 1
$settings = $windows |
  Where-Object { $_.Handle -ne $overlay.Handle -and $_.Width -le 520 -and $_.Height -le 420 } |
  Sort-Object Area |
  Select-Object -First 1

$screens = @([System.Windows.Forms.Screen]::AllScreens)
function Test-FullscreenLike($Window) {
  foreach ($screen in $screens) {
    $bounds = $screen.Bounds
    $matchesLeft = [Math]::Abs($Window.Left - $bounds.Left) -le $TolerancePx
    $matchesTop = [Math]::Abs($Window.Top - $bounds.Top) -le $TolerancePx
    $matchesWidth = [Math]::Abs($Window.Width - $bounds.Width) -le $TolerancePx
    $matchesHeight = [Math]::Abs($Window.Height - $bounds.Height) -le $TolerancePx
    if ($matchesLeft -and $matchesTop -and $matchesWidth -and $matchesHeight) {
      return $true
    }
  }

  return $false
}

function Add-Check([System.Collections.Generic.List[object]]$Checks, [string]$Name, [bool]$Pass, [string]$Details) {
  $Checks.Add([pscustomobject]@{
    Name = $Name
    Pass = $Pass
    Details = $Details
  })
}

$checks = New-Object System.Collections.Generic.List[object]

Add-Check $checks "overlay exists" ($null -ne $overlay) $overlay.HandleHex
Add-Check $checks "overlay fullscreen" (Test-FullscreenLike $overlay) ("{0}x{1}+{2}+{3}" -f $overlay.Width, $overlay.Height, $overlay.Left, $overlay.Top)
Add-Check $checks "overlay title blank" ([string]::IsNullOrWhiteSpace($overlay.Title)) ("title='$($overlay.Title)'")
Add-Check $checks "overlay no caption" (-not $overlay.HasCaption -and -not $overlay.HasThickFrame -and -not $overlay.HasSysMenu) ("caption=$($overlay.HasCaption), thickFrame=$($overlay.HasThickFrame), sysMenu=$($overlay.HasSysMenu)")
Add-Check $checks "overlay click-through style" ($overlay.IsTransparentInput) ("transparentInput=$($overlay.IsTransparentInput)")
Add-Check $checks "overlay layered" ($overlay.IsLayered) ("layered=$($overlay.IsLayered)")
Add-Check $checks "overlay not taskbar app" ($overlay.IsToolWindow -and -not $overlay.IsAppWindow) ("toolWindow=$($overlay.IsToolWindow), appWindow=$($overlay.IsAppWindow)")

if ($null -eq $settings) {
  Add-Check $checks "settings window exists" $false "No compact settings window candidate found."
} else {
  Add-Check $checks "settings window exists" $true $settings.HandleHex
  Add-Check $checks "settings title blank" ([string]::IsNullOrWhiteSpace($settings.Title)) ("title='$($settings.Title)'")
  Add-Check $checks "settings no caption" (-not $settings.HasCaption -and -not $settings.HasThickFrame -and -not $settings.HasSysMenu) ("caption=$($settings.HasCaption), thickFrame=$($settings.HasThickFrame), sysMenu=$($settings.HasSysMenu)")
  Add-Check $checks "settings not taskbar app" ($settings.IsToolWindow -and -not $settings.IsAppWindow) ("toolWindow=$($settings.IsToolWindow), appWindow=$($settings.IsAppWindow)")
}

$samplePoints = @(
  @{ X = $overlay.Left + 16; Y = $overlay.Top + 16 },
  @{ X = $overlay.Left + [Math]::Max(24, [int]($overlay.Width / 2)); Y = $overlay.Top + [Math]::Max(24, [int]($overlay.Height / 2)) },
  @{ X = $overlay.Right - 24; Y = $overlay.Bottom - 24 }
)

$hitFailures = New-Object System.Collections.Generic.List[string]
foreach ($point in $samplePoints) {
  $probePoint = [TouchPilotWindowProbe+Point]::new()
  $probePoint.X = [int]$point.X
  $probePoint.Y = [int]$point.Y
  $hit = [TouchPilotWindowProbe]::WindowFromPoint($probePoint)
  $hitPid = 0
  if ($hit -ne [IntPtr]::Zero) {
    [void][TouchPilotWindowProbe]::GetWindowThreadProcessId($hit, [ref]$hitPid)
  }

  if ($targetPids -contains [int]$hitPid) {
    $hitFailures.Add(("point {0},{1} hit TouchPilot hwnd 0x{2:X}" -f $probePoint.X, $probePoint.Y, $hit.ToInt64()))
  }
}

Add-Check $checks "overlay hit-test pass-through" ($hitFailures.Count -eq 0) (($hitFailures -join "; "))

Write-Host "TouchPilot Windows runtime QA"
Write-Host ""
Write-Host "Process ids: $($targetPids -join ', ')"
Write-Host "Overlay: $($overlay.HandleHex) $($overlay.Width)x$($overlay.Height)+$($overlay.Left)+$($overlay.Top)"
if ($settings) {
  Write-Host "Settings: $($settings.HandleHex) $($settings.Width)x$($settings.Height)+$($settings.Left)+$($settings.Top) visible=$($settings.Visible)"
}
Write-Host ""

$failed = @($checks | Where-Object { -not $_.Pass })
foreach ($check in $checks) {
  $status = if ($check.Pass) { "PASS" } else { "FAIL" }
  Write-Host ("[{0}] {1} - {2}" -f $status, $check.Name, $check.Details)
}

if ($failed.Count -gt 0) {
  Write-Host ""
  Write-Error "Runtime QA failed with $($failed.Count) failing check(s)."
  exit 1
}

Write-Host ""
Write-Host "Runtime QA passed."
