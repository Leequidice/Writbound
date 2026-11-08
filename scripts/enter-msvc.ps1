$ErrorActionPreference = 'Stop'
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vsPath = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vsPath) { throw 'MSVC C++ Build Tools installation not found' }
Import-Module (Join-Path $vsPath 'Common7\Tools\Microsoft.VisualStudio.DevShell.dll')
Enter-VsDevShell -VsInstallPath $vsPath -SkipAutomaticLocation -DevCmdArguments '-arch=x64 -host_arch=x64' | Out-Null
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
# Official AWS-LC Windows fallback avoids a separate NASM installation.
$env:AWS_LC_SYS_PREBUILT_NASM = '1'
$portableNear = Join-Path $PSScriptRoot '..\.tools\cargo-near\cargo-near-x86_64-pc-windows-msvc'
if (Test-Path (Join-Path $portableNear 'cargo-near.exe')) { $env:PATH = "$portableNear;$env:PATH" }
